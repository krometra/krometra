import { DIMENSION_WORDS, UNIT_SYMBOLS, findUnit, type Dimension, type Quantity } from "./units";

export type ExprResult = { ok: true; value: number } | { ok: false; error: string };

type Token =
  | { kind: "number"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string };

class ExprError extends Error {}

const NUMBER = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)/;
const IDENT = /^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let rest = input;
  while (rest.length > 0) {
    const ch = rest[0];
    const number = NUMBER.exec(rest)?.[0];
    const ident = IDENT.exec(rest)?.[0];
    if (ch === " " || ch === "\t") {
      rest = rest.slice(1);
    } else if (number) {
      tokens.push({ kind: "number", value: Number(number.replace(",", ".")) });
      rest = rest.slice(number.length);
    } else if (ident) {
      tokens.push({ kind: "ident", name: ident });
      rest = rest.slice(ident.length);
    } else if (UNIT_SYMBOLS.includes(ch)) {
      tokens.push({ kind: "ident", name: ch });
      rest = rest.slice(1);
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      rest = rest.slice(1);
    } else {
      throw new ExprError(`Непонятный символ «${ch}»`);
    }
  }
  return tokens;
}

function tokenText(token: Token): string {
  if (token.kind === "op") return token.op;
  if (token.kind === "ident") return token.name;
  return String(token.value);
}

function accusative(dimension: Dimension): string {
  return DIMENSION_WORDS[dimension].accusative;
}

function add(left: Quantity, right: Quantity, sign: 1 | -1): Quantity {
  if (left.dimension && right.dimension && left.dimension !== right.dimension) {
    const verb = sign > 0 ? "складывать" : "вычитать";
    throw new ExprError(`Нельзя ${verb} ${accusative(left.dimension)} и ${accusative(right.dimension)}`);
  }
  return { value: left.value + sign * right.value, dimension: left.dimension ?? right.dimension };
}

function multiply(left: Quantity, right: Quantity): Quantity {
  if (left.dimension && right.dimension) throw new ExprError("Нельзя перемножать две величины с единицами");
  return { value: left.value * right.value, dimension: left.dimension ?? right.dimension };
}

function divide(left: Quantity, right: Quantity): Quantity {
  if (right.value === 0) throw new ExprError("Деление на ноль");
  const value = left.value / right.value;
  if (!right.dimension) return { value, dimension: left.dimension };
  if (left.dimension === right.dimension) return { value, dimension: null };
  if (!left.dimension) throw new ExprError("Нельзя делить число на величину с единицей");
  throw new ExprError(`Нельзя делить ${accusative(left.dimension)} на ${accusative(right.dimension)}`);
}

function parse(tokens: Token[], variables: Record<string, Quantity>): Quantity {
  let pos = 0;

  function takeOp(op: string): boolean {
    const token = tokens[pos];
    if (token?.kind !== "op" || token.op !== op) return false;
    pos++;
    return true;
  }

  function parsePrimary(): Quantity {
    const token = tokens[pos++];
    if (!token) throw new ExprError("Выражение оборвано");
    if (token.kind === "number") return { value: token.value, dimension: null };
    if (token.kind === "ident") {
      const variable = Object.hasOwn(variables, token.name) ? variables[token.name] : null;
      if (!variable) throw new ExprError(`Нет параметра «${token.name}»`);
      return variable;
    }
    if (token.op === "(") {
      const inner = parseSum();
      if (!takeOp(")")) throw new ExprError("Не хватает закрывающей скобки");
      return inner;
    }
    throw new ExprError(`Лишнее «${tokenText(token)}» в выражении`);
  }

  function parseWithUnit(): Quantity {
    const quantity = parsePrimary();
    const token = tokens[pos];
    if (token?.kind !== "ident") return quantity;
    pos++;
    const unit = findUnit(token.name);
    if (!unit) throw new ExprError(`Неизвестная единица «${token.name}»`);
    if (quantity.dimension) throw new ExprError(`Единица «${token.name}» у величины, у которой уже есть единица`);
    return { value: quantity.value * unit.factor, dimension: unit.dimension };
  }

  function parseUnary(): Quantity {
    if (takeOp("-")) {
      const operand = parseUnary();
      return { value: -operand.value, dimension: operand.dimension };
    }
    if (takeOp("+")) return parseUnary();
    return parseWithUnit();
  }

  function parseProduct(): Quantity {
    let left = parseUnary();
    for (;;) {
      if (takeOp("*")) left = multiply(left, parseUnary());
      else if (takeOp("/")) left = divide(left, parseUnary());
      else return left;
    }
  }

  function parseSum(): Quantity {
    let left = parseProduct();
    for (;;) {
      if (takeOp("+")) left = add(left, parseProduct(), 1);
      else if (takeOp("-")) left = add(left, parseProduct(), -1);
      else return left;
    }
  }

  const result = parseSum();
  const extra = tokens[pos];
  if (extra) throw new ExprError(`Лишнее «${tokenText(extra)}» в выражении`);
  return result;
}

function checkDimension(result: Quantity, expected: Dimension): number {
  if (result.dimension && result.dimension !== expected) {
    const field = DIMENSION_WORDS[expected];
    throw new ExprError(`Это поле ${field.genitive}: нужны ${field.units}, а не единицы ${DIMENSION_WORDS[result.dimension].genitive}`);
  }
  if (!Number.isFinite(result.value)) throw new ExprError("Слишком большое число");
  return result.value;
}

export function evaluateQuantity(
  input: string,
  expected: Dimension,
  variables: Record<string, Quantity> = {},
): ExprResult {
  try {
    const tokens = tokenize(input.trim());
    if (tokens.length === 0) return { ok: false, error: "Введите значение" };
    return { ok: true, value: checkDimension(parse(tokens, variables), expected) };
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, error: error.message };
    throw error;
  }
}
