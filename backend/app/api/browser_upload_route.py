from collections.abc import Callable

from fastapi import HTTPException, Request, status
from fastapi.routing import APIRoute
from starlette.types import Message, Receive

from app.services.document_service import MAX_DOCUMENT_BYTES
from app.services.geometry_ops.limits import (
    MAX_IMPORT_BODIES,
    MAX_MESH_BYTES,
    MAX_REBUILD_BODIES,
    MAX_REBUILD_UPLOAD_BYTES,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_FIELDS,
)


def request_too_large(max_bytes: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail={"error": "request_too_large", "error_description": f"Запрос превышает {max_bytes // (1024 * 1024)} МБ."},
    )


def limited_receive(receive: Receive, max_bytes: int) -> Receive:
    received = 0

    async def receive_within_limit() -> Message:
        nonlocal received
        message = await receive()
        if message["type"] == "http.request":
            received += len(message.get("body", b""))
            if received > max_bytes:
                raise request_too_large(max_bytes)
        return message

    return receive_within_limit


def body_limited_route(max_bytes: int, request_class: type[Request] = Request) -> type[APIRoute]:
    class BodyLimitedRoute(APIRoute):
        def get_route_handler(self) -> Callable:
            handler = super().get_route_handler()

            async def limited_handler(request: Request):
                declared = request.headers.get("content-length", "")
                if declared.isdigit() and int(declared) > max_bytes:
                    raise request_too_large(max_bytes)
                return await handler(request_class(request.scope, limited_receive(request.receive, max_bytes)))

            return limited_handler

    return BodyLimitedRoute


def browser_upload_request(max_files: int, max_fields: int) -> type[Request]:
    class BrowserUploadRequest(Request):
        """Меш browser-операции приходит текстовым полем multipart, а Starlette по умолчанию режет поля на 1 МБ."""

        def form(self, *, max_files: int | float = max_files, max_fields: int | float = max_fields, max_part_size: int = MAX_MESH_BYTES):
            return super().form(max_files=max_files, max_fields=max_fields, max_part_size=max_part_size)

    return BrowserUploadRequest


BrowserUploadRoute = body_limited_route(MAX_UPLOAD_BYTES, browser_upload_request(1, MAX_UPLOAD_FIELDS))
BrowserRebuildRoute = body_limited_route(
    MAX_REBUILD_UPLOAD_BYTES,
    browser_upload_request(MAX_REBUILD_BODIES, 8 + 2 * MAX_REBUILD_BODIES),
)
BrowserImportRoute = body_limited_route(
    MAX_REBUILD_UPLOAD_BYTES,
    browser_upload_request(MAX_IMPORT_BODIES + 1, 2 + 2 * (MAX_IMPORT_BODIES + 1)),
)
DocumentRoute = body_limited_route(MAX_DOCUMENT_BYTES + 64 * 1024)
