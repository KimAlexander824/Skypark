"""Регистрация ребёнка (§5, §6.1, §8): родитель → данные ребёнка → фото → карточка."""

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Child, Parent
from app.services import recognition
from app.services.common import Actor, audit, normalize_phone
from app.services.errors import DuplicateChild, NotFound, ValidationFailed
from app.services.face import DetectedFace


def find_parent_by_phone(session: Session, phone: str) -> Parent | None:
    return session.scalar(select(Parent).where(Parent.phone == normalize_phone(phone)))


def get_or_create_parent(
    session: Session,
    *,
    parent_id: int | None,
    phone: str | None,
    first_name: str | None,
    last_name: str | None,
    actor: Actor,
) -> Parent:
    if parent_id:  # 0 или пусто — «не указан» (Swagger иногда подставляет 0)
        parent = session.get(Parent, parent_id)
        if parent is None:
            raise NotFound(
                f"Родитель с id={parent_id} не найден. Для нового родителя оставьте parent_id пустым "
                "и укажите parent_phone и parent_first_name"
            )
        return parent
    if not phone:
        raise ValidationFailed("Укажите телефон родителя или выберите существующего", field="parent_phone")
    parent = find_parent_by_phone(session, phone)
    if parent is not None:
        return parent  # родитель с таким номером уже есть — используем его (§5.1)
    if not first_name or not first_name.strip():
        raise ValidationFailed("Укажите имя родителя", field="parent_first_name")
    parent = Parent(
        phone=normalize_phone(phone),
        first_name=first_name.strip(),
        last_name=(last_name or "").strip() or None,
    )
    session.add(parent)
    session.flush()
    audit(session, actor, "parent.created", "parent", parent.id, phone=parent.phone)
    return parent


def register_child(
    session: Session,
    *,
    parent: Parent,
    first_name: str,
    last_name: str | None,
    birth_date: date | None,
    gender: str | None,
    face: DetectedFace,
    force: bool,
    actor: Actor,
    now: datetime,
) -> Child:
    """Создаёт карточку ребёнка и его первый FaceProfile.

    Перед созданием ищем похожих: если ребёнок уже есть в базе, регистрировать
    его заново не нужно. force=True — сотрудник проверил и это действительно
    другой ребёнок (например, близнец)."""
    if not force:
        similar = [c for c in recognition.find_candidates(session, face.embedding) if c.is_match]
        if similar:
            children = {
                c.id: c for c in session.scalars(select(Child).where(Child.id.in_([s.child_id for s in similar])))
            }
            raise DuplicateChild(
                "Похожий ребёнок уже зарегистрирован. Проверьте карточку или подтвердите, что это другой ребёнок",
                candidates=[
                    {
                        "child_id": c.child_id,
                        "name": children[c.child_id].full_name,
                        "parent_id": children[c.child_id].parent_id,
                        "confidence": c.confidence,
                    }
                    for c in similar
                ],
            )

    child = Child(
        parent_id=parent.id,
        first_name=first_name.strip(),
        last_name=(last_name or "").strip() or None,
        birth_date=birth_date,
        gender=gender,
        photo=face.card_photo,
        consent_at=now,
        created_by_id=actor.user_id,
    )
    session.add(child)
    session.flush()
    recognition.add_profile(session, child.id, face, source="registration")
    audit(session, actor, "child.registered", "child", child.id, parent_id=parent.id, forced=force)
    return child
