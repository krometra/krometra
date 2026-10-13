from __future__ import annotations

from typing import Optional

from sqlalchemy import BigInteger, DateTime, String, ForeignKey, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, new_uuid, utcnow


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    thumbnail: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    storage_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow, default=utcnow
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="projects")
    document: Mapped["Document"] = relationship("Document", back_populates="project", cascade="all, delete-orphan", uselist=False)
