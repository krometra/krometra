from app.main import app


def test_document_version_route_is_registered():
    path = app.openapi()["paths"]["/api/projects/{project_id}/document/version"]
    assert path["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("/DocumentVersionResponse")
