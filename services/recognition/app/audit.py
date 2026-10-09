"""Журнал доступа к биометрии.

Каждое действие с лицами детей (поиск, регистрация, удаление, сверка, просмотр
вырезки) пишется одной строкой JSON в логгер "recognition.audit":

    {"ts": "2026-10-09T10:15:03Z", "action": "identify", "via": "queue", "job_id": "42",
     "actor": "staff:17", "branch": "chilanzar", "ok": true, "status": "found",
     "child_id": 7, "confidence": 0.93}

Фото и эмбеддинги в журнал НЕ попадают — только кто, что, когда и с каким итогом.
Кто именно (actor, branch) — передаёт backend в данных задачи; сервис распознавания
пользователей не знает.

Куда писать журнал, решает инфраструктура: по умолчанию это stdout контейнера
(docker logs), в продакшене — сборщик логов (Loki/ELK) с хранением не меньше,
чем требует юрист.
"""

import json
import logging
from datetime import UTC, datetime

log = logging.getLogger("recognition.audit")
# Свой обработчик: журнал пишется всегда, как бы ни был настроен остальной логгинг
# (у uvicorn по умолчанию INFO-сообщения приложения не выводятся).
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("AUDIT %(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

# Что берём из результата задачи в журнал (без фото, вырезок и эмбеддингов).
RESULT_FIELDS = ("ok", "status", "child_id", "confidence", "error", "deleted", "faces_count", "source")
# Что backend может передать в данных задачи для журнала.
CONTEXT_FIELDS = ("actor", "branch")


def audit(action: str, *, via: str, result: dict | None = None, **fields) -> None:
    record = {"ts": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "action": action, "via": via}
    record.update({k: v for k, v in fields.items() if v is not None})
    if result:
        record.update({
            k: result[k] for k in RESULT_FIELDS if result.get(k) is not None and k not in record
        })
    log.info(json.dumps(record, ensure_ascii=False, default=str))


def context(data: dict) -> dict:
    """actor/branch из данных задачи (короткие строки, чтобы журнал не раздувать)."""
    if not isinstance(data, dict):
        return {}
    return {k: str(data[k])[:100] for k in CONTEXT_FIELDS if data.get(k) is not None}
