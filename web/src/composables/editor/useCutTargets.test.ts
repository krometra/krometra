import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useBodyPick } from "@/composables/shared/useBodyPick";
import type { PickableBody } from "@/lib/bodyPickList";
import type { ViewportRef } from "./types";
import { useCutTargets } from "./useCutTargets";

const browser = (id: string, visible = true): PickableBody => ({ id, visible, source: { kind: "browser_extrude" } });

function setup() {
  const painted: { targetId: string | null; toolIds: string[] }[] = [];
  const viewportRef = ref({ setBodyRoles: (roles: { targetId: string | null; toolIds: string[] }) => painted.push(roles) }) as unknown as ViewportRef;
  const bodies = ref<PickableBody[]>([browser("a"), browser("b"), browser("hidden", false)]);
  const active = ref(false);
  const targets = useCutTargets({ viewportRef, bodies, active });
  return { targets, bodies, active, painted };
}

describe("useCutTargets", () => {
  it("при включении выреза берёт все видимые тела и подсвечивает их", () => {
    const { targets, active, painted } = setup();
    active.value = true;
    expect(targets.targetIds.value).toEqual(["a", "b"]);
    expect(painted.at(-1)).toEqual({ targetId: null, toolIds: ["a", "b"] });
  });

  it("явный список после включения не затирается умолчанием", () => {
    const { targets, active } = setup();
    active.value = true;
    targets.set(["b"]);
    expect(targets.targetIds.value).toEqual(["b"]);
  });

  it("клик в сцене и в дереве снимает и возвращает тело, пока вырез активен", () => {
    const { targets, active } = setup();
    expect(targets.pickFromScene("a")).toBe(false);
    active.value = true;
    expect(targets.pickFromScene("a")).toBe(true);
    expect(targets.targetIds.value).toEqual(["b"]);
    expect(useBodyPick().pick("a")).toBe(true);
    expect(targets.targetIds.value).toEqual(["b", "a"]);
  });

  it("выключение отпускает дерево и снимает подсветку; скрытое тело выпадает из списка", () => {
    const { targets, bodies, active, painted } = setup();
    active.value = true;
    bodies.value = [browser("a"), browser("b", false)];
    expect(targets.targetIds.value).toEqual(["a"]);
    active.value = false;
    expect(useBodyPick().pick("a")).toBe(false);
    expect(painted.at(-1)).toEqual({ targetId: null, toolIds: [] });
  });
});
