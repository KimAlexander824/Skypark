"""Настройки приложения. Читаются из переменных окружения и файла .env."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://skypark:skypark@localhost:5432/skypark"

    # --- распознавание лиц ---
    # insightface — настоящая нейросеть; fake — заглушка для тестов и разработки
    # («личность» = средний цвет картинки).
    face_engine: Literal["insightface", "fake"] = "insightface"
    face_model: str = "buffalo_l"
    face_det_size: int = 640
    # Проверки качества фото (§44): уверенность детектора и минимальный размер лица.
    min_det_score: float = 0.6
    min_face_px: int = 80
    # Большие фото уменьшаются до этой стороны перед обработкой.
    max_image_side: int = 1280
    # Порог сходства «это тот же ребёнок». ПОДОБРАТЬ на реальных фото:
    # python -m scripts.evaluate_threshold <папка>
    match_threshold: float = 0.5
    # Если два лучших кандидата отличаются меньше чем на это — ответ ambiguous.
    ambiguity_margin: float = 0.05
    # Точность поиска по индексу HNSW (pgvector). По умолчанию в Postgres 40 — на
    # 200 тыс. лиц это ~15% промахов; 200 — без промахов, ~15 мс на запрос.
    hnsw_ef_search: int = 200
    # Сколько эмбеддингов хранить на ребёнка (первый — с регистрации — не удаляется).
    max_face_profiles_per_child: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
