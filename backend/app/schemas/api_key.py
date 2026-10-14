from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, StringConstraints


class ApiKeyCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ApiKeyCreated(ApiKeyResponse):
    key: str


class ApiKeyListResponse(BaseModel):
    api_keys: list[ApiKeyResponse]
