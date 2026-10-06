"""Посещения для сотрудника (§9–12, §17): варианты, няни, расчёт, создание, продление, завершение."""

from fastapi import APIRouter
from sqlalchemy import select

from app.api import views
from app.api.deps import Admin, Now, SessionDep, Staff, actor
from app.db.models import Child, Visit
from app.domain.enums import OPEN_VISIT_STATUSES, OptionKind
from app.schemas import (
    CancelIn,
    ExtensionCreate,
    ExtensionOptionOut,
    ExtensionResult,
    NannyOut,
    OptionOut,
    PaymentOut,
    QuoteIn,
    QuoteOut,
    VisitCreate,
    VisitDetail,
    VisitOut,
)
from app.services import extensions, nannies, pricing, visits
from app.services.errors import NotFound

router = APIRouter(prefix="/api", tags=["Посещения"])


@router.get("/duration-options", response_model=list[OptionOut])
def duration_options(session: SessionDep, _: Staff, kind: OptionKind = OptionKind.VISIT):
    """Варианты продолжительности (kind=visit) или продления (kind=extension)."""
    return pricing.list_options(session, kind)


@router.get("/nannies", response_model=list[NannyOut])
def list_nannies(session: SessionDep, _: Staff, only_available: bool = False):
    """Няни со статусом и загрузкой (§10). Назначить можно только available=true."""
    states = nannies.list_states(session)
    if only_available:
        states = [s for s in states if s.available]
    return [views.nanny_out(s) for s in states]


@router.post("/visits/quote", response_model=QuoteOut)
def quote(body: QuoteIn, session: SessionDep, _: Staff, now: Now):
    """Предварительный расчёт стоимости и проверка скидки/промокода (§9.1, §28)."""
    child = session.get(Child, body.child_id)
    if child is None:
        raise NotFound("Ребёнок не найден")
    option = pricing.get_option(session, body.option_id, OptionKind.VISIT)
    q = pricing.quote(
        session, option=option, parent_id=child.parent_id, now=now,
        discount_id=body.discount_id, promo_code=body.promo_code,
    )
    return QuoteOut(
        option_id=q.option_id, minutes=q.minutes, base_amount=q.base_amount,
        discount_amount=q.discount_amount, promo_amount=q.promo_amount, total=q.total,
    )


@router.post("/visits", response_model=VisitDetail, status_code=201)
def create(body: VisitCreate, session: SessionDep, user: Staff, now: Now):
    """Начать посещение. Ошибки (§44): already_on_visit, nanny_unavailable,
    park_closed, time_unavailable, option_unavailable, promo_invalid, discount_invalid."""
    visit = visits.create_visit(
        session,
        child_id=body.child_id,
        nanny_id=body.nanny_id,
        option_id=body.option_id,
        discount_id=body.discount_id,
        promo_code=body.promo_code,
        paid=body.paid,
        actor=actor(user),
        now=now,
    )
    session.commit()
    return views.visit_out(session, visit, now, detail=True)


@router.get("/visits/active", response_model=list[VisitOut])
def active(session: SessionDep, _: Staff, now: Now, nanny_id: int | None = None):
    """Текущие посещения (контроль сотрудником). Таймер считать на клиенте от
    server_time и remaining_seconds, а обновлять список раз в 10–30 секунд."""
    query = select(Visit).where(Visit.status.in_(OPEN_VISIT_STATUSES)).order_by(Visit.planned_end_at)
    if nanny_id is not None:
        query = query.where(Visit.nanny_id == nanny_id)
    return [views.visit_out(session, v, now) for v in session.scalars(query)]


def _visit(session, visit_id: int) -> Visit:
    visit = session.get(Visit, visit_id)
    if visit is None:
        raise NotFound("Посещение не найдено")
    return visit


@router.get("/visits/{visit_id}", response_model=VisitDetail)
def get_visit(visit_id: int, session: SessionDep, _: Staff, now: Now):
    return views.visit_out(session, _visit(session, visit_id), now, detail=True)


@router.post("/visits/{visit_id}/complete", response_model=VisitDetail)
def complete(visit_id: int, session: SessionDep, user: Staff, now: Now):
    """Завершить посещение вручную (§12). Неиспользованное время сгорает (настройка EARLY_END_POLICY)."""
    visit = visits.complete_visit(session, visit_id, actor=actor(user), now=now)
    session.commit()
    return views.visit_out(session, visit, now, detail=True)


@router.post("/visits/{visit_id}/cancel", response_model=VisitDetail)
def cancel(visit_id: int, body: CancelIn, session: SessionDep, user: Admin, now: Now):
    """Отменить посещение (только администратор)."""
    visit = visits.cancel_visit(session, visit_id, actor=actor(user), reason=body.reason, now=now)
    session.commit()
    return views.visit_out(session, visit, now, detail=True)


@router.get("/visits/{visit_id}/extension-options", response_model=list[ExtensionOptionOut])
def extension_options(visit_id: int, session: SessionDep, _: Staff):
    visit = _visit(session, visit_id)
    return [
        ExtensionOptionOut(**OptionOut.model_validate(opt).model_dump(), available=fits)
        for opt, fits in extensions.options_for(session, visit)
    ]


@router.post("/visits/{visit_id}/extensions", response_model=ExtensionResult, status_code=201)
def extend_at_desk(visit_id: int, body: ExtensionCreate, session: SessionDep, user: Staff, now: Now):
    """Продление у сотрудника с оплатой на кассе — применяется сразу."""
    ext, payment = extensions.request(
        session,
        visit_id=visit_id,
        option_id=body.option_id,
        requested_by="staff",
        actor=actor(user),
        now=now,
        promo_code=body.promo_code,
        discount_id=body.discount_id,
    )
    session.commit()
    return ExtensionResult(
        extension_id=ext.id,
        status=ext.status,
        payment=PaymentOut.model_validate(payment),
        visit=views.visit_out(session, _visit(session, visit_id), now),
    )


@router.post("/payments/{payment_id}/confirm-offline", response_model=PaymentOut)
def confirm_offline(payment_id: int, session: SessionDep, user: Staff, now: Now):
    """Кассир принял оплату за посещение, созданное с paid=false."""
    payment = visits.confirm_offline_payment(session, payment_id, actor=actor(user), now=now)
    session.commit()
    return payment
