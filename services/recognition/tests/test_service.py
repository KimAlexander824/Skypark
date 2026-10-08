"""Операции сервиса поверх шардов: app.recognition.service (2 шарда в тестах)."""

import pytest

from app.recognition import repository as repo
from app.recognition import service
from app.recognition.errors import BadImage, InvalidSource, MultipleFaces, NoFace
from tests.conftest import ANNA, DARK, MAXIM, STRANGER, photo


def test_enroll_goes_to_childs_shard(clean):
    r = service.enroll(101, photo(ANNA))
    assert r.shard == 1 and r.faces_count == 1 and r.source == "registration"
    service.enroll(202, photo(MAXIM))
    with clean.session(0) as s0, clean.session(1) as s1:
        assert repo.count_faces(s1, 101) == 1 and repo.count_faces(s0, 101) == 0
        assert repo.count_faces(s0, 202) == 1 and repo.count_faces(s1, 202) == 0


def test_identify_searches_all_shards(clean):
    service.enroll(101, photo(ANNA))  # шард 1
    service.enroll(202, photo(MAXIM))  # шард 0
    r = service.identify(photo(ANNA))
    assert r.status == "found" and r.child_id == 101 and r.confidence > 0.9
    r = service.identify(photo(MAXIM))
    assert r.status == "found" and r.child_id == 202
    assert {c.child_id for c in r.candidates} == {101, 202}


def test_twins_in_different_shards_are_ambiguous(clean):
    service.enroll(101, photo(ANNA))  # шард 1
    service.enroll(102, photo(ANNA))  # шард 0 — то же «лицо»
    r = service.identify(photo(ANNA))
    assert r.status == "ambiguous" and r.child_id is None
    assert {c.child_id for c in r.candidates} == {101, 102}


def test_not_found_and_empty(clean):
    r = service.identify(photo(ANNA))
    assert r.status == "not_found" and r.candidates == []
    service.enroll(101, photo(ANNA))
    r = service.identify(photo(STRANGER))
    assert r.status == "not_found" and r.child_id is None


def test_delete_faces_idempotent(clean):
    service.enroll(101, photo(ANNA))
    service.enroll(101, photo(ANNA), source="visit")
    assert service.delete_faces(101) == 2
    assert service.delete_faces(101) == 0
    assert service.identify(photo(ANNA)).status == "not_found"


def test_thumbnail_and_count(clean):
    assert service.latest_thumbnail(101) is None
    service.enroll(101, photo(ANNA))
    assert service.latest_thumbnail(101)[:2] == b"\xff\xd8"  # JPEG
    assert service.count_faces(101) == 1


def test_photo_errors(clean):
    with pytest.raises(NoFace):
        service.enroll(101, photo(DARK))
    with pytest.raises(BadImage):
        service.identify(b"not an image")
    with pytest.raises(InvalidSource):
        service.enroll(101, photo(ANNA), source="other")


def test_registration_requires_single_face(clean):
    class TwoFaces:
        def detect(self, image):
            from app.recognition.engine import FakeFaceEngine, RawFace

            f = FakeFaceEngine().detect(image)[0]
            return [f, RawFace((0, 0, 100, 100), 0.9, f.embedding)]

    with pytest.raises(MultipleFaces):
        service.enroll(101, photo(ANNA), engine=TwoFaces())
    # с визита — можно, берётся самое крупное лицо
    assert service.enroll(101, photo(ANNA), source="visit", engine=TwoFaces()).faces_count == 1
