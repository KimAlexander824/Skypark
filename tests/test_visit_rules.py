"""Правила посещений и ошибки из ТЗ §44."""

from datetime import date, time, timedelta

from app.db.models import Discount, Nanny, PromoCode, ScheduleException, WorkSchedule
from tests.conftest import ANNA, MAXIM, SOFIA


def test_child_cannot_have_two_visits(register, start_visit):
    anna = register(ANNA).json()
    first = start_visit(anna["id"]).json()
    r = start_visit(anna["id"], nanny="nanny2")
    assert r.status_code == 409
    assert r.json()["error"] == "already_on_visit" and r.json()["visit_id"] == first["id"]


def test_nanny_capacity_and_break(db, staff, register, start_visit, nanny1, world):
    db.get(Nanny, world["nanny1"]).max_children = 1
    db.commit()
    anna = register(ANNA).json()
    maxim = register(MAXIM, "Максим").json()
    assert start_visit(anna["id"]).status_code == 201
    r = start_visit(maxim["id"])
    assert r.status_code == 409 and r.json()["error"] == "nanny_unavailable"
    n1 = next(n for n in staff.get("/api/nannies").json() if n["id"] == world["nanny1"])
    assert n1["status_label"] == "Занята"

    nanny2 = staff.client.post("/api/auth/login", data={"username": "nanny2", "password": "nanny12345"}).json()
    staff.client.post("/api/nanny/status", json={"status": "break"},
                      headers={"Authorization": f"Bearer {nanny2['access_token']}"})
    r = start_visit(maxim["id"], nanny="nanny2")
    assert r.status_code == 409 and "перерыве" in r.json()["message"]


def test_park_hours(db, register, start_visit, clock):
    for d in range(7):
        db.add(WorkSchedule(weekday=d, opens_at=time(10), closes_at=time(22)))
    db.commit()
    anna = register(ANNA).json()

    clock.now = clock.now.replace(hour=3)  # 08:00 в Ташкенте
    r = start_visit(anna["id"])
    assert r.status_code == 409 and r.json()["error"] == "park_closed"

    clock.now = clock.now.replace(hour=16)  # 21:00 — двухчасовое не успеет
    r = start_visit(anna["id"], option="2h")
    assert r.status_code == 409 and r.json()["error"] == "time_unavailable"
    assert start_visit(anna["id"], option="1h").status_code == 201


def test_holiday(db, register, start_visit, clock):
    for d in range(7):
        db.add(WorkSchedule(weekday=d, opens_at=time(10), closes_at=time(22)))
    db.add(ScheduleException(day=date(2026, 10, 6), is_closed=True, reason="Санитарный день"))
    db.commit()
    r = start_visit(register(ANNA).json()["id"])
    assert r.status_code == 409 and r.json()["message"] == "Сегодня Скайпарк не работает"


def test_extension_must_end_before_closing(db, staff, register, start_visit, clock, world):
    for d in range(7):
        db.add(WorkSchedule(weekday=d, opens_at=time(10), closes_at=time(22)))
    db.commit()
    clock.now = clock.now.replace(hour=15, minute=30)  # 20:30 местного
    v = start_visit(register(ANNA).json()["id"]).json()  # до 21:30
    opts = {o["minutes"]: o for o in staff.get(f"/api/visits/{v['id']}/extension-options").json()}
    assert opts[30]["available"] and not opts[60]["available"]
    r = staff.post(f"/api/visits/{v['id']}/extensions", json={"option_id": world["opt"]["+1h"]})
    assert r.status_code == 409 and r.json()["error"] == "time_unavailable"


def test_staff_extension_at_desk(staff, register, start_visit, world, clock):
    v = start_visit(register(ANNA).json()["id"]).json()
    clock.advance(minutes=50)
    r = staff.post(f"/api/visits/{v['id']}/extensions", json={"option_id": world["opt"]["+30"]})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "applied"
    assert r.json()["visit"]["total_minutes"] == 90
    assert r.json()["visit"]["remaining_seconds"] == 40 * 60


def test_unpaid_visit_then_cashier_confirms(staff, register, start_visit):
    v = start_visit(register(ANNA).json()["id"], paid=False).json()
    assert v["payment_status_label"] == "Ожидает оплаты"
    pay_id = v["payments"][0]["id"]
    assert staff.post(f"/api/payments/{pay_id}/confirm-offline").json()["status"] == "paid"
    assert staff.get(f"/api/visits/{v['id']}").json()["payment_status_label"] == "Оплачено"


