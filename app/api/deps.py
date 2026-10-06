"""Общие зависимости: сессия, текущий пользователь и роли (§33), время, бот."""

import hmac
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import User
from app.db.session import get_session
from app.domain.enums import Role
from app.security import decode_token
from app.services.common import Actor

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
SessionDep = Annotated[Session, Depends(get_session)]


def get_now() -> datetime:
    """Текущее время. Вынесено в зависимость, чтобы тесты могли «перематывать» часы."""
    return datetime.now(timezone.utc)


Now = Annotated[datetime, Depends(get_now)]


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], session: SessionDep) -> User:
    user_id = decode_token(token)
    user = session.get(User, user_id) if user_id is not None else None
    if user is None or not user.is_active:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Нужно войти заново", headers={"WWW-Authenticate": "Bearer"}
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require(*roles: Role):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав")
        return user

    return checker


Staff = Annotated[User, Depends(require(Role.ADMIN, Role.EMPLOYEE))]
Admin = Annotated[User, Depends(require(Role.ADMIN))]
NannyUser = Annotated[User, Depends(require(Role.NANNY))]


def actor(user: User) -> Actor:
    return Actor.of(user)


def require_bot(x_bot_token: Annotated[str | None, Header()] = None) -> None:
    """API бота защищено общим секретом BOT_API_TOKEN (заголовок X-Bot-Token)."""
    expected = get_settings().bot_api_token
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "API бота выключено (BOT_API_TOKEN не задан)")
    if not x_bot_token or not hmac.compare_digest(x_bot_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный токен бота")


BotAuth = Depends(require_bot)
