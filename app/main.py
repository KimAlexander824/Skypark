import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.api import auth, bot, children, nanny, notifications, payments, recognition, visits
from app.services.errors import DomainError
from app.services.face import get_face_engine

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Загружаем модель заранее. Если не вышло — API всё равно стартует:
    # посещения работают, а распознавание отвечает 503 (§43).
    try:
        get_face_engine()
    except Exception:  # noqa: BLE001
        log.exception("Модель распознавания не загрузилась при старте")
    yield


app = FastAPI(
    title="СКАЙПАРК — ядро",
    description="Распознавание лиц, посещения, продления, оплаты, уведомления.",
    lifespan=lifespan,
)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message, **jsonable_encoder(exc.extra)},
    )


@app.get("/api/health", tags=["Служебное"])
def health():
    return {"status": "ok"}


for module in (auth, children, recognition, visits, nanny, notifications, payments, bot):
    app.include_router(module.router)
