"""HTTP API сервиса распознавания — синхронный вход.

Основной путь в микросервисной схеме — очередь BullMQ (app/worker.py): backend
кладёт задачу, воркеры её выполняют. Эти HTTP-адреса делают то же самое сразу,
без очереди: для проверки в Swagger, отладки и как запасной вариант.

Наружу (во фронтенд) этот сервис не открывается: доступ только внутри сети
docker-compose и по внутреннему токену (INTERNAL_TOKEN). В продакшене токен
обязателен (APP_ENV=prod не запустится без него).
"""

import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Path, Response, UploadFile

from app.audit import audit
from app.config import MAX_CHILD_ID, get_settings
from app.errors import DomainError, NotFound
from app.recognition import service
from app.recognition.engine import FaceEngine, require_face_engine
from app.recognition.errors import PhotoTooLarge
from app.recognition.schemas import (
    CandidateOut,
    EnrollOut,
    FacesInfoOut,
    IdentifyOut,
    identify_message,
)


class Unauthorized(DomainError):
    status_code = 401
    code = "unauthorized"


def check_internal_token(x_internal_token: Annotated[str | None, Header()] = None) -> None:
    expected = get_settings().internal_token
    if not expected:
        return  # только для разработки: в продакшене токен обязателен
    # compare_digest сравнивает за одинаковое время — по времени ответа нельзя
    # угадывать токен посимвольно.
    if not hmac.compare_digest((x_internal_token or "").encode(), expected.encode()):
        raise Unauthorized("Нужен заголовок X-Internal-Token")


router = APIRouter(
    prefix="/api/recognition",
    tags=["Распознавание лиц"],
    dependencies=[Depends(check_internal_token)],
)

EngineDep = Annotated[FaceEngine, Depends(require_face_engine)]
ChildId = Annotated[int, Path(gt=0, le=MAX_CHILD_ID)]
Actor = Annotated[str | None, Header(max_length=100)]


def read_photo(photo: UploadFile) -> bytes:
    """Прочитать не больше лимита: лишнее даже не загружаем в память."""
    limit = get_settings().max_photo_bytes
    data = photo.file.read(limit + 1)
    if len(data) > limit:
        raise PhotoTooLarge(f"Фото больше {limit // (1024 * 1024)} МБ")
    return data


@router.post("/identify", response_model=IdentifyOut)
def identify(engine: EngineDep, photo: Annotated[UploadFile, File()], x_actor: Actor = None):
    """Найти ребёнка по фото (§6.2, §39). Ничего не меняет в базе.

    Ошибки фото (§44): 422 no_face / low_quality / bad_image, 413 photo_too_large.
    Модель недоступна: 503 recognition_unavailable (искать по телефону)."""
    r = service.identify(read_photo(photo), engine=engine)
    audit("identify", via="http", actor=x_actor, result={
        "ok": True, "status": r.status, "child_id": r.child_id, "confidence": r.confidence})
    return IdentifyOut(
        status=r.status,
        child_id=r.child_id,
        confidence=r.confidence,
        message=identify_message(r.status),
        candidates=[CandidateOut(**c.__dict__) for c in r.candidates],
    )


@router.post("/faces/{child_id}", response_model=EnrollOut, status_code=201)
def add_face(
    child_id: ChildId,
    engine: EngineDep,
    photo: Annotated[UploadFile, File()],
    source: str = "visit",
    x_actor: Actor = None,
):
    """Добавить фото лица ребёнку. source=registration — первое фото (в кадре ровно
    одно лицо), source=visit — фото с повторного визита (берётся самое крупное лицо)."""
    r = service.enroll(child_id, read_photo(photo), source=source, engine=engine)
    audit("enroll", via="http", actor=x_actor, child_id=child_id,
          result={"ok": True, "source": r.source, "faces_count": r.faces_count})
    return EnrollOut.model_validate(r, from_attributes=True)


@router.get("/faces/{child_id}", response_model=FacesInfoOut)
def faces_info(child_id: ChildId):
    """Сколько фото лица хранится у ребёнка."""
    return FacesInfoOut(child_id=child_id, count=service.count_faces(child_id))


@router.get("/faces/{child_id}/thumbnail", response_class=Response)
def thumbnail(child_id: ChildId, x_actor: Actor = None):
    """Последняя вырезка лица (JPEG) — для сверки сотрудником."""
    data = service.latest_thumbnail(child_id)
    audit("thumbnail", via="http", actor=x_actor, child_id=child_id, result={"ok": data is not None})
    if data is None:
        raise NotFound("Фото лица нет")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.delete("/faces/{child_id}", status_code=204)
def delete_faces(child_id: ChildId, x_actor: Actor = None):
    """Удалить биометрию ребёнка (§42)."""
    deleted = service.delete_faces(child_id)
    audit("delete_faces", via="http", actor=x_actor, child_id=child_id,
          result={"ok": True, "deleted": deleted})


@router.get("/stats")
async def stats():
    """Состояние очереди для мониторинга: сколько задач ждёт, выполняется, упало.
    Растёт waiting — воркеров не хватает; растёт failed — сбой (база, модель)."""
    from app.stats import queue_stats

    return await queue_stats()
