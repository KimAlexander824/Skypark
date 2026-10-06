"""Настройки приложения. Читаются из переменных окружения и файла .env."""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://skypark:skypark@localhost:5432/skypark"
    public_base_url: str = "http://localhost:8000"
    park_timezone: str = "Asia/Tashkent"

    # --- авторизация ---
    jwt_secret: str  # обязателен
    jwt_ttl_minutes: int = 12 * 60
    # Токен, с которым Telegram-бот ходит в /api/bot/*. Пустой — API бота выключено.
    bot_api_token: str = ""

    # --- распознавание лиц ---
    face_engine: Literal["insightface", "fake"] = "insightface"
    face_model: str = "buffalo_l"
    face_det_size: int = 640
    min_det_score: float = 0.6
    min_face_px: int = 80
    max_image_side: int = 1280
    match_threshold: float = 0.5  # ПОДОБРАТЬ на реальных фото детей
    ambiguity_margin: float = 0.05
    max_face_profiles_per_child: int = 5

    # --- посещения ---
    reminder_minutes_before_end: int = 15  # §16
    # Сколько ждать оплату продления после окончания времени, прежде чем завершить посещение.
    extension_payment_grace_minutes: int = 10
    default_nanny_max_children: int = 5
    # Что делать с неиспользованным временем при досрочном завершении (вопрос №13 ТЗ).
    # Пока только "burn" — сгорает. Фактическое и плановое время окончания хранятся,
    # поэтому другую политику можно добавить без потери данных.
    early_end_policy: Literal["burn"] = "burn"

    # --- оплата ---
    # "fake" — заглушка: платёж подтверждается кнопкой на тестовой странице.
    payment_provider: Literal["fake"] = "fake"

    # --- фоновые задачи ---
    scheduler_interval_seconds: int = 20
    notification_lease_seconds: int = 60
    notification_max_attempts: int = 8


@lru_cache
def get_settings() -> Settings:
    return Settings()
