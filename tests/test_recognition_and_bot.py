"""Распознавание (§39, §44) и API бота / очередь уведомлений (§14, §15, §43)."""

from sqlalchemy import func, select

from app.db.models import FaceProfile
from tests.conftest import ANNA, DARK, MAXIM, STRANGER, files


def test_not_found_message(staff, register):
    register(ANNA)
    r = staff.post("/api/recognition/identify", files=files(STRANGER)).json()
    assert r["status"] == "not_found" and r["child_id"] is None
    assert r["message"].startswith("Ребёнок не найден. Зарегистрировать нового ребёнка")


def test_photo_errors(staff, register):
    r = staff.post("/api/recognition/identify", files=files(DARK))
    assert r.status_code == 422 and r.json()["error"] == "no_face"
    r = staff.post("/api/recognition/identify", files={"photo": ("x.jpg", b"oops", "image/jpeg")})
    assert r.status_code == 422 and r.json()["error"] == "bad_image"
    r = register(ANNA, consent="false")
    assert r.status_code == 400 and r.json()["error"] == "consent_required"


def test_duplicate_and_twins(staff, register):
    anna = register(ANNA).json()
    r = register(ANNA, "Анна (ещё раз)")
    assert r.status_code == 409 and r.json()["error"] == "possible_duplicate"
    assert r.json()["candidates"][0]["child_id"] == anna["id"]
    # Сотрудник подтверждает: это близнец
    twin = register(ANNA, "Алина", parent_id=anna["parent"]["id"], force=True)
    assert twin.status_code == 201
    r = staff.post("/api/recognition/identify", files=files(ANNA)).json()
    assert r["status"] == "ambiguous" and r["child_id"] is None
    assert {c["child"]["first_name"] for c in r["candidates"]} == {"Анна", "Алина"}


def test_face_profiles_capped_and_deletable(db, staff, admin, register):
    anna = register(ANNA).json()
    for _ in range(4):
        assert staff.post(f"/api/children/{anna['id']}/faces", files=files(ANNA)).status_code == 204
    ids = db.scalars(select(FaceProfile.id).where(FaceProfile.child_id == anna["id"]).order_by(FaceProfile.id)).all()
    assert len(ids) == 3 and ids[0] == 1  # профиль с регистрации сохранился

    assert staff.delete(f"/api/children/{anna['id']}/faces").status_code == 403
    assert admin.delete(f"/api/children/{anna['id']}/faces").status_code == 204
    assert db.scalar(select(func.count()).select_from(FaceProfile)) == 0
    r = staff.post("/api/recognition/identify", files=files(ANNA)).json()
    assert r["status"] == "not_found"


def test_recognition_unavailable_does_not_break_visits(client, staff, register, start_visit):
    from app.main import app
    from app.services.errors import RecognitionUnavailable
    from app.services.face import require_face_engine

    anna = register(ANNA).json()

    def broken():
        raise RecognitionUnavailable("Распознавание временно недоступно. Найдите ребёнка по номеру телефона")

    app.dependency_overrides[require_face_engine] = broken
    r = staff.post("/api/recognition/identify", files=files(ANNA))
    assert r.status_code == 503 and r.json()["error"] == "recognition_unavailable"
    # Поиск по телефону и посещения работают
    assert staff.get("/api/parents/by-phone", params={"phone": "+998901112233"}).status_code == 200
    assert start_visit(anna["id"]).status_code == 201
    del app.dependency_overrides[require_face_engine]


# ---------------------------------------------------------------- бот


def test_bot_requires_token(client):
    assert client.post("/api/bot/notifications/claim").status_code == 401
    assert client.post("/api/bot/notifications/claim", headers={"X-Bot-Token": "wrong"}).status_code == 401


def test_link_unknown_phone(bot):
    r = bot.post("/api/bot/link", json={"phone": "+998991234567", "chat_id": 1})
    assert r.status_code == 404 and r.json()["error"] == "parent_not_found"


def test_link_resends_skipped_notifications(bot, register, start_visit, notifications):
    anna = register(ANNA).json()
    start_visit(anna["id"])
    assert notifications(event="visit_started")[0].status == "skipped"
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 42, "username": "ivan"})
    [n] = bot.post("/api/bot/notifications/claim").json()
    assert n["event"] == "visit_started" and n["chat_id"] == 42


def test_bot_cannot_touch_other_parents_visit(bot, register, start_visit):
    anna = register(ANNA).json()
    maxim = register(MAXIM, "Максим", phone="+998935554433").json()
    v = start_visit(maxim["id"]).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 1})  # родитель Анны
    r = bot.post(f"/api/bot/visits/{v['id']}/decline", json={"chat_id": 1})
    assert r.status_code == 403
    r = bot.post(f"/api/bot/visits/{v['id']}/decline", json={"chat_id": 999})
    assert r.status_code == 403 and r.json()["error"] == "telegram_not_linked"


def test_delivery_retry_and_lease(bot, register, start_visit, clock, notifications):
    anna = register(ANNA).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 1})
    start_visit(anna["id"])

    [n] = bot.post("/api/bot/notifications/claim").json()
    assert bot.post("/api/bot/notifications/claim").json() == []  # «арендовано»
    clock.advance(seconds=61)  # бот упал и не ответил — аренда истекла
    [again] = bot.post("/api/bot/notifications/claim").json()
    assert again["id"] == n["id"] and again["attempts"] == 2

    # Telegram недоступен → повтор позже
    bot.post(f"/api/bot/notifications/{n['id']}/result", json={"success": False, "error": "timeout"})
    assert bot.post("/api/bot/notifications/claim").json() == []
    clock.advance(minutes=2)
    [third] = bot.post("/api/bot/notifications/claim").json()
    bot.post(f"/api/bot/notifications/{third['id']}/result", json={"success": True})
    assert notifications(id=n["id"])[0].status == "sent"


def test_blocked_bot_is_permanent_failure(bot, register, start_visit, notifications):
    anna = register(ANNA).json()
    bot.post("/api/bot/link", json={"phone": "+998901112233", "chat_id": 1})
    start_visit(anna["id"])
    [n] = bot.post("/api/bot/notifications/claim").json()
    bot.post(f"/api/bot/notifications/{n['id']}/result",
             json={"success": False, "error": "Forbidden: bot was blocked by the user", "permanent": True})
    assert notifications(id=n["id"])[0].status == "failed"


def test_staff_web_notifications(staff, register, start_visit, clock):
    v = start_visit(register(ANNA).json()["id"]).json()
    clock.advance(minutes=10)
    staff.post(f"/api/visits/{v['id']}/complete")
    [n] = staff.get("/api/notifications").json()
    assert n["event"] == "visit_completed"
    assert staff.post(f"/api/notifications/{n['id']}/read").status_code == 204
    assert staff.get("/api/notifications").json() == []
