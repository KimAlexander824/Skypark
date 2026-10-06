"""Распознавание ребёнка по лицу (§6.2, §39) через pgvector."""

from dataclasses import dataclass

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import FaceProfile
from app.services.face import DetectedFace


@dataclass(frozen=True)
class Candidate:
    child_id: int
    confidence: float  # косинусное сходство: 1.0 — то же лицо, ~0 — разные люди
    is_match: bool


@dataclass(frozen=True)
class IdentifyResult:
    status: str  # found | not_found | ambiguous
    child_id: int | None
    confidence: float | None
    candidates: list[Candidate]


def find_candidates(
    session: Session, embedding: np.ndarray, *, limit: int = 3, search_k: int = 30
) -> list[Candidate]:
    """Топ-N детей по сходству. У ребёнка несколько профилей, поэтому берём
    search_k ближайших векторов и оставляем лучший у каждого ребёнка."""
    threshold = get_settings().match_threshold
    distance = FaceProfile.embedding.cosine_distance(embedding)
    rows = session.execute(
        select(FaceProfile.child_id, distance).order_by(distance).limit(search_k)
    ).all()
    best: dict[int, float] = {}
    for child_id, dist in rows:
        best.setdefault(child_id, 1.0 - float(dist))
    return [
        Candidate(child_id, round(sim, 4), sim >= threshold)
        for child_id, sim in list(best.items())[:limit]
    ]


def identify(session: Session, embedding: np.ndarray) -> IdentifyResult:
    s = get_settings()
    candidates = find_candidates(session, embedding)
    matches = [c for c in candidates if c.is_match]
    if not matches:
        return IdentifyResult("not_found", None, None, candidates)
    # Два почти одинаково похожих ребёнка (часто брат/сестра) — пусть выберет сотрудник.
    if len(matches) >= 2 and matches[0].confidence - matches[1].confidence < s.ambiguity_margin:
        return IdentifyResult("ambiguous", None, None, candidates)
    return IdentifyResult("found", matches[0].child_id, matches[0].confidence, candidates)


def add_profile(session: Session, child_id: int, face: DetectedFace, source: str) -> None:
    """Сохраняет эмбеддинг и удаляет старые сверх лимита. Профиль с регистрации
    (самый первый) не удаляется никогда."""
    session.add(
        FaceProfile(
            child_id=child_id,
            embedding=face.embedding,
            det_score=face.det_score,
            thumbnail=face.thumbnail,
            source=source,
        )
    )
    session.flush()
    ids = session.scalars(
        select(FaceProfile.id).where(FaceProfile.child_id == child_id).order_by(FaceProfile.id)
    ).all()
    excess = len(ids) - get_settings().max_face_profiles_per_child
    if excess > 0:
        session.execute(delete(FaceProfile).where(FaceProfile.id.in_(ids[1 : 1 + excess])))
