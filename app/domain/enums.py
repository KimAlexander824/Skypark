"""Справочники статусов и правила переходов (ТЗ §31, §32, §10, §19).

В БД статусы хранятся строками (значения ниже), подписи для интерфейса — в LABELS.
"""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "admin"
    EMPLOYEE = "employee"  # сотрудник Скайпарка
    NANNY = "nanny"


STAFF_ROLES = (Role.ADMIN, Role.EMPLOYEE)


class Gender(StrEnum):
    MALE = "male"
    FEMALE = "female"


class VisitStatus(StrEnum):
    CREATED = "created"  # Создано
    ACTIVE = "active"  # Активно
    AWAITING_EXTENSION = "awaiting_extension"  # Ожидает продления
    EXTENDED = "extended"  # Продлено
    COMPLETED = "completed"  # Завершено
    CANCELLED = "cancelled"  # Отменено


# Посещение "идёт": ребёнок на площадке, няня занята.
OPEN_VISIT_STATUSES = (
    VisitStatus.CREATED,
    VisitStatus.ACTIVE,
    VisitStatus.AWAITING_EXTENSION,
    VisitStatus.EXTENDED,
)

# Разрешённые переходы статуса посещения.
VISIT_TRANSITIONS: dict[VisitStatus, set[VisitStatus]] = {
    VisitStatus.CREATED: {VisitStatus.ACTIVE, VisitStatus.CANCELLED},
    VisitStatus.ACTIVE: {
        VisitStatus.AWAITING_EXTENSION,  # за 15 минут до конца
        VisitStatus.EXTENDED,  # сотрудник продлил на кассе
        VisitStatus.COMPLETED,
        VisitStatus.CANCELLED,
    },
    VisitStatus.AWAITING_EXTENSION: {
        VisitStatus.EXTENDED,  # родитель оплатил продление
        VisitStatus.ACTIVE,  # родитель отказался от продления
        VisitStatus.COMPLETED,
        VisitStatus.CANCELLED,
    },
    VisitStatus.EXTENDED: {
        VisitStatus.EXTENDED,  # продлили ещё раз
        VisitStatus.AWAITING_EXTENSION,
        VisitStatus.COMPLETED,
        VisitStatus.CANCELLED,
    },
    VisitStatus.COMPLETED: set(),
    VisitStatus.CANCELLED: set(),
}


class EndReason(StrEnum):
    MANUAL = "manual"  # сотрудник завершил
    AUTO = "auto"  # закончилось оплаченное время
    CANCELLED = "cancelled"


class ExtensionStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    APPLIED = "applied"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OptionKind(StrEnum):
    VISIT = "visit"  # продолжительность посещения
    EXTENSION = "extension"  # продление


class PaymentKind(StrEnum):
    VISIT = "visit"
    EXTENSION = "extension"


class PaymentMethod(StrEnum):
    OFFLINE = "offline"  # касса/терминал в Скайпарке
    ONLINE = "online"  # онлайн через провайдера (продление из Telegram)


class PaymentStatus(StrEnum):
    """Статус одного платежа (§19)."""

    CREATED = "created"
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class VisitPaymentStatus(StrEnum):
    """Итоговый статус оплаты посещения (§32), считается из платежей."""

    UNPAID = "unpaid"
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class NannyStatus(StrEnum):
    """Статус, который задаёт сама няня/администратор."""

    WORKING = "working"
    BREAK = "break"
    OFF = "off"


class NannyEffectiveStatus(StrEnum):
    """Что видит сотрудник при выборе няни (§10)."""

    FREE = "free"  # Свободна
    BUSY = "busy"  # Занята (достигнут лимит детей)
    BREAK = "break"  # Перерыв
    OFF = "off"  # Не работает


class DiscountType(StrEnum):
    PERCENT = "percent"
    FIXED = "fixed"


class AppliesTo(StrEnum):
    ANY = "any"
    VISIT = "visit"
    EXTENSION = "extension"


class NotificationEvent(StrEnum):
    VISIT_STARTED = "visit_started"
    VISIT_ENDING_SOON = "visit_ending_soon"
    EXTENSION_APPLIED = "extension_applied"
    EXTENSION_DECLINED = "extension_declined"
    PAYMENT_PAID = "payment_paid"
    PAYMENT_FAILED = "payment_failed"
    VISIT_COMPLETED = "visit_completed"
    REFUND_REQUIRED = "refund_required"


class NotificationChannel(StrEnum):
    TELEGRAM = "telegram"  # родителю через бота
    WEB = "web"  # сотрудникам в веб-интерфейсе


class NotificationStatus(StrEnum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"  # например, родитель не привязал Telegram


VISIT_STATUS_LABELS = {
    VisitStatus.CREATED: "Создано",
    VisitStatus.ACTIVE: "Активно",
    VisitStatus.AWAITING_EXTENSION: "Ожидает продления",
    VisitStatus.EXTENDED: "Продлено",
    VisitStatus.COMPLETED: "Завершено",
    VisitStatus.CANCELLED: "Отменено",
}

PAYMENT_STATUS_LABELS = {
    VisitPaymentStatus.UNPAID: "Не оплачено",
    VisitPaymentStatus.PENDING: "Ожидает оплаты",
    VisitPaymentStatus.PAID: "Оплачено",
    VisitPaymentStatus.FAILED: "Ошибка",
    VisitPaymentStatus.CANCELLED: "Отменено",
    VisitPaymentStatus.REFUNDED: "Возвращено",
}

NANNY_STATUS_LABELS = {
    NannyEffectiveStatus.FREE: "Свободна",
    NannyEffectiveStatus.BUSY: "Занята",
    NannyEffectiveStatus.BREAK: "Перерыв",
    NannyEffectiveStatus.OFF: "Не работает",
}


def visit_status_label(status: str) -> str:
    return VISIT_STATUS_LABELS[VisitStatus(status)]


def sql_in(column: str, values) -> str:
    """Для CheckConstraint: "status in ('a', 'b')"."""
    return f"{column} in ({', '.join(repr(str(v)) for v in values)})"
