"""Схемы меша и ответов на сохранение геометрии браузерного ядра."""

from pydantic import BaseModel, Field


class BrepTopoEdge(BaseModel):
    edge_id: int | str
    vertices: list[int]
    polyline: list[float] = Field(default_factory=list)


class BrepTopoFace(BaseModel):
    face_id: int | str
    edges: list[int | str]


class BrepTopo(BaseModel):
    faces: list[BrepTopoFace]
    edges: list[BrepTopoEdge]


class BBox(BaseModel):
    min: list[float]  # length 3
    max: list[float]  # length 3


class MeshResponse(BaseModel):
    vertices: list[float]
    indices: list[int]
    brep_topo: BrepTopo
    bbox: BBox
    face_triangle_map: list[int | str]  # face_id per triangle (len = len(indices) / 3)


class ExtrudeResponse(BaseModel):
    body_id: str
    mesh: MeshResponse
    hidden_body_ids: list[str] = Field(default_factory=list)


class RevolveResponse(BaseModel):
    body_id: str
    mesh: MeshResponse


class BooleanResponse(BaseModel):
    result_body_id: str
    mesh: MeshResponse


class ImportedBodyResponse(BaseModel):
    body_id: str
    mesh: MeshResponse


class ImportResponse(BaseModel):
    bodies: list[ImportedBodyResponse]


class PatternResponse(BaseModel):
    bodies: list[ImportedBodyResponse]
    hidden_body_ids: list[str]


class ThreadResponse(BaseModel):
    body_id: str
    mesh: MeshResponse
    external: bool
    diameter: float
    length: float
    pitch: float
    depth: float
    starts: int


class HoleResponse(BaseModel):
    body_id: str
    mesh: MeshResponse
    hole_count: int
