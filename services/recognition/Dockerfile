FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Веса модели лежат в образе; сервис НЕ скачивает их при запуске
    FACE_MODEL_ROOT=/opt/models \
    # Второй рубеж против «фото-бомб» (первый — проверка заголовка в коде)
    OPENCV_IO_MAX_IMAGE_PIXELS=50000000

WORKDIR /srv

# 1. Зависимости — строго по requirements.lock: точные версии и sha256 каждого пакета.
#    Подменённый пакет на PyPI не установится. --no-deps: в lock уже всё, и он
#    не тянет opencv-python с графическими библиотеками (нужен только headless).
COPY requirements.lock ./
RUN pip install --require-hashes --no-deps -r requirements.lock

# 2. Модель — скачивается при СБОРКЕ и проверяется по sha256. Если архив подменили
#    или он повредился, сборка падает. Берём только детектор и распознаватель.
#    Лицензия моделей buffalo_l — только некоммерческое использование: для
#    продакшена нужна коммерческая лицензия (или другая модель — поменять аргументы).
ARG FACE_MODEL_URL=https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
ARG FACE_MODEL_SHA256=80ffe37d8a5940d59a7384c201a2a38d4741f2f3c51eef46ebb28218a7b0ca2f
ARG FACE_MODEL_FILES="det_10g.onnx w600k_r50.onnx"
COPY scripts/fetch_model.py /tmp/fetch_model.py
RUN python /tmp/fetch_model.py "$FACE_MODEL_URL" "$FACE_MODEL_SHA256" \
        /opt/models/models/buffalo_l $FACE_MODEL_FILES \
    && rm /tmp/fetch_model.py

# 3. Код
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY client ./client
COPY scripts ./scripts

# 4. Не root: если в обработке фото найдётся уязвимость, у процесса не будет
#    прав root внутри контейнера. Код и модель — только для чтения.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
