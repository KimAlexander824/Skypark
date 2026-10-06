"""Мелкие общие помощники: телефоны, деньги, часовой пояс, журнал действий."""

import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AuditLog, User
from app.services.errors import ValidationFailed

# ---------------------------------------------------------------- телефоны


def normalize_phone(raw: str) -> str:
    """'90 123-45-67', '+998 (90) 123 45 67', '998901234567' → '+998901234567'."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:  # местный номер без кода страны
        digits = "998" + digits
    if not 10 <= len(digits) <= 15:
        raise ValidationFailed("Неверный номер телефона", field="phone")
    return "+" + digits


# ---------------------------------------------------------------- деньги


def money(value) -> Decimal:
    """Суммы в сумах округляем до целых, но храним/отдаём в формате 50000.00 (как в БД)."""
    return Decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP).quantize(Decimal("0.01"))


# ---------------------------------------------------------------- время


@lru_cache
def park_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().park_timezone)


def local(dt: datetime) -> datetime:
    return dt.astimezone(park_tz())


def hhmm(dt: datetime) -> str:
    return local(dt).strftime("%H:%M")


# ---------------------------------------------------------------- журнал действий (§41)


@dataclass(frozen=True)
class Actor:
    """Кто совершает действие: сотрудник, бот (от имени родителя) или система (планировщик)."""

    type: str
    user_id: int | None = None

    @classmethod
    def of(cls, user: User) -> "Actor":
        return cls("user", user.id)


SYSTEM = Actor("system")
BOT = Actor("bot")


def audit(
    session: Session, actor: Actor, action: str, entity_type: str, entity_id: int | None, **data
) -> None:
    session.add(
        AuditLog(
            actor_type=actor.type,
            actor_user_id=actor.user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            data=json.loads(json.dumps(data, default=str)),
        )
    )
