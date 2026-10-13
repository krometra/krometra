export interface SuccessionBody {
  id: string;
  visible?: boolean;
  source?: unknown;
}

const PARENT_KEYS = ["target_body_id", "tool_body_id"];

function successors(bodies: SuccessionBody[]): Map<string, string> {
  const next = new Map<string, string>();
  for (const body of bodies) {
    const source = (body.source ?? {}) as Record<string, unknown>;
    for (const key of PARENT_KEYS) {
      const parent = source[key];
      if (typeof parent === "string" && parent !== body.id && !next.has(parent)) next.set(parent, body.id);
    }
  }
  return next;
}

export function liveBodyId(bodies: SuccessionBody[], bodyId: string | null | undefined): string | null {
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const next = successors(bodies);
  const seen = new Set<string>();
  let current = bodyId ?? null;
  while (current && byId.has(current) && !seen.has(current)) {
    if (byId.get(current)?.visible !== false) return current;
    seen.add(current);
    current = next.get(current) ?? null;
  }
  return null;
}
