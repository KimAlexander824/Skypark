"""Дети: карточка ребёнка (§7, §23). Регистрация, фото и биометрия — в ядре (app/api/children.py)."""

from fastapi import APIRouter

from app.api import views
from app.api.deps import SessionDep, Staff
from app.db.models import Child
from app.schemas import ChildCard
from app.services.errors import NotFound

router = APIRouter(prefix="/api", tags=["Дети и родители"])


@router.get("/children/{child_id}", response_model=ChildCard)
def card(child_id: int, session: SessionDep, _: Staff):
    child = session.get(Child, child_id)
    if child is None:
        raise NotFound("Ребёнок не найден")
    return views.child_card(session, child)
