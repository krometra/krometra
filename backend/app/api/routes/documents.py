"""Document routes: get and save project document state."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import DocumentRoute
from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.document import DocumentResponse, DocumentUpdate, DocumentVersionResponse
from app.services.document_service import get_document, get_document_version, save_document

router = APIRouter(prefix="/projects", tags=["documents"], route_class=DocumentRoute)


@router.get("/{project_id}/document", response_model=DocumentResponse)
async def get_project_document(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get (or lazily create) the document for a project."""
    doc = await get_document(db, project_id, current_user.id)
    return DocumentResponse.model_validate(doc)


@router.get("/{project_id}/document/version", response_model=DocumentVersionResponse)
async def get_project_document_version(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return DocumentVersionResponse(version=await get_document_version(db, project_id, current_user.id))


@router.put("/{project_id}/document", response_model=DocumentResponse)
async def update_project_document(
    project_id: str,
    data: DocumentUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Save document changes with optimistic locking."""
    try:
        doc = await save_document(db, project_id, current_user.id, data)
        return DocumentResponse.model_validate(doc)
    except HTTPException:
        raise
