"""Защита: продакшен-настройки, лимиты на фото, границы child_id, журнал,
удаление фото из Redis, сверка с backend, пульс воркера."""

import base64
import json
import logging
import os
import struct
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.config import MAX_CHILD_ID, Settings
from app.recognition import service
from app.recognition.engine import check_image, image_size
from app.recognition.errors import BadImage, PhotoTooLarge, SyncRefused
from tests.conftest import ANNA, MAXIM, STRANGER, files, photo

ROOT = Path(__file__).resolve().parents[1]
STRONG = "postgresql+psycopg://skypark:Xk3v9Q2mLp7Rt5Wz@db:5432/recognition_1"
GOOD_PROD = dict(
    app_env="prod",
    internal_token="t" * 40,
    redis_url="redis://:Rp4sW0rd-Long@redis:6379",
    shard_database_urls=STRONG,
    face_engine="insightface",
)


# ---------------------------------------------------------------- продакшен-настройки


def test_production_settings_ok():
    s = Settings(_env_file=None, **GOOD_PROD)
    assert s.production_problems() == []
    s.check_production()  # не бросает


@pytest.mark.parametrize(
    ("override", "problem"),
    [
        ({"internal_token": ""}, "INTERNAL_TOKEN"),
        ({"internal_token": "short"}, "INTERNAL_TOKEN"),
        ({"redis_url": "redis://redis:6379"}, "REDIS_URL"),
        ({"shard_database_urls": "postgresql+psycopg://skypark:change-me@db/recognition_1"}, "Шард 0"),
        ({"shard_database_urls": STRONG + ",postgresql+psycopg://skypark@db/r2"}, "Шард 1"),
        ({"face_engine": "fake"}, "FACE_ENGINE"),
    ],
)
def test_production_settings_problems(override, problem):
    s = Settings(_env_file=None, **{**GOOD_PROD, **override})
    assert any(problem in p for p in s.production_problems())
    with pytest.raises(RuntimeError, match="Небезопасные настройки"):
        s.check_production()
    # в разработке те же настройки допустимы
    Settings(_env_file=None, **{**GOOD_PROD, **override, "app_env": "dev"}).check_production()


