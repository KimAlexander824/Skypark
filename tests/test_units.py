"""Чистые функции без БД."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.domain.enums import VisitStatus as VS
from app.services.common import normalize_phone
from app.services.errors import InvalidStatus, ValidationFailed
from app.services.payments import visit_payment_status
from app.services.pricing import _reduction
from app.services.visits import timer, transition

T = datetime(2026, 10, 6, 10, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "raw", ["+998 90 111 22 33", "998901112233", "90 111-22-33", "(90) 111 22 33", "+998(90)1112233"]
)
def test_phone_normalization(raw):
    assert normalize_phone(raw) == "+998901112233"


def test_bad_phone():
    with pytest.raises(ValidationFailed):
        normalize_phone("12345")


def test_reductions():
    assert _reduction("percent", Decimal(10), Decimal(50000)) == Decimal(5000)
    assert _reduction("percent", Decimal("33.3"), Decimal(10000)) == Decimal(3330)
    assert _reduction("fixed", Decimal(70000), Decimal(50000)) == Decimal(50000)  # не уходим в минус


def test_transitions():
    v = SimpleNamespace(status=VS.ACTIVE)
    transition(v, VS.AWAITING_EXTENSION)
    transition(v, VS.EXTENDED)
    transition(v, VS.EXTENDED)
    transition(v, VS.COMPLETED)
    with pytest.raises(InvalidStatus):
        transition(v, VS.ACTIVE)


def test_timer():
    v = SimpleNamespace(started_at=T, planned_end_at=T + timedelta(hours=2), ended_at=None)
    t = timer(v, T + timedelta(minutes=85))
    assert (t.total_minutes, t.elapsed_seconds, t.remaining_seconds) == (120, 85 * 60, 35 * 60)
    v.ended_at = T + timedelta(minutes=90)
    t = timer(v, T + timedelta(hours=5))
    assert (t.elapsed_seconds, t.remaining_seconds) == (90 * 60, 0)


def _p(kind, status):
    return SimpleNamespace(kind=kind, status=status, amount=Decimal(1))


def test_visit_payment_status():
    assert visit_payment_status([]) == "unpaid"
    assert visit_payment_status([_p("visit", "paid")]) == "paid"
    assert visit_payment_status([_p("visit", "pending")]) == "pending"
    assert visit_payment_status([_p("visit", "paid"), _p("extension", "pending")]) == "pending"
    # неудачная попытка продления не портит статус оплаченного посещения
    assert visit_payment_status([_p("visit", "paid"), _p("extension", "failed")]) == "paid"
    assert visit_payment_status([_p("visit", "refunded")]) == "refunded"
