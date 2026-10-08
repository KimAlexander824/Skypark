"""Настройки приложения. Читаются из переменных окружения и файла .env."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- базы данных (шарды) ---
    # Список баз-шардов через запятую. Лица ребёнка всегда лежат в шарде
    # child_id % N; поиск по фото опрашивает все шарды. Пусто — один шард DATABASE_URL.
    # ВАЖНО: порядок и число шардов после запуска не менять — иначе лица «потеряются»
    # (нужен перенос данных, см. README).
    shard_database_urls: str = ""
    database_url: str = "postgresql+psycopg://skypark:skypark@localhost:5432/recognition_1"

    # --- очередь задач (BullMQ в Redis) ---
    redis_url: str = "redis://localhost:6379"
    queue_name: str = "recognition"
    # Сколько задач один воркер выполняет одновременно. Нейросеть грузит процессор,
    # поэтому обычно 1–2; для большей нагрузки запускают больше воркеров (--scale).
    worker_concurrency: int = 1
    # Максимальный размер фото в задаче.
    max_photo_bytes: int = 10 * 1024 * 1024
    # Сколько секунд хранить в Redis выполненные задачи (вместе с фото и результатом).
    # Backend должен успеть забрать результат; фото детей долго не храним.
    job_keep_completed_seconds: int = 600
    job_keep_failed_seconds: int = 3600

    # Внутренний токен для HTTP API сервиса (заголовок X-Internal-Token).
    # Пусто — проверка выключена (разработка). На сервере задать обязательно.
    internal_token: str = ""

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
    # Регистрация: второе лицо в кадре мешает, только если оно не меньше этой доли
    # площади главного (самого крупного) лица. Мелкие лица на заднем плане
    # игнорируются (их число возвращается в ответе, сотрудник сверяет вырезку).
    # 0 — строгий режим: любое второе лицо → multiple_faces.
    multiple_faces_min_ratio: float = 0.25
    # Сколько эмбеддингов хранить на ребёнка (первый — с регистрации — не удаляется).
    max_face_profiles_per_child: int = 5

    @property
    def shard_urls(self) -> list[str]:
        urls = [u.strip() for u in self.shard_database_urls.split(",") if u.strip()]
        return urls or [self.database_url]


@lru_cache
def get_settings() -> Settings:
    return Settings()
