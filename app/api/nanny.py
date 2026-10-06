"""Интерфейс няни (§13)."""

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api import views
from app.api.deps import CurrentUser, NannyUser, Now, SessionDep, actor
from app.db.models import Nanny, Visit
from app.domain.enums import OPEN_VISIT_STATUSES
from app.schemas import NannyOut, NannyStatusIn, VisitOut
from app.services import nannies
from app.services.common import audit
from app.services.errors import NotFound

router = APIRouter(prefix="/api", tags=["Няня"])


def _my_nanny(user) -> Nanny:
    if user.nanny is None:
        raise NotFound("Профиль няни не найден")
    return user.nanny


@router.get("/nanny/visits", response_model=list[VisitOut])
def my_children(session: SessionDep, user: NannyUser, now: Now):
    """Дети, которые сейчас у няни: начало, окончание, осталось, продление."""
    nanny = _my_nanny(user)
    rows = session.scalars(
        select(Visit)
        .where(Visit.nanny_id == nanny.id, Visit.status.in_(OPEN_VISIT_STATUSES))
        .order_by(Visit.planned_end_at)
    )
    return [views.visit_out(session, v, now) for v in rows]


@router.post("/nanny/status", response_model=NannyOut)
def set_status(body: NannyStatusIn, session: SessionDep, user: NannyUser):
    """Няня уходит на перерыв / возвращается. На перерыве новых детей ей не назначают."""
    nanny = _my_nanny(user)
    nanny.status = body.status
    audit(session, actor(user), "nanny.status_changed", "nanny", nanny.id, status=body.status)
    session.commit()
    state = next(s for s in nannies.list_states(session) if s.nanny.id == nanny.id)
    return views.nanny_out(state)


@router.get("/nannies/{nanny_id}/photo", response_class=Response)
def nanny_photo(nanny_id: int, session: SessionDep, _: CurrentUser):
    nanny = session.get(Nanny, nanny_id)
    if nanny is None or nanny.photo is None:
        raise NotFound("Фото нет")
    return Response(nanny.photo, media_type="image/jpeg")
