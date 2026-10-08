"""HTTP API /api/recognition/*."""

from tests.conftest import ANNA, DARK, MAXIM, STRANGER, files


def test_full_flow(client):
    r = client.post("/api/recognition/faces/7", params={"source": "registration"}, files=files(ANNA))
    assert r.status_code == 201, r.text
    assert r.json()["child_id"] == 7 and r.json()["source"] == "registration"
    client.post("/api/recognition/faces/8", params={"source": "registration"}, files=files(MAXIM))

    r = client.post("/api/recognition/identify", files=files(ANNA)).json()
    assert r["status"] == "found" and r["child_id"] == 7 and r["message"] == "Ребёнок найден"

    r = client.post("/api/recognition/identify", files=files(STRANGER)).json()
    assert r["status"] == "not_found" and r["child_id"] is None
    assert r["message"].startswith("Ребёнок не найден. Зарегистрировать нового ребёнка")

    assert client.get("/api/recognition/faces/7").json() == {"child_id": 7, "count": 1}
    r = client.get("/api/recognition/faces/7/thumbnail")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"

    assert client.delete("/api/recognition/faces/7").status_code == 204
    assert client.get("/api/recognition/faces/7").json()["count"] == 0
    r = client.get("/api/recognition/faces/7/thumbnail")
    assert r.status_code == 404 and r.json()["error"] == "not_found"


def test_photo_errors(client):
    r = client.post("/api/recognition/identify", files=files(DARK))
    assert r.status_code == 422 and r.json()["error"] == "no_face"
    r = client.post("/api/recognition/identify", files={"photo": ("x.jpg", b"oops", "image/jpeg")})
    assert r.status_code == 422 and r.json()["error"] == "bad_image"


def test_recognition_unavailable(client):
    from app.main import app
    from app.recognition.engine import require_face_engine
    from app.recognition.errors import RecognitionUnavailable

    def broken():
        raise RecognitionUnavailable("Распознавание временно недоступно. Найдите ребёнка по номеру телефона")

    app.dependency_overrides[require_face_engine] = broken
    r = client.post("/api/recognition/identify", files=files(ANNA))
    assert r.status_code == 503 and r.json()["error"] == "recognition_unavailable"
    assert client.get("/api/health").status_code == 200


def test_invalid_source(client):
    r = client.post("/api/recognition/faces/7", params={"source": "x"}, files=files(ANNA))
    assert r.status_code == 400 and r.json()["error"] == "invalid_source"


def test_internal_token(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "internal_token", "secret")
    r = client.get("/api/recognition/faces/7")
    assert r.status_code == 401 and r.json()["error"] == "unauthorized"
    r = client.get("/api/recognition/faces/7", headers={"X-Internal-Token": "secret"})
    assert r.status_code == 200
    assert client.get("/api/health").status_code == 200  # проверка здоровья без токена
