"""Просмотр журнала действий (§41). Запись в журнал — функция audit() в ядре."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import Admin, SessionDep
from app.db.models import AuditLog
from app.schemas import AuditOut

router = APIRouter(prefix="/api", tags=["Журнал действий"])


@router.get("/audit", response_model=list[AuditOut])
def audit_log(
    session: SessionDep,
    _: Admin,
    entity_type: str | None = None,
    entity_id: int | None = None,
    actor_user_id: int | None = None,
    limit: int = 100,
):
    """Журнал ключевых действий (§41): кто зарегистрировал, создал, завершил, продлил."""
    query = select(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 500))
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)
    if actor_user_id is not None:
        query = query.where(AuditLog.actor_user_id == actor_user_id)
    return session.scalars(query).all()
