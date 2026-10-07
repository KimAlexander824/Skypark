"""Модели запросов и ответов API администрирования (владелец — Акмаль)."""

from datetime import datetime

from app.schemas.core import ORM, ChildShort, ParentOut


class ParentWithChildren(ParentOut):
    children: list[ChildShort]


class AuditOut(ORM):
    id: int
    actor_type: str
    actor_user_id: int | None
    action: str
    entity_type: str
    entity_id: int | None
    data: dict
    created_at: datetime
