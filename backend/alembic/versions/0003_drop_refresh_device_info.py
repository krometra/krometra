"""drop_refresh_device_info

Revision ID: 0003_drop_refresh_device_info
Revises: 0002_add_documents
Create Date: 2026-09-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_drop_refresh_device_info"
down_revision: Union[str, None] = "0002_add_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("refresh_tokens", "device_info")


def downgrade() -> None:
    op.add_column("refresh_tokens", sa.Column("device_info", sa.String(512), nullable=True))
