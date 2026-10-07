"""Тесты идут на настоящем Postgres с pgvector.

    docker compose up -d db
    docker compose exec db createdb -U skypark skypark_test
    pytest

База очищается перед каждым тестом, поэтому в её имени обязано быть "test".
Распознавание — заглушка FakeFaceEngine: «личность» = цвет картинки.
"""

import os

import cv2
import numpy as np
import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://skypark:change-me@localhost:5432/skypark_test"
)
assert "test" in TEST_DATABASE_URL.rsplit("/", 1)[-1], "Имя тестовой БД должно содержать 'test'"

os.environ.update(
    DATABASE_URL=TEST_DATABASE_URL,
    FACE_ENGINE="fake",
    MAX_FACE_PROFILES_PER_CHILD="3",
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
def db_engine():
    from sqlalchemy import text

    from app.db.session import engine

    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"Тестовая БД недоступна ({TEST_DATABASE_URL}): {exc}")

    from alembic import command
    from alembic.config import Config

    root = os.path.dirname(os.path.dirname(__file__))
    cfg = Config(os.path.join(root, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(root, "migrations"))
    command.upgrade(cfg, "head")
    return engine


@pytest.fixture
def db(db_engine):
    from sqlalchemy import text

    from app.db.models import Base
    from app.db.session import SessionLocal

    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with db_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
