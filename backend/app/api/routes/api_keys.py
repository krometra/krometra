from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_password_session_user, get_redis
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyCreated, ApiKeyListResponse, ApiKeyResponse
from app.services.api_key_service import ApiKeyError, create_api_key, delete_api_key, list_api_keys

router = APIRouter(prefix="/auth/api-keys", tags=["api-keys"])


def _http_error(e: ApiKeyError) -> HTTPException:
    return HTTPException(status_code=e.status_code, detail={"error": e.error, "error_description": e.error_description})


@router.get("/", response_model=ApiKeyListResponse)
async def get_api_keys(
    current_user: User = Depends(get_password_session_user),
    db: AsyncSession = Depends(get_db),
):
    keys = await list_api_keys(db, current_user.id)
    return ApiKeyListResponse(api_keys=[ApiKeyResponse.model_validate(key) for key in keys])


@router.post("/", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
async def create_new_api_key(
    data: ApiKeyCreate,
    current_user: User = Depends(get_password_session_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        api_key, raw_key = await create_api_key(db, current_user, data.name)
    except ApiKeyError as e:
        raise _http_error(e)
    return ApiKeyCreated(**ApiKeyResponse.model_validate(api_key).model_dump(), key=raw_key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_existing_api_key(
    key_id: str,
    current_user: User = Depends(get_password_session_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        await delete_api_key(db, redis, current_user.id, key_id)
    except ApiKeyError as e:
        raise _http_error(e)
