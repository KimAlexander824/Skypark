"""Общая основа моделей: Base, типы и помощники. Используется и ядром, и админкой."""

from sqlalchemy import DateTime, Numeric, func
from sqlalchemy.orm import DeclarativeBase, mapped_column

EMBEDDING_DIM = 512
Money = Numeric(12, 2)


def _ts(nullable: bool = False, default: bool = False):
    """Колонка даты-времени с часовым поясом (хранится в UTC)."""
    return mapped_column(
        DateTime(timezone=True),
        nullable=nullable,
        server_default=func.now() if default else None,
    )


class Base(DeclarativeBase):
    pass
