"""Модуль распознавания лиц СКАЙПАРК.

  engine.py   — фото → лицо → эмбеддинг (OpenCV + insightface), проверки качества
  service.py  — публичный интерфейс: enroll / identify / delete_faces …
  models.py   — таблица face_profiles (pgvector + индекс HNSW)
  api.py      — HTTP API /api/recognition/*
  errors.py   — ошибки фото (§44)
"""
