import pytest
from pydantic import ValidationError

from app.schemas.sketch import SketchData

LINE_A = {"id": "a", "type": "line", "start": {"x": 0, "y": 0}, "end": {"x": 10, "y": 0}}
LINE_B = {"id": "b", "type": "line", "start": {"x": 15, "y": 2}, "end": {"x": 25, "y": 2}}
CIRCLE = {"id": "c", "type": "circle", "center": {"x": 5, "y": 5}, "radius": 3}


def sketch_with(*constraints):
    return SketchData(entities=[LINE_A, LINE_B, CIRCLE], constraints=list(constraints))


@pytest.mark.parametrize(
    "constraint",
    [
        {"id": "k1", "type": "collinear", "anchors": [{"entity_id": "a"}, {"entity_id": "b"}]},
        {"id": "k2", "type": "midpoint", "anchors": [{"entity_id": "c", "sub_index": 0}, {"entity_id": "a"}]},
        {"id": "k3", "type": "point_on_curve", "anchors": [{"entity_id": "b", "sub_index": 1}, {"entity_id": "c"}]},
        {"id": "k4", "type": "fix", "anchors": [{"entity_id": "a", "sub_index": -1}]},
        {"id": "k5", "type": "fix", "anchors": [{"entity_id": "b", "sub_index": 1}]},
        {"id": "k6", "type": "tangent", "anchors": [{"entity_id": "c", "sub_index": 1}, {"entity_id": "a"}]},
    ],
)
def test_new_constraint_types_round_trip(constraint):
    dumped = sketch_with(constraint).model_dump(mode="json")["constraints"][0]

    assert dumped["type"] == constraint["type"]
    assert [a["entity_id"] for a in dumped["anchors"]] == [a["entity_id"] for a in constraint["anchors"]]
    assert [a["sub_index"] for a in dumped["anchors"]] == [a.get("sub_index", 0) for a in constraint["anchors"]]
    assert dumped["value"] is None


def test_old_point_to_point_coincident_still_loads():
    old = {
        "id": "k",
        "type": "coincident",
        "anchors": [{"entity_id": "a", "sub_index": 1}, {"entity_id": "b", "sub_index": 0}],
        "value": None,
    }

    dumped = sketch_with(old).model_dump(mode="json")["constraints"][0]

    assert dumped == old


def test_unknown_constraint_type_is_rejected():
    with pytest.raises(ValidationError):
        sketch_with({"id": "k", "type": "tangent_to_everything", "anchors": []})
