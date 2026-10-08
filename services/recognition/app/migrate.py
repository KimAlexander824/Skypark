"""Применить миграции ко ВСЕМ шардам: python -m app.migrate

Обычная команда `alembic upgrade head` обновляет только первый шард."""

import os

from alembic import command
from alembic.config import Config

from app.config import get_settings

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def upgrade_all(urls: list[str] | None = None) -> None:
    for i, url in enumerate(urls or get_settings().shard_urls):
        cfg = Config(os.path.join(ROOT, "alembic.ini"))
        cfg.set_main_option("script_location", os.path.join(ROOT, "migrations"))
        cfg.attributes["url"] = url
        print(f"Шард {i}: миграции", flush=True)
        command.upgrade(cfg, "head")


if __name__ == "__main__":
    upgrade_all()
