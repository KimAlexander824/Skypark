"""Няни: список со статусом и загрузкой (§10, §22), фото."""

from fastapi import APIRouter, Response

from app.api import views
from app.api.deps import CurrentUser, SessionDep, Staff
from app.db.models import Nanny
from app.schemas import NannyOut
from app.services import nannies
from app.services.errors import NotFound

router = APIRouter(prefix="/api", tags=["Няни"])


@router.get("/nannies", response_model=list[NannyOut])
def list_nannies(session: SessionDep, _: Staff, only_available: bool = False):
    """Няни со статусом и загрузкой (§10). Назначить можно только available=true."""
    states = nannies.list_states(session)
    if only_available:
        states = [s for s in states if s.available]
    return [views.nanny_out(s) for s in states]


@router.get("/nannies/{nanny_id}/photo", response_class=Response)
def nanny_photo(nanny_id: int, session: SessionDep, _: CurrentUser):
    nanny = session.get(Nanny, nanny_id)
    if nanny is None or nanny.photo is None:
        raise NotFound("Фото нет")
    return Response(nanny.photo, media_type="image/jpeg")
