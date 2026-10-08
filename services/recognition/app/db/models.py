"""Реестр всех моделей проекта — отсюда их видит Alembic.

Новый файл моделей нужно добавить в импорт ниже, иначе Alembic не создаст
для него миграцию. Например, когда появится основная часть backend:

    from app.<модуль>.models import *  # noqa: F401,F403
"""

from app.db.base import Base  # noqa: F401
from app.recognition.models import FaceProfile  # noqa: F401
