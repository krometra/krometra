from html import escape
from urllib.parse import urlencode

from app.config import get_settings
from app.core.mailer import Email

settings = get_settings()

GREETING = "Здравствуйте!"


def public_link(path: str, **query: str) -> str:
    base = settings.PUBLIC_URL.rstrip("/") + path
    return f"{base}?{urlencode(query)}" if query else base


def _paragraphs(lines: list[str]) -> str:
    return "".join(f"<p>{escape(line)}</p>" for line in lines)


def _email(to: str, subject: str, intro: list[str], link: str, link_text: str, outro: list[str]) -> Email:
    text = "\n\n".join([GREETING, *intro, link, *outro])
    anchor = f'<p><a href="{escape(link)}">{escape(link_text)}</a></p>'
    body = _paragraphs([GREETING, *intro]) + anchor + _paragraphs(outro)
    html = f'<!doctype html><html lang="ru"><body style="font-family:sans-serif;line-height:1.5">{body}</body></html>'
    return Email(to=to, subject=subject, text=text, html=html)


def verification_email(to: str, raw_token: str) -> Email:
    return _email(
        to,
        "Подтвердите почту в Крометре",
        [f"Подтвердите адрес {to} для аккаунта в Крометре, открыв ссылку:"],
        public_link("/verify-email", token=raw_token),
        "Подтвердить почту",
        ["Ссылка действует 24 часа. Если вы не регистрировались в Крометре, просто удалите это письмо."],
    )


def password_reset_email(to: str, raw_token: str) -> Email:
    return _email(
        to,
        "Восстановление пароля в Крометре",
        ["Чтобы задать новый пароль, откройте ссылку:"],
        public_link("/reset-password", token=raw_token),
        "Задать новый пароль",
        [
            "Ссылка действует 1 час и срабатывает один раз.",
            "Если вы не запрашивали восстановление, удалите это письмо: пароль останется прежним.",
        ],
    )


def password_changed_email(to: str) -> Email:
    return _email(
        to,
        "Пароль в Крометре изменён",
        [
            f"Пароль от аккаунта {to} только что изменён. Если это были вы, ничего делать не нужно.",
            "Если это были не вы, восстановите пароль:",
        ],
        public_link("/forgot-password"),
        "Восстановить пароль",
        [],
    )
