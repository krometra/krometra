MAX_ERROR_LENGTH = 500


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def is_suppressed(entry: dict) -> bool:
    return entry.get("suppressed") is True


def is_failed(entry: dict) -> bool:
    return entry.get("status") == "error"


def is_active(entry: dict) -> bool:
    return not is_suppressed(entry) and entry.get("rolled_back") is not True and not is_failed(entry)


def _texts(values: object) -> list[str]:
    return [value for value in values if _text(value)] if isinstance(values, list) else []


def output_body(entry: dict) -> str | None:
    return entry.get("result_body_id") if entry.get("kind") == "boolean" else entry.get("body_id")


def output_bodies(entry: dict) -> list[str]:
    body_ids = entry.get("body_ids")
    if isinstance(body_ids, list):
        return _texts(body_ids)
    output = output_body(entry)
    return [output] if output else []


def boolean_tools(entry: dict) -> list[str]:
    tools = entry.get("tool_body_ids")
    return _texts(tools) if isinstance(tools, list) else _texts([entry.get("tool_body_id")])


def keeps_tools(entry: dict) -> bool:
    return (entry.get("params") or {}).get("keep_tools") is True


def cut_targets(entry: dict) -> list[str]:
    return _texts((entry.get("params") or {}).get("target_body_ids")) if entry.get("kind") == "extrude" else []


def consumed_bodies(entry: dict) -> list[str]:
    if entry.get("kind") == "boolean":
        return _texts([entry.get("target_body_id"), *([] if keeps_tools(entry) else boolean_tools(entry))])
    if targets := cut_targets(entry):
        return targets
    params = entry.get("params") or {}
    if entry.get("kind") == "transform" and params.get("copy") is True:
        return []
    if entry.get("kind") == "mirror" and params.get("merge") is not True:
        return []
    if entry.get("kind") == "pattern" and params.get("mode") == "separate":
        return []
    if entry.get("kind") == "press_pull" and params.get("new_body") is True:
        return []
    target = _text(params.get("target_body_id"))
    return [target] if target else []


def fallback_body(entry: dict) -> str | None:
    consumed = consumed_bodies(entry)
    return consumed[0] if consumed else None


def output_fallbacks(entry: dict) -> list[tuple[str, str | None]]:
    outputs = output_bodies(entry)
    if targets := cut_targets(entry):
        return [(output, targets[index] if index < len(targets) else None) for index, output in enumerate(outputs)]
    return [(output, fallback_body(entry) if index == 0 else None) for index, output in enumerate(outputs)]


def _producers(timeline: list) -> dict[str, tuple[dict, str | None]]:
    producers: dict[str, tuple[dict, str | None]] = {}
    for entry in timeline:
        for output, fallback in output_fallbacks(entry):
            producers.setdefault(output, (entry, fallback))
    return producers


def _effective_body(body_id: str, producers: dict[str, tuple[dict, str | None]]) -> str | None:
    seen: set[str] = set()
    current: str | None = body_id
    while current is not None and current not in seen:
        producer = producers.get(current)
        if producer is None or is_active(producer[0]):
            return current
        seen.add(current)
        current = producer[1]
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
        and (body_id not in producers or is_active(producers[body_id][0]))
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
