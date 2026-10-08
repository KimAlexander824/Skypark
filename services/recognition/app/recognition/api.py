"""HTTP API сервиса распознавания — синхронный вход.

Основной путь в микросервисной схеме — очередь BullMQ (app/worker.py): backend
кладёт задачу, воркеры её выполняют. Эти HTTP-адреса делают то же самое сразу,
без очереди: для проверки в Swagger, отладки и как запасной вариант.

Наружу (во фронтенд) этот сервис не открывается: доступ только внутри сети
docker-compose или по внутреннему токену (INTERNAL_TOKEN), если он задан.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Response, UploadFile

from app.config import get_settings
from app.errors import DomainError, NotFound
from app.recognition import service
from app.recognition.engine import FaceEngine, require_face_engine
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
    if expected and x_internal_token != expected:
        raise Unauthorized("Нужен заголовок X-Internal-Token")


router = APIRouter(
    prefix="/api/recognition",
    tags=["Распознавание лиц"],
    dependencies=[Depends(check_internal_token)],
)

EngineDep = Annotated[FaceEngine, Depends(require_face_engine)]


@router.post("/identify", response_model=IdentifyOut)
def identify(engine: EngineDep, photo: Annotated[UploadFile, File()]):
    """Найти ребёнка по фото (§6.2, §39). Ничего не меняет в базе.

    Ошибки фото (§44): 422 no_face / low_quality / bad_image.
    Модель недоступна: 503 recognition_unavailable (искать по телефону)."""
    r = service.identify(photo.file.read(), engine=engine)
    return IdentifyOut(
        status=r.status,
        child_id=r.child_id,
        confidence=r.confidence,
        message=identify_message(r.status),
        candidates=[CandidateOut(**c.__dict__) for c in r.candidates],
    )


@router.post("/faces/{child_id}", response_model=EnrollOut, status_code=201)
def add_face(
    child_id: int,
    engine: EngineDep,
    photo: Annotated[UploadFile, File()],
    source: str = "visit",
):
    """Добавить фото лица ребёнку. source=registration — первое фото (в кадре ровно
    одно лицо), source=visit — фото с повторного визита (берётся самое крупное лицо)."""
    r = service.enroll(child_id, photo.file.read(), source=source, engine=engine)
    return EnrollOut(**r.__dict__)


@router.get("/faces/{child_id}", response_model=FacesInfoOut)
def faces_info(child_id: int):
    """Сколько фото лица хранится у ребёнка."""
    return FacesInfoOut(child_id=child_id, count=service.count_faces(child_id))


@router.get("/faces/{child_id}/thumbnail", response_class=Response)
def thumbnail(child_id: int):
    """Последняя вырезка лица (JPEG) — для сверки сотрудником."""
    data = service.latest_thumbnail(child_id)
    if data is None:
        raise NotFound("Фото лица нет")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.delete("/faces/{child_id}", status_code=204)
def delete_faces(child_id: int):
    """Удалить биометрию ребёнка (§42)."""
    service.delete_faces(child_id)
