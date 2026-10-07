import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.errors import install_error_handler
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


app = FastAPI(
    title="СКАЙПАРК — распознавание лиц",
    description="Поиск ребёнка по фото, хранение эмбеддингов лиц (pgvector).",
    lifespan=lifespan,
)
install_error_handler(app)


@app.get("/api/health", tags=["Служебное"])
def health():
    return {"status": "ok"}


app.include_router(recognition_router)
