import type { MeshData } from "@/types/api";

/** Тело сцены с флагом видимости — минимум, нужный для счётчика статус-бара. */
export interface CountableBody {
  id: string;
  visible?: boolean;
}

export interface SceneStats {
  bodies: number;
  faces: number;
  edges: number;
}

const isVisible = (body: CountableBody) => body.visible !== false;

/**
 * Статистика сцены по ВИДИМЫМ телам.
 *
 * Статус-бар суммировал грани и рёбра по всем мешам, включая скрытые
 * промежуточные тела, а тела считал только видимые — получалось
 * «1 тело · 17 граней · 36 рёбер», где 17 = 6+11 от двух разных тел.
 * Считаем из одного источника: тело попадает в счётчик целиком или никак.
 */
export function sceneStats(
  bodies: CountableBody[],
  meshes: { body_id: string; mesh: MeshData }[],
): SceneStats {
  const visibleIds = new Set(bodies.filter(isVisible).map((b) => b.id));
  const seen = new Set<string>();
  let faces = 0;
  let edges = 0;

  for (const entry of meshes) {
    // Дубль body_id в списке мешей не должен удваивать счётчик.
    if (!visibleIds.has(entry.body_id) || seen.has(entry.body_id)) continue;
    seen.add(entry.body_id);
    faces += entry.mesh?.brep_topo?.faces?.length ?? 0;
    edges += entry.mesh?.brep_topo?.edges?.length ?? 0;
  }

  return { bodies: visibleIds.size, faces, edges };
}
