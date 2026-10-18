import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const ssrDist = resolve(root, "dist-ssr");

const manifest = JSON.parse(await readFile(resolve(dist, ".vite/manifest.json"), "utf8"));
const { renderLanding, landingDocument } = await import(pathToFileURL(resolve(ssrDist, "prerender.js")).href);
const { html, themeCss } = await renderLanding();
const shell = await readFile(resolve(dist, "index.html"), "utf8");

const page = landingDocument({
  shell,
  html,
  themeCss,
  manifest,
  entry: "src/views/LandingView.vue",
  previewAsset: "src/assets/landing/editor-preview.webp",
  siteUrl: process.env.PUBLIC_SITE_URL || "https://krometra.ru",
});
await writeFile(resolve(dist, "landing.html"), page);
await rm(ssrDist, { recursive: true, force: true });
await rm(resolve(dist, ".vite"), { recursive: true, force: true });
console.log(`landing.html: ${Buffer.byteLength(page)} байт`);
