from types import SimpleNamespace

import jwt
import pytest
from pydantic import ValidationError

from app.core import security
from app.schemas.auth import RegisterRequest, TokenResponse
from app.services import auth_service
from app.services.auth_service import AuthError


class TestRegisterRequest:
    def test_email_is_normalized(self):
        data = RegisterRequest(email="  Foo.Bar@Example.COM ", password="long-enough")
        assert data.email == "foo.bar@example.com"

    def test_display_name_is_bounded(self):
        with pytest.raises(ValidationError):
            RegisterRequest(email="a@example.com", password="long-enough", display_name="x" * 101)

    def test_password_over_72_bytes_is_rejected_not_truncated(self):
        with pytest.raises(ValidationError, match="72 байт"):
            RegisterRequest(email="a@example.com", password="пароль" * 7)

    def test_password_of_exactly_72_bytes_is_accepted(self):
        assert RegisterRequest(email="a@example.com", password="a" * 72)


def test_token_response_has_no_refresh_token():
    assert "refresh_token" not in TokenResponse.model_fields


class TestPasswordHashing:
    pytestmark = pytest.mark.asyncio

    async def test_roundtrip(self):
        hashed = await security.hash_password("s3cret-pass")
        assert await security.verify_password("s3cret-pass", hashed)
        assert not await security.verify_password("other-pass", hashed)


class _Result:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _Db:
    def __init__(self, user):
        self.user = user

    async def execute(self, _statement):
        return _Result(self.user)


@pytest.mark.asyncio
class TestCredentialCheck:
    async def test_unknown_user_still_runs_bcrypt(self, monkeypatch):
        calls = []

        async def burn(password):
            calls.append(password)

        monkeypatch.setattr(auth_service, "burn_password_check", burn)
        assert await auth_service._check_credentials(_Db(None), "ghost@example.com", "pw") is None
        assert calls == ["pw"]

    async def test_user_without_password_runs_bcrypt(self, monkeypatch):
        calls = []

        async def burn(password):
            calls.append(password)

        monkeypatch.setattr(auth_service, "burn_password_check", burn)
        user = SimpleNamespace(password_hash=None)
        assert await auth_service._check_credentials(_Db(user), "oauth@example.com", "pw") is None
        assert calls == ["pw"]

    async def test_valid_password(self):
        user = SimpleNamespace(password_hash=await security.hash_password("right-pass"))
        assert await auth_service._check_credentials(_Db(user), "u@example.com", "right-pass") is user
        assert await auth_service._check_credentials(_Db(user), "u@example.com", "wrong-pass") is None


@pytest.mark.asyncio
class TestAccessTokenErrors:
    async def test_garbage_token_hides_pyjwt_message(self):
        with pytest.raises(AuthError) as exc:
            await auth_service.get_current_user(_Db(None), "not-a-jwt")
        assert exc.value.error_description == "Invalid access token."

    async def test_foreign_signature_hides_pyjwt_message(self):
        forged = jwt.encode({"sub": "u", "type": "access"}, "x" * 64, algorithm="HS256")
        with pytest.raises(AuthError) as exc:
            await auth_service.get_current_user(_Db(None), forged)
        assert exc.value.error_description == "Invalid access token."
