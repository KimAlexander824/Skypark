"""Таблицы администрирования (владелец — CRUD, Акмаль).

Это справочники, которые заполняет администратор: сотрудники и няни, тарифы,
скидки, промокоды, рабочее время. Ядро их только ЧИТАЕТ.

Можно свободно добавлять поля и новые таблицы. Поля, которые читает ядро,
переименовывать/удалять только вместе с владельцем ядра:
  nannies: status, max_children, user_id
  users: login, password_hash, role, is_active, first_name, last_name
  duration_options: kind, minutes, price, is_active, sort_order
  discounts / promo_codes: type, value, applies_to, сроки, лимиты, is_active, code
  work_schedule / schedule_exceptions: все поля
"""

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Time,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.base import Base, Money, _ts
from app.domain.enums import (
    AppliesTo,
    DiscountType,
    NannyStatus,
    OptionKind,
    Role,
    sql_in,
)

__all__ = ['User', 'Nanny', 'DurationOption', 'Discount', 'PromoCode', 'WorkSchedule', 'ScheduleException']

class User(Base):
    """Учётная запись сотрудника, няни или администратора."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(16))
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str | None] = mapped_column(String(64))
    phone: Mapped[str | None] = mapped_column(String(20))
    position: Mapped[str | None] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)
    created_at: Mapped[datetime] = _ts(default=True)

    nanny: Mapped["Nanny | None"] = relationship(back_populates="user", uselist=False)

    __table_args__ = (CheckConstraint(sql_in("role", Role), name="ck_users_role"),)

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p)


class Nanny(Base):
    """Профиль няни. Логинится няня через связанного User с ролью nanny."""

    __tablename__ = "nannies"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    status: Mapped[str] = mapped_column(String(16), default=NannyStatus.WORKING)
    max_children: Mapped[int] = mapped_column(Integer, default=5)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary)
    experience_years: Mapped[int | None] = mapped_column(Integer)
    started_work_on: Mapped[date | None] = mapped_column(Date)

    user: Mapped[User] = relationship(back_populates="nanny")

    __table_args__ = (
        CheckConstraint(sql_in("status", NannyStatus), name="ck_nannies_status"),
        CheckConstraint("max_children > 0", name="ck_nannies_max_children"),
    )



class DurationOption(Base):
    """Варианты продолжительности: «1 час — 50 000», продление «+30 мин — 30 000»."""

    __tablename__ = "duration_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(64))
    minutes: Mapped[int] = mapped_column(Integer)
    price: Mapped[Decimal] = mapped_column(Money)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"), default=0)

    __table_args__ = (
        CheckConstraint(sql_in("kind", OptionKind), name="ck_duration_options_kind"),
        CheckConstraint("minutes > 0", name="ck_duration_options_minutes"),
        CheckConstraint("price >= 0", name="ck_duration_options_price"),
    )


class Discount(Base):
    __tablename__ = "discounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    type: Mapped[str] = mapped_column(String(16))
    value: Mapped[Decimal] = mapped_column(Money)
    applies_to: Mapped[str] = mapped_column(String(16), default=AppliesTo.ANY)
    valid_from: Mapped[datetime | None] = _ts(nullable=True)
    valid_to: Mapped[datetime | None] = _ts(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)

    __table_args__ = (
        CheckConstraint(sql_in("type", DiscountType), name="ck_discounts_type"),
        CheckConstraint(sql_in("applies_to", AppliesTo), name="ck_discounts_applies_to"),
        CheckConstraint("value > 0", name="ck_discounts_value"),
    )


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # хранится в ВЕРХНЕМ регистре
    type: Mapped[str] = mapped_column(String(16))
    value: Mapped[Decimal] = mapped_column(Money)
    applies_to: Mapped[str] = mapped_column(String(16), default=AppliesTo.ANY)
    starts_at: Mapped[datetime | None] = _ts(nullable=True)
    ends_at: Mapped[datetime | None] = _ts(nullable=True)
    max_uses: Mapped[int | None] = mapped_column(Integer)
    max_uses_per_parent: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), default=True)
    created_at: Mapped[datetime] = _ts(default=True)

    __table_args__ = (
        CheckConstraint(sql_in("type", DiscountType), name="ck_promo_codes_type"),
        CheckConstraint(sql_in("applies_to", AppliesTo), name="ck_promo_codes_applies_to"),
        CheckConstraint("value > 0", name="ck_promo_codes_value"),
    )



class WorkSchedule(Base):
    """Часы работы по дням недели (0 — понедельник … 6 — воскресенье), местное время.
    Если таблица пустая — ограничений по времени нет."""

    __tablename__ = "work_schedule"

    weekday: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    opens_at: Mapped[time] = mapped_column(Time)
    closes_at: Mapped[time] = mapped_column(Time)
    is_day_off: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)

    __table_args__ = (
        CheckConstraint("weekday between 0 and 6", name="ck_work_schedule_weekday"),
        CheckConstraint("closes_at > opens_at", name="ck_work_schedule_hours"),
    )


class ScheduleException(Base):
    """Праздник, временное закрытие или особые часы на конкретную дату."""

    __tablename__ = "schedule_exceptions"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=True)
    opens_at: Mapped[time | None] = mapped_column(Time)
    closes_at: Mapped[time | None] = mapped_column(Time)
    reason: Mapped[str | None] = mapped_column(String(128))

    __table_args__ = (
        CheckConstraint(
            "is_closed or (opens_at is not null and closes_at is not null and closes_at > opens_at)",
            name="ck_schedule_exceptions_hours",
        ),
    )
