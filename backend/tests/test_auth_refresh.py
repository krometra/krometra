"""
Tests for refresh-token family tracking and replay detection.

Regression: rotation used to call add_token_to_family twice — once with a
placeholder jti to "probe" for replay, once to commit. The probe itself marked
the previous token replaced, so the commit call saw a replaced token and
reported "replay" on the *first legitimate refresh* of every session, deleting
the family. After that the family was gone, so genuine replay went undetected.

Replay must be decided by the status of the presented token.
"""

import asyncio
import json

import pytest

from app.core.security import (
    generate_refresh_token,
    hash_refresh_token,
    invalidate_family,
    rotate_refresh_family,
    store_refresh_family,
)


@pytest.fixture
def redis(redis_client):
    return redis_client


async def _family(redis, family_id="fam"):
    raw = await redis.get(f"refresh_family:{family_id}")
    return json.loads(raw) if raw else None


async def _statuses(redis, family_id="fam"):
    data = await _family(redis, family_id)
    return {t["jti"]: t["status"] for t in data["tokens"]}


class TestFamilyRotation:
    """Async: rotation talks to Redis."""

    pytestmark = pytest.mark.asyncio

    async def test_first_refresh_is_not_replay(self, redis):
        """The core regression: a session's first refresh must succeed."""
        await store_refresh_family(redis, "fam", "tok1", "user1")
        result = await rotate_refresh_family(redis, "fam", "tok1", "tok2")
        assert result == "user1"
        assert await _family(redis) is not None

    async def test_repeated_legitimate_rotations_succeed(self, redis):
        """Long-lived sessions rotate many times; none of it is replay."""
        await store_refresh_family(redis, "fam", "tok0", "user1")
        current = "tok0"
        for i in range(1, 11):
            nxt = f"tok{i}"
            assert await rotate_refresh_family(redis, "fam", current, nxt) == "user1"
            current = nxt

    async def test_rotation_marks_presented_replaced_and_new_active(self, redis):
        await store_refresh_family(redis, "fam", "tok1", "user1")
        await rotate_refresh_family(redis, "fam", "tok1", "tok2")
        assert await _statuses(redis) == {"tok1": "replaced", "tok2": "active"}

    async def test_replay_of_rotated_token_is_detected(self, redis):
        """Reusing an already-rotated token is the actual attack."""
        await store_refresh_family(redis, "fam", "tok1", "user1")
        await rotate_refresh_family(redis, "fam", "tok1", "tok2")
        assert await rotate_refresh_family(redis, "fam", "tok1", "tok3") == "replay"

    async def test_replay_invalidates_the_whole_family(self, redis):
        await store_refresh_family(redis, "fam", "tok1", "user1")
        await rotate_refresh_family(redis, "fam", "tok1", "tok2")
        await rotate_refresh_family(redis, "fam", "tok1", "tok3")
        assert await _family(redis) is None

    async def test_replay_detected_after_many_rotations(self, redis):
        """Replay stays detectable deep into a session's history."""
        await store_refresh_family(redis, "fam", "tok0", "user1")
        for i in range(1, 6):
            await rotate_refresh_family(redis, "fam", f"tok{i - 1}", f"tok{i}")
        # An attacker replays a token captured early in the session.
        assert await rotate_refresh_family(redis, "fam", "tok2", "evil") == "replay"
        assert await _family(redis) is None

    async def test_unknown_token_is_treated_as_replay(self, redis):
        await store_refresh_family(redis, "fam", "tok1", "user1")
        assert await rotate_refresh_family(redis, "fam", "forged", "tok2") == "replay"
        assert await _family(redis) is None

    async def test_null_jti_never_matches(self, redis):
        """Regression: login stored jti=None (id assigned only on flush), so a
        real token id could never match and every refresh looked like replay."""
        await store_refresh_family(redis, "fam", None, "user1")
        assert await rotate_refresh_family(redis, "fam", "tok1", "tok2") == "replay"

    async def test_missing_family_returns_none(self, redis):
        assert await rotate_refresh_family(redis, "ghost", "tok1", "tok2") is None

    async def test_invalidated_family_cannot_rotate(self, redis):
        await store_refresh_family(redis, "fam", "tok1", "user1")
        await invalidate_family(redis, "fam")
        assert await rotate_refresh_family(redis, "fam", "tok1", "tok2") is None

    async def test_families_are_independent(self, redis):
        """Replay in one session must not disturb another device's session."""
        await store_refresh_family(redis, "famA", "a1", "user1")
        await store_refresh_family(redis, "famB", "b1", "user1")
        await rotate_refresh_family(redis, "famA", "a1", "a2")
        await rotate_refresh_family(redis, "famA", "a1", "a3")  # replay in A
        assert await _family(redis, "famA") is None
        assert await rotate_refresh_family(redis, "famB", "b1", "b2") == "user1"

    async def test_concurrent_rotations_of_one_token_are_serialized(self, redis):
        await store_refresh_family(redis, "fam", "tok1", "user1")
        results = await asyncio.gather(
            *(rotate_refresh_family(redis, "fam", "tok1", f"new{i}") for i in range(10))
        )
        assert results.count("user1") == 1
        assert results.count("replay") + results.count(None) == 9


class TestTokenPrimitives:
    def test_refresh_tokens_are_unique_and_hashed(self):
        a, b = generate_refresh_token(), generate_refresh_token()
        assert a != b
        assert hash_refresh_token(a) != hash_refresh_token(b)
        # Hashing is deterministic and never stores the raw token.
        assert hash_refresh_token(a) == hash_refresh_token(a)
        assert a not in hash_refresh_token(a)
        assert len(hash_refresh_token(a)) == 64
