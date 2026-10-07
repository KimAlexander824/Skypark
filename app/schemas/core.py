"""Модели запросов и ответов API ядра — контракт для фронтенда и бота."""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- пользователи


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class UserOut(ORM):
    id: int
    login: str
    role: str
    full_name: str
    nanny_id: int | None = None


# ---------------------------------------------------------------- родители и дети


class ParentOut(ORM):
    id: int
    phone: str
    first_name: str
    last_name: str | None
    telegram_linked: bool
    telegram_username: str | None


class ChildShort(ORM):
    id: int
    parent_id: int
    first_name: str
    last_name: str | None
    birth_date: date | None
    gender: str | None




class ChildCard(ChildShort):
    """Карточка ребёнка (§7). История посещений — GET /api/children/{id}/visits."""

    parent: ParentOut
    siblings: list[ChildShort]
    active_visit_id: int | None
    visits_count: int
    face_profiles: int
    created_at: datetime


# ---------------------------------------------------------------- распознавание


class RecognitionCandidate(BaseModel):
    child: ChildShort
    parent_phone: str
    confidence: float
    is_match: bool
    active_visit_id: int | None


class RecognitionResult(BaseModel):
    """status: found — ребёнок найден (child_id); not_found — нет совпадения
    (предложить регистрацию или поиск по телефону); ambiguous — несколько похожих
    (сотрудник выбирает из candidates)."""

    status: Literal["found", "not_found", "ambiguous"]
    child_id: int | None
    confidence: float | None
    message: str
    candidates: list[RecognitionCandidate]


# ---------------------------------------------------------------- няни и варианты


class NannyOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    has_photo: bool
    status: str  # free | busy | break | off
    status_label: str
    load: int
    max_children: int
    available: bool


class NannyStatusIn(BaseModel):
    status: Literal["working", "break"]


class OptionOut(ORM):
    id: int
    kind: str
    name: str
    minutes: int
    price: Decimal


class ExtensionOptionOut(OptionOut):
    available: bool  # False — продление закончится после закрытия парка


# ---------------------------------------------------------------- посещения


class QuoteIn(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"child_id": 1, "option_id": 1}})

    child_id: int
    option_id: int
    discount_id: int | None = None
    promo_code: str | None = None


class QuoteOut(BaseModel):
    option_id: int
    minutes: int
    base_amount: Decimal
    discount_amount: Decimal
    promo_amount: Decimal
    total: Decimal


class VisitCreate(QuoteIn):
    model_config = ConfigDict(json_schema_extra={"example": {"child_id": 1, "nanny_id": 1, "option_id": 1}})

    nanny_id: int
    paid: bool = Field(True, description="Оплачено на кассе сразу. False — статус «Ожидает оплаты»")


class ExtensionCreate(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"option_id": 4}})

    option_id: int
    discount_id: int | None = None
    promo_code: str | None = None


class CancelIn(BaseModel):
    reason: str = Field(min_length=3)


class NannyShort(BaseModel):
    id: int
    full_name: str


class PaymentOut(ORM):
    id: int
    kind: str
    method: str
    status: str
    amount: Decimal
    base_amount: Decimal
    discount_amount: Decimal
    promo_amount: Decimal
    pay_url: str | None
    created_at: datetime
    paid_at: datetime | None


class ExtensionOut(ORM):
    id: int
    minutes: int
    status: str
    requested_by: str
    created_at: datetime
    applied_at: datetime | None


class VisitOut(BaseModel):
    id: int
    status: str
    status_label: str
    child: ChildShort
    nanny: NannyShort
    started_at: datetime
    planned_end_at: datetime
    ended_at: datetime | None
    end_reason: str | None
    total_minutes: int
    elapsed_seconds: int
    remaining_seconds: int  # < 0 — время вышло, посещение ещё не закрыто
    extended: bool
    extension_pending: bool
    extension_declined: bool
    payment_status: str
    payment_status_label: str
    total_paid: Decimal
    server_time: datetime


class VisitDetail(VisitOut):
    extensions: list[ExtensionOut]
    payments: list[PaymentOut]


class ExtensionResult(BaseModel):
    extension_id: int
    status: str
    payment: PaymentOut
    visit: VisitOut


# ---------------------------------------------------------------- уведомления


class NotificationOut(ORM):
    id: int
    event: str
    visit_id: int | None
    message: str
    payload: dict
    created_at: datetime
    read_at: datetime | None


class BotNotificationOut(ORM):
    id: int
    event: str
    chat_id: int
    message: str
    payload: dict
    attempts: int


class DeliveryResultIn(BaseModel):
    success: bool
    error: str | None = None
    permanent: bool = Field(False, description="True — повторять бесполезно (бот заблокирован)")


# ---------------------------------------------------------------- бот


class BotLinkIn(BaseModel):
    model_config = ConfigDict(json_schema_extra={"example": {"phone": "+998901112233", "chat_id": 123}})

    phone: str = Field(description="Номер, который родитель отправил кнопкой «Поделиться контактом»")
    chat_id: int
    username: str | None = None


class BotChatIn(BaseModel):
    chat_id: int


class BotExtendIn(BotChatIn):
    model_config = ConfigDict(json_schema_extra={"example": {"chat_id": 123, "option_id": 4}})

    option_id: int
    promo_code: str | None = None
