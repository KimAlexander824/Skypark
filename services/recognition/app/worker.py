"""Воркер очереди BullMQ: python -m app.worker

Берёт задачи из очереди RECOGNITION (Redis) и выполняет их. Сколько воркеров
запущено — столько задач идёт параллельно (docker compose up --scale worker=3).

Задачи (формат — docs/contracts/recognition.md):
  identify      {"photo": base64}                              → найти ребёнка
  enroll        {"child_id", "photo": base64, "source"}        → запомнить лицо
  delete_faces  {"child_id"}                                   → удалить биометрию
  sync_children {"child_ids": [...], "dry_run"}                → сверка: удалить лица «сирот»

В любую задачу backend может добавить "actor" (кто) и "branch" (филиал) — они
попадут в журнал доступа к биометрии (app/audit.py).

Фото удаляется из данных задачи в Redis сразу после обработки (а при сбое — после
последней попытки), чтобы снимки детей не лежали в Redis.

Результат задачи всегда словарь:
  {"ok": true, ...}                                 — выполнено
  {"ok": false, "error": "no_face", "message": ...} — плохое фото (§44); это НЕ сбой,
                                                      повторять бессмысленно
Сбои (база или модель недоступны, воркер упал) — исключение: BullMQ повторит
задачу (attempts/backoff задаёт тот, кто её кладёт). Неверная задача
(нет полей, неизвестное имя) — UnrecoverableError, без повторов.
"""

import asyncio
import base64
import binascii
import logging
import signal
import time
from pathlib import Path

from bullmq import UnrecoverableError, Worker

from app.audit import audit, context
from app.config import MAX_CHILD_ID, get_settings
from app.recognition import service
from app.recognition.engine import get_face_engine
from app.recognition.errors import FaceError, PhotoTooLarge, SyncRefused
from app.recognition.schemas import identify_message

log = logging.getLogger("recognition.worker")


# ---------------------------------------------------------------- разбор данных задачи


def _photo(data: dict) -> bytes:
    raw = data.get("photo")
    if not isinstance(raw, str) or not raw:
        raise UnrecoverableError("Нет поля photo (base64)")
    limit = get_settings().max_photo_bytes
    # Проверяем длину ДО декодирования: base64 длиннее исходника в 4/3 раза.
    if len(raw) > limit * 4 // 3 + 4:
        raise PhotoTooLarge(f"Фото больше {limit // (1024 * 1024)} МБ")
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise UnrecoverableError("Поле photo — не base64") from exc


