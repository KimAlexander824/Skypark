"""Родители: поиск по телефону (§5.1, §6.3)."""

from fastapi import APIRouter

from app.api import views
from app.api.deps import SessionDep, Staff
from app.schemas import ParentWithChildren
from app.services import registration
from app.services.errors import ParentNotFound

router = APIRouter(prefix="/api", tags=["Родители"])


@router.get("/parents/by-phone", response_model=ParentWithChildren)
def parent_by_phone(phone: str, session: SessionDep, _: Staff):
    """Шаг 1 регистрации (§5.1) и ручной поиск (§6.3): родитель и его дети по номеру."""
    parent = registration.find_parent_by_phone(session, phone)
    if parent is None:
        raise ParentNotFound("Родитель с таким номером не найден")
    return ParentWithChildren(
        **views.parent_out(parent).model_dump(),
        children=[views.child_short(c) for c in parent.children],
    )
