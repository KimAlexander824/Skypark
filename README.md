# СКАЙПАРК — модуль распознавания лиц

Поиск ребёнка по фотографии и хранение эмбеддингов лиц.
**FastAPI + SQLAlchemy 2 + PostgreSQL/pgvector + OpenCV + insightface.**

Swagger после запуска: http://localhost:8000/docs

> Старая полная версия прототипа (посещения, оплаты, уведомления, админка)
> сохранена в git под меткой `prototype-full-core`:
> `git checkout prototype-full-core` — посмотреть, `git checkout main` — вернуться.

## Что делает модуль (ТЗ §6, §39, §42–44)

1. **Запоминает лицо** при регистрации ребёнка: фото → лицо → вектор из 512 чисел (эмбеддинг) → таблица `face_profiles`.
2. **Ищет ребёнка по фото**: возвращает `child_id` и уверенность (`confidence`) или «не найден».
3. **Быстрый поиск по ключам**: `face_profiles` — это «суб-БД» эмбеддингов. Векторный
   индекс HNSW (pgvector) находит ближайшие лица за миллисекунды даже на десятках тысяч
   записей и возвращает ключ `child_id`. Всё остальное о ребёнке основная часть backend
   берёт по этому ключу.

```
фото ─► OpenCV: декодировать, уменьшить ─► insightface: найти лицо, проверить качество
     ─► эмбеддинг 512 чисел ─► pgvector (HNSW, косинусное расстояние) ─► child_id + confidence
```

| Ответ | Когда | Что делает интерфейс |
|---|---|---|
| `found` | лучшее сходство ≥ `MATCH_THRESHOLD` | открыть карточку `child_id` |
| `not_found` | никто не похож достаточно | предложить регистрацию или поиск по телефону |
| `ambiguous` | 2+ детей почти одинаково похожи (близнецы, братья/сёстры) | сотрудник выбирает из `candidates` |

**Ошибки фото (§44)** — `422`, формат `{"error": "код", "message": "текст для сотрудника"}`:
`bad_image` (не картинка), `no_face` (лица нет), `multiple_faces` (при регистрации в кадре несколько лиц),
`low_quality` (лицо слишком маленькое). **Модель не загрузилась** — `503 recognition_unavailable`:
остальная система работает, ребёнка ищут по телефону (§43).

**Несколько фото на ребёнка.** Дети растут, поэтому храним до `MAX_FACE_PROFILES_PER_CHILD` (5)
эмбеддингов: фото с регистрации — всегда, плюс последние фото с визитов.

## Структура

```
app/
├── main.py              FastAPI-приложение (подключает роутер модуля)
├── config.py            настройки из .env
├── errors.py            общий формат ошибок API {"error", "message"}
├── db/
│   ├── base.py            Base — общий для всех моделей проекта
│   ├── models.py          реестр моделей для Alembic
│   └── session.py         подключение к БД, get_session
└── recognition/         ◄── модуль распознавания
    ├── engine.py          фото → лицо → эмбеддинг, проверки качества (OpenCV + insightface)
    ├── service.py         ПУБЛИЧНЫЙ ИНТЕРФЕЙС: enroll / identify / delete_faces …
    ├── models.py          таблица face_profiles (Vector(512) + индекс HNSW)
    ├── api.py             HTTP: /api/recognition/*
    ├── schemas.py         формат ответов
    └── errors.py          ошибки фото
migrations/              Alembic
scripts/evaluate_threshold.py   подбор порога на реальных фото
tests/                   тесты на настоящем Postgres + pgvector
```

## Как основной backend использует модуль

Модуль **не зависит** от таблиц детей/родителей: он знает только `child_id` (целое число).
Поэтому основную часть можно писать как угодно, в том числе с нуля.

