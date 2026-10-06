"""Няни: загрузка и доступность (§10)."""

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Nanny, Visit
from app.domain.enums import OPEN_VISIT_STATUSES, NannyEffectiveStatus, NannyStatus
from app.services.errors import NannyUnavailable, NotFound


@dataclass(frozen=True)
class NannyState:
    nanny: Nanny
    load: int  # сколько детей у няни сейчас

    @property
    def effective_status(self) -> NannyEffectiveStatus:
        if not self.nanny.user.is_active or self.nanny.status == NannyStatus.OFF:
            return NannyEffectiveStatus.OFF
        if self.nanny.status == NannyStatus.BREAK:
            return NannyEffectiveStatus.BREAK
        if self.load >= self.nanny.max_children:
            return NannyEffectiveStatus.BUSY
        return NannyEffectiveStatus.FREE

    @property
    def available(self) -> bool:
        return self.effective_status == NannyEffectiveStatus.FREE


def loads(session: Session, nanny_ids: list[int] | None = None) -> dict[int, int]:
    query = (
        select(Visit.nanny_id, func.count())
        .where(Visit.status.in_(OPEN_VISIT_STATUSES))
        .group_by(Visit.nanny_id)
    )
    if nanny_ids is not None:
        query = query.where(Visit.nanny_id.in_(nanny_ids))
    return dict(session.execute(query).all())


def list_states(session: Session) -> list[NannyState]:
    nannies = session.scalars(select(Nanny).options(joinedload(Nanny.user)).order_by(Nanny.id)).all()
    counts = loads(session)
    return [NannyState(n, counts.get(n.id, 0)) for n in nannies]


def lock_available(session: Session, nanny_id: int) -> Nanny:
    """Берём строку няни под блокировку, чтобы два сотрудника одновременно
    не назначили ей ребёнка сверх лимита."""
    nanny = session.scalar(select(Nanny).where(Nanny.id == nanny_id).with_for_update())
    if nanny is None:
        raise NotFound("Няня не найдена")
    state = NannyState(nanny, loads(session, [nanny_id]).get(nanny_id, 0))
    if not state.available:
        reasons = {
            NannyEffectiveStatus.OFF: "не работает",
            NannyEffectiveStatus.BREAK: "на перерыве",
            NannyEffectiveStatus.BUSY: f"уже присматривает за {state.load} детьми (максимум {nanny.max_children})",
        }
        raise NannyUnavailable(
            f"Няня {nanny.user.full_name} {reasons[state.effective_status]}",
            nanny_status=state.effective_status.value,
        )
    return nanny