def test_payment_failed(staff, register, start_visit, bot, clock, tick, notifications, world):
    v = start_visit(register(ANNA).json()["id"]).json()
    bot.post("/api/bot/link", json={"phone": "998901112233", "chat_id": 7})
    clock.advance(minutes=46)
    tick()
    pay = bot.post(f"/api/bot/visits/{v['id']}/extend",
                   json={"chat_id": 7, "option_id": world["opt"]["+30"]}).json()["payment"]
    staff.client.post(f"/api/payments/fake/{pay['id']}?success=false")
    visit = staff.get(f"/api/visits/{v['id']}").json()
    assert visit["status_label"] == "Ожидает продления"  # можно попробовать снова
    assert visit["payment_status_label"] == "Оплачено"  # само посещение оплачено
    assert visit["extensions"][0]["status"] == "failed"
    assert notifications(event="payment_failed")[0].chat_id == 7


def test_auto_complete_waits_for_pending_payment(staff, register, start_visit, bot, clock, tick, world):
    v = start_visit(register(ANNA).json()["id"]).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 7})
    clock.advance(minutes=58)
    pay = bot.post(f"/api/bot/visits/{v['id']}/extend",
                   json={"chat_id": 7, "option_id": world["opt"]["+30"]}).json()["payment"]
    clock.advance(minutes=5)  # время вышло, но оплата в процессе
    assert tick().completed == 0
    assert staff.get(f"/api/visits/{v['id']}").json()["remaining_seconds"] < 0
    staff.client.post(f"/api/payments/fake/{pay['id']}?success=true")
    v2 = staff.get(f"/api/visits/{v['id']}").json()
    assert v2["status"] == "extended" and v2["remaining_seconds"] == 27 * 60  # 60+30 − 63


def test_late_payment_after_completion_requires_refund(staff, register, start_visit, bot, clock, tick, world, notifications):
    v = start_visit(register(ANNA).json()["id"]).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 7})
    clock.advance(minutes=58)
    pay = bot.post(f"/api/bot/visits/{v['id']}/extend",
                   json={"chat_id": 7, "option_id": world["opt"]["+30"]}).json()["payment"]
    clock.advance(minutes=15)  # льготные 10 минут прошли
    assert tick().completed == 1
    staff.client.post(f"/api/payments/fake/{pay['id']}?success=true")
    assert staff.get(f"/api/visits/{v['id']}").json()["status"] == "completed"
    [refund] = notifications(event="refund_required")
    assert "Нужен возврат" in refund.message


def test_discount_and_promo(db, staff, register, start_visit, clock, world):
    db.add(Discount(name="Будни -10%", type="percent", value=10, applies_to="visit"))
    db.add(PromoCode(code="SKY5000", type="fixed", value=5000, max_uses_per_parent=1))
    db.add(PromoCode(code="OLD", type="fixed", value=5000, ends_at=clock.now - timedelta(days=1)))
    db.commit()
    anna = register(ANNA).json()
    body = {"child_id": anna["id"], "option_id": world["opt"]["1h"], "discount_id": 1, "promo_code": "sky5000"}
    q = staff.post("/api/visits/quote", json=body).json()
    assert (q["base_amount"], q["discount_amount"], q["promo_amount"], q["total"]) == (
        "50000.00", "5000.00", "5000.00", "40000.00"
    )
    r = staff.post("/api/visits/quote", json={**body, "promo_code": "OLD"})
    assert r.status_code == 400 and r.json()["error"] == "promo_invalid"

    v = start_visit(anna["id"], discount_id=1, promo_code="SKY5000").json()
    assert v["total_paid"] == "40000.00"
    staff.post(f"/api/visits/{v['id']}/complete")
    # Этот родитель уже использовал промокод один раз
    maxim = register(MAXIM, "Максим", parent_id=anna["parent"]["id"]).json()
    r = staff.post("/api/visits/quote", json={**body, "child_id": maxim["id"]})
    assert r.status_code == 400 and "уже использовал" in r.json()["message"]


def test_cancel_by_admin_only(staff, admin, register, start_visit, notifications):
    v = start_visit(register(ANNA).json()["id"]).json()
    assert staff.post(f"/api/visits/{v['id']}/cancel", json={"reason": "ошибка"}).status_code == 403
    r = admin.post(f"/api/visits/{v['id']}/cancel", json={"reason": "создано по ошибке"}).json()
    assert r["status_label"] == "Отменено"
    assert notifications(event="refund_required")[0].payload["amount"] == "50000.00"
    assert staff.post(f"/api/visits/{v['id']}/complete").status_code == 409


def test_nanny_sees_only_her_children(staff, register, start_visit, nanny1):
    anna = register(ANNA).json()
    sofia = register(SOFIA, "София", phone="+998935554433").json()
    start_visit(anna["id"], nanny="nanny1")
    start_visit(sofia["id"], nanny="nanny2")
    mine = nanny1.get("/api/nanny/visits").json()
    assert [v["child"]["first_name"] for v in mine] == ["Анна"]
    assert nanny1.get(f"/api/children/{anna['id']}/photo").status_code == 200
    assert nanny1.get(f"/api/children/{sofia['id']}/photo").status_code == 403
    assert nanny1.get(f"/api/children/{anna['id']}").status_code == 403  # карточки — только сотрудникам
    assert nanny1.post("/api/visits", json={}).status_code == 403
