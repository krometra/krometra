from app.schemas.sketch import SketchData

RECT = {"id": "r1", "type": "rectangle", "corner1": {"x": 0, "y": 0}, "corner2": {"x": 10, "y": 5}}


def test_construction_flag_survives_for_every_primitive():
    entities = [
        {**RECT, "construction": True},
        {"id": "l1", "type": "line", "start": {"x": 0, "y": 0}, "end": {"x": 1, "y": 0}, "construction": True},
        {"id": "c1", "type": "circle", "center": {"x": 0, "y": 0}, "radius": 2, "construction": True},
        {"id": "a1", "type": "arc", "center": {"x": 0, "y": 0}, "radius": 2, "startAngle": 0, "endAngle": 1, "construction": True},
    ]

    dumped = SketchData(entities=entities).model_dump()["entities"]

    assert [entity["type"] for entity in dumped] == ["rectangle", "line", "circle", "arc"]
    assert [entity["construction"] for entity in dumped] == [True, True, True, True]


def test_rectangle_is_regular_by_default():
    assert SketchData(entities=[RECT]).model_dump()["entities"][0]["construction"] is False
