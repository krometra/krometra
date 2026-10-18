import logging
from dataclasses import dataclass
from email.message import EmailMessage

import aiosmtplib
from fastapi import BackgroundTasks

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str
    html: str


def build_message(email: Email) -> EmailMessage:
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = email.to
    message["Subject"] = email.subject
    message.set_content(email.text)
    message.add_alternative(email.html, subtype="html")
    return message


async def send_email(email: Email) -> None:
    if not settings.SMTP_HOST:
        _log_unsent(email)
        return
    try:
        await aiosmtplib.send(
            build_message(email),
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME or None,
            password=settings.SMTP_PASSWORD or None,
            use_tls=settings.SMTP_SECURITY == "ssl",
            start_tls=settings.SMTP_SECURITY == "starttls",
            timeout=settings.SMTP_TIMEOUT_SECONDS,
        )
    except Exception:
        logger.exception("Письмо не отправлено: %s, тема «%s»", email.to, email.subject)


def _log_unsent(email: Email) -> None:
    if settings.DEBUG:
        logger.warning("SMTP_HOST не задан, письмо для %s не отправлено:\n%s\n%s", email.to, email.subject, email.text)
    else:
        logger.warning("SMTP_HOST не задан, письмо для %s не отправлено: «%s»", email.to, email.subject)


class Outbox:
    def __init__(self, tasks: BackgroundTasks):
        self._tasks = tasks

    def send(self, email: Email) -> None:
        self._tasks.add_task(send_email, email)
