import argparse
import asyncio
import sys
from typing import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.admin_roles import AdminError, list_admins, set_admin_by_email


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    groups = parser.add_subparsers(dest="group", required=True)
    admin = groups.add_parser("admin", help="Роль администратора")
    actions = admin.add_subparsers(dest="action", required=True)
    for action, help_text in (("grant", "Назначить администратором"), ("revoke", "Снять роль администратора")):
        actions.add_parser(action, help=help_text).add_argument("email")
    actions.add_parser("list", help="Список администраторов")
    return parser


async def run(args: argparse.Namespace, session_factory: Callable[[], AsyncSession]) -> tuple[int, str]:
    async with session_factory() as db:
        if args.action == "list":
            admins = await list_admins(db)
            return 0, "\n".join(user.email for user in admins) or "Администраторов нет."
        try:
            user = await set_admin_by_email(db, args.email, args.action == "grant")
        except AdminError as e:
            return 1, e.error_description
    state = "администратор" if user.is_admin else "не администратор"
    return 0, f"{user.email}: {state}"


def main(argv: list[str] | None = None) -> int:
    from app.core.database import async_session, engine

    args = build_parser().parse_args(argv)

    async def execute() -> tuple[int, str]:
        try:
            return await run(args, async_session)
        finally:
            await engine.dispose()

    code, message = asyncio.run(execute())
    print(message, file=sys.stderr if code else sys.stdout)
    return code


if __name__ == "__main__":
    sys.exit(main())
