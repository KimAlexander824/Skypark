"""Проверки качества фото (§44) — без базы данных."""

import numpy as np
import pytest

from app.config import Settings
from app.recognition.engine import RawFace, decode_image, extract_face
from app.recognition.errors import BadImage, LowQuality, MultipleFaces, NoFace
from tests.conftest import ANNA, photo

S = Settings(min_det_score=0.6, min_face_px=80, max_image_side=1280)


class StubEngine:
    def __init__(self, *faces):
        self.faces = list(faces)

    def detect(self, image):
        return self.faces


def face(x1, y1, x2, y2, score=0.9, seed=0):
    vec = np.random.default_rng(seed).normal(size=512).astype(np.float32)
    return RawFace((x1, y1, x2, y2), score, vec / np.linalg.norm(vec))


def test_largest_face_for_identify():
    small, big = face(0, 0, 90, 90, seed=1), face(100, 100, 250, 250, seed=2)
    f = extract_face(StubEngine(small, big), photo(ANNA), require_single=False, settings=S)
    assert np.allclose(f.embedding, big.embedding)
    assert f.thumbnail[:2] == b"\xff\xd8"


def test_registration_requires_single_face():
    eng = StubEngine(face(0, 0, 100, 100), face(150, 150, 280, 280))  # 59% — сопоставимо
    with pytest.raises(MultipleFaces):
        extract_face(eng, photo(ANNA), require_single=True, settings=S)


def test_small_background_face_ignored_at_registration():
    main, small = face(50, 50, 250, 250, seed=1), face(0, 0, 90, 90, seed=2)  # 20% площади
    f = extract_face(StubEngine(small, main), photo(ANNA), require_single=True, settings=S)
    assert np.allclose(f.embedding, main.embedding) and f.ignored_faces == 1


def test_ratio_threshold_and_strict_mode():
    main, other = face(50, 50, 250, 250, seed=1), face(0, 0, 110, 110, seed=2)  # 30%
    with pytest.raises(MultipleFaces):  # 30% >= 25% — сопоставимо
        extract_face(StubEngine(main, other), photo(ANNA), require_single=True, settings=S)
    loose = Settings(min_det_score=0.6, min_face_px=80, max_image_side=1280, multiple_faces_min_ratio=0.4)
    assert extract_face(StubEngine(main, other), photo(ANNA), require_single=True, settings=loose).ignored_faces == 1
    strict = Settings(min_det_score=0.6, min_face_px=80, max_image_side=1280, multiple_faces_min_ratio=0)
    small = face(0, 0, 90, 90, seed=3)
    with pytest.raises(MultipleFaces):  # строгий режим: любое второе лицо
        extract_face(StubEngine(main, small), photo(ANNA), require_single=True, settings=strict)


def test_low_detector_score_ignored():
    with pytest.raises(NoFace):
        extract_face(StubEngine(face(0, 0, 200, 200, score=0.3)), photo(ANNA), require_single=True, settings=S)


def test_small_face_rejected():
    with pytest.raises(LowQuality):
        extract_face(StubEngine(face(0, 0, 40, 40)), photo(ANNA), require_single=True, settings=S)


def test_bad_files():
    with pytest.raises(BadImage):
        decode_image(b"", 1280)
    with pytest.raises(BadImage):
        decode_image(b"hello", 1280)


def test_big_photo_downscaled():
    img = decode_image(photo(ANNA, size=3000), 1280)
    assert max(img.shape[:2]) == 1280
