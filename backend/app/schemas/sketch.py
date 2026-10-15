"""Sketch schemas for 2D sketcher."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class SketchPoint(BaseModel):
    """A 2D point in sketch space."""
    x: float = 0.0
    y: float = 0.0


class SketchEntityBase(BaseModel):
    """Base class for all sketch entities."""
    id: str
    type: str


class SketchLine(SketchEntityBase):
    """A line segment defined by start and end points."""
    type: Literal["line"] = "line"
    start: SketchPoint = Field(default_factory=SketchPoint)
    end: SketchPoint = Field(default_factory=SketchPoint)
    construction: bool = False


class SketchInfiniteLine(SketchEntityBase):
    """An infinite construction line through a point at an angle (radians)."""
    type: Literal["infline"] = "infline"
    point: SketchPoint = Field(default_factory=SketchPoint)
    angle: float = 0.0


class SketchCircle(SketchEntityBase):
    """A circle defined by center point and radius."""
    type: Literal["circle"] = "circle"
    center: SketchPoint = Field(default_factory=SketchPoint)
    radius: float = 0.0
    construction: bool = False


class SketchArc(SketchEntityBase):
    """An arc defined by center, radius, start angle and end angle (in radians)."""
    type: Literal["arc"] = "arc"
    center: SketchPoint = Field(default_factory=SketchPoint)
    radius: float = 0.0
    startAngle: float = 0.0
    endAngle: float = 0.0
    construction: bool = False


class SketchRectangle(SketchEntityBase):
    """A rectangle defined by two opposite corners."""
    type: Literal["rectangle"] = "rectangle"
    corner1: SketchPoint = Field(default_factory=SketchPoint)
    corner2: SketchPoint = Field(default_factory=SketchPoint)


SketchEntity = SketchLine | SketchCircle | SketchArc | SketchRectangle | SketchInfiniteLine

SketchPlane = Literal["XY", "XZ", "YZ"]


# --- Constraints ---

class ConstraintType(str, Enum):
    # Geometric
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"
    COINCIDENT = "coincident"
    PARALLEL = "parallel"
    PERPENDICULAR = "perpendicular"
    EQUAL = "equal"
    # Dimensional
    DISTANCE = "distance"
    RADIUS = "radius"
    ANGLE = "angle"


class ConstraintRef(BaseModel):
    """Reference to a point or entity as a constraint anchor."""
    entity_id: str
    sub_index: int = 0


class SketchConstraint(BaseModel):
    """A single constraint."""
    id: str
    type: ConstraintType
    anchors: list[ConstraintRef] = Field(default_factory=list)
    value: float | None = None


class PlaneBasis(BaseModel):
    """Arbitrary sketch coordinate system: world = origin + u*x + v*y."""
    origin: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    u: list[float] = Field(default_factory=lambda: [1.0, 0.0, 0.0])
    v: list[float] = Field(default_factory=lambda: [0.0, 1.0, 0.0])
    n: list[float] = Field(default_factory=lambda: [0.0, 0.0, 1.0])


class SketchData(BaseModel):
    """Complete sketch data for a plane."""
    plane: SketchPlane = "XY"
    plane_offset: float = 0.0
    plane_basis: PlaneBasis | None = None
    ref_body_id: str | None = None
    ref_face_id: str | int | None = None  # logical name (str) or physical index (int, legacy)
    entities: list[SketchEntity] = Field(default_factory=list)
    constraints: list[SketchConstraint] = Field(default_factory=list)


SKETCH_PRESENTATION_FIELDS = ("visible",)


def sketch_component(data: SketchData, previous: object) -> dict:
    kept = {field: previous[field] for field in SKETCH_PRESENTATION_FIELDS if isinstance(previous, dict) and field in previous}
    return {**data.model_dump(), **kept}


class SketchSaveResponse(BaseModel):
    """Response after saving a sketch."""
    sketch_id: str
    version: int