```python
from app.recognition import service as faces

# Регистрация (§6.1): сначала проверить, нет ли ребёнка уже в базе
result = faces.identify(session, photo_bytes)
if result.status == "found":
    ...  # «Похоже, ребёнок уже зарегистрирован» — показать карточку result.child_id

child = Child(...)                      # таблица детей — основная часть backend
session.add(child)
session.flush()                         # чтобы появился child.id
faces.enroll(session, child.id, photo_bytes)   # ошибки фото → 422, ребёнок не сохранится
session.commit()                        # ребёнок и его лицо сохраняются вместе

# Повторный визит (§6.2)
result = faces.identify(session, photo_bytes)
# result.status: "found" | "not_found" | "ambiguous"
# result.child_id, result.confidence, result.candidates[i].child_id / .confidence / .is_match

# Пополнить базу свежим фото с визита (необязательно, повышает точность)
faces.enroll(session, child_id, photo_bytes, source="visit", require_single=False)

# Удалить биометрию по просьбе родителя (§42)
faces.delete_faces(session, child_id)
```

Функции **не делают `commit`** — это решает вызывающий код. Ошибки — исключения из
`app/recognition/errors.py`; если в приложении вызван `install_error_handler(app)`
(уже есть в `main.py`), они сами превращаются в правильный HTTP-ответ.

**Авторизация.** В `api.py` её нет намеренно. Когда появится, роутер подключается так:

```python
app.include_router(recognition_router, dependencies=[Depends(require_staff)])
```

**Внешний ключ на таблицу детей.** Когда появится таблица `children` (с `id` — целым числом),
одной миграцией добавляется связь, чтобы при удалении ребёнка удалялись его лица:

```python
op.create_foreign_key("fk_face_profiles_child", "face_profiles", "children",
                      ["child_id"], ["id"], ondelete="CASCADE")
```

и в `app/recognition/models.py`: `mapped_column(ForeignKey("children.id", ondelete="CASCADE"), index=True)`.

**Новые модели** основной части добавляются в импорт в `app/db/models.py` — иначе Alembic их не увидит.

## HTTP API (для фронтенда)

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/recognition/identify` (файл `photo`) | найти ребёнка: `status`, `child_id`, `confidence`, `message`, `candidates` |
| POST | `/api/recognition/faces/{child_id}?source=registration\|visit` (файл `photo`) | добавить фото лица ребёнку |
| GET | `/api/recognition/faces/{child_id}` | сколько фото лица хранится |
| GET | `/api/recognition/faces/{child_id}/thumbnail` | вырезка лица (JPEG) для сверки сотрудником |
| DELETE | `/api/recognition/faces/{child_id}` | удалить биометрию ребёнка |

## Запуск

```bash
cp .env.example .env               # Windows: copy .env.example .env  — и поменять пароль
docker compose up -d --build       # db + migrator + api
```

Первый запуск скачивает веса модели (~300 МБ) — они сохраняются в томе `insightface`.

**Без Docker и без нейросети** (удобно для фронтенда): в `.env` поставить `FACE_ENGINE=fake`, затем

```bash
pip install -r requirements-dev.txt
docker compose up -d db
alembic upgrade head
uvicorn app.main:app --reload
```

С заглушкой `fake` «лицо» определяется по цвету картинки: одноцветная картинка — это один и тот же «ребёнок».

## Тесты

```bash
docker compose exec db createdb -U skypark skypark_test
pytest
```

Тесты идут на настоящем Postgres с pgvector (в том числе проверяют, что поиск использует индекс HNSW).
База `skypark_test` очищается перед каждым тестом.

## Подбор порога (обязательно до запуска в парке)

`MATCH_THRESHOLD=0.5` — стартовое значение. Порог нужно проверить на реальных фото детей:
папка, где одна подпапка — один ребёнок, внутри 2+ его фото.

```bash
docker compose run --rm -v ./photos:/photos api python -m scripts.evaluate_threshold /photos
```

Скрипт базу не трогает. Он показывает для каждого порога долю **ложных совпадений**
(открылась бы чужая карточка — самая опасная ошибка) и **пропусков** (ребёнка не узнали —
сотрудник найдёт по телефону), и предлагает порог. Фото детей — персональные данные:
папку `photos/` в git не добавлять (она уже в `.gitignore`).

## Безопасность

- `.env`, фото детей, дампы базы и веса модели в git не коммитить.
- На сервере — свой надёжный `POSTGRES_PASSWORD`, порт `5432` наружу не открывать
  (убрать `ports` у `db` в `docker-compose.yml`).
- Эмбеддинги и вырезки лиц — биометрия: доступ к API распознавания только у сотрудников,
  удаление — только у администратора.
