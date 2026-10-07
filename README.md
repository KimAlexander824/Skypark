# СКАЙПАРК — ядро backend

Распознавание лиц и ядро системы: посещения, таймер, продления, статусы оплаты,
очередь уведомлений, журнал действий. **FastAPI + SQLAlchemy 2 + PostgreSQL/pgvector + insightface.**

Документация API (Swagger) после запуска: http://localhost:8000/docs

## Что сделано (по ТЗ)

| Раздел ТЗ | Где в коде |
|---|---|
| §5, §6.1, §8 Регистрация: родитель по телефону → ребёнок → фото | `services/registration.py`, `POST /api/registration` |
| §6.2, §39 Распознавание: id ребёнка + уверенность, «не найден» | `services/recognition.py`, `POST /api/recognition/identify` |
| §6.3 Ручной поиск по телефону | `GET /api/parents/by-phone` |
| §7 Карточка и история посещений | `GET /api/children/{id}`, `GET /api/children/{id}/visits` |
| §9 Создание посещения, §10 выбор няни | `services/visits.py`, `services/nannies.py`, `POST /api/visits`, `GET /api/nannies` |
| §11 Таймер | `visits.timer()`: прошедшее, оставшееся, время окончания |
| §12 Завершение вручную и автоматически | `POST /api/visits/{id}/complete`, воркер `app/worker.py` |
| §13 Интерфейс няни | `GET /api/nanny/visits`, `POST /api/nanny/status` |
| §16–18 Напоминание за 15 мин, продление, отказ | `services/scheduler.py`, `services/extensions.py`, `/api/bot/*` |
| §19, §32 Статусы оплаты | `services/payments.py` |
| §26 Рабочее время, праздники | `services/schedule.py` |
| §27–28 Применение скидок и проверка промокодов | `services/pricing.py`, `POST /api/visits/quote` |
| §30 Уведомления (очередь) | `services/notifications.py` |
| §31 Статусы посещения и переходы | `domain/enums.py` (`VISIT_TRANSITIONS`) |
| §33, §42 Роли, доступ к фото детей | `api/deps.py`, `GET /api/children/{id}/photo` |
| §41 Журнал действий | `services/common.py: audit()`, `GET /api/audit` |
| §43 Надёжность | уведомления не теряются при недоступном Telegram; без модели распознавания остальное работает |
| §44 Коды ошибок | `services/errors.py` |

## Как устроено

```
app/
├── main.py, config.py, security.py, cli.py, worker.py
├── domain/enums.py      статусы, переходы, русские подписи
├── db/models/           схема БД (импорт: from app.db.models import Visit)
│   ├── base.py            Base и общие помощники
│   ├── core.py            таблицы ядра
│   └── admin.py           справочники администратора (Акмаль)
├── schemas/             модели запросов/ответов: core.py (ядро), admin.py (Акмаль)
├── services/            бизнес-логика, без HTTP
│   ├── face.py            OpenCV + insightface: фото → эмбеддинг, проверки качества
│   ├── recognition.py     поиск в pgvector, found / not_found / ambiguous
│   ├── registration.py    родитель + ребёнок + FaceProfile, защита от дублей
│   ├── visits.py          создание, таймер, завершение, отмена
│   ├── extensions.py      продление и отказ
│   ├── payments.py        платежи + интерфейс провайдера (сейчас fake)
│   ├── pricing.py         цены, скидки, промокоды
│   ├── schedule.py        рабочие часы
│   ├── nannies.py         загрузка и доступность нянь
│   ├── notifications.py   очередь уведомлений (outbox)
│   └── scheduler.py       напоминания и автозавершение
└── api/                 тонкий HTTP-слой
    ├── *.py               эндпоинты ядра
    ├── views.py           общая сборка ответов (карточка, посещение, няня)
    └── admin/             эндпоинты администрирования (Акмаль)
```

**Статусы посещения:**

```
Активно ──(за 15 мин)──► Ожидает продления ──(оплачено)──► Продлено ──(за 15 мин)──► Ожидает продления …
   │                          │  └──(отказ)──► Активно
   └──────────────┬───────────┴──────────────────────────────┘
                  ▼
     Завершено (вручную / авто) · Отменено (админ)
```

«Создано» есть в справочнике, но сейчас посещение сразу становится «Активно».

**Уведомления.** Ядро записывает событие в таблицу `notifications` в той же транзакции,
что и изменение посещения. Telegram-уведомления забирает бот, web-уведомления
показывает интерфейс сотрудника. Если родитель ещё не привязал Telegram, уведомление
помечается `skipped`, а после привязки уведомления по текущим посещениям отправляются заново.

## Границы с командой

### Кто владеет какими файлами

| Часть | Файлы | Владелец |
|---|---|---|
| Распознавание, посещения, продления, оплата, уведомления, бот | `app/services/`, `app/api/*.py`, `app/db/models/core.py`, `app/schemas/core.py`, `app/domain/` | ядро |
| Администрирование (CRUD) | `app/api/admin/`, `app/db/models/admin.py`, `app/schemas/admin.py` | Акмаль |
| Миграции | `migrations/` | оба (ревьюят оба) |

Это же записано в `.github/CODEOWNERS`: PR в чужие файлы автоматически требует ревью владельца.

**Акмаль (CRUD).** Таблицы справочников уже лежат в `app/db/models/admin.py`, а в `app/api/admin/`
уже есть: поиск родителя по телефону, карточка ребёнка, список нянь и их фото, список тарифов,
просмотр журнала. Их можно переписывать по-своему, если сохранить формат ответа
(на него рассчитаны сценарий регистрации и фронтенд). Остаются:
- создание и редактирование сотрудников и нянь;
- тарифы, скидки, промокоды, рабочее время;
- списки детей и родителей с фильтрами, новости, Dashboard.

