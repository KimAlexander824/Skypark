"""HTTP API модуля распознавания.

Авторизации здесь нет намеренно: её подключает основная часть backend при
регистрации роутера, например

    app.include_router(recognition_router, dependencies=[Depends(require_staff)])

Регистрацию ребёнка целиком (данные + лицо) делает основной backend через
service.enroll() в одной транзакции. Эндпоинт POST /faces/{child_id} нужен,
чтобы добавить фото уже существующему ребёнку или проверить модуль в Swagger.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.errors import NotFound
from app.recognition import service
from app.recognition.engine import FaceEngine, require_face_engine
from app.recognition.schemas import CandidateOut, FaceProfileOut, FacesInfoOut, IdentifyOut

router = APIRouter(prefix="/api/recognition", tags=["Распознавание лиц"])

SessionDep = Annotated[Session, Depends(get_session)]
EngineDep = Annotated[FaceEngine, Depends(require_face_engine)]

MESSAGES = {
    "found": "Ребёнок найден",
    "not_found": "Ребёнок не найден. Зарегистрировать нового ребёнка или выполнить поиск по номеру телефона",
    "ambiguous": "Найдено несколько похожих детей. Выберите нужного",
}


@router.post("/identify", response_model=IdentifyOut)
def identify(session: SessionDep, engine: EngineDep, photo: Annotated[UploadFile, File()]):
    """Найти ребёнка по фото (§6.2, §39). Ничего не меняет в базе.

    Ошибки фото (§44): 422 no_face / low_quality / bad_image.
    Модель недоступна: 503 recognition_unavailable (искать по телефону)."""
    r = service.identify(session, photo.file.read(), engine=engine)
    return IdentifyOut(
        status=r.status,
        child_id=r.child_id,
        confidence=r.confidence,
        message=MESSAGES[r.status],
        candidates=[CandidateOut(**c.__dict__) for c in r.candidates],
    )


@router.post("/faces/{child_id}", response_model=FaceProfileOut, status_code=201)
def add_face(
    child_id: int,
    session: SessionDep,
    engine: EngineDep,
    photo: Annotated[UploadFile, File()],
    source: str = "visit",
):
    """Добавить фото лица ребёнку. source=registration — первое фото (в кадре ровно
    одно лицо), source=visit — фото с повторного визита (берётся самое крупное лицо)."""
    profile = service.enroll(
        session,
        child_id,
        photo.file.read(),
        source=source,
        require_single=(source == "registration"),
        engine=engine,
    )
    session.commit()
    return FaceProfileOut.model_validate(profile, from_attributes=True)


@router.get("/faces/{child_id}", response_model=FacesInfoOut)
def faces_info(child_id: int, session: SessionDep):
    """Сколько фото лица хранится у ребёнка."""
    return FacesInfoOut(child_id=child_id, count=service.count_faces(session, child_id))


@router.get("/faces/{child_id}/thumbnail", response_class=Response)
def thumbnail(child_id: int, session: SessionDep):
    """Последняя вырезка лица (JPEG) — для сверки сотрудником."""
    data = service.latest_thumbnail(session, child_id)
    if data is None:
        raise NotFound("Фото лица нет")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})


@router.delete("/faces/{child_id}", status_code=204)
def delete_faces(child_id: int, session: SessionDep):
    """Удалить биометрию ребёнка (§42). В основной части доступ — только администратору."""
    service.delete_faces(session, child_id)
    session.commit()
