"""Ограничение размера HTTP-запроса.

FastAPI (Starlette) сохраняет загружаемый файл целиком ещё до того, как запрос
дойдёт до обработчика. Без лимита можно прислать гигабайтный «файл» и забить
память или диск. Эта прослойка обрывает запрос, как только тело превысило лимит
(и по заголовку Content-Length, и по факту — если заголовка нет).
"""

import json

# Запас сверх размера фото на заголовки multipart и поля формы.
OVERHEAD = 64 * 1024


class BodySizeLimit:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = dict(scope.get("headers") or []).get(b"content-length")
        if length is not None and length.isdigit() and int(length) > self.max_bytes:
            return await _too_large(send)

        received = 0
        exceeded = False
        replied = False

        async def limited_receive():
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    exceeded = True
                    raise _TooLarge
            return message

        async def guarded_send(message):
            # FastAPI превращает ошибку чтения тела в свой ответ 400 — подменяем его на 413.
            nonlocal replied
            if not exceeded:
                return await send(message)
            if not replied:
                replied = True
                await _too_large(send)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not exceeded:
                raise
        if exceeded and not replied:
            await _too_large(send)


class _TooLarge(Exception):
    pass


async def _too_large(send) -> None:
    body = json.dumps(
        {"error": "photo_too_large", "message": "Файл слишком большой"}, ensure_ascii=False
    ).encode()
    await send({
        "type": "http.response.start",
        "status": 413,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
    })
    await send({"type": "http.response.body", "body": body})
