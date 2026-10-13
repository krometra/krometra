"""Разрешение целевого тела операции в актуальное состояние ветки.

`change/target-body-resolution` (ROADMAP, Фаза A).

Операция запоминает `target_body_id` на момент запуска панели. Пока
пользователь крутит камеру и правит параметры, ветка могла уйти вперёд:
приклейка/вырез/скругление поглощают исходное тело, прячут его
(`visible: false`) и кладут в документ НОВОЕ тело-результат.

Раньше вырез с устаревшим id молча выполнялся над скрытым телом: операция
отвечала `ok`, а в документе оказывались два пересекающихся видимых тела —
живой результат ветки и воскресший потомок мертвеца. Пользователь видел
«деталь раздвоилась», а история этого не объясняла.

Здесь мы восстанавливаем цепочку преемственности `source.target_body_id`
(«из какого тела это сделано») и разрешаем устаревший id в потомка.
"""

from fastapi import HTTPException, status

# Операции, которые потребляют целевое тело и выдают новое вместо него.
_CONSUMING_KINDS = {"extrude", "boolean", "fillet", "chamfer", "revolve", "browser_extrude", "browser_boolean"}


def _bad_request(error: str, description: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"error": error, "error_description": description},
    )


def _is_body(components: dict, body_id: str) -> bool:
    comp = components.get(body_id)
    return isinstance(comp, dict) and comp.get("type") == "body"


def _is_visible(components: dict, body_id: str) -> bool:
    return components.get(body_id, {}).get("visible") is not False


def _successors(components: dict) -> dict[str, str]:
    """Карта «поглощённое тело → тело-результат» по source всех тел."""
    successors: dict[str, str] = {}
    for body_id, comp in components.items():
        if not isinstance(comp, dict) or comp.get("type") != "body":
            continue
        source = comp.get("source")
        if not isinstance(source, dict) or source.get("kind") not in _CONSUMING_KINDS:
            continue
        for key in ("target_body_id", "body_id"):
            parent = source.get(key)
            # Тело-результат не может быть собственным потомком (fillet
            # переиспользует body_id при пересборке от родителя).
            if isinstance(parent, str) and parent != body_id:
                successors.setdefault(parent, body_id)
    return successors


def resolve_target_body(components: dict, target_body_id: str) -> str:
    """
    Вернуть живое тело, в которое должна целиться операция.

    Устаревший id разрешается в потомка по цепочке; если потомка нет, значит
    ветка оборвана — это ошибка, а не повод молча ветвить документ.
    """
    if not target_body_id:
        raise _bad_request(
            "target_required", "Операция join/cut требует целевое тело (target_body_id)."
        )

    if not _is_body(components, target_body_id):
        raise _bad_request(
            "unknown_target_body",
            f"Целевое тело «{target_body_id}» не найдено в документе. "
            "Выберите тело заново — возможно, документ был изменён в другой вкладке.",
        )

    if _is_visible(components, target_body_id):
        return target_body_id

    successors = _successors(components)
    seen = {target_body_id}
    current = target_body_id
    while current in successors:
        current = successors[current]
        if current in seen:
            break  # цикл в истории — дальше не идём, отдадим ошибку ниже
        seen.add(current)
        if _is_body(components, current) and _is_visible(components, current):
            return current

    raise _bad_request(
        "stale_target_body",
        "Целевое тело больше не актуально: оно поглощено предыдущей операцией, "
        "а её результат не найден. Выберите тело заново в дереве модели.",
    )
