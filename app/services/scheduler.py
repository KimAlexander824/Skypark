"""Фоновые задачи ядра. Запускаются воркером (app/worker.py) каждые ~20 секунд.

1. Напоминание за 15 минут до конца (§16): статус «Ожидает продления» + уведомление родителю.
2. Автозавершение по окончании оплаченного времени (§12). Если родитель как раз
   оплачивает продление, ждём extension_payment_grace_minutes.

Каждая задача идемпотентна: повторный запуск в ту же минуту ничего не продублирует,
а SKIP LOCKED позволяет запускать несколько воркеров.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Extension, Visit
from app.domain.enums import OPEN_VISIT_STATUSES, ExtensionStatus, NotificationEvent, VisitStatus
from app.services import notifications, visits
from app.services.common import SYSTEM, audit

log = logging.getLogger(__name__)
VS = VisitStatus


@dataclass
class TickResult:
    reminders: int = 0
    completed: int = 0


def send_reminders(session: Session, now: datetime) -> int:
    lead = timedelta(minutes=get_settings().reminder_minutes_before_end)
    due = session.scalars(
        select(Visit)
        .where(
            Visit.status.in_(OPEN_VISIT_STATUSES),
            Visit.planned_end_at > now,
            Visit.planned_end_at <= now + lead,
            or_(Visit.reminder_sent_for.is_(None), Visit.reminder_sent_for != Visit.planned_end_at),
        )
        .with_for_update(skip_locked=True)
    ).all()
    for visit in due:
        if visit.status in (VS.ACTIVE, VS.EXTENDED):
            visits.transition(visit, VS.AWAITING_EXTENSION)
        visit.reminder_sent_for = visit.planned_end_at
        visit.extension_declined_at = None
        notifications.notify_parent(
            session,
            NotificationEvent.VISIT_ENDING_SOON,
            visit,
            now,
            dedup_key=f"ending_soon:{visit.id}:{visit.planned_end_at.isoformat()}",
            actions=["extend", "decline"],
        )
        audit(session, SYSTEM, "visit.reminder_sent", "visit", visit.id, planned_end=visit.planned_end_at)
    return len(due)


def auto_complete(session: Session, now: datetime) -> int:
    grace = timedelta(minutes=get_settings().extension_payment_grace_minutes)
    due = session.scalars(
        select(Visit)
        .where(Visit.status.in_(OPEN_VISIT_STATUSES), Visit.planned_end_at <= now)
        .with_for_update(skip_locked=True)
    ).all()
    done = 0
    for visit in due:
        waiting_payment = session.scalar(
            select(Extension.id).where(
                Extension.visit_id == visit.id, Extension.status == ExtensionStatus.PENDING_PAYMENT
            )
        )
        if waiting_payment and now < visit.planned_end_at + grace:
            continue
        # Точка сохранения: ошибка в одном посещении не должна блокировать остальные.
        try:
            with session.begin_nested():
                visits.complete_visit(session, visit.id, actor=SYSTEM, now=now, auto=True)
            done += 1
        except Exception:
            log.exception("Не удалось автоматически завершить посещение %s", visit.id)
    return done


def tick(session: Session, now: datetime) -> TickResult:
    """Один проход планировщика. Каждая задача — в своей транзакции."""
    result = TickResult()
    for name, job in (("reminders", send_reminders), ("completed", auto_complete)):
        try:
            setattr(result, name, job(session, now))
            session.commit()
        except Exception:
            session.rollback()
            log.exception("Ошибка в задаче планировщика %s", name)
    return result
