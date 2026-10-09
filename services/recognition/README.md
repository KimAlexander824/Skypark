# Сервис распознавания лиц (ядро СКАЙПАРК)

Находит ребёнка по фото и хранит векторы лиц. Работает через очередь BullMQ:
backend кладёт задачу, воркеры её выполняют.
**Python 3.12, BullMQ (Redis), PostgreSQL + pgvector (шарды), OpenCV, insightface, FastAPI.**

Как вызывать из других сервисов: [`docs/contracts/recognition.md`](../../docs/contracts/recognition.md).

## Как устроено

```
задача из очереди ─► воркер ─► OpenCV + insightface ─► вектор 512 чисел
                                                          │
         enroll / delete_faces: шард child_id % N  ◄──────┤
         identify: все шарды параллельно, лучший результат ◄┘
```

| Файл | Что делает |
|---|---|
| `app/worker.py` | воркер BullMQ: задачи `identify`, `enroll`, `delete_faces`, `sync_children` |
| `app/recognition/engine.py` | фото → лицо → вектор, проверки качества (§44) |
| `app/recognition/service.py` | операции поверх шардов: поиск по всем шардам, запись в шард ребёнка |
| `app/recognition/repository.py` | запросы к `face_profiles` внутри одного шарда |
| `app/recognition/models.py` | таблица `face_profiles` (vector(512) + индекс HNSW) |
| `app/recognition/api.py` | синхронный HTTP-вход (Swagger, отладка) |
| `app/db/session.py` | подключение к шардам |
| `app/migrate.py` | миграции на все шарды |
| `app/audit.py` | журнал доступа к биометрии (строки `AUDIT {...}` в логе) |
| `app/stats.py` | состояние очереди для мониторинга |
| `app/limits.py` | лимит размера HTTP-запроса |
| `client/recognition_client.py` | готовый клиент для backend |
| `scripts/evaluate_threshold.py` | подбор порога на реальных фото |
| `scripts/fetch_model.py` | скачать модель и проверить sha256 (при сборке образа) |

**Очередь.** Поиск — самая срочная задача. Плохое фото — обычный ответ (`ok: false` + код),
повторов нет. Сбой (база, модель) — BullMQ повторяет задачу до 3 раз. Упавший посреди задачи
воркер не теряет её: задачу заберёт другой.

**Шарды.** Лица одного ребёнка лежат в шарде `child_id % N`. Поиск по фото опрашивает все шарды
параллельно. Для разработки шарды — 3 базы на одном сервере, в продакшене — разные серверы
(меняются только адреса в `SHARD_DATABASE_URLS`).
⚠ Число и порядок шардов после запуска не менять: иначе лица окажутся «не в том» шарде.
Для смены числа шардов нужен перенос данных.

**Масштабирование.** Больше воркеров (`--scale recognition-worker=N`) ускоряет обработку,
если у сервера есть свободные ядра или воркеры стоят на разных машинах: одна копия нейросети
уже занимает 2 ядра. Поиск в базе — 15 мс на 200 000 лиц, узкое место — нейросеть (0,2–0,5 с на фото).

## Настройки

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `APP_ENV` | `dev` | `prod` — проверка паролей и токена при старте, Swagger выключен |
| `SHARD_DATABASE_URLS` | — | базы-шарды через запятую |
| `REDIS_URL` | `redis://localhost:6379` | Redis для очереди |
| `QUEUE_NAME` | `recognition` | имя очереди |
| `WORKER_CONCURRENCY` | 1 | задач одновременно в одном воркере |
| `FACE_ENGINE` | `insightface` | `fake` — заглушка без нейросети (лицо = цвет картинки) |
| `MATCH_THRESHOLD` | 0.5 | порог «тот же ребёнок» — подобрать на реальных фото |
| `AMBIGUITY_MARGIN` | 0.05 | разница двух лучших меньше → `ambiguous` |
| `HNSW_EF_SEARCH` | 200 | точность поиска по индексу |
| `MULTIPLE_FACES_MIN_RATIO` | 0.25 | при регистрации лица меньше этой доли главного игнорируются; 0 — строго одно лицо |
| `MAX_FACE_PROFILES_PER_CHILD` | 5 | фото лица на ребёнка |
| `INTERNAL_TOKEN` | — | токен HTTP API (`X-Internal-Token`); в `prod` обязателен, 32+ символа |
| `MAX_PHOTO_BYTES` | 10 МБ | максимальный размер фото |
| `MAX_IMAGE_PIXELS` | 50 млн | максимальное разрешение (проверяется до декодирования) |
| `FACE_MODEL_ROOT` | `~/.insightface` | папка с весами модели; в Docker — `/opt/models` |
| `SYNC_MAX_DELETE_RATIO` | 0.2 | сверка не удалит больше этой доли детей без `force` |

