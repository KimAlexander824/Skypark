"""Настройки приложения. Читаются из переменных окружения и файла .env."""

from functools import lru_cache
from typing import Literal
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

# child_id хранится как PostgreSQL integer
MAX_CHILD_ID = 2**31 - 1


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # dev — разработка; prod — продакшен: при старте проверяются пароли, токен и
    # настройки безопасности (см. production_problems), Swagger выключен.
    app_env: Literal["dev", "prod"] = "dev"

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
    # Максимальный размер фото (и в задаче, и в HTTP).
    max_photo_bytes: int = 10 * 1024 * 1024
    # Максимум пикселей в фото — проверяется ПО ЗАГОЛОВКУ до декодирования, чтобы
    # маленький файл с огромным разрешением не съел память («фото-бомба»).
    # 50 млн ≈ 8160x6120 — с запасом для камер телефонов.
    max_image_pixels: int = 50_000_000
    # Сколько секунд хранить в Redis выполненные задачи (вместе с фото и результатом).
    # Backend должен успеть забрать результат; фото детей долго не храним.
    job_keep_completed_seconds: int = 600
    job_keep_failed_seconds: int = 3600

    # Внутренний токен для HTTP API сервиса (заголовок X-Internal-Token).
    # Пусто — проверка выключена (разработка). На сервере задать обязательно.
    internal_token: str = ""

    # Файл-пульс воркера: обновляется раз в 10 с, по нему docker проверяет, что воркер жив.
    heartbeat_file: str = "/tmp/recognition-worker.heartbeat"
    # Сверка с backend (задача sync_children) не удалит больше этой доли детей за раз —
    # защита от ошибки, когда backend прислал пустой или обрезанный список.
    sync_max_delete_ratio: float = 0.2

    # --- распознавание лиц ---
    # insightface — настоящая нейросеть; fake — заглушка для тестов и разработки
    # («личность» = средний цвет картинки).
    face_engine: Literal["insightface", "fake"] = "insightface"
    face_model: str = "buffalo_l"
    face_det_size: int = 640
    # Папка с весами модели. В Docker-образе модель уже лежит там (проверена по
    # sha256), в интернет за ней сервис не ходит.
    face_model_root: str = "~/.insightface"
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

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

    def production_problems(self) -> list[str]:
        """Что мешает запуску в продакшене. Пустой список — всё в порядке."""
        problems = []
        if len(self.internal_token) < 32:
            problems.append("INTERNAL_TOKEN должен быть задан и не короче 32 символов")
        if not urlparse(self.redis_url).password:
            problems.append("REDIS_URL должен содержать пароль: redis://:ПАРОЛЬ@host:6379")
        for i, url in enumerate(self.shard_urls):
            password = urlparse(url.replace("+psycopg", "")).password
            if not password or password in WEAK_PASSWORDS:
                problems.append(f"Шард {i}: задайте надёжный пароль базы (не пример из .env.example)")
        if self.face_engine == "fake":
            problems.append("FACE_ENGINE=fake — заглушка, в продакшене нужна настоящая модель")
        return problems

    def check_production(self) -> None:
        """В продакшене не запускаться с небезопасными настройками."""
        if self.is_prod and (problems := self.production_problems()):
            raise RuntimeError("Небезопасные настройки для продакшена:\n- " + "\n- ".join(problems))


WEAK_PASSWORDS = {"change-me", "skypark", "postgres", "password", "123456"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
