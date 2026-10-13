from fastapi import APIRouter, FastAPI, Form
from fastapi.testclient import TestClient

from app.api.browser_upload_route import BrowserUploadRoute


def _client(route_class=None) -> TestClient:
    router = APIRouter(route_class=route_class) if route_class else APIRouter()

    @router.post("/upload")
    async def upload(mesh: str = Form(...)):
        return {"size": len(mesh)}

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_browser_route_accepts_mesh_field_over_one_megabyte():
    mesh = "x" * (3 * 1024 * 1024)
    response = _client(BrowserUploadRoute).post("/upload", files={"mesh": (None, mesh)})
    assert response.status_code == 200
    assert response.json() == {"size": len(mesh)}


def test_default_route_rejects_same_field():
    response = _client().post("/upload", files={"mesh": (None, "x" * (3 * 1024 * 1024))})
    assert response.status_code == 400
