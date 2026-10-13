import type { BrowserBuildResult } from "@/composables/editor/useBrowserGeometry";

export function newFeatureKey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `k-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function browserBodyForm(
  result: Pick<BrowserBuildResult, "step" | "mesh" | "naming">,
  fileName: string,
  featureKey: string,
  fields: Record<string, string>,
): FormData {
  const form = new FormData();
  form.set("step", new Blob([result.step], { type: "application/step" }), fileName);
  form.set("mesh", JSON.stringify(result.mesh));
  form.set("naming", JSON.stringify(result.naming));
  form.set("feature_key", featureKey);
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return form;
}

export function browserImportForm(
  fileName: string,
  version: number,
  bodies: Pick<BrowserBuildResult, "step" | "mesh" | "naming">[],
): FormData {
  const form = new FormData();
  form.set("file_name", fileName);
  form.set("document_version", String(version));
  bodies.forEach((body, index) => {
    form.append("steps", new Blob([body.step], { type: "application/step" }), `import-${index + 1}.step`);
    form.append("meshes", JSON.stringify(body.mesh));
    form.append("namings", JSON.stringify(body.naming));
  });
  return form;
}
