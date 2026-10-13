"""Sketch routes: save and load 2D sketches within project documents."""

import uuid
import datetime as _dt
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.browser_upload_route import DocumentRoute
from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.sketch import SketchData, SketchSaveResponse
from app.services.document_service import get_document, save_document
from app.services.geometry_ops import next_label
from app.schemas.document import DocumentUpdate
from app.schemas.ids import is_component_id

router = APIRouter(prefix="/projects", tags=["sketches"], route_class=DocumentRoute)


@router.put("/{project_id}/sketches/{sketch_id}", response_model=SketchSaveResponse)
async def save_sketch(
    project_id: str,
    sketch_id: str,
    data: SketchData,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Save sketch data into document.components[sketch_id]."""
    if not is_component_id(sketch_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_sketch_id", "error_description": "Некорректный идентификатор эскиза."},
        )
    # Load current document (verifies project ownership via document_service)
    doc = await get_document(db, project_id, current_user.id)

    # Serialize sketch data and store in components
    components = dict(doc.components) if doc.components else {}
    components[sketch_id] = data.model_dump()

    # Append/update timeline entry
    doc_timeline = list(doc.timeline or [])
    existing_entry = next((e for e in doc_timeline if e.get("sketch_id") == sketch_id), None)
    if existing_entry:
        existing_entry["entity_count"] = len(data.entities)
        existing_entry["timestamp"] = _dt.datetime.now(timezone.utc).isoformat()
    else:
        doc_timeline.append({
            "id": f"tl-{uuid.uuid4().hex[:12]}",
            "timestamp": _dt.datetime.now(timezone.utc).isoformat(),
            "kind": "sketch",
            "label": next_label(doc_timeline, "sketch"),
            "sketch_id": sketch_id,
            "plane": data.plane,
            "entity_count": len(data.entities),
            "status": "ok",
        })

    # Save with optimistic locking using current document version
    update_data = DocumentUpdate(components=components, timeline=doc_timeline, version=doc.version)
    try:
        updated_doc = await save_document(db, project_id, current_user.id, update_data)
    except HTTPException:
        raise

    return SketchSaveResponse(sketch_id=sketch_id, version=updated_doc.version)


@router.get("/{project_id}/sketches/{sketch_id}", response_model=SketchData)
async def load_sketch(
    project_id: str,
    sketch_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Load sketch data from document.components[sketch_id]."""
    doc = await get_document(db, project_id, current_user.id)

    components = doc.components or {}
    sketch_raw = components.get(sketch_id)

    if sketch_raw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "sketch_not_found", "error_description": f"Sketch '{sketch_id}' not found."},
        )

    return SketchData(**sketch_raw)