def _is_child_id(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value <= MAX_CHILD_ID


def _child_id(data: dict) -> int:
    value = data.get("child_id")
    if not _is_child_id(value):
        raise UnrecoverableError(f"child_id должен быть целым числом от 1 до {MAX_CHILD_ID}")
    return value


# ---------------------------------------------------------------- обработчики


def handle_identify(data: dict) -> dict:
    r = service.identify(_photo(data))
    return {
        "ok": True,
        "status": r.status,
        "child_id": r.child_id,
        "confidence": r.confidence,
        "message": identify_message(r.status),
        "candidates": [c.__dict__ for c in r.candidates],
    }


def handle_enroll(data: dict) -> dict:
    source = data.get("source", "registration")
    if source not in service.SOURCES:
        raise UnrecoverableError(f"source должен быть одним из {service.SOURCES}")
    r = service.enroll(_child_id(data), _photo(data), source=source)
    result = {"ok": True, **r.__dict__, "thumbnail": base64.b64encode(r.thumbnail).decode("ascii")}
    if r.ignored_faces:
        result["warning"] = (
            f"В кадре были ещё лица ({r.ignored_faces}), зарегистрировано самое крупное. "
            "Проверьте по вырезке, что это ребёнок"
        )
    return result


def handle_delete_faces(data: dict) -> dict:
    child_id = _child_id(data)
    return {"ok": True, "child_id": child_id, "deleted": service.delete_faces(child_id)}


def handle_sync_children(data: dict) -> dict:
    ids = data.get("child_ids")
    if not isinstance(ids, list) or not all(_is_child_id(i) for i in ids):
        raise UnrecoverableError("child_ids должен быть списком целых чисел > 0")
    r = service.sync_children(
        ids,
        dry_run=bool(data.get("dry_run", False)),
        allow_empty=bool(data.get("allow_empty", False)),
        force=bool(data.get("force", False)),
    )
    return {"ok": True, **r.__dict__}


HANDLERS = {
    "identify": handle_identify,
    "enroll": handle_enroll,
    "delete_faces": handle_delete_faces,
    "sync_children": handle_sync_children,
}


def run_job(name: str, data: dict) -> dict:
    """Выполнить одну задачу (синхронно; вызывается в отдельном потоке)."""
    handler = HANDLERS.get(name)
    if handler is None:
        raise UnrecoverableError(f"Неизвестная задача {name!r}")
    if not isinstance(data, dict):
        raise UnrecoverableError("Данные задачи должны быть объектом")
    try:
        return handler(data)
    except (FaceError, SyncRefused) as exc:  # плохое фото / отказ сверки — ответ, а не сбой
        return {"ok": False, "error": exc.code, "message": exc.message, **exc.extra}


def _is_last_attempt(job, exc: Exception) -> bool:
    attempts = (job.opts or {}).get("attempts") or 1
    return isinstance(exc, UnrecoverableError) or job.attemptsMade + 1 >= attempts


async def _forget_photo(job) -> None:
    """Убрать фото из данных задачи в Redis (результат и остальные поля остаются)."""
    if isinstance(job.data, dict) and "photo" in job.data:
        try:
            await job.updateData({k: v for k, v in job.data.items() if k != "photo"})
        except Exception:  # noqa: BLE001 — не валим задачу: удалится по сроку хранения
            log.exception("Не удалось убрать фото из задачи %s", job.id)


async def process(job, token) -> dict:
    ctx = {"via": "queue", "job_id": job.id, **context(job.data)}
    if isinstance(job.data, dict) and _is_child_id(job.data.get("child_id")):
        ctx["child_id"] = job.data["child_id"]
    try:
        # Нейросеть и база — синхронный код: выполняем в потоке, чтобы не блокировать
        # цикл событий воркера (он продлевает блокировки задач в Redis).
        result = await asyncio.to_thread(run_job, job.name, job.data)
    except Exception as exc:
        last = _is_last_attempt(job, exc)
        audit(job.name, **ctx, reason=type(exc).__name__,
              result={"ok": False, "error": "unrecoverable" if last else "retry"})
        if last:  # повторов не будет — фото больше не нужно
            await _forget_photo(job)
        raise
    await _forget_photo(job)
    audit_result = {k: v for k, v in result.items() if k != "orphans"}
    if "orphans" in result:
        audit_result["deleted"] = result["deleted"]
        ctx["orphans"] = len(result["orphans"])
    audit(job.name, **ctx, result=audit_result)
    return result


# ---------------------------------------------------------------- запуск

HEARTBEAT_EVERY = 10  # с


async def heartbeat(worker: Worker, path: Path) -> None:
    """Обновлять файл-пульс, пока воркер работает. Docker healthcheck смотрит
    на время изменения файла: старше 60 с — воркер завис, контейнер перезапускается."""
    while True:
        if worker.running:
            try:
                path.write_text(str(int(time.time())))
            except OSError:
                log.exception("Не удалось записать пульс в %s", path)
        await asyncio.sleep(HEARTBEAT_EVERY)


def is_alive(path: Path, max_age: float = 60) -> bool:
    try:
        return time.time() - path.stat().st_mtime < max_age
    except OSError:
        return False


def make_worker(*, autorun: bool = True) -> Worker:
    s = get_settings()
    return Worker(
        s.queue_name,
        process,
        {
            "connection": s.redis_url,
            "concurrency": s.worker_concurrency,
            "autorun": autorun,
            "removeOnComplete": {"age": s.job_keep_completed_seconds},
            "removeOnFail": {"age": s.job_keep_failed_seconds},
        },
    )


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    settings.check_production()
    try:
        get_face_engine()  # загрузить модель заранее, а не на первой задаче
    except Exception:  # noqa: BLE001
        if settings.is_prod:
            raise  # без модели воркер бесполезен: пусть контейнер перезапустится и это будет видно
        log.exception("Модель не загрузилась; задачи будут падать и повторяться")

    worker = make_worker()
    pulse = asyncio.create_task(heartbeat(worker, Path(settings.heartbeat_file)))
    log.info("Воркер слушает очередь %r", settings.queue_name)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows: остановка по Ctrl+C через KeyboardInterrupt
            pass
    try:
        await stop.wait()
    finally:
        log.info("Останавливаюсь: дожидаюсь текущих задач")
        pulse.cancel()
        await worker.close()


if __name__ == "__main__":
    import sys

    # python -m app.worker --check — проверка для docker healthcheck
    if "--check" in sys.argv:
        sys.exit(0 if is_alive(Path(get_settings().heartbeat_file)) else 1)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
