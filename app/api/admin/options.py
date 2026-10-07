"""Справочник вариантов продолжительности и продления (§17)."""

from fastapi import APIRouter

from app.api.deps import SessionDep, Staff
from app.domain.enums import OptionKind
from app.schemas import OptionOut
from app.services import pricing

router = APIRouter(prefix="/api", tags=["Справочники"])


@router.get("/duration-options", response_model=list[OptionOut])
def duration_options(session: SessionDep, _: Staff, kind: OptionKind = OptionKind.VISIT):
    """Варианты продолжительности (kind=visit) или продления (kind=extension)."""
    return pricing.list_options(session, kind)
