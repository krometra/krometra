from __future__ import annotations

from typing import Optional

from sqlalchemy import DateTime, String, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, new_uuid, utcnow


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # "yandex", "google", "github"
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    access_token: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    token_expires_at: Mapped[Optional[DateTime]] = mapped_column(DateTime(timezone=True), nullable=True)
    linked_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="oauth_accounts")
