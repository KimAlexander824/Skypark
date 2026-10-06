"""Платежи (§19, §32).

- offline — оплата на кассе Скайпарка (первое посещение, продление у сотрудника).
- online — оплата через провайдера (продление из Telegram, §17).

Конкретный провайдер ещё не выбран (вопрос №2 ТЗ). Он подключается реализацией
интерфейса PaymentProvider: create() создаёт платёж у провайдера и возвращает ссылку
на оплату, а обработчик webhook провайдера вызывает mark_paid() / mark_failed().
Пока работает FakePaymentProvider: ссылка ведёт на тестовую страницу с кнопками.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from functools import lru_cache
from typing import Protocol

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Extension, Payment, Visit
from app.domain.enums import (
    ExtensionStatus,
    NotificationEvent,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    VisitPaymentStatus,
)
from app.services import notifications, pricing
from app.services.common import Actor, audit
from app.services.errors import InvalidStatus, NotFound, PaymentUnavailable
from app.services.pricing import Quote

PS = PaymentStatus


@dataclass(frozen=True)
class ProviderPayment:
    provider_payment_id: str
    pay_url: str | None


class PaymentProvider(Protocol):
    name: str

    def create(self, payment: Payment, description: str) -> ProviderPayment: ...


class FakePaymentProvider:
    name = "fake"

    def create(self, payment: Payment, description: str) -> ProviderPayment:
        url = f"{get_settings().public_base_url}/api/payments/fake/{payment.id}"
        return ProviderPayment(f"fake-{payment.id}", url)


@lru_cache
def get_payment_provider() -> PaymentProvider:
    provider = get_settings().payment_provider
    if provider == "fake":
        return FakePaymentProvider()
    raise RuntimeError(f"Платёжный провайдер {provider!r} не подключён")


def _new(visit: Visit, quote: Quote, kind: PaymentKind, method: PaymentMethod, extension, actor, now):
    return Payment(
        visit_id=visit.id,
        extension_id=extension.id if extension is not None else None,
        kind=kind,
        method=method,
        base_amount=quote.base_amount,
        discount_id=quote.discount_id,
        discount_amount=quote.discount_amount,
        promo_code_id=quote.promo_code_id,
        promo_amount=quote.promo_amount,
        amount=quote.total,
        created_by_id=actor.user_id,
        created_at=now,
        updated_at=now,
    )


def create_offline(
    session: Session,
    *,
    visit: Visit,
    quote: Quote,
    kind: PaymentKind,
    paid: bool,
    actor: Actor,
    now: datetime,
    extension: Extension | None = None,
) -> Payment:
    p = _new(visit, quote, kind, PaymentMethod.OFFLINE, extension, actor, now)
    p.status = PS.PAID if paid else PS.PENDING
    p.paid_at = now if paid else None
    session.add(p)
    session.flush()
    if paid:
        pricing.record_promo_usage(session, p, visit.child.parent_id)
    audit(session, actor, "payment.created", "payment", p.id, visit_id=visit.id, amount=p.amount, status=p.status)
    return p


def create_online(
    session: Session,
    *,
    visit: Visit,
    quote: Quote,
    extension: Extension,
    actor: Actor,
    now: datetime,
    provider: PaymentProvider | None = None,
) -> Payment:
    provider = provider or get_payment_provider()
    p = _new(visit, quote, PaymentKind.EXTENSION, PaymentMethod.ONLINE, extension, actor, now)
    p.status = PS.CREATED
    p.provider = provider.name
    session.add(p)
    session.flush()
    try:
        result = provider.create(p, f"Продление посещения №{visit.id} на {quote.minutes} мин")
    except Exception as exc:  # noqa: BLE001 — любая ошибка провайдера
        raise PaymentUnavailable("Платёжный сервис недоступен, попробуйте позже") from exc
    p.provider_payment_id = result.provider_payment_id
    p.pay_url = result.pay_url
    p.status = PS.PENDING
    audit(session, actor, "payment.created", "payment", p.id, visit_id=visit.id, amount=p.amount, status=p.status)
    return p


def _lock(session: Session, payment_id: int) -> Payment:
    p = session.get(Payment, payment_id, with_for_update=True)
    if p is None:
        raise NotFound("Платёж не найден")
    return p


def mark_paid(session: Session, payment_id: int, now: datetime, *, actor: Actor) -> Payment:
    """Платёж подтверждён (webhook провайдера или кассир). Повторный вызов безопасен."""
    p = _lock(session, payment_id)
    if p.status == PS.PAID:
        return p
    if p.status == PS.REFUNDED:
        raise InvalidStatus("Платёж уже возвращён")
    # Даже если платёж был отменён/с ошибкой, деньги могли всё же списаться —
    # фиксируем факт оплаты, а дальше решаем, применить ли продление.
    p.status = PS.PAID
    p.paid_at = now
    p.updated_at = now
    p.error = None
    visit = p.visit
    pricing.record_promo_usage(session, p, visit.child.parent_id)
    audit(session, actor, "payment.paid", "payment", p.id, visit_id=visit.id, amount=p.amount)
    if p.method == PaymentMethod.ONLINE:
        notifications.notify_parent(session, NotificationEvent.PAYMENT_PAID, visit, now, amount=p.amount)
    if p.kind == PaymentKind.EXTENSION:
        from app.services import extensions  # отложенный импорт: модули ссылаются друг на друга

        extensions.apply_paid(session, p, now, actor)
    return p


def mark_failed(
    session: Session, payment_id: int, now: datetime, *, actor: Actor, error: str, cancelled: bool = False
) -> Payment:
    """Платёж отклонён (cancelled=False) или отменён родителем (cancelled=True)."""
    p = _lock(session, payment_id)
    if p.status not in (PS.CREATED, PS.PENDING):
        return p
    p.status = PS.CANCELLED if cancelled else PS.FAILED
    p.error = error
    p.updated_at = now
    if p.extension_id is not None:
        ext = session.get(Extension, p.extension_id)
        if ext.status == ExtensionStatus.PENDING_PAYMENT:
            ext.status = ExtensionStatus.CANCELLED if cancelled else ExtensionStatus.FAILED
    audit(session, actor, f"payment.{p.status}", "payment", p.id, visit_id=p.visit_id, error=error)
    if p.method == PaymentMethod.ONLINE:
        notifications.notify_parent(session, NotificationEvent.PAYMENT_FAILED, p.visit, now, amount=p.amount)
    return p


def cancel_if_pending(session: Session, payment: Payment, now: datetime) -> None:
    if payment.status in (PS.CREATED, PS.PENDING):
        payment.status = PS.CANCELLED
        payment.updated_at = now


def visit_payment_status(payments: list[Payment]) -> VisitPaymentStatus:
    """Итоговый статус оплаты посещения (§32). Неудачные/отменённые попытки
    оплатить продление не портят статус уже оплаченного посещения."""
    relevant = [
        p for p in payments if not (p.kind == PaymentKind.EXTENSION and p.status in (PS.FAILED, PS.CANCELLED))
    ]
    if not relevant:
        return VisitPaymentStatus.UNPAID
    statuses = {p.status for p in relevant}
    if statuses <= {PS.REFUNDED}:
        return VisitPaymentStatus.REFUNDED
    if statuses & {PS.CREATED, PS.PENDING}:
        return VisitPaymentStatus.PENDING
    if PS.FAILED in statuses:
        return VisitPaymentStatus.FAILED
    if statuses <= {PS.CANCELLED}:
        return VisitPaymentStatus.CANCELLED
    return VisitPaymentStatus.PAID


def total_paid(payments: list[Payment]) -> Decimal:
    return sum((p.amount for p in payments if p.status == PS.PAID), Decimal(0))
