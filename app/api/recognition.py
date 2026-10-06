from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select

from app.api import views
from app.api.deps import SessionDep, Staff
from app.db.models import Child, Visit
from app.domain.enums import OPEN_VISIT_STATUSES
from app.schemas import RecognitionCandidate, RecognitionResult
from app.services import recognition
from app.services.face import FaceEngine, extract_face, require_face_engine

router = APIRouter(prefix="/api/recognition", tags=["Распознавание"])

MESSAGES = {
    "found": "Ребёнок найден",
    "not_found": "Ребёнок не найден. Зарегистрировать нового ребёнка или выполнить поиск по номеру телефона",
    "ambiguous": "Найдено несколько похожих детей. Выберите нужного",
}


@router.post("/identify", response_model=RecognitionResult)
def identify(
    session: SessionDep,
    _: Staff,
    engine: Annotated[FaceEngine, Depends(require_face_engine)],
    photo: Annotated[UploadFile, File()],
):
    """Найти ребёнка по фото (§6.2, §39). Ничего не меняет в базе.

    Ошибки фото (§44): 422 no_face / multiple_faces / low_quality / bad_image.
    Если модель недоступна — 503 recognition_unavailable (искать по телефону)."""
    face = extract_face(engine, photo.file.read(), require_single=False)
    result = recognition.identify(session, face.embedding)

    ids = [c.child_id for c in result.candidates]
    children = {c.id: c for c in session.scalars(select(Child).where(Child.id.in_(ids)))}
    active = dict(
        session.execute(
            select(Visit.child_id, Visit.id).where(
                Visit.child_id.in_(ids), Visit.status.in_(OPEN_VISIT_STATUSES)
            )
        ).all()
    )
    return RecognitionResult(
        status=result.status,
        child_id=result.child_id,
        confidence=result.confidence,
        message=MESSAGES[result.status],
        candidates=[
            RecognitionCandidate(
                child=views.child_short(children[c.child_id]),
                parent_phone=children[c.child_id].parent.phone,
                confidence=c.confidence,
                is_match=c.is_match,
                active_visit_id=active.get(c.child_id),
            )
            for c in result.candidates
        ],
    )
