"""Таблицы ядра (владелец — ядро: распознавание, посещения, оплаты).

Их создаёт и меняет логика ядра по ходу посещения. Админка может их читать
(списки, фильтры, отчёты), но правила записи — в app/services/.
"""

from datetime import date, datetime
from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models.admin import Nanny
from app.db.models.base import EMBEDDING_DIM, Base, Money, _ts
from app.domain.enums import (
    OPEN_VISIT_STATUSES,
    EndReason,
    ExtensionStatus,
    Gender,
    NotificationChannel,
    NotificationStatus,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    VisitStatus,
    sql_in,
)

__all__ = ['Parent', 'Child', 'FaceProfile', 'PromoCodeUsage', 'Visit', 'Extension', 'Payment', 'Notification', 'AuditLog']

class Parent(Base):
    __tablename__ = "parents"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True)  # +998901234567
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str | None] = mapped_column(String(64))
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    telegram_username: Mapped[str | None] = mapped_column(String(64))
    telegram_linked_at: Mapped[datetime | None] = _ts(nullable=True)
    created_at: Mapped[datetime] = _ts(default=True)

    children: Mapped[list["Child"]] = relationship(back_populates="parent", order_by="Child.id")


class Child(Base):
    __tablename__ = "children"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("parents.id"), index=True)
    first_name: Mapped[str] = mapped_column(String(64))
    last_name: Mapped[str | None] = mapped_column(String(64))
    birth_date: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(8))
    photo: Mapped[bytes | None] = mapped_column(LargeBinary)  # фото для карточки (JPEG)
    consent_at: Mapped[datetime] = _ts()  # согласие родителя на обработку фото
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _ts(default=True)

    parent: Mapped[Parent] = relationship(back_populates="children")

    __table_args__ = (
        CheckConstraint(f"gender is null or {sql_in('gender', Gender)}", name="ck_children_gender"),
    )

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p)


