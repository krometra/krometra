import hashlib
from email.message import EmailMessage

import pytest

from app.config import get_settings
from app.core import email_tokens, mailer
from app.core.email_tokens import EMAIL_VERIFICATION, PASSWORD_RESET
from app.core.mailer import Email
from app.services import account_emails
from tests.fakes import FakeRedis

settings = get_settings()


@pytest.fixture
def redis():
    return FakeRedis()


class TestEmailTokens:
    pytestmark = pytest.mark.asyncio

    async def test_only_hash_is_stored(self, redis):
        raw = await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        assert len(raw) >= 40
        digest = hashlib.sha256(raw.encode()).hexdigest()
        assert redis.data == {f"email_token:verify_email:{digest}": "user-1"}
        assert all(raw not in key and raw != value for key, value in redis.data.items())

    async def test_token_is_single_use(self, redis):
        raw = await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        assert await email_tokens.consume(redis, EMAIL_VERIFICATION, raw) == "user-1"
        assert await email_tokens.consume(redis, EMAIL_VERIFICATION, raw) is None

    async def test_purposes_do_not_mix(self, redis):
        raw = await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        assert await email_tokens.consume(redis, PASSWORD_RESET, raw) is None
        assert await email_tokens.consume(redis, EMAIL_VERIFICATION, raw) == "user-1"

    async def test_ttl_per_purpose(self, redis):
        await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        await email_tokens.issue(redis, PASSWORD_RESET, "user-1")
        ttl = {key.split(":")[1]: value for key, value in redis.expiry.items() if key.startswith("email_token:")}
        assert ttl == {"verify_email": 24 * 3600, "password_reset": 3600}

    async def test_expired_token_is_rejected(self, redis):
        raw = await email_tokens.issue(redis, PASSWORD_RESET, "user-1")
        redis.data.clear()
        assert await email_tokens.consume(redis, PASSWORD_RESET, raw) is None

    async def test_new_reset_token_invalidates_previous(self, redis):
        first = await email_tokens.issue(redis, PASSWORD_RESET, "user-1")
        second = await email_tokens.issue(redis, PASSWORD_RESET, "user-1")
        assert await email_tokens.consume(redis, PASSWORD_RESET, first) is None
        assert await email_tokens.consume(redis, PASSWORD_RESET, second) == "user-1"
        assert redis.data == {}

    async def test_verification_tokens_stay_valid_after_resend(self, redis):
        first = await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        second = await email_tokens.issue(redis, EMAIL_VERIFICATION, "user-1")
        assert await email_tokens.consume(redis, EMAIL_VERIFICATION, first) == "user-1"
        assert await email_tokens.consume(redis, EMAIL_VERIFICATION, second) == "user-1"

    async def test_revoke_drops_outstanding_reset_token(self, redis):
        raw = await email_tokens.issue(redis, PASSWORD_RESET, "user-1")
        await email_tokens.revoke(redis, PASSWORD_RESET, "user-1")
        assert await email_tokens.consume(redis, PASSWORD_RESET, raw) is None

    async def test_real_redis_applies_ttl_and_single_use(self, redis_client):
        raw = await email_tokens.issue(redis_client, PASSWORD_RESET, "user-1")
        [key] = await redis_client.keys("email_token:password_reset:*")
        assert 3500 < await redis_client.ttl(key) <= 3600
        assert await email_tokens.consume(redis_client, PASSWORD_RESET, raw) == "user-1"
        assert await email_tokens.consume(redis_client, PASSWORD_RESET, raw) is None
        assert await redis_client.keys("email_token*") == []


class TestTemplates:
    @pytest.fixture(autouse=True)
    def public_url(self, monkeypatch):
        monkeypatch.setattr(account_emails.settings, "PUBLIC_URL", "https://krometra.ru/")

    def test_verification_link(self):
        email = account_emails.verification_email("a@example.com", "tok-1")
        assert email.to == "a@example.com"
        assert "https://krometra.ru/verify-email?token=tok-1" in email.text
        assert 'href="https://krometra.ru/verify-email?token=tok-1"' in email.html

    def test_reset_link_mentions_hour(self):
        email = account_emails.password_reset_email("a@example.com", "tok-2")
        assert "https://krometra.ru/reset-password?token=tok-2" in email.text
        assert "1 час" in email.text

    def test_password_changed_points_to_recovery(self):
        email = account_emails.password_changed_email("a@example.com")
        assert "https://krometra.ru/forgot-password" in email.text
        assert "не вы" in email.text

    def test_html_escapes_address(self):
        email = account_emails.password_changed_email("<b>@example.com")
        assert "<b>@" not in email.html


SAMPLE = Email(to="a@example.com", subject="Тема", text="Текст", html="<p>Текст</p>")


class TestMailer:
    def test_message_has_text_and_html(self):
        message = mailer.build_message(SAMPLE)
        assert isinstance(message, EmailMessage)
        assert message["From"] == settings.SMTP_FROM
        assert message["To"] == "a@example.com"
        types = [part.get_content_type() for part in message.iter_parts()]
        assert types == ["text/plain", "text/html"]

    @pytest.mark.asyncio
    async def test_without_host_nothing_is_sent(self, monkeypatch):
        async def must_not_send(*_args, **_kwargs):
            raise AssertionError("SMTP must not be used")

        monkeypatch.setattr(mailer.settings, "SMTP_HOST", "")
        monkeypatch.setattr(mailer.aiosmtplib, "send", must_not_send)
        await mailer.send_email(SAMPLE)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("security", "use_tls", "start_tls"), [("ssl", True, False), ("starttls", False, True), ("none", False, False)])
    async def test_security_modes(self, monkeypatch, security, use_tls, start_tls):
        calls = []

        async def fake_send(message, **kwargs):
            calls.append(kwargs)

        monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(mailer.settings, "SMTP_SECURITY", security)
        monkeypatch.setattr(mailer.aiosmtplib, "send", fake_send)
        await mailer.send_email(SAMPLE)
        [kwargs] = calls
        assert (kwargs["hostname"], kwargs["use_tls"], kwargs["start_tls"]) == ("smtp.example.com", use_tls, start_tls)
        assert kwargs["username"] is None

    @pytest.mark.asyncio
    async def test_smtp_failure_is_logged_not_raised(self, monkeypatch, caplog):
        async def broken(*_args, **_kwargs):
            raise OSError("connection refused")

        monkeypatch.setattr(mailer.settings, "SMTP_HOST", "smtp.example.com")
        monkeypatch.setattr(mailer.aiosmtplib, "send", broken)
        await mailer.send_email(SAMPLE)
        assert "Письмо не отправлено" in caplog.text
