"""Ошибки распознавания (ТЗ §44 «Распознавание»)."""

from app.errors import DomainError


class FaceError(DomainError):
    status_code = 422
    code = "face_error"


class BadImage(FaceError):
    """Файл не читается как изображение."""

    code = "bad_image"


class NoFace(FaceError):
    """Лицо не найдено."""

    code = "no_face"


class MultipleFaces(FaceError):
    """Несколько лиц там, где нужно одно (регистрация)."""

    code = "multiple_faces"


class LowQuality(FaceError):
    """Лицо слишком маленькое / низкое качество фотографии."""

    code = "low_quality"


class RecognitionUnavailable(DomainError):
    """Модель не загрузилась. Остальная система должна продолжать работать (§43)."""

    status_code = 503
    code = "recognition_unavailable"
