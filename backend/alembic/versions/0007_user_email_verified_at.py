"""user email_verified_at

Revision ID: 0007_user_email_verified_at
Revises: 0006_user_is_admin
Create Date: 2026-10-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_user_email_verified_at"
down_revision: Union[str, None] = "0006_user_is_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET email_verified_at = created_at")


def downgrade() -> None:
    op.drop_column("users", "email_verified_at")
