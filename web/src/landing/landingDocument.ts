export interface ManifestChunk {
  file: string;
  css?: string[];
  imports?: string[];
}

export type Manifest = Record<string, ManifestChunk>;

export interface LandingDocumentInput {
  shell: string;
  html: string;
  themeCss: string;
  manifest: Manifest;
  entry: string;
  previewAsset: string;
  siteUrl: string;
}

export const LANDING_TITLE = "Крометра: 3D CAD в браузере";
export const LANDING_DESCRIPTION =
  "Параметрическая 3D CAD в браузере: эскизы с размерами, выдавливание, скругления, экспорт в STL и STEP. " +
  "Ничего не нужно устанавливать, а модель можно построить и через ИИ-ассистента по MCP.";

export function chunkStyles(manifest: Manifest, entry: string, seen = new Set<string>()): string[] {
  const chunk = manifest[entry];
  if (!chunk || seen.has(entry)) return [];
  seen.add(entry);
  return [...(chunk.css ?? []), ...(chunk.imports ?? []).flatMap((child) => chunkStyles(manifest, child, seen))];
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function headTags(input: LandingDocumentInput): string {
  const site = input.siteUrl.replace(/\/$/, "");
  const styles = chunkStyles(input.manifest, input.entry).filter((file) => !input.shell.includes(`/${file}`));
  const script = input.manifest[input.entry]?.file;
  const preview = input.manifest[input.previewAsset]?.file;
  const description = escapeAttribute(LANDING_DESCRIPTION);
  return [
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${site}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Крометра" />`,
    `<meta property="og:title" content="${escapeAttribute(LANDING_TITLE)}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${site}/" />`,
    ...(preview ? [`<meta property="og:image" content="${site}/${preview}" />`] : []),
    `<style id="kr-theme">${input.themeCss}</style>`,
    ...styles.map((file) => `<link rel="stylesheet" href="/${file}" />`),
    ...(script ? [`<link rel="modulepreload" href="/${script}" />`] : []),
  ].join("\n    ");
}

export function landingDocument(input: LandingDocumentInput): string {
  if (!input.shell.includes('<div id="app"></div>')) throw new Error("В index.html нет пустого <div id=\"app\">");
  return input.shell
    .replace(/\s*<meta name="robots"[^>]*>/, "")
    .replace(/<title>[^<]*<\/title>/, `<title>${LANDING_TITLE}</title>`)
    .replace("<html lang=\"ru\">", '<html lang="ru" data-k-scheme="light">')
    .replace("</head>", `  ${headTags(input)}\n  </head>`)
    .replace('<div id="app"></div>', `<div id="app">${input.html}</div>`);
}
