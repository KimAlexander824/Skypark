"""Запросы внутри одного шарда: app.recognition.repository."""

from sqlalchemy import func, select, text

from app.recognition import repository as repo
from app.recognition.engine import FakeFaceEngine, extract_face
from app.recognition.models import FaceProfile
from tests.conftest import ANNA, MAXIM, photo

ENGINE = FakeFaceEngine()


def face(color):
    return extract_face(ENGINE, photo(color), require_single=True)


def test_candidates_best_per_child(db):
    for _ in range(3):
        repo.add_face(db, 101, face(ANNA), source="visit")
    repo.add_face(db, 202, face(MAXIM), source="registration")
    found = repo.find_candidates(db, face(ANNA).embedding)
    assert [c.child_id for c in found] == [101, 202]  # без дублей
    assert found[0].is_match and not found[1].is_match


def test_profiles_capped_registration_kept(db):
    first = repo.add_face(db, 101, face(ANNA), source="registration")
    for _ in range(5):
        repo.add_face(db, 101, face(ANNA), source="visit")
    ids = db.scalars(select(FaceProfile.id).where(FaceProfile.child_id == 101).order_by(FaceProfile.id)).all()
    assert len(ids) == 3  # MAX_FACE_PROFILES_PER_CHILD=3 в тестах
    assert ids[0] == first.id
    assert repo.count_faces(db, 101) == 3


def test_rollback_leaves_nothing(db):
    repo.add_face(db, 101, face(ANNA), source="registration")
    db.rollback()
    assert db.scalar(select(func.count()).select_from(FaceProfile)) == 0


def test_search_uses_hnsw_index(db):
    repo.add_face(db, 101, face(ANNA), source="registration")
    db.execute(text("SET LOCAL enable_seqscan = off"))
    vec = "[" + ",".join(["0.01"] * 512) + "]"
    plan = "\n".join(
        r[0]
        for r in db.execute(
            text(f"EXPLAIN SELECT child_id FROM face_profiles ORDER BY embedding <=> '{vec}' LIMIT 30")
        )
    )
    assert "ix_face_profiles_hnsw" in plan


def test_search_accuracy_setting_applied(db):
    repo.find_candidates(db, face(ANNA).embedding)
    assert db.scalar(text("SHOW hnsw.ef_search")) == "200"
