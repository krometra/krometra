"""project storage_bytes

Revision ID: 0004_project_storage_bytes
Revises: 0003_drop_refresh_device_info
Create Date: 2026-09-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_project_storage_bytes"
down_revision: Union[str, None] = "0003_drop_refresh_device_info"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("storage_bytes", sa.BigInteger(), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    op.drop_column("projects", "storage_bytes")
