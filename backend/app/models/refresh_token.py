from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, DateTime, String, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, new_uuid, utcnow


class RefreshToken(Base):
    """Stores SHA-256 hashes of opaque refresh tokens.

    The raw token is stored in an httpOnly cookie on the client.
    Only the hash is stored in the database. Family tracking is handled in Redis.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    family_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    api_key_id: Mapped[Optional[str]] = mapped_column(
        String(32), ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=True, index=True
    )
    expires_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")
