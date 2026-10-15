MAX_ERROR_LENGTH = 500


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def is_suppressed(entry: dict) -> bool:
    return entry.get("suppressed") is True


def is_failed(entry: dict) -> bool:
    return entry.get("status") == "error"


def is_active(entry: dict) -> bool:
    return not is_suppressed(entry) and entry.get("rolled_back") is not True and not is_failed(entry)


def output_body(entry: dict) -> str | None:
    return entry.get("result_body_id") if entry.get("kind") == "boolean" else entry.get("body_id")


def consumed_bodies(entry: dict) -> list[str]:
    if entry.get("kind") == "boolean":
        ids = [_text(entry.get("target_body_id")), _text(entry.get("tool_body_id"))]
        return [body_id for body_id in ids if body_id]
    params = entry.get("params") or {}
    if entry.get("kind") == "transform" and params.get("copy") is True:
        return []
    target = _text(params.get("target_body_id"))
    return [target] if target else []


def fallback_body(entry: dict) -> str | None:
    consumed = consumed_bodies(entry)
    return consumed[0] if consumed else None


def _producers(timeline: list) -> dict[str, dict]:
    producers: dict[str, dict] = {}
    for entry in timeline:
        output = output_body(entry)
        if output and output not in producers:
            producers[output] = entry
    return producers


def _effective_body(body_id: str, producers: dict[str, dict]) -> str | None:
    seen: set[str] = set()
    current: str | None = body_id
    while current is not None and current not in seen:
        producer = producers.get(current)
        if producer is None or is_active(producer):
            return current
        seen.add(current)
        current = fallback_body(producer)
    return None


def _is_body(component: object) -> bool:
    return isinstance(component, dict) and component.get("type") == "body"


def live_bodies(components: dict, timeline: list) -> set[str]:
    producers = _producers(timeline)
    consumed = {
        effective
        for entry in timeline if is_active(entry)
        for body_id in consumed_bodies(entry)
        if (effective := _effective_body(body_id, producers))
    }
    return {
        body_id for body_id, component in components.items()
        if _is_body(component) and body_id not in consumed
        and (body_id not in producers or is_active(producers[body_id]))
    }


def synced_liveness(components: dict, before_timeline: list, after_timeline: list) -> dict:
    was_live = live_bodies(components, before_timeline)
    is_live = live_bodies(components, after_timeline)
    return {
        body_id: {**component, "visible": body_id in is_live}
        if _is_body(component) and (body_id in was_live) != (body_id in is_live) else component
        for body_id, component in components.items()
    }


def with_regen_statuses(timeline: list, regenerated: set[str], failed: dict[str, str]) -> list:
    def status_of(entry: dict) -> dict:
        rest = {key: value for key, value in entry.items() if key != "error_message"}
        message = failed.get(entry.get("id"))
        if message is None:
            return {**rest, "status": "ok"}
        return {**rest, "status": "error", "error_message": message[:MAX_ERROR_LENGTH]}

    return [status_of(entry) if entry.get("id") in regenerated else entry for entry in timeline]
