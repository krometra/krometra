import { describe, expect, it } from "vitest";
import { useI18n } from "@/composables/shared/useI18n";
import { useSketchText } from "./useSketchText";

describe("sketch text localization", () => {
  it("translates sketch messages and preserves their dynamic values", async () => {
    const i18n = useI18n();
    const translate = useSketchText();
    await i18n.setLocale("en");
    expect(translate("Длина 40 — кликните, чтобы поставить размер")).toBe("Length 40 — click to place the dimension");
    expect(translate("только для двух отрезков, выбрано 3")).toBe("only for two segments; selected 3");
    expect(translate("Unrecognized message")).toBe("Unrecognized message");
    await i18n.setLocale("zh");
    expect(translate("Укажите точку")).toBe("选择点");
    await i18n.setLocale("ru");
  });
});