Новый раздел: файл в `app/api/admin/` с `router = APIRouter(...)` + строка в `ROUTERS`
в `app/api/admin/__init__.py`. `main.py` трогать не нужно.

Ядро таблицы справочников только **читает**. Поля можно свободно **добавлять**;
переименовывать или удалять поля из списка в начале `app/db/models/admin.py` — только вместе
с владельцем ядра, в одном PR с правкой ядра.
Важные действия стоит записывать в журнал: `audit(session, Actor.of(user), "nanny.created", "nanny", id)`.

### Правила работы с git

- `main` защищена: изменения только через Pull Request, CI (`.github/workflows/tests.yml`)
  запускает миграции и все тесты на Postgres с pgvector.
- Каждый работает в своей ветке и перед PR делает `git rebase origin/main`.
- Изменение таблиц — **новая** миграция: `alembic revision --autogenerate -m "..."`.
  Уже смёрженные миграции не редактировать. Если после мёржа две «головы» —
  `alembic merge heads -m "merge"`.

**Абдулох (фронтенд).** Всё в Swagger: `/docs`. Ошибки приходят в формате
`{"error": "код", "message": "текст для сотрудника"}`. Таймер считать на клиенте
от `server_time` и `remaining_seconds`, список обновлять раз в 10–30 секунд.

**Telegram-бот (отдельное приложение).** Заголовок `X-Bot-Token: <BOT_API_TOKEN>`.
1. `/start` → кнопка «Поделиться контактом» → `POST /api/bot/link {phone, chat_id, username}`.
2. Каждые 3–5 секунд: `POST /api/bot/notifications/claim` → отправить `message` в `chat_id` →
   `POST /api/bot/notifications/{id}/result {success, error, permanent}`.
   Для `visit_ending_soon` в `payload.actions` лежат кнопки `extend` и `decline`, а в `payload.visit_id` — id посещения.
3. «Продлить» → `POST /api/bot/visits/{id}/extension-options` → выбор →
   `POST /api/bot/visits/{id}/extend` → отправить родителю `payment.pay_url`.
4. «Не продлевать» → `POST /api/bot/visits/{id}/decline`.

**Платёжный провайдер.** Реализовать `PaymentProvider.create()` в `services/payments.py`
и webhook, который вызывает `payments.mark_paid()` / `mark_failed()`.
Пока работает `fake`: `pay_url` открывает тестовую страницу с кнопками «Оплатить» / «Отклонить».

## Допущения (ответов от заказчика пока нет)

| Вопрос ТЗ | Что сделано сейчас | Как поменять |
|---|---|---|
| №13 Досрочное завершение | Неиспользованное время **сгорает**. Плановое и фактическое окончание хранятся, остаток всегда можно посчитать | Настройка `EARLY_END_POLICY` + логика в `visits.complete_visit` |
| №6–8 Расчёт стоимости | Фиксированные варианты в `duration_options` (админ настраивает) | Функция `pricing.base_price()` |
| Скидка + промокод | Применяются оба: сначала скидка, затем промокод; итог ≥ 0 | `pricing.quote()` |
| Промокод «использован» | Когда платёж стал «Оплачен» | `pricing.record_promo_usage()` |
| №10 Сколько детей у няни | До 5 одновременно (`nannies.max_children`) | Поле у каждой няни |
| №3–4 Обязательные поля | Ребёнок: имя (+ согласие и фото). Родитель: телефон и имя | `api/children.py: register` |
| §26 Рабочее время | Если график не задан — ограничений нет. Работа после полуночи не поддерживается | `services/schedule.py` |
| Оплата продления опоздала | Ждём `EXTENSION_PAYMENT_GRACE_MINUTES` (10) после окончания; если деньги пришли позже — сотрудникам уведомление «нужен возврат» | Настройка |
| №12 Смена няни во время посещения | Не сделано | — |
| №1 Технология распознавания | insightface `buffalo_l`, порог 0.5 | **Подобрать порог на реальных фото детей** |

## Запуск

```bash
cp .env.example .env               # поменять пароли, JWT_SECRET, BOT_API_TOKEN
docker compose up -d --build       # db + migrator + api + worker
docker compose exec api python -m app.cli seed-demo
```

`seed-demo` создаёт пользователей `admin` / `staff` / `nanny1` / `nanny2`
(пароли `admin12345`, `staff12345`, `nanny12345`), тарифы и часы работы 10:00–22:00.

**Разработка без Docker и без нейросети** (удобно для фронтенда и бота):
в `.env` поставить `FACE_ENGINE=fake`, затем:

```bash
pip install -r requirements-dev.txt
docker compose up -d db
alembic upgrade head
python -m app.cli seed-demo
uvicorn app.main:app --reload      # API
python -m app.worker               # в отдельном окне: напоминания и автозавершение
```

С заглушкой `fake` «лицо» определяется по цвету картинки: одноцветная картинка — это один и тот же «ребёнок».

## Тесты

```bash
docker compose exec db createdb -U skypark skypark_test
pytest
```

42 теста на настоящем Postgres, включая все сценарии из критериев готовности MVP (§47):
`tests/test_mvp_scenarios.py`. База `skypark_test` очищается перед каждым тестом.
Время в тестах «перематывается», поэтому напоминание за 15 минут и автозавершение проверяются без ожидания.
