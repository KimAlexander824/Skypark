"""Клиент сервиса распознавания лиц — для backend СКАЙПАРК.

Скопируйте этот файл в свой сервис (например, backend/app/recognition_client.py)
и установите зависимость:

    pip install bullmq

Больше ничего из сервиса распознавания не нужно. Полное описание задач и ответов:
docs/contracts/recognition.md (версия контракта: 1).


КАК ЭТО УСТРОЕНО
================

У backend и сервиса распознавания РАЗНЫЕ базы данных. Backend хранит детей,
родителей, визиты, оплаты. Сервис распознавания хранит только лица: вектор
лица (512 чисел) и маленькую вырезку лица (JPEG) под номером child_id.

Общего у них только одно — число child_id. Номер выдаёт ТОЛЬКО backend
(это id ребёнка в вашей таблице детей). Сервис распознавания номера не
придумывает, он записывает лицо под тем child_id, который вы прислали.
Поэтому номера всегда совпадают и синхронизировать их не нужно.

Сервисы не обращаются к базам друг друга. Обмен идёт через очередь в Redis:

    backend --задача--> Redis (очередь "recognition") --> воркер распознавания
    backend <--ответ--- Redis <---------------------------- воркер

Этот клиент делает всю работу с очередью за вас: кладёт задачу, ждёт, пока
воркер её выполнит, и возвращает готовый ответ. Для вас это выглядит как
обычный вызов асинхронной функции:

    result = await rc.identify(photo_bytes)

Внешних ключей, JOIN и таблицы face_profiles у вас в базе быть НЕ должно.


ПОДКЛЮЧЕНИЕ
===========

Создайте ОДИН клиент на всё приложение при старте и закройте при остановке.
Не создавайте новый клиент на каждый запрос — это лишние соединения с Redis.

Адрес Redis:
    разработка (docker compose):  redis://redis:6379
    локально без Docker:          redis://localhost:6379
    продакшен (с паролем):        redis://:ПАРОЛЬ@redis:6379   (пароль из .env сервера)

Пример для FastAPI:

    from contextlib import asynccontextmanager
    from fastapi import FastAPI
    from app.recognition_client import RecognitionClient, RecognitionJobFailed

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.rc = RecognitionClient(settings.redis_url)
        yield
        await app.state.rc.close()

    app = FastAPI(lifespan=lifespan)

Эндпоинты, которые вызывают клиент, должны быть async def. Тогда, пока один
запрос ждёт ответ распознавания, сервер обрабатывает другие запросы.


КТО СДЕЛАЛ ЗАПРОС (обязательно)
===============================

Каждое действие с лицами детей записывается в журнал доступа к биометрии.
Сервис распознавания не знает пользователей, поэтому backend передаёт:
    actor  — кто: например "staff:17" (id сотрудника)
    branch — где: например "chilanzar" (филиал)

    who = {"actor": f"staff:{user.id}", "branch": user.branch_code}
    await rc.identify(photo_bytes, **who)

Параметры необязательные, но передавайте их ВСЕГДА: без них по журналу нельзя
понять, кто искал ребёнка.


ФОТО
====

photo_bytes — байты файла (то, что пришло с фронтенда), НЕ base64: клиент сам
закодирует. Требования: JPEG или PNG, до 10 МБ, до 50 млн пикселей.
Фото после обработки удаляется, сервис распознавания его не хранит.
Если полное фото нужно для карточки ребёнка — храните его у себя.

child_id — целое число от 1 до 2 147 483 647 (обычный id из вашей таблицы).


МЕТОДЫ
======

1. identify — найти ребёнка по фото. Ничего не записывает.

    r = await rc.identify(photo_bytes, **who)

    Ответ, если всё прочиталось:
    {
        "ok": True,
        "status": "found",          # found | not_found | ambiguous
        "child_id": 7,              # только при found, иначе None
        "confidence": 0.93,         # сходство 0..1, только при found
        "message": "Ребёнок найден",  # готовый текст для сотрудника
        "candidates": [             # до 3 самых похожих детей
            {"child_id": 7, "confidence": 0.93, "is_match": True},
            {"child_id": 12, "confidence": 0.41, "is_match": False}
        ]
    }

    status:
      found      — ребёнок найден. Берёте child_id и открываете карточку из своей базы.
      not_found  — похожих нет. Предложить регистрацию или поиск по телефону.
      ambiguous  — несколько детей почти одинаково похожи (близнецы, братья).
                   child_id = None. Показываете сотруднику карточки детей из
                   candidates, у которых is_match = True, — он выбирает сам.

2. enroll — запомнить лицо ребёнка под вашим child_id.

    r = await rc.enroll(child_id, photo_bytes, **who)                  # регистрация
    r = await rc.enroll(child_id, photo_bytes, source="visit", **who)  # фото с визита

    source="registration" (по умолчанию) — фото при регистрации. В кадре должен
        быть один ребёнок; мелкие лица на заднем плане игнорируются.
    source="visit" — фото с повторного визита. Добавляйте ТОЛЬКО если identify
        ответил found и confidence >= 0.6: так система «запоминает», как ребёнок
        выглядит сейчас (дети растут). Не добавляйте при слабом совпадении или
        после ambiguous — можно записать ребёнку чужое лицо.

    На ребёнка хранится до 5 фото: фото регистрации — всегда, остальные места —
    самые свежие визиты. Старые удаляются автоматически, следить не нужно.

    Ответ:
    {
        "ok": True,
        "face_id": 15,           # внутренний номер, вам не нужен
        "child_id": 42,
        "shard": 0,              # в какой базе-шарде лежит, вам не нужен
        "det_score": 0.87,       # качество найденного лица
        "source": "registration",
        "faces_count": 1,        # сколько фото лица теперь у ребёнка
        "ignored_faces": 0,      # сколько мелких лиц на фоне проигнорировано
        "thumbnail": "<base64>", # вырезка запомненного лица, JPEG в base64
        "warning": "..."         # есть, только если ignored_faces > 0
    }

    thumbnail покажите сотруднику: «Запомнено это лицо — верно?». Если на
    вырезке не тот человек — delete_faces(child_id) и переснять.
    Если есть warning — сверка по вырезке особенно важна.
    Вырезка — это биометрия: показать и не хранить у себя дольше, чем нужно.

3. delete_faces — удалить все лица ребёнка.

    r = await rc.delete_faces(child_id, **who)
    # {"ok": True, "child_id": 42, "deleted": 3}

    Вызывайте, когда:
      - удаляете ребёнка из своей базы;
      - родитель просит удалить фото (ребёнок у вас остаётся, помечается
        «без фото» и дальше ищется по телефону).
    Повторный вызов безопасен (вернёт deleted: 0).
    Сообщайте сотруднику «фото удалено» только после ответа ok: True.

4. sync_children — ночная сверка. Запускайте раз в сутки (например, в 3:00).

    r = await rc.sync_children(all_child_ids)
    # {"ok": True, "dry_run": False, "known": 1520, "stored": 1498,
    #  "orphans": [313], "deleted": 2}

    all_child_ids — список ВСЕХ существующих у вас child_id (не только с фото).
    Сервис удалит лица детей, которых в списке нет («сироты»): например, если
    delete_faces потерялся при перезапуске Redis.

    Защита от ошибок:
      - пустой список — отказ (если база детей правда пуста: allow_empty=True);
      - если удалилось бы больше 20% детей и больше 5 — отказ
        (если это правда: force=True).
    Отказ — ответ {"ok": False, "error": "sync_refused", "message": "..."}.
    Проверить заранее, кого удалит: rc.sync_children(ids, dry_run=True).


ДВА ВИДА ОШИБОК
===============

1) Плохое фото — это ОБЫЧНЫЙ ОТВЕТ, а не исключение. Приходит {"ok": False, ...}:

    {"ok": False, "error": "no_face",
     "message": "Лицо не найдено. Сфотографируйте ребёнка анфас при хорошем свете"}

    error:
      no_face          — лицо не найдено → переснять анфас при хорошем свете
      low_quality      — лицо слишком маленькое → подойти ближе
      multiple_faces   — при регистрации рядом ещё человек → переснять одного ребёнка
      bad_image        — файл не читается или не JPEG/PNG → другой файл
      photo_too_large  — больше 10 МБ или слишком большое разрешение → уменьшить
      sync_refused     — только у sync_children, см. выше

    message можно показывать сотруднику как есть.
    ВСЕГДА проверяйте r["ok"] перед тем, как читать status или child_id.

2) Распознавание недоступно — это ИСКЛЮЧЕНИЕ:

    RecognitionJobFailed       — сбой после 3 автоматических попыток (база или
                                 нейросеть недоступны) или неверная задача
    TimeoutError               — ответа нет 15 секунд (воркеры перегружены или выключены)
    redis.exceptions.RedisError — нет связи с Redis

    Во всех трёх случаях: сотрудник ищет ребёнка по номеру телефона родителя.
    Остальная система (визиты, оплаты) должна работать и без распознавания.

    from redis.exceptions import RedisError

    try:
        r = await rc.identify(photo_bytes, **who)
    except (RecognitionJobFailed, TimeoutError, RedisError):
        return {"status": "unavailable",
                "message": "Распознавание недоступно. Найдите ребёнка по телефону"}
    if not r["ok"]:
        return {"status": "bad_photo", "message": r["message"]}


СЦЕНАРИИ
========

Регистрация нового ребёнка:

    r = await rc.identify(photo, **who)
    if r["ok"] and r["status"] == "found":
        # возможно, уже зарегистрирован — показать его карточку.
        # Если сотрудник подтвердит, что это другой ребёнок (близнец), продолжить.
        ...
    child = create_child(...)                    # ваша база, получили child.id
    r = await rc.enroll(child.id, photo, **who)
    if not r["ok"]:
        # плохое фото: удалить ребёнка у себя или пометить «без фото», переснять
        ...
    # показать сотруднику r["thumbnail"] для сверки

    Если enroll бросил исключение — оставить ребёнка «без фото» и добавить
    фото позже (снова enroll с тем же child_id).

Повторный визит:

    r = await rc.identify(photo, **who)
    found -> карточка get_child(r["child_id"]);
             если r["confidence"] >= 0.6 — можно enroll(..., source="visit")
    ambiguous -> карточки детей из candidates с is_match = True, сотрудник выбирает
    not_found -> поиск по телефону; нашли — можно enroll(..., source="visit"),
                 чтобы в следующий раз узнало; не нашли — регистрация

Удаление:

    удалить ребёнка у себя (или пометить «без фото») -> await rc.delete_faces(child_id, **who)

Каждую ночь:

    await rc.sync_children(all_child_ids)


ВАЖНО
=====

Распознавание помогает НАЙТИ карточку ребёнка. Оно не подтверждает, кому можно
отдать ребёнка: выдача взрослому — по документам и правилам площадки.


Методы submit_* и get_result — внутренние (их использует сам клиент и скрипты
проверки). В backend они не нужны.
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

    async def submit(
        self, name: str, data: dict, *, priority: int | None = None,
        actor: str | None = None, branch: str | None = None,
    ) -> str:
        opts = {"attempts": DEFAULT_ATTEMPTS, "backoff": DEFAULT_BACKOFF}
        if priority:
            opts["priority"] = priority
        data = {**data, **{k: v for k, v in {"actor": actor, "branch": branch}.items() if v}}
        job = await self.queue.add(name, data, opts)
        return job.id

    async def submit_identify(self, photo: bytes, **who) -> str:
        return await self.submit("identify", {"photo": _b64(photo)}, **who)

    async def submit_enroll(
        self, child_id: int, photo: bytes, source: str = "registration", **who
    ) -> str:
        priority = PRIORITY_REGISTRATION if source == "registration" else PRIORITY_BACKGROUND
        data = {"child_id": child_id, "photo": _b64(photo), "source": source}
        return await self.submit("enroll", data, priority=priority, **who)

    async def submit_delete_faces(self, child_id: int, **who) -> str:
        return await self.submit(
            "delete_faces", {"child_id": child_id}, priority=PRIORITY_BACKGROUND, **who
        )

    async def submit_sync_children(
        self, child_ids: list[int], *, dry_run: bool = False, force: bool = False,
        allow_empty: bool = False, **who,
    ) -> str:
        """Сверка: передать ВСЕ существующие child_id. Лица остальных детей удаляются.
        Запускайте раз в сутки (ночью). Сначала можно dry_run=True — только показать."""
        data = {"child_ids": list(child_ids), "dry_run": dry_run, "force": force, "allow_empty": allow_empty}
        return await self.submit("sync_children", data, priority=PRIORITY_BACKGROUND, **who)

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

    async def identify(self, photo: bytes, timeout: float = 15, **who) -> dict:
        return await self.wait(await self.submit_identify(photo, **who), timeout)

    async def enroll(
        self, child_id: int, photo: bytes, source: str = "registration", timeout: float = 15, **who
    ) -> dict:
        return await self.wait(await self.submit_enroll(child_id, photo, source, **who), timeout)

    async def delete_faces(self, child_id: int, timeout: float = 15, **who) -> dict:
        return await self.wait(await self.submit_delete_faces(child_id, **who), timeout)

    async def sync_children(self, child_ids: list[int], timeout: float = 120, **kwargs) -> dict:
        return await self.wait(await self.submit_sync_children(child_ids, **kwargs), timeout)


def _b64(photo: bytes) -> str:
    return base64.b64encode(photo).decode("ascii")
