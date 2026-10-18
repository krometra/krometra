import { describe, expect, it } from "vitest";
import { hasSignedInHint, signedInHintCookie } from "./signedInHint";

describe("signedInHint", () => {
  it("ставит подсказку на месяц и снимает её нулевым сроком", () => {
    expect(signedInHintCookie(true, true)).toBe("kr_signed_in=1; path=/; max-age=2592000; SameSite=Lax; Secure");
    expect(signedInHintCookie(false, false)).toBe("kr_signed_in=; path=/; max-age=0; SameSite=Lax");
  });

  it("узнаёт подсказку среди других cookie", () => {
    expect(hasSignedInHint("a=1; kr_signed_in=1; b=2")).toBe(true);
    expect(hasSignedInHint("kr_signed_in=")).toBe(false);
    expect(hasSignedInHint("xkr_signed_in=1")).toBe(false);
    expect(hasSignedInHint("")).toBe(false);
  });
});
