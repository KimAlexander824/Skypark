"""Все модели БД. Импортируйте отсюда: from app.db.models import Visit, Nanny.

  base.py  — Base и общие помощники
  core.py  — таблицы ядра (родители, дети, лица, посещения, продления, платежи,
             уведомления, журнал)
  admin.py — справочники администратора (сотрудники, няни, тарифы, скидки,
             промокоды, рабочее время)

Новый файл моделей нужно добавить в импорт ниже, иначе Alembic его не увидит.
"""

from app.db.models.admin import *  # noqa: F401,F403
from app.db.models.base import EMBEDDING_DIM, Base, Money  # noqa: F401
from app.db.models.core import *  # noqa: F401,F403
