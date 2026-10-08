"""Хранилище эмбеддингов лиц (pgvector).

Таблица face_profiles — это и есть «суб-БД по ключам»: по лицу векторный индекс
HNSW быстро находит ближайшие эмбеддинги и возвращает ключ — child_id.
Карточку ребёнка по этому ключу отдаёт основная часть backend.

child_id намеренно без внешнего ключа: модуль распознавания не зависит от того,
как устроена таблица детей. Когда она появится, внешний ключ с ON DELETE CASCADE
можно добавить отдельной миграцией (см. README).
"""

from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Float, Index, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

EMBEDDING_DIM = 512


class FaceProfile(Base):
    """Один эмбеддинг лица ребёнка. У ребёнка их несколько: фото с регистрации
    (хранится всегда) + несколько последних фото с визитов."""

    __tablename__ = "face_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    child_id: Mapped[int] = mapped_column(Integer, index=True)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM))
    det_score: Mapped[float] = mapped_column(Float)
    thumbnail: Mapped[bytes] = mapped_column(LargeBinary)  # вырезка лица, JPEG
    source: Mapped[str] = mapped_column(String(16), default="registration")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # Векторный индекс для быстрого поиска ближайшего лица по косинусному расстоянию.
        Index(
            "ix_face_profiles_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )
