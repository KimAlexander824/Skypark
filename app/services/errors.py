"""Ошибки предметной области (§44). В main.py превращаются в JSON:
{"error": "<code>", "message": "<текст для сотрудника>", ...доп. поля}.
Фронтенд и бот ориентируются на поле error, а message можно показывать как есть."""


class DomainError(Exception):
    status_code = 400
    code = "error"

    def __init__(self, message: str, **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra


class ValidationFailed(DomainError):
    code = "validation_error"


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class Forbidden(DomainError):
    status_code = 403
    code = "forbidden"


class InvalidStatus(DomainError):
    status_code = 409
    code = "invalid_status"


# --- дети и родители ---


class ConsentRequired(DomainError):
    code = "consent_required"


class DuplicateChild(DomainError):
    status_code = 409
    code = "possible_duplicate"


class ParentNotFound(DomainError):
    status_code = 404
    code = "parent_not_found"


# --- распознавание (§44 «Распознавание») ---


class FaceError(DomainError):
    status_code = 422
    code = "face_error"


class BadImage(FaceError):
    code = "bad_image"


class NoFace(FaceError):
    code = "no_face"


class MultipleFaces(FaceError):
    code = "multiple_faces"


class LowQuality(FaceError):
    code = "low_quality"


class RecognitionUnavailable(DomainError):
    status_code = 503
    code = "recognition_unavailable"


# --- посещения (§44 «Посещение») ---


class AlreadyOnVisit(DomainError):
    status_code = 409
    code = "already_on_visit"


class NannyUnavailable(DomainError):
    status_code = 409
    code = "nanny_unavailable"


class ParkClosed(DomainError):
    status_code = 409
    code = "park_closed"


class TimeUnavailable(DomainError):
    status_code = 409
    code = "time_unavailable"


class OptionUnavailable(DomainError):
    code = "option_unavailable"


# --- цены ---


class DiscountInvalid(DomainError):
    code = "discount_invalid"


class PromoInvalid(DomainError):
    code = "promo_invalid"


# --- оплата (§44 «Оплата») ---


class PaymentUnavailable(DomainError):
    status_code = 502
    code = "payment_unavailable"


# --- Telegram (§44 «Telegram») ---


class TelegramNotLinked(DomainError):
    status_code = 403
    code = "telegram_not_linked"
