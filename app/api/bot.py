"""API для Telegram-бота (§14–18). Авторизация: заголовок X-Bot-Token.

Бот — отдельное приложение (его пишет другой человек). Он:
1. привязывает родителя: POST /api/bot/link (номер из кнопки «Поделиться контактом»);
2. раз в несколько секунд забирает уведомления: POST /api/bot/notifications/claim,
   отправляет их и сообщает результат: POST /api/bot/notifications/{id}/result;
3. на кнопки «Продлить» / «Не продлевать» вызывает extend / decline.
"""

from fastapi import APIRouter
from sqlalchemy import select

from app.api import views
from app.api.deps import BotAuth, Now, SessionDep
from app.db.models import Child, Parent, Visit
from app.domain.enums import OPEN_VISIT_STATUSES
from app.schemas import (
    BotChatIn,
    BotExtendIn,
    BotLinkIn,
    BotNotificationOut,
    DeliveryResultIn,
    ExtensionOptionOut,
    ExtensionResult,
    OptionOut,
    ParentOut,
    PaymentOut,
    VisitOut,
)
from app.services import extensions, notifications, registration
from app.services.common import BOT, audit
from app.services.errors import Forbidden, NotFound, ParentNotFound, TelegramNotLinked

router = APIRouter(prefix="/api/bot", tags=["Telegram-бот"], dependencies=[BotAuth])


def _parent_by_chat(session, chat_id: int) -> Parent:
    parent = session.scalar(select(Parent).where(Parent.telegram_chat_id == chat_id))
    if parent is None:
        raise TelegramNotLinked("Telegram не привязан. Отправьте свой номер телефона")
    return parent


def _parents_visit(session, visit_id: int, chat_id: int) -> Visit:
    parent = _parent_by_chat(session, chat_id)
    visit = session.get(Visit, visit_id)
    if visit is None:
        raise NotFound("Посещение не найдено")
    if visit.child.parent_id != parent.id:
        raise Forbidden("Это посещение другого родителя")
    return visit


@router.post("/link", response_model=ParentOut)
def link(body: BotLinkIn, session: SessionDep, now: Now):
    """Привязка Telegram к номеру телефона (§14). Номер должен прийти из
    request_contact — тогда Telegram гарантирует, что он принадлежит пользователю."""
    parent = registration.find_parent_by_phone(session, body.phone)
    if parent is None:
        raise ParentNotFound("Родитель с таким номером не зарегистрирован в Скайпарке")
    # Если этот chat_id был привязан к другому номеру — отвязываем.
    other = session.scalar(select(Parent).where(Parent.telegram_chat_id == body.chat_id, Parent.id != parent.id))
    if other is not None:
        other.telegram_chat_id = None
        session.flush()
    parent.telegram_chat_id = body.chat_id
    parent.telegram_username = body.username
    parent.telegram_linked_at = now
    session.flush()
    notifications.requeue_for_parent(session, parent, now)
    audit(session, BOT, "parent.telegram_linked", "parent", parent.id, chat_id=body.chat_id)
    session.commit()
    return views.parent_out(parent)


@router.post("/visits/active", response_model=list[VisitOut])
def active_visits(body: BotChatIn, session: SessionDep, now: Now):
    """Текущие посещения детей этого родителя."""
    parent = _parent_by_chat(session, body.chat_id)
    rows = session.scalars(
        select(Visit)
        .join(Child, Child.id == Visit.child_id)
        .where(Child.parent_id == parent.id, Visit.status.in_(OPEN_VISIT_STATUSES))
    )
    return [views.visit_out(session, v, now) for v in rows]


@router.post("/visits/{visit_id}/extension-options", response_model=list[ExtensionOptionOut])
def extension_options(visit_id: int, body: BotChatIn, session: SessionDep):
    visit = _parents_visit(session, visit_id, body.chat_id)
    return [
        ExtensionOptionOut(**OptionOut.model_validate(opt).model_dump(), available=fits)
        for opt, fits in extensions.options_for(session, visit)
    ]


@router.post("/visits/{visit_id}/extend", response_model=ExtensionResult, status_code=201)
def extend(visit_id: int, body: BotExtendIn, session: SessionDep, now: Now):
    """Родитель выбрал вариант продления → создаётся онлайн-платёж.
    Бот отправляет родителю payment.pay_url. Время продлится после оплаты."""
    _parents_visit(session, visit_id, body.chat_id)
    ext, payment = extensions.request(
        session,
        visit_id=visit_id,
        option_id=body.option_id,
        requested_by="parent",
        actor=BOT,
        now=now,
        promo_code=body.promo_code,
    )
    session.commit()
    return ExtensionResult(
        extension_id=ext.id,
        status=ext.status,
        payment=PaymentOut.model_validate(payment),
        visit=views.visit_out(session, session.get(Visit, visit_id), now),
    )


@router.post("/visits/{visit_id}/decline", response_model=VisitOut)
def decline(visit_id: int, body: BotChatIn, session: SessionDep, now: Now):
    """Родитель нажал «Не продлевать» (§18)."""
    _parents_visit(session, visit_id, body.chat_id)
    visit = extensions.decline(session, visit_id, actor=BOT, now=now)
    session.commit()
    return views.visit_out(session, visit, now)


@router.post("/notifications/claim", response_model=list[BotNotificationOut])
def claim(session: SessionDep, now: Now, limit: int = 20):
    """Забрать порцию уведомлений для отправки. Для visit_ending_soon в payload.actions
    лежат кнопки ["extend", "decline"] и payload.visit_id."""
    rows = notifications.claim_for_bot(session, now, limit=min(limit, 100))
    session.commit()
    return rows


@router.post("/notifications/{notification_id}/result", status_code=204)
def delivery_result(notification_id: int, body: DeliveryResultIn, session: SessionDep, now: Now):
    notifications.report_delivery(
        session, notification_id, now, success=body.success, error=body.error, permanent=body.permanent
    )
    session.commit()
