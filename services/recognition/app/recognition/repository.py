"""Запросы к таблице face_profiles внутри ОДНОГО шарда.

Ничего не знают про шарды и не делают commit — этим управляет service.py.
"""

from dataclasses import dataclass

import numpy as np
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.recognition.engine import DetectedFace
from app.recognition.models import FaceProfile


@dataclass(frozen=True)
class Candidate:
    child_id: int
    confidence: float  # косинусное сходство: 1.0 — то же лицо, ~0 — разные люди
    is_match: bool  # confidence >= MATCH_THRESHOLD


def find_candidates(
    session: Session, embedding: np.ndarray, *, limit: int = 3, search_k: int = 30
) -> list[Candidate]:
    """Топ-N детей шарда по сходству. У ребёнка несколько эмбеддингов, поэтому берём
    search_k ближайших векторов (через HNSW-индекс) и оставляем лучший у каждого."""
    s = get_settings()
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
        Candidate(child_id, round(sim, 4), sim >= s.match_threshold)
        for child_id, sim in list(best.items())[:limit]
    ]


def add_face(session: Session, child_id: int, face: DetectedFace, *, source: str) -> FaceProfile:
    """Сохранить лицо. Хранится не больше MAX_FACE_PROFILES_PER_CHILD эмбеддингов на
    ребёнка; самый первый (с регистрации) не удаляется никогда, остальные обновляются,
    чтобы база успевала за тем, как ребёнок растёт."""
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


def delete_faces(session: Session, child_id: int) -> int:
    result = session.execute(delete(FaceProfile).where(FaceProfile.child_id == child_id))
    return result.rowcount or 0


def stored_child_ids(session: Session) -> set[int]:
    """Все child_id, у которых в этом шарде есть лица."""
    return set(session.scalars(select(FaceProfile.child_id).distinct()))


def count_faces(session: Session, child_id: int) -> int:
    return session.scalar(
        select(func.count()).select_from(FaceProfile).where(FaceProfile.child_id == child_id)
    )


def latest_thumbnail(session: Session, child_id: int) -> bytes | None:
    return session.scalar(
        select(FaceProfile.thumbnail)
        .where(FaceProfile.child_id == child_id)
        .order_by(FaceProfile.id.desc())
        .limit(1)
    )
