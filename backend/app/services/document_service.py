"""Document service: load, save with optimistic locking."""

import json

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.document import Document
from app.models.project import Project
from app.schemas.document import DocumentUpdate

MAX_DOCUMENT_BYTES = 5 * 1024 * 1024


def ensure_document_size(values: dict) -> None:
    if len(json.dumps(values, ensure_ascii=False, default=str).encode("utf-8")) > MAX_DOCUMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={"error": "document_too_large", "error_description": "Документ проекта превышает 5 МБ."},
        )


async def _get_project_or_404(db: AsyncSession, project_id: str, user_id: str) -> Project:
    """Verify project exists and belongs to user."""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return project


async def get_document(db: AsyncSession, project_id: str, user_id: str) -> Document:
    """
    Get the document for a project.
    If no document exists yet, create one lazily.
    """
    await _get_project_or_404(db, project_id, user_id)

    result = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()

    if doc is None:
        doc = Document(
            project_id=project_id,
            components={},
            timeline=[],
            doc_metadata={},
            version=1,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)

    return doc


async def get_document_version(db: AsyncSession, project_id: str, user_id: str) -> int:
    await _get_project_or_404(db, project_id, user_id)
    result = await db.execute(select(Document.version).where(Document.project_id == project_id))
    return result.scalar_one_or_none() or 0


async def save_document(
    db: AsyncSession, project_id: str, user_id: str, update_data: DocumentUpdate
) -> Document:
    """
    Save document changes with optimistic locking.
    Returns 409 if version mismatch.
    """
    await _get_project_or_404(db, project_id, user_id)

    # Build the update dict from non-None fields
    # Note: schema uses 'metadata', DB column is also 'metadata',
    # but the model attribute is 'doc_metadata' (metadata is reserved in SQLAlchemy).
    values: dict = {}
    schema_to_column = {"components": "components", "timeline": "timeline", "metadata": "doc_metadata"}
    for schema_field, col_name in schema_to_column.items():
        val = getattr(update_data, schema_field)
        if val is not None:
            values[col_name] = val

    if not values:
        # Nothing to update — return current doc
        return await get_document(db, project_id, user_id)
    ensure_document_size(values)

    # Atomic UPDATE with version check
    import datetime as _dt
    from datetime import timezone

    now = _dt.datetime.now(timezone.utc)
    expected_version = update_data.version
    new_version = expected_version + 1

    stmt = (
        update(Document)
        .where(Document.project_id == project_id, Document.version == expected_version)
        .values(**values, version=new_version, updated_at=now)
    )
    result = await db.execute(stmt)
    if result.rowcount == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "version_conflict", "error_description": "Document was modified by another session."},
        )

    await db.commit()

    # Fetch the updated document
    doc_result = await db.execute(
        select(Document).where(Document.project_id == project_id)
    )
    doc = doc_result.scalar_one()
    return doc
