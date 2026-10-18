"""Account email routes: email verification, password reset and password change."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_ip, get_current_active_user, get_db, get_outbox, get_password_session_user, get_redis
from app.api.routes.auth import too_many_requests
from app.core.mailer import Outbox
from app.core.rate_limit import RateLimitExceeded
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.services import account_service
from app.services.account_service import AccountError

router = APIRouter(prefix="/auth", tags=["account"])


def _http_error(e: AccountError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail={"error": e.error, "error_description": e.error_description})


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(
    data: VerifyEmailRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        await account_service.verify_email(db, redis, data.token, client_ip)
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AccountError as e:
        raise _http_error(e)


@router.post("/verify-email/resend", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification_email(
    current_user: User = Depends(get_current_active_user),
    redis: Redis = Depends(get_redis),
    outbox: Outbox = Depends(get_outbox),
):
    try:
        await account_service.resend_verification_email(redis, outbox, current_user)
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AccountError as e:
        raise _http_error(e)


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    data: ForgotPasswordRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    outbox: Outbox = Depends(get_outbox),
):
    try:
        await account_service.request_password_reset(db, redis, outbox, data.email, client_ip)
    except RateLimitExceeded as e:
        raise too_many_requests(e)


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    data: ResetPasswordRequest,
    client_ip: str = Depends(get_client_ip),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    outbox: Outbox = Depends(get_outbox),
):
    try:
        await account_service.reset_password(db, redis, outbox, data.token, data.new_password, client_ip)
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AccountError as e:
        raise _http_error(e)


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_password_session_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    outbox: Outbox = Depends(get_outbox),
):
    try:
        await account_service.change_password(
            db,
            redis,
            outbox,
            current_user,
            data.current_password,
            data.new_password,
            request.cookies.get("refresh_token"),
        )
    except RateLimitExceeded as e:
        raise too_many_requests(e)
    except AccountError as e:
        raise _http_error(e)
