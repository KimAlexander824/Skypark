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
| `app/worker.py` | воркер BullMQ: задачи `identify`, `enroll`, `delete_faces` |
| `app/recognition/engine.py` | фото → лицо → вектор, проверки качества (§44) |
| `app/recognition/service.py` | операции поверх шардов: поиск по всем шардам, запись в шард ребёнка |
| `app/recognition/repository.py` | запросы к `face_profiles` внутри одного шарда |
| `app/recognition/models.py` | таблица `face_profiles` (vector(512) + индекс HNSW) |
| `app/recognition/api.py` | синхронный HTTP-вход (Swagger, отладка) |
| `app/db/session.py` | подключение к шардам |
| `app/migrate.py` | миграции на все шарды |
| `client/recognition_client.py` | готовый клиент для backend |
| `scripts/evaluate_threshold.py` | подбор порога на реальных фото |

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
| `INTERNAL_TOKEN` | — | токен HTTP API (`X-Internal-Token`) |

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

## Подбор порога

Папка `photos/`, в ней подпапка на каждого ребёнка с 2+ фото. Скрипт базу не трогает.

```bash
docker compose run --rm -v ./photos:/photos recognition-api python -m scripts.evaluate_threshold /photos
```

Фото детей — персональные данные: папку `photos/` в git не добавлять.
