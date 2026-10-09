"""Тесты идут на настоящем Postgres с pgvector (2 шарда) и настоящем Redis.

    docker compose up -d db redis
    docker compose exec db createdb -U skypark recognition_test
    docker compose exec db createdb -U skypark recognition_test_2
    cd services/recognition
    pytest

Базы очищаются перед каждым тестом, поэтому в их именах обязано быть "test".
Распознавание — заглушка FakeFaceEngine: «личность» = цвет картинки.
Без Redis тесты очереди пропускаются, без Postgres — тесты базы.
"""

import asyncio
import os

import cv2
import numpy as np
import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://skypark:change-me@localhost:5432/recognition_test"
)
TEST_DATABASE_URL_2 = os.environ.get("TEST_DATABASE_URL_2", TEST_DATABASE_URL + "_2")
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
SHARD_URLS = [TEST_DATABASE_URL, TEST_DATABASE_URL_2]
for _url in SHARD_URLS:
    assert "test" in _url.rsplit("/", 1)[-1], "Имя тестовой БД должно содержать 'test'"

os.environ.update(
    SHARD_DATABASE_URLS=",".join(SHARD_URLS),
    DATABASE_URL=TEST_DATABASE_URL,
    REDIS_URL=TEST_REDIS_URL,
    QUEUE_NAME="recognition-test",
    FACE_ENGINE="fake",
    MAX_FACE_PROFILES_PER_CHILD="3",
    INTERNAL_TOKEN="",
    APP_ENV="dev",
)

# --- «лица» для FakeFaceEngine (BGR) ---
ANNA = (40, 80, 200)
MAXIM = (200, 120, 40)
STRANGER = (80, 40, 160)
DARK = (0, 0, 0)  # лица нет


def photo(color, size=300) -> bytes:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:] = color
    return cv2.imencode(".jpg", img)[1].tobytes()


def files(color):
    return {"photo": ("face.jpg", photo(color), "image/jpeg")}


@pytest.fixture(scope="session")
def shards():
    from sqlalchemy import text

    from app.db.session import get_shards
    from app.migrate import upgrade_all

    shards = get_shards()
    try:
        for engine in shards.engines:
            with engine.begin() as conn:
                conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Тестовые базы недоступны ({', '.join(SHARD_URLS)}): {exc}")
    upgrade_all(SHARD_URLS)
    return shards


@pytest.fixture
def clean(shards):
    """Пустые шарды перед тестом."""
    from sqlalchemy import text

    for engine in shards.engines:
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE face_profiles RESTART IDENTITY"))
    return shards


@pytest.fixture
def db(clean):
    """Сессия первого шарда — для тестов запросов внутри одного шарда."""
    with clean.session(0) as session:
        yield session


@pytest.fixture
def client(clean):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def redis_available():
    from redis import Redis

    try:
        Redis.from_url(TEST_REDIS_URL, socket_connect_timeout=1).ping()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Redis недоступен ({TEST_REDIS_URL}): {exc}")


@pytest.fixture
def queue_env(clean, redis_available):
    """Пустая очередь + запущенный в этом процессе воркер; тест получает клиент.

    Пример:  def test_x(queue_env): result = queue_env(lambda c: c.identify(...))"""
    from bullmq import Queue

    from app.worker import make_worker
    from client.recognition_client import RecognitionClient

    def run(scenario):
        async def main():
            q = Queue("recognition-test", {"connection": TEST_REDIS_URL})
            await q.obliterate({"force": True})
            await q.close()
            worker = make_worker()
            rc = RecognitionClient(TEST_REDIS_URL, "recognition-test")
            try:
                return await scenario(rc)
            finally:
                await rc.close()
                await worker.close()

        return asyncio.run(main())

    return run