## Тесты

Нужны Postgres и Redis из корневого `docker-compose` (тестовые базы `recognition_test`,
`recognition_test_2` создаются автоматически при первом запуске):

```bash
docker compose up -d db redis        # из корня репозитория
cd services/recognition
pip install -r requirements-dev.txt
pytest
```

Тесты проверяют поиск по двум шардам, запись в нужный шард, очередь (настоящий Redis):
ответы, ошибки фото, повтор при сбое и отсутствие повторов для неверных задач.

## Безопасность и продакшен

Запуск на сервере — из корня репозитория:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

| Защита | Как сделано |
|---|---|
| Порты | в продакшене наружу не открыт ни один порт сервиса, базы и Redis; в разработке — только `127.0.0.1` |
| Пароли | `APP_ENV=prod` не запустится без пароля Redis, с паролем базы из примера, без `INTERNAL_TOKEN` (32+ символа), с `FACE_ENGINE=fake` |
| Swagger | в `prod` выключен (`/docs`, `/openapi.json` не отдаются) |
| Токен | сравнивается за постоянное время (`hmac.compare_digest`) |
| Размер фото | HTTP: запрос больше 10 МБ обрывается, не дочитываясь; очередь: проверка до декодирования base64 → `photo_too_large` |
| «Фото-бомба» | разрешение читается из заголовка JPEG/PNG до декодирования, больше 50 млн пикселей → `photo_too_large`; другие форматы не принимаются |
| `child_id` | от 1 до 2 147 483 647 (больше не помещается в столбец) |
| Фото в Redis | удаляется из задачи сразу после обработки (при сбое — после последней попытки); в продакшене Redis без записи на диск |
| Модель | вшита в образ при сборке, sha256 архива проверяется; в интернет сервис не ходит |
| Пользователь | контейнер работает не от root; в продакшене файловая система только для чтения, без привилегий |
| Зависимости | точные версии и sha256 в `requirements.lock`; `pip-audit` в CI на каждый PR и раз в неделю |
| Журнал | каждое действие с биометрией — строка `AUDIT {...}` (кто, что, когда, итог; без фото) |
| «Сироты» | задача `sync_children` удаляет лица детей, которых нет у backend |

**Обновить зависимости:** поменять версию в `requirements*.txt`, затем

```bash
pip install uv
uv pip compile requirements-ml.txt --python-version 3.12 --python-platform x86_64-manylinux_2_28 \
  --generate-hashes --no-emit-package opencv-python -o requirements.lock
pip-audit -r requirements.lock --require-hashes --disable-pip
```

**Сменить модель** (например, после покупки лицензии): аргументы сборки `FACE_MODEL_URL`,
`FACE_MODEL_SHA256`, `FACE_MODEL_FILES` в `Dockerfile`.

## Мониторинг

- `docker compose ps` — у воркера и API есть healthcheck: завис — docker перезапустит контейнер.
- Очередь: `docker compose exec recognition-worker python -m app.stats`
  или `GET /api/recognition/stats` (с токеном). Постоянно растёт `waiting` — не хватает воркеров;
  растёт `failed` — сбой базы или модели.
- Журнал доступа: `docker compose logs recognition-worker | grep AUDIT`.

Оповещения (Telegram/почта, когда сервис упал или очередь растёт) настраиваются в системе
мониторинга сервера (Uptime Kuma, Prometheus + Alertmanager) по этим двум источникам.

## Резервные копии

`infra/backup/backup.sh` — копии всех шардов и базы backend (`pg_dump`), с шифрованием
(`GPG_RECIPIENT`) и удалением копий старше `KEEP_DAYS`. `infra/backup/restore-check.sh` —
восстанавливает копию во временную базу и проверяет, что она читается. Запуск по расписанию
и примеры — в начале каждого скрипта. В копиях биометрия: шифровать и хранить в Узбекистане.

## Подбор порога

Папка `photos/`, в ней подпапка на каждого ребёнка с 2+ фото. Скрипт базу не трогает.

```bash
docker compose run --rm -v ./photos:/photos recognition-api python -m scripts.evaluate_threshold /photos
```

Фото детей — персональные данные: папку `photos/` в git не добавлять.
