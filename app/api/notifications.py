"""Уведомления для сотрудников (web) и журнал действий."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import Admin, Now, SessionDep, Staff
from app.db.models import AuditLog, Notification
from app.domain.enums import NotificationChannel
from app.schemas import AuditOut, NotificationOut
from app.services.errors import NotFound

router = APIRouter(prefix="/api", tags=["Уведомления и журнал"])


@router.get("/notifications", response_model=list[NotificationOut])
def staff_notifications(session: SessionDep, _: Staff, unread_only: bool = True, limit: int = 50):
    """Уведомления для сотрудников: отказ от продления, продление, завершение, нужен возврат."""
    query = (
        select(Notification)
        .where(Notification.channel == NotificationChannel.WEB)
        .order_by(Notification.id.desc())
        .limit(min(limit, 200))
    )
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    return session.scalars(query).all()


@router.post("/notifications/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, session: SessionDep, _: Staff, now: Now):
    n = session.get(Notification, notification_id)
    if n is None or n.channel != NotificationChannel.WEB:
        raise NotFound("Уведомление не найдено")
    n.read_at = n.read_at or now
    session.commit()


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
