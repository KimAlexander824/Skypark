"""Расчёт стоимости (§9.1, §17), скидки (§27) и промокоды (§28).

Текущая модель цен (пока заказчик не ответил на вопросы №6–8): администратор задаёт
фиксированные варианты в duration_options. Если правило изменится (например, цена
за час), достаточно поменять base_price() — остальной код использует только Quote.

Порядок: базовая цена → скидка → промокод (на сумму после скидки). Итог не меньше 0.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Discount, DurationOption, Payment, PromoCode, PromoCodeUsage
from app.domain.enums import AppliesTo, DiscountType, OptionKind
from app.services.common import money
from app.services.errors import DiscountInvalid, OptionUnavailable, PromoInvalid


@dataclass(frozen=True)
class Quote:
    option_id: int
    kind: str
    minutes: int
    base_amount: Decimal
    discount_id: int | None = None
    discount_amount: Decimal = Decimal(0)
    promo_code_id: int | None = None
    promo_amount: Decimal = Decimal(0)

    @property
    def total(self) -> Decimal:
        return max(Decimal(0), self.base_amount - self.discount_amount - self.promo_amount)


def get_option(session: Session, option_id: int, kind: OptionKind) -> DurationOption:
    option = session.get(DurationOption, option_id)
    if option is None or not option.is_active or option.kind != kind:
        raise OptionUnavailable("Такой вариант продолжительности недоступен")
    return option


def list_options(session: Session, kind: OptionKind) -> list[DurationOption]:
    return list(
        session.scalars(
            select(DurationOption)
            .where(DurationOption.kind == kind, DurationOption.is_active)
            .order_by(DurationOption.sort_order, DurationOption.minutes)
        )
    )


def base_price(option: DurationOption) -> Decimal:
    return money(option.price)


def _reduction(type_: str, value: Decimal, amount: Decimal) -> Decimal:
    if type_ == DiscountType.PERCENT:
        return min(amount, money(amount * value / 100))
    return min(amount, money(value))


def _applies(applies_to: str, kind: str) -> bool:
    return applies_to in (AppliesTo.ANY, kind)


def _in_period(start: datetime | None, end: datetime | None, now: datetime) -> bool:
    return (start is None or start <= now) and (end is None or now <= end)


def validate_discount(session: Session, discount_id: int, kind: str, now: datetime) -> Discount:
    d = session.get(Discount, discount_id)
    if d is None or not d.is_active:
        raise DiscountInvalid("Скидка не найдена или отключена")
    if not _in_period(d.valid_from, d.valid_to, now):
        raise DiscountInvalid("Срок действия скидки истёк или ещё не начался")
    if not _applies(d.applies_to, kind):
        raise DiscountInvalid("Эта скидка не применяется к такому виду оплаты")
    return d


def validate_promo(
    session: Session, code: str, parent_id: int, kind: str, now: datetime
) -> PromoCode:
    promo = session.scalar(select(PromoCode).where(PromoCode.code == code.strip().upper()))
    if promo is None or not promo.is_active:
        raise PromoInvalid("Промокод не найден или отключён")
    if not _in_period(promo.starts_at, promo.ends_at, now):
        raise PromoInvalid("Срок действия промокода истёк или ещё не начался")
    if not _applies(promo.applies_to, kind):
        raise PromoInvalid("Промокод не применяется к такому виду оплаты")
    if promo.max_uses is not None:
        used = session.scalar(
            select(func.count()).select_from(PromoCodeUsage).where(PromoCodeUsage.promo_code_id == promo.id)
        )
        if used >= promo.max_uses:
            raise PromoInvalid("Промокод уже использован максимальное количество раз")
    if promo.max_uses_per_parent is not None:
        used = session.scalar(
            select(func.count())
            .select_from(PromoCodeUsage)
            .where(PromoCodeUsage.promo_code_id == promo.id, PromoCodeUsage.parent_id == parent_id)
        )
        if used >= promo.max_uses_per_parent:
            raise PromoInvalid("Этот родитель уже использовал промокод максимальное количество раз")
    return promo


def quote(
    session: Session,
    *,
    option: DurationOption,
    parent_id: int,
    now: datetime,
    discount_id: int | None = None,
    promo_code: str | None = None,
) -> Quote:
    base = base_price(option)
    discount_amount = Decimal(0)
    if discount_id:  # 0 / пусто — скидки нет
        d = validate_discount(session, discount_id, option.kind, now)
        discount_amount = _reduction(d.type, d.value, base)

    promo_id, promo_amount = None, Decimal(0)
    if promo_code and promo_code.strip():
        promo = validate_promo(session, promo_code, parent_id, option.kind, now)
        promo_id = promo.id
        promo_amount = _reduction(promo.type, promo.value, base - discount_amount)

    return Quote(
        option_id=option.id,
        kind=option.kind,
        minutes=option.minutes,
        base_amount=base,
        discount_id=discount_id or None,
        discount_amount=discount_amount,
        promo_code_id=promo_id,
        promo_amount=promo_amount,
    )


def record_promo_usage(session: Session, payment: Payment, parent_id: int) -> None:
    """Вызывается, когда платёж стал «Оплачен»: только тогда промокод считается использованным."""
    if payment.promo_code_id is None:
        return
    exists = session.scalar(select(PromoCodeUsage.id).where(PromoCodeUsage.payment_id == payment.id))
    if exists is None:
        session.add(
            PromoCodeUsage(promo_code_id=payment.promo_code_id, parent_id=parent_id, payment_id=payment.id)
        )
