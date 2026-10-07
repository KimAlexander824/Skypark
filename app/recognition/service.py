"""Модуль распознавания — публичный интерфейс для остального backend.

    from app.recognition import service as faces

    # регистрация ребёнка: сначала проверить, нет ли его уже в базе
    result = faces.identify(session, photo_bytes)
    if result.status == "found": ...          # похоже, ребёнок уже зарегистрирован
    child = ...                               # создать ребёнка (код Акмаля)
    faces.enroll(session, child.id, photo_bytes)

    # повторный визит
    result = faces.identify(session, photo_bytes)   # found / not_found / ambiguous

Функции НЕ делают commit — это делает вызывающий код в своей транзакции,
чтобы ребёнок и его лицо сохранялись вместе (или не сохранялись вовсе).
"""

from dataclasses import dataclass

import numpy as np
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.recognition.engine import DetectedFace, FaceEngine, extract_face, require_face_engine
from app.recognition.models import FaceProfile


@dataclass(frozen=True)
class Candidate:
    child_id: int
    confidence: float  # косинусное сходство: 1.0 — то же лицо, ~0 — разные люди
    is_match: bool  # confidence >= MATCH_THRESHOLD


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


# ---------------------------------------------------------------- поиск


def find_candidates(
    session: Session, embedding: np.ndarray, *, limit: int = 3, search_k: int = 30
) -> list[Candidate]:
    """Топ-N детей по сходству. У ребёнка несколько эмбеддингов, поэтому берём
    search_k ближайших векторов (через HNSW-индекс) и оставляем лучший у каждого."""
    s = get_settings()
    threshold = s.match_threshold
    # HNSW — приближённый поиск: чем больше ef_search, тем меньше шанс пропустить
    # нужного ребёнка. SET LOCAL действует только до конца текущей транзакции.
    session.execute(text(f"SET LOCAL hnsw.ef_search = {int(s.hnsw_ef_search)}"))
    distance = FaceProfile.embedding.cosine_distance(embedding)
    rows = session.execute(
        select(FaceProfile.child_id, distance).order_by(distance).limit(search_k)
    ).all()
    best: dict[int, float] = {}
    for child_id, dist in rows:  # уже отсортированы по расстоянию
        best.setdefault(child_id, 1.0 - float(dist))
    return [
        Candidate(child_id, round(sim, 4), sim >= threshold)
        for child_id, sim in list(best.items())[:limit]
    ]


def identify_embedding(session: Session, embedding: np.ndarray) -> IdentifyResult:
    s = get_settings()
    candidates = find_candidates(session, embedding)
    matches = [c for c in candidates if c.is_match]
    if not matches:
        return IdentifyResult("not_found", None, None, candidates)
    if len(matches) >= 2 and matches[0].confidence - matches[1].confidence < s.ambiguity_margin:
        return IdentifyResult("ambiguous", None, None, candidates)
    return IdentifyResult("found", matches[0].child_id, matches[0].confidence, candidates)


def identify(session: Session, image: bytes, *, engine: FaceEngine | None = None) -> IdentifyResult:
    """Найти ребёнка по фото (ТЗ §6.2, §39). Ничего не меняет в базе.

    На фото может быть несколько людей — берётся самое крупное лицо.
    Ошибки: BadImage, NoFace, LowQuality (422), RecognitionUnavailable (503)."""
    face = extract_face(engine or require_face_engine(), image, require_single=False)
    return identify_embedding(session, face.embedding)


# ---------------------------------------------------------------- запись


def add_face(session: Session, child_id: int, face: DetectedFace, *, source: str) -> FaceProfile:
    """Сохранить уже извлечённое лицо. Хранится не больше MAX_FACE_PROFILES_PER_CHILD
    эмбеддингов на ребёнка; самый первый (с регистрации) не удаляется никогда,
    остальные обновляются, чтобы база успевала за тем, как ребёнок растёт."""
    profile = FaceProfile(
        child_id=child_id,
        embedding=face.embedding,
        det_score=face.det_score,
        thumbnail=face.thumbnail,
        source=source,
    )
    session.add(profile)
    session.flush()

    ids = session.scalars(
        select(FaceProfile.id).where(FaceProfile.child_id == child_id).order_by(FaceProfile.id)
    ).all()
    excess = len(ids) - get_settings().max_face_profiles_per_child
    if excess > 0:
        session.execute(delete(FaceProfile).where(FaceProfile.id.in_(ids[1 : 1 + excess])))
    return profile


def enroll(
    session: Session,
    child_id: int,
    image: bytes,
    *,
    source: str = "registration",
    require_single: bool = True,
    engine: FaceEngine | None = None,
) -> FaceProfile:
    """Запомнить лицо ребёнка (ТЗ §6.1).

    source="registration" — фото при регистрации: в кадре должно быть ровно одно лицо.
    source="visit" — фото с повторного визита, пополняет базу (require_single=False).
    Ошибки: BadImage, NoFace, MultipleFaces, LowQuality (422), RecognitionUnavailable (503)."""
    face = extract_face(engine or require_face_engine(), image, require_single=require_single)
    return add_face(session, child_id, face, source=source)


def delete_faces(session: Session, child_id: int) -> int:
    """Удалить биометрию ребёнка (по просьбе родителя, §42). Возвращает число удалённых профилей."""
    result = session.execute(delete(FaceProfile).where(FaceProfile.child_id == child_id))
    return result.rowcount or 0


# ---------------------------------------------------------------- чтение


def count_faces(session: Session, child_id: int) -> int:
    return session.scalar(
        select(func.count()).select_from(FaceProfile).where(FaceProfile.child_id == child_id)
    )


def latest_thumbnail(session: Session, child_id: int) -> bytes | None:
    """Последняя вырезка лица — чтобы сотрудник сверил «тот ли это ребёнок»."""
    return session.scalar(
        select(FaceProfile.thumbnail)
        .where(FaceProfile.child_id == child_id)
        .order_by(FaceProfile.id.desc())
        .limit(1)
    )
