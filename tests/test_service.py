"""Интерфейс модуля для остального backend: app.recognition.service."""

import pytest
from sqlalchemy import func, select, text

from app.recognition import service as faces
from app.recognition.errors import BadImage, NoFace
from app.recognition.models import FaceProfile
from tests.conftest import ANNA, DARK, MAXIM, STRANGER, photo


def test_enroll_then_identify(db):
    faces.enroll(db, 101, photo(ANNA))
    faces.enroll(db, 202, photo(MAXIM))
    db.commit()

    r = faces.identify(db, photo(ANNA))
    assert r.status == "found" and r.child_id == 101
    assert r.confidence > 0.9
    assert r.candidates[0].child_id == 101 and r.candidates[0].is_match
    # второй кандидат — другой ребёнок, ниже порога
    assert all(not c.is_match for c in r.candidates[1:])


def test_not_found(db):
    faces.enroll(db, 101, photo(ANNA))
    r = faces.identify(db, photo(STRANGER))
    assert r.status == "not_found" and r.child_id is None and r.confidence is None


def test_empty_database(db):
    r = faces.identify(db, photo(ANNA))
    assert r.status == "not_found" and r.candidates == []


def test_twins_are_ambiguous(db):
    faces.enroll(db, 101, photo(ANNA))
    faces.enroll(db, 102, photo(ANNA))  # близнец: то же «лицо»
    r = faces.identify(db, photo(ANNA))
    assert r.status == "ambiguous" and r.child_id is None
    assert {c.child_id for c in r.candidates} == {101, 102}


def test_one_child_many_profiles_counted_once(db):
    for _ in range(3):
        faces.enroll(db, 101, photo(ANNA), source="visit", require_single=False)
    faces.enroll(db, 202, photo(MAXIM))
    r = faces.identify(db, photo(ANNA))
    assert r.status == "found"
    assert [c.child_id for c in r.candidates] == [101, 202]  # без дублей


def test_profiles_capped_registration_kept(db):
    first = faces.enroll(db, 101, photo(ANNA))
    for _ in range(5):
        faces.enroll(db, 101, photo(ANNA), source="visit", require_single=False)
    ids = db.scalars(select(FaceProfile.id).where(FaceProfile.child_id == 101).order_by(FaceProfile.id)).all()
    assert len(ids) == 3  # MAX_FACE_PROFILES_PER_CHILD=3 в тестах
    assert ids[0] == first.id
    assert faces.count_faces(db, 101) == 3


def test_caller_controls_transaction(db):
    """Модуль не коммитит сам: если основной код откатит регистрацию, лица не останется."""
    faces.enroll(db, 101, photo(ANNA))
    db.rollback()
    assert db.scalar(select(func.count()).select_from(FaceProfile)) == 0


def test_delete_faces(db):
    faces.enroll(db, 101, photo(ANNA))
    faces.enroll(db, 101, photo(ANNA), source="visit", require_single=False)
    faces.enroll(db, 202, photo(MAXIM))
    assert faces.delete_faces(db, 101) == 2
    assert faces.identify(db, photo(ANNA)).status == "not_found"
    assert faces.count_faces(db, 202) == 1


def test_photo_errors(db):
    with pytest.raises(NoFace):
        faces.enroll(db, 101, photo(DARK))
    with pytest.raises(BadImage):
        faces.identify(db, b"not an image")


def test_thumbnail(db):
    assert faces.latest_thumbnail(db, 101) is None
    faces.enroll(db, 101, photo(ANNA))
    assert faces.latest_thumbnail(db, 101)[:2] == b"\xff\xd8"  # JPEG


def test_search_uses_hnsw_index(db):
    faces.enroll(db, 101, photo(ANNA))
    db.execute(text("SET LOCAL enable_seqscan = off"))
    vec = "[" + ",".join(["0.01"] * 512) + "]"
    plan = "\n".join(
        r[0]
        for r in db.execute(
            text(f"EXPLAIN SELECT child_id FROM face_profiles ORDER BY embedding <=> '{vec}' LIMIT 30")
        )
    )
    assert "ix_face_profiles_hnsw" in plan
