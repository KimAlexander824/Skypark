"""Сборка ответов API из моделей БД."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Child, Extension, FaceProfile, Parent, Visit
from app.domain.enums import (
    NANNY_STATUS_LABELS,
    PAYMENT_STATUS_LABELS,
    ExtensionStatus,
    visit_status_label,
)
from app.schemas import (
    ChildCard,
    ChildShort,
    ExtensionOut,
    NannyOut,
    NannyShort,
    ParentOut,
    PaymentOut,
    VisitDetail,
    VisitOut,
)
from app.services import payments, visits
from app.services.nannies import NannyState


def parent_out(p: Parent) -> ParentOut:
    return ParentOut(
        id=p.id,
        phone=p.phone,
        first_name=p.first_name,
        last_name=p.last_name,
        telegram_linked=p.telegram_chat_id is not None,
        telegram_username=p.telegram_username,
    )


def child_short(c: Child) -> ChildShort:
    return ChildShort.model_validate(c)


def child_card(session: Session, child: Child) -> ChildCard:
    open_visit = visits.open_visit_of_child(session, child.id)
    visits_count = session.scalar(select(func.count()).select_from(Visit).where(Visit.child_id == child.id))
    profiles = session.scalar(
        select(func.count()).select_from(FaceProfile).where(FaceProfile.child_id == child.id)
    )
    return ChildCard(
        **child_short(child).model_dump(),
        parent=parent_out(child.parent),
        siblings=[child_short(c) for c in child.parent.children if c.id != child.id],
        active_visit_id=open_visit.id if open_visit else None,
        visits_count=visits_count,
        face_profiles=profiles,
        created_at=child.created_at,
    )


def nanny_out(state: NannyState) -> NannyOut:
    n = state.nanny
    return NannyOut(
        id=n.id,
        user_id=n.user_id,
        full_name=n.user.full_name,
        has_photo=n.photo is not None,
        status=state.effective_status.value,
        status_label=NANNY_STATUS_LABELS[state.effective_status],
        load=state.load,
        max_children=n.max_children,
        available=state.available,
    )


def visit_out(session: Session, visit: Visit, now: datetime, detail: bool = False) -> VisitOut | VisitDetail:
    pays = visits.visit_payments(session, visit.id)
    exts = list(session.scalars(select(Extension).where(Extension.visit_id == visit.id).order_by(Extension.id)))
    t = visits.timer(visit, now)
    pay_status = payments.visit_payment_status(pays)
    data = dict(
        id=visit.id,
        status=visit.status,
        status_label=visit_status_label(visit.status),
        child=child_short(visit.child),
        nanny=NannyShort(id=visit.nanny_id, full_name=visit.nanny.user.full_name),
        started_at=visit.started_at,
        planned_end_at=visit.planned_end_at,
        ended_at=visit.ended_at,
        end_reason=visit.end_reason,
        total_minutes=t.total_minutes,
        elapsed_seconds=t.elapsed_seconds,
        remaining_seconds=t.remaining_seconds,
        extended=any(e.status == ExtensionStatus.APPLIED for e in exts),
        extension_pending=any(e.status == ExtensionStatus.PENDING_PAYMENT for e in exts),
        extension_declined=visit.extension_declined_at is not None,
        payment_status=pay_status.value,
        payment_status_label=PAYMENT_STATUS_LABELS[pay_status],
        total_paid=payments.total_paid(pays),
        server_time=now,
    )
    if not detail:
        return VisitOut(**data)
    return VisitDetail(
        **data,
        extensions=[ExtensionOut.model_validate(e) for e in exts],
        payments=[PaymentOut.model_validate(p) for p in pays],
    )
