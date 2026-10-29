"""user personal_data_consent_at

Revision ID: 0008_user_pd_consent_at
Revises: 0007_user_email_verified_at
Create Date: 2026-10-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_user_pd_consent_at"
down_revision: Union[str, None] = "0007_user_email_verified_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("personal_data_consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "personal_data_consent_at")
