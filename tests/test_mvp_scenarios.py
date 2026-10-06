"""Критерии готовности MVP (ТЗ §47) — сквозные сценарии через API."""

from datetime import timedelta

from tests.conftest import ANNA, MAXIM, files


def test_first_visit(staff, register, start_visit, world, notifications):
    """Создать родителя → создать ребёнка → сфотографировать → карточка →
    выбрать няню → выбрать время → начать посещение."""
    # Шаг 1: родителя с таким номером нет
    r = staff.get("/api/parents/by-phone", params={"phone": "90 111 22 33"})
    assert r.status_code == 404 and r.json()["error"] == "parent_not_found"

    # Регистрация: родитель + ребёнок + фото
    r = register(ANNA, "Анна", last_name="Иванова", birth_date="2019-05-01", gender="female")
    assert r.status_code == 201, r.text
    card = r.json()
    assert card["parent"]["phone"] == "+998901112233"
    assert card["face_profiles"] == 1
    assert staff.get(f"/api/children/{card['id']}/photo").headers["content-type"] == "image/jpeg"

    # Выбор няни: обе свободны
    nannies = staff.get("/api/nannies", params={"only_available": True}).json()
    assert {n["id"] for n in nannies} == {world["nanny1"], world["nanny2"]}
    assert nannies[0]["status_label"] == "Свободна"

    # Расчёт стоимости и старт
    q = staff.post("/api/visits/quote", json={"child_id": card["id"], "option_id": world["opt"]["2h"]}).json()
    assert q["total"] == "90000.00"
    r = start_visit(card["id"], option="2h")
    assert r.status_code == 201, r.text
    visit = r.json()
    assert visit["status"] == "active" and visit["status_label"] == "Активно"
    assert visit["total_minutes"] == 120 and visit["remaining_seconds"] == 7200
    assert visit["payment_status_label"] == "Оплачено"
    assert visit["nanny"]["id"] == world["nanny1"]

    # Ребёнок появился у няни, у неё +1 к загрузке
    n1 = next(n for n in staff.get("/api/nannies").json() if n["id"] == world["nanny1"])
    assert n1["load"] == 1

    # Родитель ещё не привязал Telegram → уведомление сохранено, но пропущено
    [n] = notifications(event="visit_started")
    assert n.status == "skipped" and n.last_error == "telegram_not_linked"


def test_repeat_visit_by_face(staff, register, start_visit, clock):
    """Сфотографировать → распознать → найти карточку → выбрать няню → время → начать."""
    anna = register(ANNA).json()
    v = start_visit(anna["id"]).json()
    clock.advance(minutes=30)
    staff.post(f"/api/visits/{v['id']}/complete")

    clock.advance(days=3)
    r = staff.post("/api/recognition/identify", files=files(ANNA)).json()
    assert r["status"] == "found" and r["child_id"] == anna["id"]
    assert r["confidence"] > 0.9
    assert r["candidates"][0]["active_visit_id"] is None

    card = staff.get(f"/api/children/{r['child_id']}").json()
    assert card["visits_count"] == 1
    assert start_visit(anna["id"], nanny="nanny2").status_code == 201


def test_search_by_phone_shows_all_children(staff, register):
    """Сценарий №3 и §8: один родитель — несколько детей."""
    anna = register(ANNA, "Анна").json()
    parent_id = anna["parent"]["id"]
    maxim = register(MAXIM, "Максим", parent_id=parent_id).json()
    assert maxim["parent"]["id"] == parent_id
    assert [s["first_name"] for s in maxim["siblings"]] == ["Анна"]

    # Регистрация по тому же телефону без parent_id тоже находит существующего родителя
    sofia = register((120, 200, 80), "София", phone="+998 (90) 111-22-33", parent_id_raw="0").json()
    assert sofia["parent"]["id"] == parent_id

    r = staff.get("/api/parents/by-phone", params={"phone": "901112233"}).json()
    assert [c["first_name"] for c in r["children"]] == ["Анна", "Максим", "София"]


