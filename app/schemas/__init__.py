"""Модели запросов и ответов API: from app.schemas import VisitOut.

  core.py  — ядро (распознавание, посещения, продления, оплата, бот)
  admin.py — администрирование (владелец — Акмаль)
"""

from app.schemas.admin import *  # noqa: F401,F403
from app.schemas.core import *  # noqa: F401,F403
