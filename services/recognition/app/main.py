import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.errors import install_error_handler
from app.limits import OVERHEAD, BodySizeLimit
from app.recognition.api import router as recognition_router
from app.recognition.engine import get_face_engine

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Загружаем модель заранее, чтобы первый запрос не ждал. Если не вышло —
    # API всё равно стартует, а распознавание отвечает 503 (§43).
    try:
        get_face_engine()
    except Exception:  # noqa: BLE001
        log.exception("Модель распознавания не загрузилась при старте")
    yield


settings = get_settings()
# В продакшене не стартуем с паролями-примерами, без токена и т. п.
settings.check_production()

app = FastAPI(
    title="СКАЙПАРК — распознавание лиц",
    description="Поиск ребёнка по фото, хранение эмбеддингов лиц (pgvector).",
    lifespan=lifespan,
    # Swagger — только для разработки: в продакшене описание API наружу не отдаём.
    docs_url=None if settings.is_prod else "/docs",
    redoc_url=None if settings.is_prod else "/redoc",
    openapi_url=None if settings.is_prod else "/openapi.json",
)
install_error_handler(app)
app.add_middleware(BodySizeLimit, max_bytes=settings.max_photo_bytes + OVERHEAD)


@app.get("/api/health", tags=["Служебное"])
def health():
    return {"status": "ok"}


app.include_router(recognition_router)
