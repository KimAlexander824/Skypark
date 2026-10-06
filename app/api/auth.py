from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import User
from app.schemas import TokenOut, UserOut
from app.security import create_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["Авторизация"])


@router.post("/login", response_model=TokenOut)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep):
    user = session.scalar(select(User).where(User.login == form.username))
    if user is None or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    return TokenOut(access_token=create_token(user.id), role=user.role)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut(
        id=user.id,
        login=user.login,
        role=user.role,
        full_name=user.full_name,
        nanny_id=user.nanny.id if user.nanny else None,
    )
