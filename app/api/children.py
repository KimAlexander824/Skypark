"""Регистрация, карточка, фото и биометрия ребёнка (§5–8)."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from sqlalchemy import delete, select

from app.api import views
from app.api.deps import Admin, CurrentUser, Now, SessionDep, Staff, actor
from app.db.models import Child, FaceProfile, Visit
from app.domain.enums import OPEN_VISIT_STATUSES, Role
from app.schemas import ChildCard, VisitOut
from app.services import recognition, registration
from app.services.common import audit
from app.services.errors import ConsentRequired, Forbidden, NotFound
from app.services.face import FaceEngine, extract_face, require_face_engine

router = APIRouter(prefix="/api", tags=["Дети и родители"])
FaceEngineDep = Annotated[FaceEngine, Depends(require_face_engine)]


def _child(session, child_id: int) -> Child:
    child = session.get(Child, child_id)
    if child is None:
        raise NotFound("Ребёнок не найден")
    return child




@router.post("/registration", response_model=ChildCard, status_code=201)
def register(
    session: SessionDep,
    user: Staff,
    engine: FaceEngineDep,
    now: Now,
    first_name: Annotated[str, Form(min_length=1, max_length=64)],
    consent: Annotated[bool, Form(description="Родитель согласен на обработку фото")],
    photo: Annotated[UploadFile, File()],
    parent_id: Annotated[int | None, Form(description="Существующий родитель")] = None,
    parent_phone: Annotated[str | None, Form()] = None,
    parent_first_name: Annotated[str | None, Form()] = None,
    parent_last_name: Annotated[str | None, Form()] = None,
    last_name: Annotated[str | None, Form(max_length=64)] = None,
    birth_date: Annotated[date | None, Form()] = None,
    gender: Annotated[Literal["male", "female"] | None, Form()] = None,
    force: Annotated[bool, Form(description="Зарегистрировать, даже если найден похожий ребёнок")] = False,
):
    """Регистрация ребёнка (§5, §6.1). Родитель — либо parent_id, либо телефон (+ имя,
    если родителя ещё нет). Если похожий ребёнок уже есть — 409 possible_duplicate."""
    if not consent:
        raise ConsentRequired("Нужно согласие родителя на обработку фотографии ребёнка")
    face = extract_face(engine, photo.file.read(), require_single=True)
    parent = registration.get_or_create_parent(
        session,
        parent_id=parent_id,
        phone=parent_phone,
        first_name=parent_first_name,
        last_name=parent_last_name,
        actor=actor(user),
    )
    child = registration.register_child(
        session,
        parent=parent,
        first_name=first_name,
        last_name=last_name,
        birth_date=birth_date,
        gender=gender,
        face=face,
        force=force,
        actor=actor(user),
        now=now,
    )
    session.commit()
    session.refresh(parent)
    return views.child_card(session, child)




@router.get("/children/{child_id}/visits", response_model=list[VisitOut])
def history(child_id: int, session: SessionDep, _: Staff, now: Now, limit: int = 50):
    """История посещений ребёнка (§7), новые сверху."""
    _child(session, child_id)
    rows = session.scalars(
        select(Visit).where(Visit.child_id == child_id).order_by(Visit.id.desc()).limit(min(limit, 200))
    ).all()
    return [views.visit_out(session, v, now) for v in rows]


@router.get("/children/{child_id}/photo", response_class=Response)
def child_photo(child_id: int, session: SessionDep, user: CurrentUser):
    """Фото ребёнка (§42: доступ ограничен). Няня видит только детей, которые сейчас у неё."""
    child = _child(session, child_id)
    if user.role == Role.NANNY:
        assigned = session.scalar(
            select(Visit.id).where(
                Visit.child_id == child_id,
                Visit.nanny_id == (user.nanny.id if user.nanny else -1),
                Visit.status.in_(OPEN_VISIT_STATUSES),
            )
        )
        if assigned is None:
            raise Forbidden("Этот ребёнок сейчас не у вас")
    if child.photo is None:
        raise NotFound("Фото нет")
    return Response(child.photo, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.post("/children/{child_id}/faces", status_code=204)
def add_face(
    child_id: int,
    session: SessionDep,
    user: Staff,
    engine: FaceEngineDep,
    photo: Annotated[UploadFile, File()],
):
    """Добавить ещё одно фото лица: например, после подтверждённого визита или если
    ребёнка плохо узнаёт. Хранится до MAX_FACE_PROFILES_PER_CHILD фото."""
    _child(session, child_id)
    face = extract_face(engine, photo.file.read(), require_single=False)
    recognition.add_profile(session, child_id, face, source="visit")
    audit(session, actor(user), "child.face_added", "child", child_id)
    session.commit()


@router.delete("/children/{child_id}/faces", status_code=204)
def forget_face(child_id: int, session: SessionDep, user: Admin):
    """Удалить биометрию ребёнка (по просьбе родителя, §42). Карточка и история
    остаются, но по лицу ребёнок больше не находится."""
    child = _child(session, child_id)
    session.execute(delete(FaceProfile).where(FaceProfile.child_id == child_id))
    child.photo = None
    audit(session, actor(user), "child.biometrics_deleted", "child", child_id)
    session.commit()
