from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User
from app.schemas.auth import normalize_email


class AdminError(Exception):
    def __init__(self, status_code: int, error: str, error_description: str):
        self.status_code = status_code
        self.error = error
        self.error_description = error_description


def is_listed_admin(email: str) -> bool:
    return normalize_email(email) in get_settings().admin_emails


def promote_listed_admin(user: User) -> bool:
    if user.is_admin or not is_listed_admin(user.email):
        return False
    user.is_admin = True
    return True


async def ensure_listed_admin(db: AsyncSession, user: User) -> None:
    if promote_listed_admin(user):
        await db.commit()


async def _get_user(db: AsyncSession, user_id: str) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise AdminError(404, "not_found", "Пользователь не найден.")
    return user


async def set_user_admin(db: AsyncSession, actor: User, user_id: str, is_admin: bool) -> User:
    if user_id == actor.id and not is_admin:
        raise AdminError(400, "cannot_demote_self", "Нельзя снять роль администратора с самого себя.")
    user = await _get_user(db, user_id)
    user.is_admin = is_admin
    await db.commit()
    return user


async def set_admin_by_email(db: AsyncSession, email: str, is_admin: bool) -> User:
    result = await db.execute(select(User).where(func.lower(User.email) == normalize_email(email)))
    user = result.scalars().first()
    if user is None:
        raise AdminError(404, "not_found", f"Пользователь {email} не найден.")
    user.is_admin = is_admin
    await db.commit()
    return user


async def list_admins(db: AsyncSession) -> list[User]:
    result = await db.execute(select(User).where(User.is_admin.is_(True)).order_by(User.email))
    return list(result.scalars().all())
