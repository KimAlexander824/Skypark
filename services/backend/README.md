# Backend (Акмаль)

Здесь будет основной backend СКАЙПАРК: CRUD, бизнес-логика, API для фронтенда, админка.
Структура внутри — на усмотрение владельца (модульная, DDD — любая).

Что нужно, чтобы сервис заработал вместе с остальными:

1. `Dockerfile` в этой папке.
2. Раскомментировать блок `backend` в корневом `docker-compose.yml`.
   База `backend` на общем сервере Postgres уже создаётся автоматически.
3. Распознавание лиц вызывать через очередь BullMQ — готовый клиент:
   `services/recognition/client/recognition_client.py` (скопировать к себе),
   формат задач — `docs/contracts/recognition.md`.
4. Свои автотесты — `.github/workflows/backend.yml` с `paths: ["services/backend/**"]`
   (по образцу `recognition.yml`).
