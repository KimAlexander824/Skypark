"""Служебные команды.

    python -m app.cli create-user --login admin --password '...' --role admin --first-name 'Имя'
    python -m app.cli seed-demo     # демо-данные для разработки фронтенда и бота
"""

import argparse
import sys
from datetime import time
from decimal import Decimal

from sqlalchemy import select

from app.db.models import DurationOption, Nanny, User, WorkSchedule
from app.db.session import SessionLocal
from app.domain.enums import OptionKind, Role
from app.security import hash_password


def create_user(session, login, password, role, first_name, last_name=None) -> User:
    if session.scalar(select(User).where(User.login == login)):
        sys.exit(f"Пользователь {login!r} уже существует")
    user = User(
        login=login,
        password_hash=hash_password(password),
        role=role,
        first_name=first_name,
        last_name=last_name,
    )
    session.add(user)
    session.flush()
    if role == Role.NANNY:
        session.add(Nanny(user_id=user.id, max_children=5))
    return user


def seed_demo() -> None:
    with SessionLocal() as s:
        if s.scalar(select(User).limit(1)):
            sys.exit("В базе уже есть пользователи — seed-demo запускается только на пустой базе")
        create_user(s, "admin", "admin12345", Role.ADMIN, "Админ")
        create_user(s, "staff", "staff12345", Role.EMPLOYEE, "Дилноза", "Каримова")
        create_user(s, "nanny1", "nanny12345", Role.NANNY, "Малика", "Юсупова")
        create_user(s, "nanny2", "nanny12345", Role.NANNY, "Гульнора", "Ахмедова")
        for i, (name, minutes, price) in enumerate(
            [("1 час", 60, 50000), ("2 часа", 120, 90000), ("3 часа", 180, 120000)]
        ):
            s.add(DurationOption(kind=OptionKind.VISIT, name=name, minutes=minutes, price=Decimal(price), sort_order=i))
        for i, (name, minutes, price) in enumerate(
            [("+30 минут", 30, 30000), ("+1 час", 60, 50000), ("+2 часа", 120, 90000)]
        ):
            s.add(DurationOption(kind=OptionKind.EXTENSION, name=name, minutes=minutes, price=Decimal(price), sort_order=i))
        for weekday in range(7):
            s.add(WorkSchedule(weekday=weekday, opens_at=time(10), closes_at=time(22)))
        s.commit()
    print("Готово. Логины: admin/admin12345, staff/staff12345, nanny1/nanny12345, nanny2/nanny12345")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("create-user")
    p.add_argument("--login", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--role", choices=[r.value for r in Role], required=True)
    p.add_argument("--first-name", required=True)
    p.add_argument("--last-name")
    sub.add_parser("seed-demo", help="демо-данные: пользователи, тарифы, часы работы 10:00–22:00")
    args = parser.parse_args()

    if args.command == "create-user":
        if len(args.password) < 8:
            sys.exit("Пароль должен быть не короче 8 символов")
        with SessionLocal() as s:
            create_user(s, args.login, args.password, args.role, args.first_name, args.last_name)
            s.commit()
        print(f"Пользователь {args.login!r} создан")
    elif args.command == "seed-demo":
        seed_demo()


if __name__ == "__main__":
    main()
