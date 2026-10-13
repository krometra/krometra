"""Document model: stores CAD document state per project."""

from __future__ import annotations

from sqlalchemy import DateTime, String, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, new_uuid, utcnow


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_uuid)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    components: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    timeline: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    doc_metadata: Mapped[dict] = mapped_column("metadata", JSONB, default=dict, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), default=utcnow)
    updated_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow, default=utcnow
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="document")
