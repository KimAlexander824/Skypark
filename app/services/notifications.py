"""Очередь уведомлений (§15, §30).

Ядро не отправляет сообщения само: оно записывает событие в таблицу notifications
в той же транзакции, что и изменение посещения. Поэтому если Telegram или бот
недоступны, событие не теряется (§43).

- channel=telegram — родителю. Бот забирает их через /api/bot/notifications/claim,
  отправляет и сообщает результат. Неудачные попытки повторяются с паузой.
- channel=web — сотрудникам. Веб-интерфейс показывает их через /api/notifications.
"""

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import Notification, Parent, Visit
from app.domain.enums import (
    OPEN_VISIT_STATUSES,
    NotificationChannel,
    NotificationEvent,
    NotificationStatus,
)
from app.services.common import hhmm
from app.services.errors import NotFound

E = NotificationEvent


def _minutes(seconds: float) -> int:
    return max(0, round(seconds / 60))


def render(event: E, p: dict) -> str:
    """Готовый текст сообщения. Бот может отправить его как есть."""
    child = p.get("child_name", "")
    match event:
        case E.VISIT_STARTED:
            return f"{child}: посещение началось в {p['started']}. Окончание в {p['planned_end']}."
        case E.VISIT_ENDING_SOON:
            return (
                f"Время посещения ({child}) заканчивается через {p['minutes_left']} мин, "
                f"в {p['planned_end']}. Хотите продлить посещение?"
            )
        case E.EXTENSION_APPLIED:
            return f"{child}: посещение продлено на {p['minutes']} мин. Новое время окончания — {p['planned_end']}."
        case E.EXTENSION_DECLINED:
            return f"{child}: родитель отказался от продления. Посещение закончится в {p['planned_end']}."
        case E.PAYMENT_PAID:
            return f"Оплата {p['amount']} сум прошла успешно."
        case E.PAYMENT_FAILED:
            return f"Оплата {p['amount']} сум не прошла. Попробуйте ещё раз или обратитесь к сотруднику."
        case E.VISIT_COMPLETED:
            return f"{child}: посещение завершено в {p['ended']}. Спасибо, что были в Скайпарке!"
        case E.REFUND_REQUIRED:
            return f"{child}: платёж {p['amount']} сум прошёл, но продление не применено ({p['reason']}). Нужен возврат."
    return event.value


def visit_payload(visit: Visit, now: datetime, **extra) -> dict:
    payload = {
        "visit_id": visit.id,
        "child_id": visit.child_id,
        "child_name": visit.child.first_name,
        "started": hhmm(visit.started_at),
        "planned_end": hhmm(visit.planned_end_at),
        "planned_end_at": visit.planned_end_at.isoformat(),
        "minutes_left": _minutes((visit.planned_end_at - now).total_seconds()),
    }
    if visit.ended_at:
        payload["ended"] = hhmm(visit.ended_at)
    payload.update({k: str(v) if not isinstance(v, (int, float, str, bool, list)) else v for k, v in extra.items()})
    return payload


def _insert(session: Session, values: dict) -> None:
    stmt = insert(Notification).values(**values)
    if values.get("dedup_key"):
        stmt = stmt.on_conflict_do_nothing(index_elements=["dedup_key"])
    session.execute(stmt)


def notify_parent(
    session: Session,
    event: E,
    visit: Visit,
    now: datetime,
    *,
    dedup_key: str | None = None,
    actions: list[str] | None = None,
    **extra,
) -> None:
    parent: Parent = visit.child.parent
    payload = visit_payload(visit, now, **extra)
    if actions:
        payload["actions"] = actions  # кнопки для бота, например ["extend", "decline"]
    linked = parent.telegram_chat_id is not None
    _insert(
        session,
        {
            "event": event.value,
            "channel": NotificationChannel.TELEGRAM.value,
            "parent_id": parent.id,
            "chat_id": parent.telegram_chat_id,
            "visit_id": visit.id,
            "message": render(event, payload),
            "payload": payload,
            "status": (NotificationStatus.PENDING if linked else NotificationStatus.SKIPPED).value,
            "last_error": None if linked else "telegram_not_linked",
            "next_attempt_at": now,
            "dedup_key": dedup_key,
            "created_at": now,
        },
    )


def notify_staff(session: Session, event: E, visit: Visit, now: datetime, **extra) -> None:
    payload = visit_payload(visit, now, **extra)
    _insert(
        session,
        {
            "event": event.value,
            "channel": NotificationChannel.WEB.value,
            "visit_id": visit.id,
            "message": render(event, payload),
            "payload": payload,
            "status": NotificationStatus.SENT.value,
            "next_attempt_at": now,
            "created_at": now,
            "sent_at": now,
        },
    )


# ---------------------------------------------------------------- доставка ботом


def claim_for_bot(session: Session, now: datetime, limit: int = 20) -> list[Notification]:
    """Выдать боту порцию уведомлений. Каждое «арендуется» на lease секунд: если бот
    упал и не сообщил результат, уведомление снова станет доступно после аренды."""
    s = get_settings()
    rows = session.scalars(
        select(Notification)
        .where(
            Notification.channel == NotificationChannel.TELEGRAM,
            Notification.status == NotificationStatus.PENDING,
            Notification.next_attempt_at <= now,
        )
        .order_by(Notification.id)
        .limit(limit)
        .with_for_update(skip_locked=True)
    ).all()
    for n in rows:
        n.attempts += 1
        n.next_attempt_at = now + timedelta(seconds=s.notification_lease_seconds)
    return list(rows)


def report_delivery(
    session: Session,
    notification_id: int,
    now: datetime,
    *,
    success: bool,
    error: str | None = None,
    permanent: bool = False,
) -> Notification:
    """Результат отправки от бота. permanent=True — повторять бесполезно
    (например, родитель заблокировал бота)."""
    n = session.get(Notification, notification_id, with_for_update=True)
    if n is None or n.channel != NotificationChannel.TELEGRAM:
        raise NotFound("Уведомление не найдено")
    if n.status != NotificationStatus.PENDING:
        return n  # повторный отчёт — ничего не делаем
    if success:
        n.status = NotificationStatus.SENT
        n.sent_at = now
        n.last_error = None
    elif permanent or n.attempts >= get_settings().notification_max_attempts:
        n.status = NotificationStatus.FAILED
        n.last_error = error
    else:
        backoff = min(30 * 2 ** (n.attempts - 1), 30 * 60)  # 30 с, 1 мин, 2 мин … до 30 мин
        n.next_attempt_at = now + timedelta(seconds=backoff)
        n.last_error = error
    return n


def requeue_for_parent(session: Session, parent: Parent, now: datetime) -> int:
    """После привязки Telegram — отправить пропущенные уведомления о текущих посещениях."""
    rows = session.scalars(
        select(Notification)
        .join(Visit, Visit.id == Notification.visit_id)
        .where(
            Notification.parent_id == parent.id,
            Notification.status == NotificationStatus.SKIPPED,
            Visit.status.in_(OPEN_VISIT_STATUSES),
        )
    ).all()
    for n in rows:
        n.chat_id = parent.telegram_chat_id
        n.status = NotificationStatus.PENDING
        n.next_attempt_at = now
        n.last_error = None
    return len(rows)
