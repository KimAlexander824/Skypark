FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# build-essential нужен, чтобы собрать insightface
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv

COPY requirements.txt requirements-ml.txt ./
# insightface тянет полную версию opencv-python, которой нужны графические
# библиотеки (libGL, libxcb…). На сервере они не нужны — оставляем только headless.
RUN pip install -r requirements-ml.txt \
    && pip uninstall -y opencv-python opencv-contrib-python \
    && pip install --force-reinstall --no-deps opencv-python-headless

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