class FaceProfile(Base):
    """Эмбеддинг лица (§6.1, FaceProfile из §40). У ребёнка их несколько:
    фото с регистрации (хранится всегда) + последние фото с визитов."""

    __tablename__ = "face_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id", ondelete="CASCADE"), index=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    det_score: Mapped[float] = mapped_column(Float)
    thumbnail: Mapped[bytes] = mapped_column(LargeBinary)
    source: Mapped[str] = mapped_column(String(16), default="registration")
    created_at: Mapped[datetime] = _ts(default=True)

    __table_args__ = (
        Index(
            "ix_face_profiles_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )




class PromoCodeUsage(Base):
    """Факт применения промокода. Пишется, когда платёж стал «Оплачен»."""

    __tablename__ = "promo_code_usages"

    id: Mapped[int] = mapped_column(primary_key=True)
    promo_code_id: Mapped[int] = mapped_column(ForeignKey("promo_codes.id"), index=True)
    parent_id: Mapped[int] = mapped_column(ForeignKey("parents.id"), index=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id"), unique=True)
    used_at: Mapped[datetime] = _ts(default=True)




class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(ForeignKey("children.id"), index=True)
    nanny_id: Mapped[int] = mapped_column(ForeignKey("nannies.id"), index=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("duration_options.id"))
    base_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24))
    started_at: Mapped[datetime] = _ts()
    # Плановое окончание: старт + базовые минуты + применённые продления.
    planned_end_at: Mapped[datetime] = _ts()
    # Фактическое окончание. Неиспользованное время = planned_end_at − ended_at.
    ended_at: Mapped[datetime | None] = _ts(nullable=True)
    end_reason: Mapped[str | None] = mapped_column(String(16))
    # Для какого planned_end_at уже отправлено напоминание «осталось 15 минут».
    reminder_sent_for: Mapped[datetime | None] = _ts(nullable=True)
    extension_declined_at: Mapped[datetime | None] = _ts(nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    completed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _ts(default=True)

    child: Mapped[Child] = relationship()
    nanny: Mapped[Nanny] = relationship()
    extensions: Mapped[list["Extension"]] = relationship(order_by="Extension.id", back_populates="visit")
    payments: Mapped[list["Payment"]] = relationship(order_by="Payment.id", back_populates="visit")

    __table_args__ = (
        CheckConstraint(sql_in("status", VisitStatus), name="ck_visits_status"),
        CheckConstraint(
            f"end_reason is null or {sql_in('end_reason', EndReason)}", name="ck_visits_end_reason"
        ),
        CheckConstraint("planned_end_at > started_at", name="ck_visits_planned_end"),
        CheckConstraint("ended_at is null or ended_at >= started_at", name="ck_visits_ended_at"),
        # Ребёнок не может быть на двух посещениях одновременно (§44).
        Index(
            "uq_visits_one_open_per_child",
            "child_id",
            unique=True,
            postgresql_where=text(sql_in("status", OPEN_VISIT_STATUSES)),
        ),
        Index("ix_visits_status_planned_end", "status", "planned_end_at"),
    )


class Extension(Base):
    __tablename__ = "extensions"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("duration_options.id"))
    minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24))
    requested_by: Mapped[str] = mapped_column(String(16))  # parent | staff
    requested_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _ts(default=True)
    applied_at: Mapped[datetime | None] = _ts(nullable=True)

    visit: Mapped[Visit] = relationship(back_populates="extensions")

    __table_args__ = (
        CheckConstraint(sql_in("status", ExtensionStatus), name="ck_extensions_status"),
        CheckConstraint("requested_by in ('parent', 'staff')", name="ck_extensions_requested_by"),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    extension_id: Mapped[int | None] = mapped_column(ForeignKey("extensions.id"), unique=True)
    kind: Mapped[str] = mapped_column(String(16))
    method: Mapped[str] = mapped_column(String(16))
    provider: Mapped[str | None] = mapped_column(String(32))
    provider_payment_id: Mapped[str | None] = mapped_column(String(128))
    pay_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    base_amount: Mapped[Decimal] = mapped_column(Money)
    discount_id: Mapped[int | None] = mapped_column(ForeignKey("discounts.id"))
    discount_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal(0))
    promo_code_id: Mapped[int | None] = mapped_column(ForeignKey("promo_codes.id"))
    promo_amount: Mapped[Decimal] = mapped_column(Money, default=Decimal(0))
    amount: Mapped[Decimal] = mapped_column(Money)  # к оплате
    error: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _ts(default=True)
    paid_at: Mapped[datetime | None] = _ts(nullable=True)
    updated_at: Mapped[datetime] = _ts(default=True)

    visit: Mapped[Visit] = relationship(back_populates="payments")

    __table_args__ = (
        CheckConstraint(sql_in("kind", PaymentKind), name="ck_payments_kind"),
        CheckConstraint(sql_in("method", PaymentMethod), name="ck_payments_method"),
        CheckConstraint(sql_in("status", PaymentStatus), name="ck_payments_status"),
        CheckConstraint("amount >= 0", name="ck_payments_amount"),
        CheckConstraint(
            "(kind = 'extension') = (extension_id is not null)", name="ck_payments_extension"
        ),
        Index("ix_payments_provider_id", "provider", "provider_payment_id"),
    )


# ---------------------------------------------------------------- уведомления и журнал


class Notification(Base):
    """Очередь уведомлений (outbox). Ядро только записывает событие, а доставляет
    его бот (channel=telegram) или веб-интерфейс сотрудника (channel=web).
    Если Telegram недоступен, уведомление не теряется, а ждёт повторной попытки (§43)."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    event: Mapped[str] = mapped_column(String(32))
    channel: Mapped[str] = mapped_column(String(16))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("parents.id"), index=True)
    chat_id: Mapped[int | None] = mapped_column(BigInteger)
    visit_id: Mapped[int | None] = mapped_column(ForeignKey("visits.id"), index=True)
    message: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(16))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    next_attempt_at: Mapped[datetime] = _ts(default=True)
    last_error: Mapped[str | None] = mapped_column(Text)
    dedup_key: Mapped[str | None] = mapped_column(String(128), unique=True)
    created_at: Mapped[datetime] = _ts(default=True)
    sent_at: Mapped[datetime | None] = _ts(nullable=True)
    read_at: Mapped[datetime | None] = _ts(nullable=True)

    __table_args__ = (
        CheckConstraint(sql_in("channel", NotificationChannel), name="ck_notifications_channel"),
        CheckConstraint(sql_in("status", NotificationStatus), name="ck_notifications_status"),
        Index("ix_notifications_queue", "channel", "status", "next_attempt_at"),
    )


class AuditLog(Base):
    """Журнал ключевых действий (§41)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_type: Mapped[str] = mapped_column(String(16))  # user | bot | system
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = _ts(default=True)

    __table_args__ = (Index("ix_audit_log_entity", "entity_type", "entity_id"),)
