"""Подключение к базам-шардам.

Лица одного ребёнка всегда лежат в одном шарде: номер = child_id % число_шардов.
Поиск по фото не знает, чьё это лицо, поэтому опрашивает все шарды
(см. app/recognition/service.py).

Для разработки шарды — отдельные базы на одном сервере Postgres
(recognition_1, recognition_2, …). В продакшене это могут быть разные серверы:
меняются только адреса в SHARD_DATABASE_URLS, код тот же.
"""

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings


class Shards:
    def __init__(self, urls: list[str]):
        if not urls:
            raise ValueError("Нужен хотя бы один шард")
        self.urls = urls
        self.engines = [create_engine(u, pool_pre_ping=True) for u in urls]
        self._makers = [sessionmaker(bind=e, expire_on_commit=False) for e in self.engines]

    def __len__(self) -> int:
        return len(self.engines)

    def index_for(self, child_id: int) -> int:
        return child_id % len(self.engines)

    def session(self, index: int) -> Session:
        return self._makers[index]()

    def session_for(self, child_id: int) -> Session:
        """Сессия шарда, где лежат (или будут лежать) лица этого ребёнка."""
        return self.session(self.index_for(child_id))

    def dispose(self) -> None:
        for e in self.engines:
            e.dispose()


@lru_cache
def get_shards() -> Shards:
    return Shards(get_settings().shard_urls)
