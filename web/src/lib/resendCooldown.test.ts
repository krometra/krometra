import { describe, expect, it } from "vitest";
import { RESEND_COOLDOWN_MS, cooldownEnd, secondsLeft } from "./resendCooldown";

describe("кулдаун повторной отправки письма", () => {
  it("без отправки ждать не нужно", () => {
    expect(secondsLeft(null, 1_000)).toBe(0);
  });

  it("сразу после отправки ждать весь интервал", () => {
    const end = cooldownEnd(10_000);
    expect(end).toBe(10_000 + RESEND_COOLDOWN_MS);
    expect(secondsLeft(end, 10_000)).toBe(RESEND_COOLDOWN_MS / 1000);
  });

  it("неполная секунда округляется вверх, чтобы кнопка не включилась раньше", () => {
    expect(secondsLeft(cooldownEnd(0, 5_000), 4_001)).toBe(1);
  });

  it("после окончания интервала ноль, а не отрицательное число", () => {
    expect(secondsLeft(cooldownEnd(0, 5_000), 5_000)).toBe(0);
    expect(secondsLeft(cooldownEnd(0, 5_000), 60_000)).toBe(0);
  });
});
