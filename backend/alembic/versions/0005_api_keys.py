"""api keys

Revision ID: 0005_api_keys
Revises: 0004_project_storage_bytes
Create Date: 2026-10-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_api_keys"
down_revision: Union[str, None] = "0004_project_storage_bytes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("prefix", sa.String(16), nullable=False),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_api_keys_user_id", "api_keys", ["user_id"])
    op.create_index("ix_api_keys_key_hash", "api_keys", ["key_hash"], unique=True)

    op.add_column("refresh_tokens", sa.Column("api_key_id", sa.String(32), nullable=True))
    op.create_foreign_key(
        "refresh_tokens_api_key_id_fkey", "refresh_tokens", "api_keys", ["api_key_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_refresh_tokens_api_key_id", "refresh_tokens", ["api_key_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_api_key_id", table_name="refresh_tokens")
    op.drop_constraint("refresh_tokens_api_key_id_fkey", "refresh_tokens", type_="foreignkey")
    op.drop_column("refresh_tokens", "api_key_id")
    op.drop_index("ix_api_keys_key_hash", table_name="api_keys")
    op.drop_index("ix_api_keys_user_id", table_name="api_keys")
    op.drop_table("api_keys")
