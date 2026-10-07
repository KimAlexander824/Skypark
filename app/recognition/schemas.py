from datetime import datetime

from pydantic import BaseModel


class CandidateOut(BaseModel):
    child_id: int
    confidence: float
    is_match: bool


class IdentifyOut(BaseModel):
    """status: found — ребёнок найден (child_id); not_found — нет совпадения
    (предложить регистрацию или поиск по телефону); ambiguous — несколько похожих
    (сотрудник выбирает из candidates). Данные ребёнка (имя и т.д.) фронтенд
    берёт по child_id из основной части API."""

    status: str
    child_id: int | None
    confidence: float | None
    message: str
    candidates: list[CandidateOut]


class FaceProfileOut(BaseModel):
    id: int
    child_id: int
    det_score: float
    source: str
    created_at: datetime


class FacesInfoOut(BaseModel):
    child_id: int
    count: int
