"""Операции сервиса распознавания. Их вызывают воркер очереди (app/worker.py)
и HTTP API (app/recognition/api.py).

Каждая операция сама открывает сессии нужных шардов и сама делает commit:
в микросервисной схеме сервис распознавания — единственный владелец своих данных.
"""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import numpy as np

from app.config import get_settings
from app.db.session import Shards, get_shards
from app.recognition import repository as repo
from app.recognition.engine import FaceEngine, extract_face, require_face_engine
from app.recognition.errors import InvalidSource
from app.recognition.repository import Candidate

SOURCES = ("registration", "visit")


@dataclass(frozen=True)
class IdentifyResult:
    """status:
    found     — ребёнок найден (child_id, confidence);
    not_found — совпадений выше порога нет;
    ambiguous — несколько почти одинаково похожих детей (брат/сестра, близнецы),
                сотрудник выбирает из candidates.
    """

    status: str
    child_id: int | None
    confidence: float | None
    candidates: list[Candidate]


@dataclass(frozen=True)
class EnrollResult:
    face_id: int
    child_id: int
    shard: int
    det_score: float
    source: str
    faces_count: int
    ignored_faces: int  # другие (мелкие) лица в кадре, которые не учитывались
    thumbnail: bytes  # вырезка зарегистрированного лица — показать сотруднику для сверки


# ---------------------------------------------------------------- поиск


def decide(candidates: list[Candidate]) -> IdentifyResult:
    """found / not_found / ambiguous по отсортированному списку кандидатов."""
    matches = [c for c in candidates if c.is_match]
    if not matches:
        return IdentifyResult("not_found", None, None, candidates)
    if (
        len(matches) >= 2
        and matches[0].confidence - matches[1].confidence < get_settings().ambiguity_margin
    ):
        return IdentifyResult("ambiguous", None, None, candidates)
    return IdentifyResult("found", matches[0].child_id, matches[0].confidence, candidates)


def _search_shard(shards: Shards, index: int, embedding: np.ndarray) -> list[Candidate]:
    with shards.session(index) as session, session.begin():
        return repo.find_candidates(session, embedding)


def identify_embedding(
    embedding: np.ndarray, *, shards: Shards | None = None, limit: int = 3
) -> IdentifyResult:
    """Поиск по всем шардам параллельно и объединение результатов (scatter-gather).
    Лица одного ребёнка лежат в одном шарде, поэтому дублей между шардами нет."""
    shards = shards or get_shards()
    if len(shards) == 1:
        found = _search_shard(shards, 0, embedding)
    else:
        with ThreadPoolExecutor(max_workers=len(shards)) as pool:
            parts = pool.map(lambda i: _search_shard(shards, i, embedding), range(len(shards)))
            found = [c for part in parts for c in part]
    found.sort(key=lambda c: c.confidence, reverse=True)
    return decide(found[:limit])


def identify(
    image: bytes, *, engine: FaceEngine | None = None, shards: Shards | None = None
) -> IdentifyResult:
    """Найти ребёнка по фото (ТЗ §6.2, §39). Ничего не меняет в базе.

    На фото может быть несколько людей — берётся самое крупное лицо.
    Ошибки: BadImage, NoFace, LowQuality (422), RecognitionUnavailable (503)."""
    face = extract_face(engine or require_face_engine(), image, require_single=False)
    return identify_embedding(face.embedding, shards=shards)


# ---------------------------------------------------------------- запись


def enroll(
    child_id: int,
    image: bytes,
    *,
    source: str = "registration",
    require_single: bool | None = None,
    engine: FaceEngine | None = None,
    shards: Shards | None = None,
) -> EnrollResult:
    """Запомнить лицо ребёнка (ТЗ §6.1) в его шарде.

    source="registration" — фото при регистрации: в кадре должно быть ровно одно лицо.
    source="visit" — фото с повторного визита, пополняет базу (берётся самое крупное лицо).
    Ошибки: BadImage, NoFace, MultipleFaces, LowQuality (422), RecognitionUnavailable (503)."""
    if source not in SOURCES:
        raise InvalidSource(f"source должен быть одним из {SOURCES}")
    if require_single is None:
        require_single = source == "registration"
    face = extract_face(engine or require_face_engine(), image, require_single=require_single)
    shards = shards or get_shards()
    with shards.session_for(child_id) as session, session.begin():
        profile = repo.add_face(session, child_id, face, source=source)
        count = repo.count_faces(session, child_id)
        return EnrollResult(
            face_id=profile.id,
            child_id=child_id,
            shard=shards.index_for(child_id),
            det_score=round(profile.det_score, 4),
            source=source,
            faces_count=count,
            ignored_faces=face.ignored_faces,
            thumbnail=face.thumbnail,
        )


def delete_faces(child_id: int, *, shards: Shards | None = None) -> int:
    """Удалить биометрию ребёнка (ребёнок удалён или родитель попросил, §42).
    Возвращает число удалённых фото. Повторный вызов безопасен (вернёт 0)."""
    shards = shards or get_shards()
    with shards.session_for(child_id) as session, session.begin():
        return repo.delete_faces(session, child_id)


# ---------------------------------------------------------------- чтение


def count_faces(child_id: int, *, shards: Shards | None = None) -> int:
    shards = shards or get_shards()
    with shards.session_for(child_id) as session:
        return repo.count_faces(session, child_id)


def latest_thumbnail(child_id: int, *, shards: Shards | None = None) -> bytes | None:
    """Последняя вырезка лица (JPEG) — чтобы сотрудник сверил «тот ли это ребёнок»."""
    shards = shards or get_shards()
    with shards.session_for(child_id) as session:
        return repo.latest_thumbnail(session, child_id)