def _import_main(**env) -> subprocess.CompletedProcess:
    code = "import app.main as m; print(m.app.docs_url, m.app.openapi_url)"
    return subprocess.run(
        [sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True,
        env={**os.environ, **env}, timeout=60,
    )


def test_api_refuses_to_start_in_prod_with_weak_settings():
    r = _import_main(APP_ENV="prod", INTERNAL_TOKEN="", FACE_ENGINE="fake")
    assert r.returncode != 0 and "Небезопасные настройки" in r.stderr


def test_swagger_disabled_in_prod():
    env = {k.upper(): v for k, v in GOOD_PROD.items()}
    r = _import_main(**env)
    assert r.returncode == 0, r.stderr
    assert r.stdout.split() == ["None", "None"]
    assert _import_main(APP_ENV="dev").stdout.split() == ["/docs", "/openapi.json"]


# ---------------------------------------------------------------- лимиты на фото


def _jpeg_with_size(w: int, h: int) -> bytes:
    """Маленький JPEG, в заголовке которого записан размер w x h («фото-бомба»)."""
    data = bytearray(photo(ANNA, size=16))
    i = 2
    while True:
        marker, length = data[i + 1], struct.unpack(">H", data[i + 2 : i + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            data[i + 5 : i + 9] = struct.pack(">HH", h, w)
            return bytes(data)
        i += 2 + length


def _png_with_size(w: int, h: int) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR" + struct.pack(">II", w, h) + b"\x08\x02\x00\x00\x00"


def test_image_size_from_header():
    assert image_size(photo(ANNA, size=300)) == (300, 300)
    png = cv2.imencode(".png", np.zeros((40, 70, 3), np.uint8))[1].tobytes()
    assert image_size(png) == (70, 40)
    assert image_size(_jpeg_with_size(60000, 60000)) == (60000, 60000)
    assert image_size(b"GIF89a....") is None
    assert image_size(b"\xff\xd8\xff") is None  # обрезанный JPEG


def test_pixel_bomb_rejected_before_decoding():
    s = Settings(_env_file=None)
    for bomb in (_jpeg_with_size(60000, 60000), _png_with_size(30000, 30000)):
        assert len(bomb) < 10_000  # файл крошечный…
        with pytest.raises(PhotoTooLarge, match="разрешение"):  # …а разрешение огромное
            check_image(bomb, s)
    check_image(photo(ANNA, size=3000), s)  # обычное большое фото проходит


def test_only_jpeg_and_png():
    bmp = cv2.imencode(".bmp", np.full((200, 200, 3), 100, np.uint8))[1].tobytes()
    with pytest.raises(BadImage, match="JPEG или PNG"):
        check_image(bmp, Settings(_env_file=None))


def test_file_size_limit():
    s = Settings(_env_file=None, max_photo_bytes=1000)
    with pytest.raises(PhotoTooLarge):
        check_image(photo(ANNA, size=300) + b"\0" * 1000, s)


def test_api_photo_too_large(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_photo_bytes", 500)
    r = client.post("/api/recognition/identify", files=files(ANNA))
    assert r.status_code == 413 and r.json()["error"] == "photo_too_large"


def test_api_huge_body_cut_off_by_middleware(client):
    from app.config import get_settings
    from app.limits import OVERHEAD

    big = b"\0" * (get_settings().max_photo_bytes + OVERHEAD + 1)
    r = client.post("/api/recognition/identify", files={"photo": ("x.jpg", big, "image/jpeg")})
    assert r.status_code == 413 and r.json()["error"] == "photo_too_large"


def test_api_pixel_bomb(client):
    r = client.post(
        "/api/recognition/identify", files={"photo": ("b.jpg", _jpeg_with_size(60000, 60000), "image/jpeg")}
    )
    assert r.status_code == 413 and r.json()["error"] == "photo_too_large"


# ---------------------------------------------------------------- child_id


def test_api_child_id_bounds(client):
    assert client.get(f"/api/recognition/faces/{MAX_CHILD_ID}").status_code == 200
    assert client.get(f"/api/recognition/faces/{MAX_CHILD_ID + 1}").status_code == 422
    assert client.get("/api/recognition/faces/0").status_code == 422
    assert client.delete(f"/api/recognition/faces/{2**63}").status_code == 422


def test_worker_child_id_bounds():
    from bullmq import UnrecoverableError

    from app.worker import _child_id

    assert _child_id({"child_id": MAX_CHILD_ID}) == MAX_CHILD_ID
    for bad in (MAX_CHILD_ID + 1, 0, -1, True, "7", 7.0):
        with pytest.raises(UnrecoverableError):
            _child_id({"child_id": bad})


def test_worker_photo_too_large_is_result(monkeypatch):
    from app.config import get_settings
    from app.worker import run_job

    monkeypatch.setattr(get_settings(), "max_photo_bytes", 100)
    r = run_job("identify", {"photo": base64.b64encode(b"\0" * 1000).decode()})
    assert r["ok"] is False and r["error"] == "photo_too_large"


# ---------------------------------------------------------------- журнал доступа


class _Records(logging.Handler):
    def __init__(self):
        super().__init__()
        self.items = []

    def emit(self, record):
        self.items.append(json.loads(record.getMessage()))


@pytest.fixture
def audit_log():
    log = logging.getLogger("recognition.audit")
    h = _Records()
    log.addHandler(h)
    yield h.items
    log.removeHandler(h)


def test_audit_http(client, audit_log):
    client.post("/api/recognition/faces/7?source=registration", files=files(ANNA), headers={"X-Actor": "staff:3"})
    client.post("/api/recognition/identify", files=files(ANNA))
    client.get("/api/recognition/faces/7/thumbnail")
    client.delete("/api/recognition/faces/7")
    actions = [(r["action"], r.get("child_id")) for r in audit_log]
    assert actions == [("enroll", 7), ("identify", 7), ("thumbnail", 7), ("delete_faces", 7)]
    assert audit_log[0]["actor"] == "staff:3" and audit_log[0]["via"] == "http"
    assert audit_log[1]["status"] == "found"
    assert audit_log[3]["deleted"] == 1
    assert "photo" not in json.dumps(audit_log) and "thumbnail\":" not in json.dumps(audit_log)


def test_audit_queue_and_photo_removed_from_redis(queue_env, audit_log):
    from bullmq import Job

    async def scenario(rc):
        ok_id = await rc.submit_enroll(101, photo(ANNA), actor="staff:9", branch="chilanzar")
        await rc.wait(ok_id)
        bad_id = await rc.submit_identify(b"not an image")
        await rc.wait(bad_id)
        failed_id = await rc.submit("enroll", {"child_id": MAX_CHILD_ID + 1, "photo": "AAAA"})
        for _ in range(100):
            if (await rc.get_result(failed_id))["state"] == "failed":
                break
            await __import__("asyncio").sleep(0.05)
        jobs = [await Job.fromId(rc.queue, j) for j in (ok_id, bad_id, failed_id)]
        return jobs

    jobs = queue_env(scenario)
    for job in jobs:  # фото не осталось ни в выполненной, ни в упавшей задаче
        assert "photo" not in job.data, job.name
    assert jobs[0].data["child_id"] == 101 and jobs[0].returnvalue["ok"]

    enroll = next(r for r in audit_log if r["action"] == "enroll" and r.get("child_id") == 101)
    assert enroll["via"] == "queue" and enroll["actor"] == "staff:9" and enroll["branch"] == "chilanzar"
    assert enroll["job_id"] == jobs[0].id and enroll["ok"] is True
    assert any(r["action"] == "identify" and r.get("error") == "bad_image" for r in audit_log)
    assert any(r.get("error") == "unrecoverable" for r in audit_log)


def test_photo_kept_for_retries():
    """При обычном сбое фото остаётся — оно нужно следующей попытке."""
    from app.worker import _is_last_attempt

    class J:
        def __init__(self, made, attempts):
            self.attemptsMade, self.opts = made, {"attempts": attempts}

    assert not _is_last_attempt(J(0, 3), RuntimeError())
    assert not _is_last_attempt(J(1, 3), RuntimeError())
    assert _is_last_attempt(J(2, 3), RuntimeError())
    assert _is_last_attempt(J(0, None), RuntimeError())  # без повторов


# ---------------------------------------------------------------- сверка с backend


def test_sync_children(clean):
    for cid, color in ((101, ANNA), (102, MAXIM), (103, STRANGER)):
        service.enroll(cid, photo(color))
    preview = service.sync_children([101, 102, 999], dry_run=True)
    assert preview.orphans == [103] and preview.deleted == 0 and preview.stored == 3
    assert service.count_faces(103) == 1  # dry_run ничего не удалил

    r = service.sync_children([101, 102, 999])
    assert r.orphans == [103] and r.deleted == 1 and r.known == 3
    assert service.count_faces(103) == 0 and service.count_faces(101) == 1


def test_sync_children_guards(clean, monkeypatch):

    for cid in range(1, 21):
        service.enroll(cid, photo(ANNA))
    with pytest.raises(SyncRefused, match="Пустой"):
        service.sync_children([])
    # 10 из 20 — больше 20% и больше 5: подозрительно
    with pytest.raises(SyncRefused, match="подозрительно"):
        service.sync_children(list(range(1, 11)))
    assert service.count_faces(15) == 1
    assert service.sync_children(list(range(1, 11)), dry_run=True).orphans == list(range(11, 21))
    assert service.sync_children(list(range(1, 11)), force=True).deleted == 10
    with pytest.raises(SyncRefused):  # пустой список разрешён, но удалить всех — всё равно много
        service.sync_children([], allow_empty=True)
    assert service.sync_children([], allow_empty=True, force=True).deleted == 10


def test_sync_children_through_queue(queue_env):
    async def scenario(rc):
        await rc.enroll(101, photo(ANNA))
        await rc.enroll(102, photo(MAXIM))
        empty = await rc.sync_children([])
        done = await rc.sync_children([101])
        bad = await rc.submit_sync_children(["x"])
        return empty, done, bad, rc

    empty, done, *_ = queue_env(scenario)
    assert empty["ok"] is False and empty["error"] == "sync_refused"
    assert done == {"ok": True, "dry_run": False, "known": 1, "stored": 2, "orphans": [102], "deleted": 1}


# ---------------------------------------------------------------- пульс воркера и статистика


def test_heartbeat(tmp_path):
    import asyncio

    from app.worker import heartbeat, is_alive

    path = tmp_path / "hb"
    assert not is_alive(path)

    class W:
        running = True

    async def run():
        task = asyncio.create_task(heartbeat(W(), path))
        await asyncio.sleep(0.05)
        task.cancel()

    asyncio.run(run())
    assert is_alive(path)
    os.utime(path, (0, 0))  # давно не обновлялся
    assert not is_alive(path)


def test_stats(client, redis_available):
    r = client.get("/api/recognition/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["queue"] == "recognition-test"
    assert {"waiting", "active", "failed", "completed", "delayed"} <= body.keys()
