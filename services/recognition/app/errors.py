"""Общий формат ошибок API.

Любая ошибка-наследник DomainError превращается в ответ
{"error": "<код>", "message": "<текст для сотрудника>", ...доп. поля}.
Модуль распознавания и остальной backend используют один и тот же формат,
поэтому фронтенду достаточно смотреть на поле error.
"""

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code = 400
    code = "error"

    def __init__(self, message: str, **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


def install_error_handler(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _handler(_: Request, exc: DomainError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.code, "message": exc.message, **jsonable_encoder(exc.extra)},
        )
