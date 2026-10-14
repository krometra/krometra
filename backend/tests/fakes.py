import json
import operator

from sqlalchemy.sql import operators
from sqlalchemy.sql.elements import BinaryExpression, BindParameter, BooleanClauseList, False_, True_, UnaryExpression

from app.core import rate_limit, security
from app.models import Base

_COMPARATORS = {operators.eq: operator.eq, operators.ne: operator.ne}


def _literal(element):
    if isinstance(element, BindParameter):
        return element.value
    if isinstance(element, True_):
        return True
    if isinstance(element, False_):
        return False
    raise NotImplementedError(f"FakeDb: unsupported operand {element!r}")


def _matches(row, clause) -> bool:
    if clause is None:
        return True
    if isinstance(clause, BooleanClauseList) and clause.operator is operators.and_:
        return all(_matches(row, part) for part in clause.clauses)
    if isinstance(clause, BinaryExpression) and clause.operator in _COMPARATORS:
        return _COMPARATORS[clause.operator](getattr(row, clause.left.key), _literal(clause.right))
    raise NotImplementedError(f"FakeDb: unsupported clause {clause}")


def _sorted(rows, order_by):
    for clause in reversed(order_by):
        descending = isinstance(clause, UnaryExpression) and clause.modifier is operators.desc_op
        column = clause.element if isinstance(clause, UnaryExpression) else clause
        rows = sorted(rows, key=lambda row: getattr(row, column.key), reverse=descending)
    return rows


class _Result:
    def __init__(self, values):
        self._values = values

    def scalar_one_or_none(self):
        if len(self._values) > 1:
            raise AssertionError("FakeDb: more than one row")
        return self._values[0] if self._values else None

    def scalars(self):
        return self

    def all(self):
        return list(self._values)

    def __iter__(self):
        return iter(list(self._values))


class FakeDb:
    def __init__(self):
        self.tables: dict[str, list] = {}
        self.commits = 0

    def rows(self, model) -> list:
        return self.tables.setdefault(model.__tablename__, [])

    def add(self, row) -> None:
        for column in row.__table__.columns:
            if getattr(row, column.key) is None and column.default is not None:
                default = column.default.arg
                setattr(row, column.key, default(None) if column.default.is_callable else default)
        if row not in self.rows(type(row)):
            self.rows(type(row)).append(row)

    async def execute(self, statement):
        description = statement.column_descriptions[0]
        entity = description["entity"]
        rows = [row for row in self.rows(entity) if _matches(row, statement.whereclause)]
        rows = _sorted(rows, statement._order_by_clauses)
        expr = description["expr"]
        if expr is not entity:
            rows = [getattr(row, expr.key) for row in rows]
        return _Result(rows)

    async def delete(self, row) -> None:
        table = row.__table__
        self.rows(type(row)).remove(row)
        for mapper in Base.registry.mappers:
            child = mapper.class_
            for foreign_key in child.__table__.foreign_keys:
                if foreign_key.column.table is table and foreign_key.ondelete == "CASCADE":
                    parent_value = getattr(row, foreign_key.column.key)
                    for dependent in [r for r in self.rows(child) if getattr(r, foreign_key.parent.key) == parent_value]:
                        await self.delete(dependent)

    async def commit(self) -> None:
        self.commits += 1

    async def refresh(self, _row) -> None:
        return None


class FakeRedis:
    def __init__(self):
        self.data: dict[str, str] = {}

    async def get(self, key):
        return self.data.get(key)

    async def set(self, key, value, ex=None):
        self.data[key] = value

    async def delete(self, key):
        self.data.pop(key, None)

    async def ttl(self, key):
        return 60 if key in self.data else -2

    async def eval(self, script, _numkeys, key, *args):
        if script == rate_limit._HIT_SCRIPT:
            count = int(self.data.get(key, 0)) + 1
            self.data[key] = str(count)
            return [count, 60]
        if script == security._ROTATE_FAMILY_SCRIPT:
            return self._rotate(key, *args)
        raise NotImplementedError("FakeRedis: unknown script")

    def _rotate(self, key, presented, new, _ttl):
        raw = self.data.get(key)
        if raw is None:
            return None
        family = json.loads(raw)
        token = next((t for t in family["tokens"] if t["jti"] == presented), None)
        if token is None or token["status"] != "active":
            del self.data[key]
            return "replay"
        token["status"] = "replaced"
        family["tokens"].append({"jti": new, "status": "active"})
        self.data[key] = json.dumps(family)
        return family["user_id"]
