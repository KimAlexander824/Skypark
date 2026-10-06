"""Посещения (§9, §11, §12, §31): создание, таймер, завершение, отмена."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Child, Extension, Payment, Visit
from app.domain.enums import (
    OPEN_VISIT_STATUSES,
    VISIT_TRANSITIONS,
    EndReason,
    ExtensionStatus,
    NotificationEvent,
    OptionKind,
    PaymentKind,
    PaymentStatus,
    VisitStatus,
    visit_status_label,
)
from app.services import nannies, notifications, payments, pricing, schedule
from app.services.common import Actor, audit
from app.services.errors import AlreadyOnVisit, InvalidStatus, NotFound

VS = VisitStatus


def transition(visit: Visit, new: VisitStatus) -> None:
    if new not in VISIT_TRANSITIONS[VisitStatus(visit.status)]:
        raise InvalidStatus(
            f"Нельзя перевести посещение из «{visit_status_label(visit.status)}» в «{visit_status_label(new)}»"
        )
    visit.status = new


def is_open(visit: Visit) -> bool:
    return visit.status in OPEN_VISIT_STATUSES


def lock_visit(session: Session, visit_id: int) -> Visit:
    visit = session.scalar(
        select(Visit)
        .where(Visit.id == visit_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if visit is None:
        raise NotFound("Посещение не найдено")
    return visit


def open_visit_of_child(session: Session, child_id: int) -> Visit | None:
    return session.scalar(
        select(Visit).where(Visit.child_id == child_id, Visit.status.in_(OPEN_VISIT_STATUSES))
    )


@dataclass(frozen=True)
class Timer:
    """Таймер посещения (§11). remaining_seconds < 0 — время вышло, но посещение
    ещё не закрыто (например, ждём оплату продления)."""

    total_minutes: int
    elapsed_seconds: int
    remaining_seconds: int


def timer(visit: Visit, now: datetime) -> Timer:
    end_ref = visit.ended_at if visit.ended_at else now
    total = int((visit.planned_end_at - visit.started_at).total_seconds() // 60)
    elapsed = max(0, int((end_ref - visit.started_at).total_seconds()))
    remaining = 0 if visit.ended_at else int((visit.planned_end_at - now).total_seconds())
    return Timer(total, elapsed, remaining)


def create_visit(
    session: Session,
    *,
    child_id: int,
    nanny_id: int,
    option_id: int,
    actor: Actor,
    now: datetime,
    discount_id: int | None = None,
    promo_code: str | None = None,
    paid: bool = True,
) -> Visit:
    """Создание посещения (§9.1): ребёнок → няня → продолжительность → стоимость →
    посещение → таймер. paid=True — оплачено на кассе сразу."""
    child = session.get(Child, child_id)
    if child is None:
        raise NotFound("Ребёнок не найден")
    existing = open_visit_of_child(session, child_id)
    if existing is not None:
        raise AlreadyOnVisit("Ребёнок уже находится на посещении", visit_id=existing.id)

    option = pricing.get_option(session, option_id, OptionKind.VISIT)
    planned_end = now + timedelta(minutes=option.minutes)
    schedule.ensure_can_start(session, now, planned_end)
    nannies.lock_available(session, nanny_id)
    quote = pricing.quote(
        session, option=option, parent_id=child.parent_id, now=now, discount_id=discount_id, promo_code=promo_code
    )

    visit = Visit(
        child_id=child.id,
        nanny_id=nanny_id,
        option_id=option.id,
        base_minutes=option.minutes,
        status=VS.ACTIVE,
        started_at=now,
        planned_end_at=planned_end,
        created_by_id=actor.user_id,
        created_at=now,
    )
    session.add(visit)
    try:
        session.flush()
    except IntegrityError:  # параллельно уже создали посещение этому ребёнку
        session.rollback()
        raise AlreadyOnVisit("Ребёнок уже находится на посещении") from None

    payments.create_offline(
        session, visit=visit, quote=quote, kind=PaymentKind.VISIT, paid=paid, actor=actor, now=now
    )
    audit(
        session, actor, "visit.created", "visit", visit.id,
        child_id=child.id, nanny_id=nanny_id, minutes=option.minutes, amount=quote.total,
    )
    notifications.notify_parent(session, NotificationEvent.VISIT_STARTED, visit, now)
    return visit


def visit_payments(session: Session, visit_id: int) -> list[Payment]:
    return list(session.scalars(select(Payment).where(Payment.visit_id == visit_id).order_by(Payment.id)))


def cancel_pending_extensions(session: Session, visit_id: int, now: datetime) -> None:
    for ext in session.scalars(
        select(Extension).where(
            Extension.visit_id == visit_id, Extension.status == ExtensionStatus.PENDING_PAYMENT
        )
    ):
        ext.status = ExtensionStatus.CANCELLED
    for p in visit_payments(session, visit_id):
        if p.kind == PaymentKind.EXTENSION:
            payments.cancel_if_pending(session, p, now)


def complete_visit(
    session: Session, visit_id: int, *, actor: Actor, now: datetime, auto: bool = False
) -> Visit:
    """Завершение (§12): вручную сотрудником или автоматически по окончании времени.
    Няня освобождается автоматически: её загрузка считается по открытым посещениям."""
    visit = lock_visit(session, visit_id)
    transition(visit, VS.COMPLETED)
    visit.ended_at = visit.planned_end_at if auto else max(now, visit.started_at)
    visit.end_reason = EndReason.AUTO if auto else EndReason.MANUAL
    visit.completed_by_id = actor.user_id
    cancel_pending_extensions(session, visit.id, now)

    unused_minutes = max(0, int((visit.planned_end_at - visit.ended_at).total_seconds() // 60))
    audit(
        session, actor, "visit.completed", "visit", visit.id,
        auto=auto, unused_minutes=unused_minutes, early_end_policy=get_settings().early_end_policy,
    )
    notifications.notify_parent(session, NotificationEvent.VISIT_COMPLETED, visit, now)
    notifications.notify_staff(session, NotificationEvent.VISIT_COMPLETED, visit, now)
    return visit


def cancel_visit(session: Session, visit_id: int, *, actor: Actor, reason: str, now: datetime) -> Visit:
    """Отмена (например, посещение создано по ошибке). Если что-то уже оплачено —
    сотрудникам приходит уведомление о необходимости возврата."""
    visit = lock_visit(session, visit_id)
    transition(visit, VS.CANCELLED)
    visit.ended_at = max(now, visit.started_at)
    visit.end_reason = EndReason.CANCELLED
    visit.cancel_reason = reason
    visit.completed_by_id = actor.user_id
    cancel_pending_extensions(session, visit.id, now)
    paid = payments.total_paid(visit_payments(session, visit.id))
    if paid > 0:
        notifications.notify_staff(
            session, NotificationEvent.REFUND_REQUIRED, visit, now, amount=paid, reason="посещение отменено"
        )
    audit(session, actor, "visit.cancelled", "visit", visit.id, reason=reason, paid=paid)
    return visit


def confirm_offline_payment(session: Session, payment_id: int, *, actor: Actor, now: datetime):
    """Кассир принял оплату за посещение, созданное с paid=False."""
    p = session.get(Payment, payment_id)
    if p is None:
        raise NotFound("Платёж не найден")
    if p.method != "offline" or p.status not in (PaymentStatus.PENDING, PaymentStatus.PAID):
        raise InvalidStatus("Этот платёж нельзя подтвердить на кассе")
    return payments.mark_paid(session, payment_id, now, actor=actor)