def test_extension_via_telegram(staff, register, start_visit, bot, clock, tick, notifications, world):
    """Уведомление за 15 минут → продлить → выбрать время → оплатить → время увеличено."""
    anna = register(ANNA).json()
    assert bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 555}).status_code == 200
    visit = start_visit(anna["id"]).json()  # 1 час

    clock.advance(minutes=44)
    assert tick().reminders == 0
    clock.advance(minutes=1)  # осталось 15 минут
    assert tick().reminders == 1
    assert tick().reminders == 0  # повторно не шлём
    assert staff.get(f"/api/visits/{visit['id']}").json()["status_label"] == "Ожидает продления"

    # Бот забирает уведомление с кнопками
    batch = bot.post("/api/bot/notifications/claim").json()
    ending = next(n for n in batch if n["event"] == "visit_ending_soon")
    assert ending["chat_id"] == 555
    assert ending["payload"]["actions"] == ["extend", "decline"]
    assert "через 15 мин" in ending["message"]

    # Родитель выбирает +1 час
    opts = bot.post(f"/api/bot/visits/{visit['id']}/extension-options", json={"chat_id": 555}).json()
    plus_hour = next(o for o in opts if o["minutes"] == 60)
    r = bot.post(f"/api/bot/visits/{visit['id']}/extend", json={"chat_id": 555, "option_id": plus_hour["id"]})
    assert r.status_code == 201, r.text
    pay = r.json()["payment"]
    assert pay["status"] == "pending" and pay["amount"] == "50000.00"
    assert pay["pay_url"].endswith(f"/api/payments/fake/{pay['id']}")
    assert r.json()["visit"]["payment_status_label"] == "Ожидает оплаты"

    # Оплата (имитация webhook провайдера)
    clock.advance(minutes=2)
    assert staff.client.post(f"/api/payments/fake/{pay['id']}?success=true").status_code == 200
    v = staff.get(f"/api/visits/{visit['id']}").json()
    assert v["status_label"] == "Продлено"
    assert v["total_minutes"] == 120
    assert v["payment_status_label"] == "Оплачено" and v["total_paid"] == "100000.00"

    events = [n.event for n in notifications(channel="telegram")]
    assert {"payment_paid", "extension_applied"} <= set(events)
    assert [n.event for n in notifications(channel="web")] == ["extension_applied"]

    # Посещение не завершилось в исходное время
    clock.advance(minutes=20)
    assert tick().completed == 0
    # Новое напоминание — за 15 минут до нового окончания
    clock.advance(minutes=48)
    assert tick().reminders == 1


def test_decline_extension_then_auto_complete(staff, register, start_visit, bot, clock, tick, notifications):
    """Сценарий №5: «Не продлевать» → уведомление Скайпарку → завершение в срок."""
    anna = register(ANNA).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 555})
    visit = start_visit(anna["id"]).json()
    clock.advance(minutes=46)
    tick()

    r = bot.post(f"/api/bot/visits/{visit['id']}/decline", json={"chat_id": 555}).json()
    assert r["status"] == "active" and r["extension_declined"] is True
    [staff_note] = notifications(channel="web", event="extension_declined")
    assert "отказался от продления" in staff_note.message

    clock.advance(minutes=14)
    assert tick().completed == 1
    v = staff.get(f"/api/visits/{visit['id']}").json()
    assert v["status_label"] == "Завершено" and v["end_reason"] == "auto"
    assert v["ended_at"] == v["planned_end_at"]


def test_manual_completion_frees_nanny(staff, register, start_visit, clock, world, notifications):
    """Закончить посещение → освободить няню → сохранить историю → уведомить."""
    anna = register(ANNA).json()
    v = start_visit(anna["id"]).json()
    clock.advance(minutes=40)
    r = staff.post(f"/api/visits/{v['id']}/complete").json()
    assert r["status"] == "completed" and r["end_reason"] == "manual"
    assert r["elapsed_seconds"] == 40 * 60

    n1 = next(n for n in staff.get("/api/nannies").json() if n["id"] == world["nanny1"])
    assert n1["load"] == 0 and n1["available"]
    history = staff.get(f"/api/children/{anna['id']}/visits").json()
    assert [h["id"] for h in history] == [v["id"]]
    assert {n.event for n in notifications()} >= {"visit_completed"}
    assert len(notifications(event="visit_completed")) == 2  # родителю и сотрудникам


def test_audit_trail(staff, admin, register, start_visit, clock):
    """§41: кто зарегистрировал, кто создал посещение, кто завершил."""
    anna = register(ANNA).json()
    v = start_visit(anna["id"]).json()
    clock.advance(minutes=5)
    staff.post(f"/api/visits/{v['id']}/complete")
    log = admin.get("/api/audit").json()
    actions = [e["action"] for e in reversed(log)]
    assert actions[:2] == ["parent.created", "child.registered"]
    assert "visit.created" in actions and "visit.completed" in actions
    completed = next(e for e in log if e["action"] == "visit.completed")
    assert completed["actor_type"] == "user" and completed["data"]["unused_minutes"] == 55
