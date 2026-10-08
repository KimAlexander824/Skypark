"""Движок распознавания: фото (байты) → OpenCV → детектор/модель → эмбеддинг.

Модель спрятана за интерфейсом FaceEngine, поэтому её легко подменить
заглушкой (FakeFaceEngine) в тестах и при разработке без insightface.
"""

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol

import cv2
import numpy as np

from app.config import Settings, get_settings
from app.recognition.errors import (
    BadImage,
    LowQuality,
    MultipleFaces,
    NoFace,
    RecognitionUnavailable,
)
from app.recognition.models import EMBEDDING_DIM

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class RawFace:
    """То, что возвращает модель для одного найденного лица."""

    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2
    det_score: float
    embedding: np.ndarray  # L2-нормализованный вектор длины 512


@dataclass(frozen=True)
class DetectedFace:
    """Лицо, прошедшее проверки качества, готовое к сохранению/поиску."""

    embedding: np.ndarray
    det_score: float
    thumbnail: bytes  # JPEG-вырезка лица (для сверки сотрудником)
    card_photo: bytes  # всё фото, уменьшенное до 800 px (может пригодиться для карточки ребёнка)
    ignored_faces: int = 0  # сколько других (мелких) лиц в кадре проигнорировано


class FaceEngine(Protocol):
    def detect(self, image: np.ndarray) -> list[RawFace]: ...


class InsightFaceEngine:
    def __init__(self, model_name: str, det_size: int):
        # Тяжёлый импорт делаем только здесь, чтобы тесты и fake-режим
        # работали без установленного insightface.
        from insightface.app import FaceAnalysis

        self._app = FaceAnalysis(
            name=model_name,
            allowed_modules=["detection", "recognition"],
            providers=["CPUExecutionProvider"],
        )
        self._app.prepare(ctx_id=-1, det_size=(det_size, det_size))

    def detect(self, image: np.ndarray) -> list[RawFace]:
        return [
            RawFace(
                bbox=tuple(float(v) for v in f.bbox),
                det_score=float(f.det_score),
                embedding=np.asarray(f.normed_embedding, dtype=np.float32),
            )
            for f in self._app.get(image)
        ]


class FakeFaceEngine:
    """Заглушка без нейросети: "личность" определяется средним цветом картинки.

    Две картинки одного цвета → почти одинаковые эмбеддинги (один и тот же
    "ребёнок"), разного цвета → разные. Почти чёрная картинка → лица нет.
    Подходит для тестов и чтобы погонять фронт без insightface.
    """

    def detect(self, image: np.ndarray) -> list[RawFace]:
        mean = image.reshape(-1, 3).mean(axis=0)
        if mean.max() < 10:
            return []
        key = [int(round(c / 40)) for c in mean]
        seed = key[0] * 10_000 + key[1] * 100 + key[2]
        base = np.random.default_rng(seed).normal(size=EMBEDDING_DIM)
        noise = np.random.default_rng(int(mean.sum() * 1000)).normal(size=EMBEDDING_DIM)
        vec = base + 0.1 * noise
        vec = (vec / np.linalg.norm(vec)).astype(np.float32)
        h, w = image.shape[:2]
        return [RawFace(bbox=(w * 0.1, h * 0.1, w * 0.9, h * 0.9), det_score=0.99, embedding=vec)]


@lru_cache
def get_face_engine() -> FaceEngine:
    """Один экземпляр модели на процесс (загрузка занимает несколько секунд)."""
    s = get_settings()
    if s.face_engine == "fake":
        return FakeFaceEngine()
    return InsightFaceEngine(s.face_model, s.face_det_size)


def require_face_engine() -> FaceEngine:
    """FastAPI-зависимость. Если модель не загрузилась, падает только распознавание
    (503), а остальная система — посещения, оплаты — продолжает работать (§43)."""
    try:
        return get_face_engine()
    except Exception as exc:  # noqa: BLE001
        log.exception("Модель распознавания недоступна")
        raise RecognitionUnavailable(
            "Распознавание временно недоступно. Найдите ребёнка по номеру телефона"
        ) from exc


def decode_image(data: bytes, max_side: int) -> np.ndarray:
    if not data:
        raise BadImage("Пустой файл")
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise BadImage("Не удалось прочитать изображение (нужен JPEG/PNG)")
    h, w = image.shape[:2]
    scale = max_side / max(h, w)
    if scale < 1:
        image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return image


def make_thumbnail(image: np.ndarray, bbox: tuple[float, float, float, float]) -> bytes:
    """Вырезает лицо с запасом 30% и сжимает в небольшой JPEG."""
    h, w = image.shape[:2]
    x1, y1, x2, y2 = bbox
    mx, my = (x2 - x1) * 0.3, (y2 - y1) * 0.3
    x1, y1 = max(0, int(x1 - mx)), max(0, int(y1 - my))
    x2, y2 = min(w, int(x2 + mx)), min(h, int(y2 + my))
    crop = image[y1:y2, x1:x2]
    scale = 200 / max(crop.shape[:2])
    if scale < 1:
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not ok:
        raise BadImage("Не удалось сохранить фото лица")
    return buf.tobytes()


def encode_jpeg(image: np.ndarray, max_side: int = 800, quality: int = 85) -> bytes:
    scale = max_side / max(image.shape[:2])
    if scale < 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise BadImage("Не удалось сохранить фото")
    return buf.tobytes()


def _area(f: RawFace) -> float:
    x1, y1, x2, y2 = f.bbox
    return (x2 - x1) * (y2 - y1)


def extract_face(
    engine: FaceEngine,
    data: bytes,
    *,
    require_single: bool,
    settings: Settings | None = None,
) -> DetectedFace:
    """Находит лицо на фото и проверяет качество.

    require_single=True — для регистрации: в кадре должно быть ровно одно лицо.
    require_single=False — для распознавания: берём самое крупное лицо
    (на фоне могут попасть другие дети).
    """
    s = settings or get_settings()
    image = decode_image(data, s.max_image_side)

    faces = [f for f in engine.detect(image) if f.det_score >= s.min_det_score]
    if not faces:
        raise NoFace("Лицо не найдено. Сфотографируйте ребёнка анфас при хорошем свете")
    faces.sort(key=_area, reverse=True)
    if require_single and len(faces) > 1:
        # Мешают только лица, сопоставимые по размеру с главным: значит, рядом стоит
        # ещё один человек и непонятно, кого регистрировать. Мелкие лица на заднем
        # плане (прохожие, плакаты) игнорируем.
        main_area = _area(faces[0])
        rivals = [f for f in faces[1:] if _area(f) >= s.multiple_faces_min_ratio * main_area]
        if rivals:
            raise MultipleFaces(
                f"В кадре несколько лиц ({len(rivals) + 1}) — нужен только один ребёнок"
            )

    face = faces[0]
    x1, y1, x2, y2 = face.bbox
    if min(x2 - x1, y2 - y1) < s.min_face_px:
        raise LowQuality("Лицо слишком маленькое — подойдите ближе")

    return DetectedFace(
        embedding=face.embedding,
        det_score=face.det_score,
        thumbnail=make_thumbnail(image, face.bbox),
        card_photo=encode_jpeg(image),
        ignored_faces=len(faces) - 1,
    )
