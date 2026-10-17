from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db
from app.models.user import User
from app.schemas.admin import (
    AdminOverview,
    AdminProjectPage,
    AdminProjectSort,
    AdminUserPage,
    AdminUserRole,
    AdminUserRoleUpdate,
    AdminUserSort,
    SortOrder,
)
from app.services import admin_analytics, admin_directory
from app.services.admin_directory import PageQuery
from app.services.admin_roles import AdminError, set_user_admin

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])

MAX_PAGE = 200


@router.get("/overview", response_model=AdminOverview)
async def overview(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    return await admin_analytics.build_overview(db, days)


@router.get("/users", response_model=AdminUserPage)
async def users(
    limit: int = Query(50, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
    sort: AdminUserSort = "created_at",
    order: SortOrder = "desc",
    q: Optional[str] = Query(None, max_length=255),
    db: AsyncSession = Depends(get_db),
):
    return await admin_directory.list_users(db, PageQuery(limit, offset, sort, order, q))


@router.get("/projects", response_model=AdminProjectPage)
async def projects(
    limit: int = Query(50, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
    sort: AdminProjectSort = "updated_at",
    order: SortOrder = "desc",
    q: Optional[str] = Query(None, max_length=255),
    db: AsyncSession = Depends(get_db),
):
    return await admin_directory.list_projects(db, PageQuery(limit, offset, sort, order, q))


@router.patch("/users/{user_id}", response_model=AdminUserRole)
async def update_user_role(
    user_id: str,
    data: AdminUserRoleUpdate,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await set_user_admin(db, admin, user_id, data.is_admin)
    except AdminError as e:
        raise HTTPException(status_code=e.status_code, detail={"error": e.error, "error_description": e.error_description})
    return AdminUserRole.model_validate(user)
