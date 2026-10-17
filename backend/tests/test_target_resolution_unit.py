"""Unit tests for stale target body resolution (no backend/OCC needed)."""

import pytest
from fastapi import HTTPException

from app.services.geometry_ops.target_resolution import resolve_target_bodies, resolve_target_body


def body(visible=True, source=None):
    comp = {"type": "body", "visible": visible}
    if source is not None:
        comp["source"] = source
    return comp


def test_visible_body_resolves_to_itself():
    components = {"b1": body()}
    assert resolve_target_body(components, "b1") == "b1"


def test_body_without_visible_flag_counts_as_visible():
    components = {"b1": {"type": "body"}}
    assert resolve_target_body(components, "b1") == "b1"


def test_consumed_body_resolves_to_its_successor():
    """Классический случай: приклейка поглотила b1, живой результат — b2."""
    components = {
        "b1": body(visible=False),
        "b2": body(source={"kind": "extrude", "operation": "join", "target_body_id": "b1"}),
    }
    assert resolve_target_body(components, "b1") == "b2"


def test_resolution_follows_a_chain_of_operations():
    components = {
        "b1": body(visible=False),
        "b2": body(
            visible=False,
            source={"kind": "extrude", "operation": "join", "target_body_id": "b1"},
        ),
        "b3": body(source={"kind": "fillet", "target_body_id": "b2"}),
    }
    assert resolve_target_body(components, "b1") == "b3"


def test_boolean_successor_is_followed():
    components = {
        "t": body(visible=False),
        "tool": body(visible=False),
        "r": body(source={"kind": "boolean", "target_body_id": "t", "tool_body_id": "tool"}),
    }
    assert resolve_target_body(components, "t") == "r"


def test_consumed_body_without_successor_is_rejected():
    """Ветка оборвана — ошибка, а не тихое ветвление документа на два тела."""
    components = {"b1": body(visible=False)}
    with pytest.raises(HTTPException) as exc:
        resolve_target_body(components, "b1")
    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "stale_target_body"


def test_unknown_body_is_rejected():
    with pytest.raises(HTTPException) as exc:
        resolve_target_body({"b1": body()}, "nope")
    assert exc.value.status_code == 400
    assert exc.value.detail["error"] == "unknown_target_body"


def test_sketch_component_is_not_a_body():
    components = {"s1": {"type": "sketch"}}
    with pytest.raises(HTTPException) as exc:
        resolve_target_body(components, "s1")
    assert exc.value.detail["error"] == "unknown_target_body"


def test_empty_target_is_rejected():
    with pytest.raises(HTTPException) as exc:
        resolve_target_body({}, "")
    assert exc.value.detail["error"] == "target_required"


def test_cycle_in_history_does_not_hang():
    """Битая история не должна вешать сервер бесконечным циклом."""
    components = {
        "a": body(visible=False, source={"kind": "extrude", "target_body_id": "b"}),
        "b": body(visible=False, source={"kind": "extrude", "target_body_id": "a"}),
    }
    with pytest.raises(HTTPException) as exc:
        resolve_target_body(components, "a")
    assert exc.value.detail["error"] == "stale_target_body"


def test_self_referencing_source_is_ignored():
    """Fillet при пересборке от родителя переиспользует body_id — не зацикливаемся."""
    components = {"b1": body(visible=False, source={"kind": "fillet", "body_id": "b1"})}
    with pytest.raises(HTTPException) as exc:
        resolve_target_body(components, "b1")
    assert exc.value.detail["error"] == "stale_target_body"


def test_target_list_resolves_each_body_in_order():
    components = {
        "b1": body(visible=False),
        "b2": body(),
        "b3": body(source={"kind": "browser_extrude", "operation": "join", "target_body_id": "b1"}),
    }
    assert resolve_target_bodies(components, ["b2", "b1"]) == ["b2", "b3"]


def test_target_list_collapses_targets_of_one_branch_into_its_live_body():
    components = {
        "b1": body(visible=False),
        "b2": body(visible=False, source={"kind": "browser_extrude", "target_body_id": "b1"}),
        "b3": body(source={"kind": "browser_extrude", "target_body_id": "b2"}),
    }
    assert resolve_target_bodies(components, ["b1", "b2"]) == ["b3"]


def test_empty_or_unknown_target_list_is_rejected():
    with pytest.raises(HTTPException) as empty:
        resolve_target_bodies({}, [])
    assert empty.value.detail["error"] == "target_required"
    with pytest.raises(HTTPException) as unknown:
        resolve_target_bodies({"b1": body()}, ["b1", "ghost"])
    assert unknown.value.detail["error"] == "unknown_target_body"
