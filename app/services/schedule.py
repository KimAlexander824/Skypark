"""Рабочее время Скайпарка (§26): посещение нельзя начать вне рабочих часов,
и оно (вместе с продлениями) должно закончиться до закрытия."""

from datetime import date, datetime, time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import ScheduleException, WorkSchedule
from app.services.common import local, park_tz
from app.services.errors import ParkClosed, TimeUnavailable

UNRESTRICTED = "unrestricted"


def opening_hours(session: Session, day: date) -> tuple[time, time] | None | str:
    """(открытие, закрытие) на дату, None — выходной, UNRESTRICTED — график не задан."""
    exc = session.get(ScheduleException, day)
    if exc is not None:
        return None if exc.is_closed else (exc.opens_at, exc.closes_at)
    row = session.get(WorkSchedule, day.weekday())
    if row is None:
        has_schedule = session.scalar(select(func.count()).select_from(WorkSchedule))
        return None if has_schedule else UNRESTRICTED
    return None if row.is_day_off else (row.opens_at, row.closes_at)


def _bounds(session: Session, moment: datetime):
    day = local(moment).date()
    hours = opening_hours(session, day)
    if hours == UNRESTRICTED or hours is None:
        return hours
    opens, closes = hours
    tz = park_tz()
    return datetime.combine(day, opens, tz), datetime.combine(day, closes, tz)


def ensure_can_start(session: Session, start: datetime, end: datetime) -> None:
    """Проверка при создании посещения."""
    bounds = _bounds(session, start)
    if bounds == UNRESTRICTED:
        return
    if bounds is None:
        raise ParkClosed("Сегодня Скайпарк не работает")
    open_dt, close_dt = bounds
    if not open_dt <= start < close_dt:
        raise ParkClosed(
            f"Скайпарк работает с {open_dt:%H:%M} до {close_dt:%H:%M}",
            opens_at=open_dt.isoformat(),
            closes_at=close_dt.isoformat(),
        )
    if end > close_dt:
        raise TimeUnavailable(
            f"Посещение закончится после закрытия ({close_dt:%H:%M}). Выберите меньшую продолжительность",
            closes_at=close_dt.isoformat(),
        )


def ends_before_close(session: Session, start: datetime, end: datetime) -> bool:
    """Помещается ли окончание (например, после продления) в рабочий день начала посещения."""
    bounds = _bounds(session, start)
    if bounds == UNRESTRICTED:
        return True
    if bounds is None:
        return False
    return end <= bounds[1]


def ensure_ends_before_close(session: Session, start: datetime, end: datetime) -> None:
    if not ends_before_close(session, start, end):
        raise TimeUnavailable("Продление закончится после закрытия Скайпарка")
