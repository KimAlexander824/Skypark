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


class PhotoTooLarge(FaceError):
    """Файл больше MAX_PHOTO_BYTES или разрешение больше MAX_IMAGE_PIXELS."""

    status_code = 413
    code = "photo_too_large"


class RecognitionUnavailable(DomainError):
    """Модель не загрузилась. Остальная система должна продолжать работать (§43)."""

    status_code = 503
    code = "recognition_unavailable"


class SyncRefused(DomainError):
    """Сверка с backend отказалась удалять: список подозрительный (пустой или
    удаление слишком многих детей). Защита от ошибки на стороне backend."""

    status_code = 409
    code = "sync_refused"


class InvalidSource(DomainError):
    """source задан неверно (допустимо registration или visit)."""

    code = "invalid_source"
