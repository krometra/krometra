from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel

AdminUserSort = Literal[
    "email", "display_name", "created_at", "is_admin", "projects", "storage_bytes", "operations",
    "last_activity_at", "last_seen_at",
]
AdminProjectSort = Literal[
    "name", "owner_email", "created_at", "updated_at", "storage_bytes", "operations", "bodies", "sketches",
    "document_version",
]
SortOrder = Literal["asc", "desc"]


class AdminUserStats(BaseModel):
    total: int
    new: int
    admins: int
    active_1d: int
    active_7d: int
    active_30d: int


class AdminProjectStats(BaseModel):
    total: int
    new: int
    storage_bytes: int
    with_bodies: int
    empty: int
    operations_total: int
    avg_operations: float


class AdminApiKeyStats(BaseModel):
    keys: int
    users: int
    active_users: int


class AdminOperationStat(BaseModel):
    kind: str
    count: int
    projects: int
    period_count: int


class AdminDailyPoint(BaseModel):
    date: date
    registrations: int
    projects: int
    active_users: int
    operations: int


class AdminOverview(BaseModel):
    period_days: int
    since: datetime
    generated_at: datetime
    users: AdminUserStats
    projects: AdminProjectStats
    api_keys: AdminApiKeyStats
    operations: list[AdminOperationStat]
    series: list[AdminDailyPoint]


class AdminUserRow(BaseModel):
    id: str
    email: str
    display_name: str
    created_at: datetime
    is_admin: bool
    auth_methods: list[str]
    projects: int
    storage_bytes: int
    operations: int
    last_activity_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    api_keys: int


class AdminUserPage(BaseModel):
    items: list[AdminUserRow]
    total: int
    limit: int
    offset: int


class AdminKindCount(BaseModel):
    kind: str
    count: int


class AdminProjectRow(BaseModel):
    id: str
    name: str
    owner_id: str
    owner_email: str
    created_at: datetime
    updated_at: datetime
    storage_bytes: int
    document_version: Optional[int] = None
    operations: int
    sketches: int
    bodies: int
    top_operations: list[AdminKindCount]


class AdminProjectPage(BaseModel):
    items: list[AdminProjectRow]
    total: int
    limit: int
    offset: int


class AdminUserRoleUpdate(BaseModel):
    is_admin: bool


class AdminUserRole(BaseModel):
    id: str
    email: str
    is_admin: bool

    model_config = {"from_attributes": True}
