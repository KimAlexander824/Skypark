"""Продление посещения (§16–18).

Родитель (через бота): request(requested_by="parent") → онлайн-платёж →
webhook провайдера → payments.mark_paid() → apply_paid() → время окончания сдвигается.

Сотрудник на кассе: request(requested_by="staff") → оплачено сразу → время сдвигается.

Отказ: decline() — статус возвращается в «Активно», сотрудник получает уведомление,
посещение автоматически завершится в исходное время.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import DurationOption, Extension, Payment, Visit
from app.domain.enums import ExtensionStatus, NotificationEvent, OptionKind, PaymentKind, VisitStatus
from app.services import notifications, payments, pricing, schedule, visits
from app.services.common import Actor, audit
from app.services.errors import InvalidStatus

VS = VisitStatus


def options_for(session: Session, visit: Visit) -> list[tuple[DurationOption, bool]]:
    """Варианты продления и помещается ли каждый до закрытия парка."""
    return [
        (
            opt,
            schedule.ends_before_close(
                session, visit.started_at, visit.planned_end_at + timedelta(minutes=opt.minutes)
            ),
        )
        for opt in pricing.list_options(session, OptionKind.EXTENSION)
    ]


def request(
    session: Session,
    *,
    visit_id: int,
    option_id: int,
    requested_by: str,
    actor: Actor,
    now: datetime,
    promo_code: str | None = None,
    discount_id: int | None = None,
) -> tuple[Extension, Payment]:
    visit = visits.lock_visit(session, visit_id)
    if not visits.is_open(visit):
        raise InvalidStatus("Посещение уже завершено")
    option = pricing.get_option(session, option_id, OptionKind.EXTENSION)
    schedule.ensure_ends_before_close(
        session, visit.started_at, visit.planned_end_at + timedelta(minutes=option.minutes)
    )
    quote = pricing.quote(
        session,
        option=option,
        parent_id=visit.child.parent_id,
        now=now,
        discount_id=discount_id,
        promo_code=promo_code,
    )
    # Родитель передумал и выбрал другой вариант — прежний неоплаченный отменяем.
    visits.cancel_pending_extensions(session, visit.id, now)

    ext = Extension(
        visit_id=visit.id,
        option_id=option.id,
        minutes=option.minutes,
        status=ExtensionStatus.PENDING_PAYMENT,
        requested_by=requested_by,
        requested_by_user_id=actor.user_id,
        created_at=now,
    )
    session.add(ext)
    session.flush()
    audit(session, actor, "extension.requested", "extension", ext.id, visit_id=visit.id, minutes=option.minutes)

    if requested_by == "staff":
        payment = payments.create_offline(
            session, visit=visit, quote=quote, kind=PaymentKind.EXTENSION, paid=True,
            actor=actor, now=now, extension=ext,
        )
        _apply(session, visit, ext, now, actor)
    else:
        payment = payments.create_online(
            session, visit=visit, quote=quote, extension=ext, actor=actor, now=now
        )
    return ext, payment


def apply_paid(session: Session, payment: Payment, now: datetime, actor: Actor) -> None:
    """Вызывается из payments.mark_paid для платежа за продление."""
    ext = session.get(Extension, payment.extension_id, with_for_update=True)
    if ext.status == ExtensionStatus.APPLIED:
        return
    visit = visits.lock_visit(session, ext.visit_id)
    if ext.status != ExtensionStatus.PENDING_PAYMENT or not visits.is_open(visit):
        # Деньги пришли, но продлевать уже нечего (посещение закрыто или продление отменено).
        reason = "посещение уже завершено" if not visits.is_open(visit) else "продление было отменено"
        notifications.notify_staff(
            session, NotificationEvent.REFUND_REQUIRED, visit, now, amount=payment.amount, reason=reason
        )
        audit(session, actor, "extension.refund_required", "extension", ext.id, reason=reason)
        return
    _apply(session, visit, ext, now, actor)


def _apply(session: Session, visit: Visit, ext: Extension, now: datetime, actor: Actor) -> None:
    visits.transition(visit, VS.EXTENDED)
    visit.planned_end_at = visit.planned_end_at + timedelta(minutes=ext.minutes)
    visit.extension_declined_at = None
    ext.status = ExtensionStatus.APPLIED
    ext.applied_at = now
    audit(
        session, actor, "extension.applied", "extension", ext.id,
        visit_id=visit.id, minutes=ext.minutes, new_end=visit.planned_end_at,
    )
    notifications.notify_parent(session, NotificationEvent.EXTENSION_APPLIED, visit, now, minutes=ext.minutes)
    notifications.notify_staff(session, NotificationEvent.EXTENSION_APPLIED, visit, now, minutes=ext.minutes)


def decline(session: Session, visit_id: int, *, actor: Actor, now: datetime) -> Visit:
    """Родитель нажал «Не продлевать» (§18)."""
    visit = visits.lock_visit(session, visit_id)
    if not visits.is_open(visit):
        raise InvalidStatus("Посещение уже завершено")
    if visit.status == VS.AWAITING_EXTENSION:
        visits.transition(visit, VS.ACTIVE)
    visit.extension_declined_at = now
    visits.cancel_pending_extensions(session, visit.id, now)
    audit(session, actor, "extension.declined", "visit", visit.id)
    notifications.notify_staff(session, NotificationEvent.EXTENSION_DECLINED, visit, now)
    return visit
