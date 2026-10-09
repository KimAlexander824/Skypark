# СКАЙПАРК

Система для детской площадки с распознаванием лиц детей. Микросервисы в одном репозитории.

| Папка | Что | Владелец |
|---|---|---|
| `services/recognition/` | ядро: распознавание лиц, база векторов (pgvector, шарды), воркеры очереди | Александр |
| `services/backend/` | CRUD, бизнес-логика, API для фронтенда, админка | Акмаль |
| `services/frontend/` | веб-интерфейс (Vite + React + TS + Tailwind) | Абдулло |
| `docs/contracts/` | договорённости между сервисами (очереди, форматы) | все |
| `docs/Скайпарк-TZ.md` | техническое задание | все |
| `infra/` | общая инфраструктура (создание баз Postgres) | все |

```
фронтенд ──HTTP──► backend ──задача──► Redis (BullMQ) ──► воркеры распознавания ──► шарды Postgres
                      ▲                                              │
                      └────────────── результат задачи ◄─────────────┘
```

## Запуск

```bash
cp .env.example .env            # Windows: copy .env.example .env
docker compose up -d --build
```

- Swagger сервиса распознавания: http://localhost:8001/docs
- Фронтенд (нужен Node.js 20+):
  ```bash
  cd services/frontend
  npm install
  cp .env.example .env.local    # VITE_FACE_API=service — настоящий сервис распознавания
  npm run dev                   # http://localhost:5173
  ```
- Больше воркеров распознавания: `docker compose up -d --scale recognition-worker=3`
- Postgres (`localhost:5432`, пользователь `skypark`) содержит базы `recognition_1..3` (шарды),
  `backend`, тестовые базы. Они создаются при ПЕРВОМ запуске: чтобы пересоздать — `docker compose down -v`.

## Продакшен

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

В `.env` на сервере обязательно задать `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`INTERNAL_TOKEN` (сгенерировать: `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
Наружу не открыт ни один порт — только backend через HTTPS. Подробности, мониторинг и резервные
копии: [`services/recognition/README.md`](services/recognition/README.md#безопасность-и-продакшен).

## Правила работы

- Каждый работает в своей папке `services/<сервис>/` и в своей ветке, в `main` — только через PR.
- Сервисы общаются только по контракту из `docs/contracts/`. Внутри своего сервиса — любая структура.
- Автотесты на GitHub запускаются только для того сервиса, чьи файлы изменились.
- Старая версия прототипа (всё в одном приложении): метка `prototype-full-core`.
