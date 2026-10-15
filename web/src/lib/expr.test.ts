import { describe, expect, it } from "vitest";
import { evaluateQuantity } from "./expr";
import type { Quantity } from "./units";

const length = (value: number): Quantity => ({ value, dimension: "length" });
const angle = (value: number): Quantity => ({ value, dimension: "angle" });
const plain = (value: number): Quantity => ({ value, dimension: null });

function lengthOf(input: string, variables: Record<string, Quantity> = {}) {
  const result = evaluateQuantity(input, "length", variables);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function angleOf(input: string, variables: Record<string, Quantity> = {}) {
  const result = evaluateQuantity(input, "angle", variables);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

function errorOf(input: string, expected: "length" | "angle" = "length", variables: Record<string, Quantity> = {}) {
  const result = evaluateQuantity(input, expected, variables);
  return result.ok ? null : result.error;
}

describe("evaluateQuantity: числа и арифметика", () => {
  it("число без единицы берётся в единице поля", () => {
    expect(lengthOf("30")).toBe(30);
    expect(angleOf("45")).toBe(45);
  });

  it("понимает десятичную точку и запятую", () => {
    expect(lengthOf("12.5")).toBe(12.5);
    expect(lengthOf("12,5")).toBe(12.5);
    expect(lengthOf(".5")).toBe(0.5);
    expect(lengthOf("-1,5")).toBe(-1.5);
  });

  it("соблюдает приоритет действий и скобки", () => {
    expect(lengthOf("2 + 3 * 4")).toBe(14);
    expect(lengthOf("(2 + 3) * 4")).toBe(20);
    expect(lengthOf("30/2")).toBe(15);
    expect(lengthOf("10 - 4 - 3")).toBe(3);
    expect(lengthOf("2 * -3")).toBe(-6);
    expect(lengthOf("+5")).toBe(5);
    expect(lengthOf("--5")).toBe(5);
  });

  it("подставляет параметры", () => {
    expect(lengthOf("width*2", { width: plain(15) })).toBe(30);
    expect(lengthOf("ширина + 1", { ширина: length(9) })).toBe(10);
  });
});

describe("evaluateQuantity: единицы длины", () => {
  it.each([
    ["1 mm", 1],
    ["1 cm", 10],
    ["1cm", 10],
    ["1 m", 1000],
    ["1 in", 25.4],
    ["1 inch", 25.4],
    ['1"', 25.4],
    ["1″", 25.4],
    ["1 мм", 1],
    ["1 см", 10],
    ["1 м", 1000],
    ["1 дюйм", 25.4],
    ["2 MM", 2],
    ["1,5 cm", 15],
  ])("%s = %d мм", (input, expected) => {
    expect(lengthOf(input)).toBeCloseTo(expected, 9);
  });

  it("складывает разные единицы длины и числа без единицы", () => {
    expect(lengthOf("1in + 2mm")).toBeCloseTo(27.4, 9);
    expect(lengthOf("1 cm + 5")).toBe(15);
    expect(lengthOf("1 m - 1 cm")).toBe(990);
  });

  it("единица привязывается к числу, а не ко всей сумме", () => {
    expect(lengthOf("width/2 + 5 mm", { width: length(40) })).toBe(25);
    expect(lengthOf("2 * 3 cm")).toBe(60);
    expect(lengthOf("3 cm * 2")).toBe(60);
    expect(lengthOf("-5 mm")).toBe(-5);
  });

  it("единица после скобки применяется к её значению", () => {
    expect(lengthOf("(1 + 2) cm")).toBe(30);
  });

  it("отношение длин безразмерно и берётся в единице поля", () => {
    expect(lengthOf("1 cm / 2 mm")).toBe(5);
    expect(angleOf("1 cm / 2 mm")).toBe(5);
  });

  it("длина, делённая на число, остаётся длиной", () => {
    expect(lengthOf("1 in / 2")).toBeCloseTo(12.7, 9);
  });

  it("параметр в мм не путается с единицей того же имени", () => {
    expect(lengthOf("2 m + m", { m: length(3) })).toBe(2003);
    expect(lengthOf("in * 2", { in: plain(4) })).toBe(8);
  });
});

describe("evaluateQuantity: единицы угла", () => {
  it.each([
    ["90deg", 90],
    ["90 deg", 90],
    ["90°", 90],
    ["90 град", 90],
    ["1 rad", 180 / Math.PI],
    ["1 рад", 180 / Math.PI],
  ])("%s = %d°", (input, expected) => {
    expect(angleOf(input)).toBeCloseTo(expected, 9);
  });

  it("складывает градусы и радианы", () => {
    expect(angleOf("90deg + 0.5 rad")).toBeCloseTo(90 + 90 / Math.PI, 9);
    expect(angleOf("360 / 4")).toBe(90);
  });

  it("берёт угловой параметр", () => {
    expect(angleOf("tilt * 2", { tilt: angle(34) })).toBe(68);
  });
});

describe("evaluateQuantity: несовместимые единицы", () => {
  it("не принимает длину в поле угла", () => {
    expect(errorOf("10 mm", "angle")).toBe("Это поле угла: нужны deg, rad, а не единицы длины");
  });

  it("не принимает угол в поле длины", () => {
    expect(errorOf("90deg", "length")).toBe("Это поле длины: нужны mm, cm, m, in, а не единицы угла");
  });

  it("не принимает параметр длины в поле угла", () => {
    expect(errorOf("width", "angle", { width: length(10) })).toBe("Это поле угла: нужны deg, rad, а не единицы длины");
  });

  it("не складывает и не вычитает длину с углом", () => {
    expect(errorOf("1 cm + 90 deg")).toBe("Нельзя складывать длину и угол");
    expect(errorOf("90 deg - 1 cm", "angle")).toBe("Нельзя вычитать угол и длину");
  });

  it("не перемножает две величины с единицами", () => {
    expect(errorOf("2 mm * 3 mm")).toBe("Нельзя перемножать две величины с единицами");
  });

  it("не делит число на величину с единицей и длину на угол", () => {
    expect(errorOf("10 / 2 mm")).toBe("Нельзя делить число на величину с единицей");
    expect(errorOf("10 mm / 2 deg")).toBe("Нельзя делить длину на угол");
  });

  it("не ставит вторую единицу на величину с единицей", () => {
    expect(errorOf("(1 cm) mm")).toBe("Единица «mm» у величины, у которой уже есть единица");
    expect(errorOf("width cm", "length", { width: length(3) })).toBe("Единица «cm» у величины, у которой уже есть единица");
  });

  it("безразмерный параметр получает единицу", () => {
    expect(lengthOf("k cm", { k: plain(3) })).toBe(30);
  });
});

describe("evaluateQuantity: ошибки ввода", () => {
  it("пустая строка", () => {
    expect(errorOf("")).toBe("Введите значение");
    expect(errorOf("   ")).toBe("Введите значение");
  });

  it("неизвестная единица и неизвестный параметр", () => {
    expect(errorOf("5 ft")).toBe("Неизвестная единица «ft»");
    expect(errorOf("1e3")).toBe("Неизвестная единица «e3»");
    expect(errorOf("height * 2")).toBe("Нет параметра «height»");
    expect(errorOf("constructor")).toBe("Нет параметра «constructor»");
    expect(errorOf("5 toString")).toBe("Неизвестная единица «toString»");
  });

  it("синтаксические ошибки", () => {
    expect(errorOf("2 +")).toBe("Выражение оборвано");
    expect(errorOf("(2 + 3")).toBe("Не хватает закрывающей скобки");
    expect(errorOf("2 + 3)")).toBe("Лишнее «)» в выражении");
    expect(errorOf("*2")).toBe("Лишнее «*» в выражении");
    expect(errorOf("2 3")).toBe("Лишнее «3» в выражении");
    expect(errorOf("2 mm cm")).toBe("Лишнее «cm» в выражении");
    expect(errorOf("2 % 3")).toBe("Непонятный символ «%»");
  });

  it("деление на ноль и переполнение", () => {
    expect(errorOf("5 / 0")).toBe("Деление на ноль");
    expect(errorOf("5 / (1 - 1) mm")).toBe("Деление на ноль");
    expect(errorOf("9".repeat(400))).toBe("Слишком большое число");
  });
});
