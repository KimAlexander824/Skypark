"""Тестовый платёжный провайдер (PAYMENT_PROVIDER=fake).

Ссылка на оплату ведёт на страницу с кнопками «Оплатить» и «Отклонить» — так весь
сценарий продления можно пройти без настоящей платёжной системы.

Когда выберут провайдера (Click, Payme и т.п.), рядом появится его webhook:
он проверяет подпись запроса и вызывает payments.mark_paid() / mark_failed().
"""

from html import escape

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from app.api.deps import Now, SessionDep
from app.config import get_settings
from app.db.models import Payment
from app.domain.enums import PaymentStatus
from app.services import payments
from app.services.common import Actor

router = APIRouter(prefix="/api/payments/fake", tags=["Тестовая оплата"])
PROVIDER = Actor("provider")


def _payment(session, payment_id: int) -> Payment:
    if get_settings().payment_provider != "fake":
        raise HTTPException(404)
    p = session.get(Payment, payment_id)
    if p is None or p.provider != "fake":
        raise HTTPException(404, "Платёж не найден")
    return p


@router.get("/{payment_id}", response_class=HTMLResponse)
def page(payment_id: int, session: SessionDep):
    p = _payment(session, payment_id)
    done = p.status != PaymentStatus.PENDING
    buttons = (
        f"<p>Статус: <b>{escape(p.status)}</b></p>"
        if done
        else f"""<form method=post action="{payment_id}?success=true"><button>Оплатить {p.amount} сум</button></form>
<form method=post action="{payment_id}?success=false"><button>Отклонить</button></form>"""
    )
    return f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width">
<title>Тестовая оплата</title><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h2>Тестовая оплата №{p.id}</h2><p>Продление посещения №{p.visit_id}</p>{buttons}</body>"""


@router.post("/{payment_id}")
def complete(payment_id: int, session: SessionDep, now: Now, success: bool = True):
    """Имитация webhook провайдера."""
    p = _payment(session, payment_id)
    if success:
        payments.mark_paid(session, p.id, now, actor=PROVIDER)
    else:
        payments.mark_failed(session, p.id, now, actor=PROVIDER, error="Отклонено (тестовая оплата)")
    session.commit()
    return HTMLResponse(f"<meta charset=utf-8><p style='font-family:system-ui'>Готово: {escape(p.status)}</p>")
