"""Клиент сервиса распознавания для других сервисов (backend Акмаля).

Скопируйте этот файл в свой сервис и установите зависимость: pip install bullmq
Он зависит только от bullmq — от кода сервиса распознавания ничего не нужно.
Формат задач и ответов: docs/contracts/recognition.md (версия контракта: 1).

Два способа получить результат — выбирайте любой:

1) Подождать ответ (проще: фронтенд делает один запрос):

    client = RecognitionClient("redis://redis:6379")
    result = await client.identify(photo_bytes)          # ждёт до timeout секунд
    # {"ok": True, "status": "found", "child_id": 7, "confidence": 0.93, ...}

2) Отдать номер задачи и опрашивать (как на схеме: POST → GET):

    job_id = await client.submit_identify(photo_bytes)   # POST /recognize → {"job_id": ...}
    info = await client.get_result(job_id)               # GET /jobs/{job_id}
    # {"state": "completed", "result": {...}} | {"state": "waiting"} | {"state": "failed", "error": ...}
"""

import asyncio
import base64
import time

from bullmq import Job, Queue

CONTRACT_VERSION = 1
DEFAULT_ATTEMPTS = 3  # повторы при сбоях (не при плохом фото — это обычный ответ)
DEFAULT_BACKOFF = {"type": "exponential", "delay": 1000}

# Чем меньше число — тем раньше берётся задача. Поиск без приоритета = самый срочный:
# сотрудник на ресепшене ждёт ответа.
PRIORITY_REGISTRATION = 1
PRIORITY_BACKGROUND = 5


class RecognitionJobFailed(Exception):
    """Задача упала после всех повторов (сбой сервиса, а не плохое фото)."""


class RecognitionClient:
    def __init__(self, redis_url: str, queue_name: str = "recognition"):
        self.queue = Queue(queue_name, {"connection": redis_url})

    async def close(self) -> None:
        await self.queue.close()

    # ------------------------------------------------------------ положить задачу

    async def submit(self, name: str, data: dict, *, priority: int | None = None) -> str:
        opts = {"attempts": DEFAULT_ATTEMPTS, "backoff": DEFAULT_BACKOFF}
        if priority:
            opts["priority"] = priority
        job = await self.queue.add(name, data, opts)
        return job.id

    async def submit_identify(self, photo: bytes) -> str:
        return await self.submit("identify", {"photo": _b64(photo)})

    async def submit_enroll(self, child_id: int, photo: bytes, source: str = "registration") -> str:
        priority = PRIORITY_REGISTRATION if source == "registration" else PRIORITY_BACKGROUND
        data = {"child_id": child_id, "photo": _b64(photo), "source": source}
        return await self.submit("enroll", data, priority=priority)

    async def submit_delete_faces(self, child_id: int) -> str:
        return await self.submit("delete_faces", {"child_id": child_id}, priority=PRIORITY_BACKGROUND)

    # ------------------------------------------------------------ узнать результат

    async def get_result(self, job_id: str) -> dict:
        """{"state": ...} где state:
        waiting / delayed / prioritized / active — ещё выполняется;
        completed — готово, результат в "result" (там ok=True или ok=False с кодом ошибки фото);
        failed — сбой после всех повторов, причина в "error";
        unknown — такой задачи нет (неверный id или уже удалена по сроку хранения)."""
        # Сначала статус, потом данные: если прочитать данные раньше, воркер может
        # закончить задачу между двумя запросами, и результат окажется пустым.
        state = await self.queue.getJobState(job_id)
        if state in ("unknown", None):
            return {"state": "unknown"}
        if state not in ("completed", "failed"):
            return {"state": state}
        job = await Job.fromId(self.queue, job_id)
        if job is None:  # успела удалиться по сроку хранения
            return {"state": "unknown"}
        if state == "completed":
            return {"state": state, "result": job.returnvalue}
        if state == "failed":
            return {"state": state, "error": job.failedReason}
        return {"state": state}

    async def wait(self, job_id: str, timeout: float = 15, poll: float = 0.05) -> dict:
        """Дождаться результата. TimeoutError — не успели; RecognitionJobFailed — сбой."""
        deadline = time.monotonic() + timeout
        while True:
            info = await self.get_result(job_id)
            if info["state"] == "completed":
                return info["result"]
            if info["state"] == "failed":
                raise RecognitionJobFailed(info["error"])
            if info["state"] == "unknown":
                raise RecognitionJobFailed(f"Задача {job_id} не найдена")
            if time.monotonic() > deadline:
                raise TimeoutError(f"Распознавание не ответило за {timeout} с")
            await asyncio.sleep(poll)

    # ------------------------------------------------------------ положить и дождаться

    async def identify(self, photo: bytes, timeout: float = 15) -> dict:
        return await self.wait(await self.submit_identify(photo), timeout)

    async def enroll(
        self, child_id: int, photo: bytes, source: str = "registration", timeout: float = 15
    ) -> dict:
        return await self.wait(await self.submit_enroll(child_id, photo, source), timeout)

    async def delete_faces(self, child_id: int, timeout: float = 15) -> dict:
        return await self.wait(await self.submit_delete_faces(child_id), timeout)


def _b64(photo: bytes) -> str:
    return base64.b64encode(photo).decode("ascii")
