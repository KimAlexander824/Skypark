from pydantic import BaseModel

MESSAGES = {
    "found": "Ребёнок найден",
    "not_found": "Ребёнок не найден. Зарегистрировать нового ребёнка или выполнить поиск по номеру телефона",
    "ambiguous": "Найдено несколько похожих детей. Выберите нужного",
}


def identify_message(status: str) -> str:
    return MESSAGES[status]


class CandidateOut(BaseModel):
    child_id: int
    confidence: float
    is_match: bool


class IdentifyOut(BaseModel):
    """status: found — ребёнок найден (child_id); not_found — нет совпадения
    (предложить регистрацию или поиск по телефону); ambiguous — несколько похожих
    (сотрудник выбирает из candidates)."""

    status: str
    child_id: int | None
    confidence: float | None
    message: str
    candidates: list[CandidateOut]


class EnrollOut(BaseModel):
    face_id: int
    child_id: int
    shard: int
    det_score: float
    source: str
    faces_count: int
    ignored_faces: int  # мелкие лица в кадре, которые не учитывались; > 0 — сверить вырезку


class FacesInfoOut(BaseModel):
    child_id: int
    count: int
