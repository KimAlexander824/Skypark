"""Воркер очереди BullMQ: python -m app.worker

Берёт задачи из очереди RECOGNITION (Redis) и выполняет их. Сколько воркеров
запущено — столько задач идёт параллельно (docker compose up --scale worker=3).

Задачи (формат — docs/contracts/recognition.md):
  identify      {"photo": base64}                              → найти ребёнка
  enroll        {"child_id", "photo": base64, "source"}        → запомнить лицо
  delete_faces  {"child_id"}                                   → удалить биометрию

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

from bullmq import UnrecoverableError, Worker

from app.config import get_settings
from app.recognition import service
from app.recognition.engine import get_face_engine
from app.recognition.errors import FaceError
from app.recognition.schemas import identify_message

log = logging.getLogger("recognition.worker")


# ---------------------------------------------------------------- разбор данных задачи


def _photo(data: dict) -> bytes:
    raw = data.get("photo")
    if not isinstance(raw, str) or not raw:
        raise UnrecoverableError("Нет поля photo (base64)")
    try:
        photo = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise UnrecoverableError("Поле photo — не base64") from exc
    if len(photo) > get_settings().max_photo_bytes:
        raise UnrecoverableError("Фото слишком большое")
    return photo


def _child_id(data: dict) -> int:
    value = data.get("child_id")
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise UnrecoverableError("child_id должен быть целым числом > 0")
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
    return {"ok": True, **r.__dict__}


def handle_delete_faces(data: dict) -> dict:
    child_id = _child_id(data)
    return {"ok": True, "child_id": child_id, "deleted": service.delete_faces(child_id)}


HANDLERS = {
    "identify": handle_identify,
    "enroll": handle_enroll,
    "delete_faces": handle_delete_faces,
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
    except FaceError as exc:  # плохое фото — это ответ, а не сбой
        return {"ok": False, "error": exc.code, "message": exc.message}


async def process(job, token) -> dict:
    # Нейросеть и база — синхронный код: выполняем в потоке, чтобы не блокировать
    # цикл событий воркера (он продлевает блокировки задач в Redis).
    return await asyncio.to_thread(run_job, job.name, job.data)


# ---------------------------------------------------------------- запуск


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
    try:
        get_face_engine()  # загрузить модель заранее, а не на первой задаче
    except Exception:  # noqa: BLE001
        log.exception("Модель не загрузилась; задачи будут падать и повторяться")

    worker = make_worker()
    log.info("Воркер слушает очередь %r", get_settings().queue_name)

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
        await worker.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
