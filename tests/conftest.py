"""Тесты идут на настоящем Postgres с pgvector.

    docker compose up -d db
    docker compose exec db createdb -U skypark skypark_test
    pytest

База очищается перед каждым тестом, поэтому в её имени обязано быть "test".
Распознавание — заглушка FakeFaceEngine: «личность» = цвет картинки.
"""

import os
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
import pytest

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://skypark:change-me@localhost:5432/skypark_test"
)
assert "test" in TEST_DATABASE_URL.rsplit("/", 1)[-1], "Имя тестовой БД должно содержать 'test'"

os.environ.update(
    DATABASE_URL=TEST_DATABASE_URL,
    JWT_SECRET="test-secret-" + "x" * 32,
    BOT_API_TOKEN="test-bot-token",
    FACE_ENGINE="fake",
    PAYMENT_PROVIDER="fake",
    PARK_TIMEZONE="Asia/Tashkent",
    MAX_FACE_PROFILES_PER_CHILD="3",
)

# --- «лица» для FakeFaceEngine (BGR) ---
ANNA = (40, 80, 200)
MAXIM = (200, 120, 40)
SOFIA = (120, 200, 80)
STRANGER = (80, 40, 160)
DARK = (0, 0, 0)  # лица нет

# 10:00 UTC = 15:00 в Ташкенте
T0 = datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc)


def photo(color, size=300) -> bytes:
    img = np.zeros((size, size, 3), dtype=np.uint8)
    img[:] = color
    return cv2.imencode(".jpg", img)[1].tobytes()


def files(color):
    return {"photo": ("face.jpg", photo(color), "image/jpeg")}


class Clock:
    def __init__(self):
        self.now = T0

    def advance(self, **kw):
        self.now += timedelta(**kw)


class As:
    """Клиент от имени пользователя: подставляет его заголовки авторизации."""

    def __init__(self, client, headers):
        self.client, self.headers = client, headers

    def request(self, method, url, **kw):
        kw["headers"] = {**self.headers, **kw.get("headers", {})}
        return self.client.request(method, url, **kw)

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, **kw):
        return self.request("POST", url, **kw)

    def delete(self, url, **kw):
        return self.request("DELETE", url, **kw)


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

    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with db_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    from app.db.session import SessionLocal

    with SessionLocal() as session:
        yield session


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def world(db):
    """Пользователи, няни и варианты продолжительности как после seed-demo (без расписания)."""
    from decimal import Decimal

    from app.cli import create_user
    from app.db.models import DurationOption
    from app.domain.enums import OptionKind, Role

    users = {
        "admin": create_user(db, "admin", "admin12345", Role.ADMIN, "Админ"),
        "staff": create_user(db, "staff", "staff12345", Role.EMPLOYEE, "Дилноза"),
        "nanny1": create_user(db, "nanny1", "nanny12345", Role.NANNY, "Малика"),
        "nanny2": create_user(db, "nanny2", "nanny12345", Role.NANNY, "Гульнора"),
    }
    opts = {}
    for key, kind, name, minutes, price in [
        ("1h", OptionKind.VISIT, "1 час", 60, 50000),
        ("2h", OptionKind.VISIT, "2 часа", 120, 90000),
        ("+30", OptionKind.EXTENSION, "+30 минут", 30, 30000),
        ("+1h", OptionKind.EXTENSION, "+1 час", 60, 50000),
    ]:
        o = DurationOption(kind=kind, name=name, minutes=minutes, price=Decimal(price))
        db.add(o)
        db.flush()
        opts[key] = o.id
    db.commit()
    return {
        "opt": opts,
        "nanny1": users["nanny1"].nanny.id,
        "nanny2": users["nanny2"].nanny.id,
    }


@pytest.fixture
def client(world, clock):
    from fastapi.testclient import TestClient

    from app.api.deps import get_now
    from app.main import app

    app.dependency_overrides[get_now] = lambda: clock.now
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _login(client, login, password):
    r = client.post("/api/auth/login", data={"username": login, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def staff(client):
    return As(client, _login(client, "staff", "staff12345"))


@pytest.fixture
def admin(client):
    return As(client, _login(client, "admin", "admin12345"))


@pytest.fixture
def nanny1(client):
    return As(client, _login(client, "nanny1", "nanny12345"))


@pytest.fixture
def bot(client):
    return As(client, {"X-Bot-Token": "test-bot-token"})


@pytest.fixture
def register(staff):
    """Регистрация ребёнка. По умолчанию — новый родитель Иван, +998 90 111 22 33."""

    def _register(color, first_name="Анна", *, phone="+998901112233", parent_id=None, force=False, **extra):
        if "parent_id_raw" in extra:  # как отправляет Swagger: parent_id=0
            extra["parent_id"] = extra.pop("parent_id_raw")
        data = {"first_name": first_name, "consent": "true", "force": str(force).lower(), **extra}
        if parent_id is not None:
            data["parent_id"] = str(parent_id)
        else:
            data.update(parent_phone=phone, parent_first_name="Иван", parent_last_name="Иванов")
        return staff.post("/api/registration", data=data, files=files(color))

    return _register


@pytest.fixture
def start_visit(staff, world):
    def _start(child_id, *, nanny="nanny1", option="1h", **extra):
        body = {"child_id": child_id, "nanny_id": world[nanny], "option_id": world["opt"][option], **extra}
        return staff.post("/api/visits", json=body)

    return _start


@pytest.fixture
def tick(db_engine, clock):
    """Один проход фонового планировщика в момент clock.now."""
    from app.db.session import SessionLocal
    from app.services.scheduler import tick as run

    def _tick():
        with SessionLocal() as s:
            return run(s, clock.now)

    return _tick


@pytest.fixture
def notifications(db):
    from sqlalchemy import select

    from app.db.models import Notification

    def _list(**filters):
        db.expire_all()
        q = select(Notification).order_by(Notification.id)
        for k, v in filters.items():
            q = q.where(getattr(Notification, k) == v)
        return list(db.scalars(q))

    return _list
