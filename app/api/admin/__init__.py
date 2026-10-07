"""API администрирования (владелец — Акмаль).

Новый раздел админки: создайте файл с router = APIRouter(...) и добавьте его
в ROUTERS ниже. main.py трогать не нужно.
"""

from app.api.admin import audit, children, nannies, options, parents

ROUTERS = [parents.router, children.router, nannies.router, options.router, audit.router]
