"""Async MinIO storage client — wraps the synchronous minio SDK via run_in_executor."""

import asyncio
from concurrent.futures import ThreadPoolExecutor

from minio import Minio
from minio.deleteobjects import DeleteObject
from minio.error import S3Error

_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="minio")


class AsyncStorageClient:
    """Async wrapper around the synchronous minio SDK."""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket_name: str,
        secure: bool = False,
    ):
        self._client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
        )
        self._bucket_name = bucket_name
        self._loop = asyncio.get_running_loop()

    async def ensure_bucket(self) -> None:
        """Create the bucket if it does not exist (idempotent)."""
        loop = self._loop
        try:
            exists = await loop.run_in_executor(
                _EXECUTOR,
                self._client.bucket_exists,
                self._bucket_name,
            )
            if not exists:
                await loop.run_in_executor(
                    _EXECUTOR,
                    self._client.make_bucket,
                    self._bucket_name,
                )
        except S3Error as exc:
            raise RuntimeError(f"Failed to ensure bucket '{self._bucket_name}': {exc}") from exc

    async def put_object(self, key: str, data_bytes: bytes, content_type: str = "application/octet-stream") -> None:
        """Upload a blob to the bucket."""
        from io import BytesIO

        loop = self._loop
        try:
            await loop.run_in_executor(
                _EXECUTOR,
                self._client.put_object,
                self._bucket_name,
                key,
                BytesIO(data_bytes),
                len(data_bytes),
                content_type,
            )
        except S3Error as exc:
            raise RuntimeError(f"Failed to upload object '{key}': {exc}") from exc

    async def get_object(self, key: str) -> bytes | None:
        """Download a blob from the bucket. Returns None if the key does not exist."""
        loop = self._loop
        try:
            response = await loop.run_in_executor(
                _EXECUTOR,
                self._client.get_object,
                self._bucket_name,
                key,
            )
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except S3Error as exc:
            if exc.code == "NoSuchKey":
                return None
            raise RuntimeError(f"Failed to download object '{key}': {exc}") from exc

    async def delete_object(self, key: str) -> None:
        """Remove an object from the bucket (missing keys are ignored)."""
        loop = self._loop
        try:
            await loop.run_in_executor(
                _EXECUTOR,
                self._client.remove_object,
                self._bucket_name,
                key,
            )
        except S3Error:
            pass

    async def object_exists(self, key: str) -> bool:
        """Check whether an object exists in the bucket."""
        loop = self._loop
        try:
            obj = await loop.run_in_executor(
                _EXECUTOR,
                self._client.stat_object,
                self._bucket_name,
                key,
            )
            return obj is not None
        except S3Error:
            return False

    def _list_prefix(self, prefix: str) -> list:
        return list(self._client.list_objects(self._bucket_name, prefix=prefix, recursive=True))

    def _delete_prefix_sync(self, prefix: str) -> None:
        names = [DeleteObject(obj.object_name) for obj in self._list_prefix(prefix)]
        errors = list(self._client.remove_objects(self._bucket_name, names)) if names else []
        if errors:
            raise RuntimeError(f"Failed to delete objects under '{prefix}': {errors[0]}")

    async def delete_prefix(self, prefix: str) -> None:
        """Remove every object whose key starts with the prefix."""
        if not prefix.endswith("/"):
            raise ValueError("Prefix must end with '/'.")
        await self._loop.run_in_executor(_EXECUTOR, self._delete_prefix_sync, prefix)

    async def prefix_size(self, prefix: str) -> int:
        """Total size in bytes of the objects under the prefix."""
        objects = await self._loop.run_in_executor(_EXECUTOR, self._list_prefix, prefix)
        return sum(obj.size or 0 for obj in objects)
