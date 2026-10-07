"""Уведомления для сотрудников (web) и журнал действий."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import Now, SessionDep, Staff
from app.db.models import Notification
from app.domain.enums import NotificationChannel
from app.schemas import NotificationOut
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
