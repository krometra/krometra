// Безопасный вычислитель арифметических выражений: числа, имена параметров,
// + - * / ( ), унарный минус. Без eval.

type Token =
  | { kind: "number"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const raw = input.slice(i, j).replace(",", ".");
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "number", value });
      i = j;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /[0-9]/.test(input[j])) j++;
      const prev = tokens[tokens.length - 1];
      if (prev?.kind === "number") {
        const frac = Number(`0.${input.slice(i + 1, j)}`);
        prev.value = prev.value + (prev.value >= 0 ? frac : -frac);
        i = j;
        continue;
      }
      return null;
    }
    if (/[A-Za-zА-Яа-я_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-zА-Яа-я0-9_]/.test(input[j])) j++;
      tokens.push({ kind: "ident", name: input.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateExpression(
  input: string,
  variables: Record<string, number> = {},
): number | null {
  const tokens = tokenize(input.trim());
  if (!tokens || tokens.length === 0) return null;

  let pos = 0;

  function peek(): Token | undefined {
    return tokens![pos];
  }

  function takeOp(op: string): boolean {
    const t = peek();
    if (t?.kind === "op" && t.op === op) {
      pos++;
      return true;
    }
    return false;
  }

  function parsePrimary(): number | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === "number") {
      pos++;
      return t.value;
    }
    if (t.kind === "ident") {
      pos++;
      const v = variables[t.name];
      return typeof v === "number" ? v : null;
    }
    if (t.kind === "op" && t.op === "(") {
      pos++;
      const v = parseSum();
      if (v === null || !takeOp(")")) return null;
      return v;
    }
    if (t.kind === "op" && t.op === "-") {
      pos++;
      const v = parsePrimary();
      return v === null ? null : -v;
    }
    if (t.kind === "op" && t.op === "+") {
      pos++;
      return parsePrimary();
    }
    return null;
  }

  function parseProduct(): number | null {
    let left = parsePrimary();
    if (left === null) return null;
    for (;;) {
      if (takeOp("*")) {
        const right = parsePrimary();
        if (right === null) return null;
        left = left * right;
      } else if (takeOp("/")) {
        const right = parsePrimary();
        if (right === null || right === 0) return null;
        left = left / right;
      } else {
        return left;
      }
    }
  }

  function parseSum(): number | null {
    let left = parseProduct();
    if (left === null) return null;
    for (;;) {
      if (takeOp("+")) {
        const right = parseProduct();
        if (right === null) return null;
        left = left + right;
      } else if (takeOp("-")) {
        const right = parseProduct();
        if (right === null) return null;
        left = left - right;
      } else {
        return left;
      }
    }
  }

  const result = parseSum();
  if (result === null || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}
