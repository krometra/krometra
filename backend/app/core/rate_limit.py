from dataclasses import dataclass
from functools import lru_cache
from ipaddress import ip_address, ip_network

from redis.asyncio import Redis

from app.config import get_settings

settings = get_settings()


class RateLimitExceeded(Exception):
    def __init__(self, retry_after: int, description: str):
        self.retry_after = retry_after
        self.description = description


@dataclass(frozen=True)
class Limit:
    prefix: str
    limit: int
    window_seconds: int
    message: str


LOGIN_FAILURES_BY_IP = Limit(
    "rl:login:ip", settings.LOGIN_IP_FAILURE_LIMIT, settings.LOGIN_IP_WINDOW_SECONDS, "Слишком много неудачных попыток входа"
)
LOGIN_FAILURES_BY_EMAIL = Limit(
    "rl:login:fail",
    settings.LOGIN_EMAIL_FAILURE_LIMIT,
    settings.LOGIN_EMAIL_WINDOW_SECONDS,
    "Слишком много неудачных попыток входа для этой почты",
)
REGISTER_BY_IP = Limit(
    "rl:register:ip", settings.REGISTER_IP_LIMIT, settings.REGISTER_IP_WINDOW_SECONDS, "Слишком много регистраций"
)
REFRESH_BY_IP = Limit(
    "rl:refresh:ip", settings.REFRESH_IP_LIMIT, settings.REFRESH_IP_WINDOW_SECONDS, "Слишком много запросов обновления сессии"
)

_HIT_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
"""


def _key(limit: Limit, subject: str) -> str:
    return f"{limit.prefix}:{subject}"


def _exceeded(limit: Limit, ttl: int) -> RateLimitExceeded:
    retry_after = max(int(ttl), 1)
    return RateLimitExceeded(retry_after, f"{limit.message}. Повторите через {retry_after} с.")


async def consume(redis: Redis, limit: Limit, subject: str) -> None:
    count, ttl = await redis.eval(_HIT_SCRIPT, 1, _key(limit, subject), limit.window_seconds)
    if int(count) > limit.limit:
        raise _exceeded(limit, ttl)


async def ensure_available(redis: Redis, limit: Limit, subject: str) -> None:
    key = _key(limit, subject)
    count = await redis.get(key)
    if count is not None and int(count) >= limit.limit:
        raise _exceeded(limit, await redis.ttl(key))


async def reset(redis: Redis, limit: Limit, subject: str) -> None:
    await redis.delete(_key(limit, subject))


@lru_cache()
def _parse_networks(raw: str) -> tuple:
    return tuple(ip_network(part.strip(), strict=False) for part in raw.split(",") if part.strip())


def _is_trusted(host: str, trusted_proxies: str) -> bool:
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return any(address in network for network in _parse_networks(trusted_proxies))


def resolve_client_ip(peer: str | None, headers, trusted_proxies: str) -> str:
    if not peer:
        return "unknown"
    if not _is_trusted(peer, trusted_proxies):
        return peer
    forwarded = [part.strip() for part in headers.get("x-forwarded-for", "").split(",") if part.strip()]
    for hop in reversed(forwarded):
        if not _is_trusted(hop, trusted_proxies):
            return hop
    real_ip = headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return forwarded[0] if forwarded else peer
