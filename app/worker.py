"""Фоновый воркер: напоминания за 15 минут и автозавершение посещений.

    python -m app.worker

Можно запускать несколько копий — задачи используют SELECT … SKIP LOCKED.
"""

import logging
import signal
import time
from datetime import datetime, timezone

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.scheduler import tick

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")

_running = True


def _stop(*_):
    global _running
    _running = False


def main() -> None:
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    interval = get_settings().scheduler_interval_seconds
    log.info("Воркер запущен, интервал %s с", interval)
    while _running:
        started = time.monotonic()
        try:
            with SessionLocal() as session:
                result = tick(session, datetime.now(timezone.utc))
            if result.reminders or result.completed:
                log.info("Напоминаний: %s, завершено: %s", result.reminders, result.completed)
        except Exception:  # noqa: BLE001 — воркер не должен падать из-за одной ошибки
            log.exception("Ошибка планировщика")
        time.sleep(max(1.0, interval - (time.monotonic() - started)))
    log.info("Воркер остановлен")


if __name__ == "__main__":
    main()
