import { describe, expect, it } from "vitest";
import { LANDING_TITLE, chunkStyles, landingDocument, type Manifest } from "./landingDocument";

const shell = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>Крометра</title>
    <script type="module" crossorigin src="/assets/index-a.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-a.css">
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;

const manifest: Manifest = {
  "index.html": { file: "assets/index-a.js", css: ["assets/index-a.css"] },
  "src/views/LandingView.vue": { file: "assets/LandingView-b.js", css: ["assets/LandingView-b.css"], imports: ["index.html", "_KrButton.js"] },
  "_KrButton.js": { file: "assets/KrButton-c.js", css: ["assets/KrButton-c.css"], imports: ["index.html"] },
  "src/assets/landing/editor-preview.webp": { file: "assets/editor-preview-d.webp" },
};

function render() {
  return landingDocument({
    shell,
    html: "<main>Опишите деталь словами</main>",
    themeCss: ":root { --k-primary: #006eb8; }",
    manifest,
    entry: "src/views/LandingView.vue",
    previewAsset: "src/assets/landing/editor-preview.webp",
    siteUrl: "https://krometra.ru/",
  });
}

describe("landingDocument", () => {
  it("собирает стили страницы по графу чанков без повторов", () => {
    expect(chunkStyles(manifest, "src/views/LandingView.vue")).toEqual([
      "assets/LandingView-b.css",
      "assets/index-a.css",
      "assets/KrButton-c.css",
    ]);
  });

  it("кладёт отрисованную разметку в #app и разрешает индексацию", () => {
    const page = render();
    expect(page).toContain('<div id="app"><main>Опишите деталь словами</main></div>');
    expect(page).not.toContain("noindex");
    expect(page).toContain(`<title>${LANDING_TITLE}</title>`);
    expect(page).toContain('<link rel="canonical" href="https://krometra.ru/" />');
    expect(page).toContain('<meta property="og:image" content="https://krometra.ru/assets/editor-preview-d.webp" />');
  });

  it("подключает тему и стили чанков, не дублируя стили оболочки", () => {
    const page = render();
    expect(page).toContain('<style id="kr-theme">:root { --k-primary: #006eb8; }</style>');
    expect(page).toContain('<link rel="stylesheet" href="/assets/LandingView-b.css" />');
    expect(page).toContain('<link rel="stylesheet" href="/assets/KrButton-c.css" />');
    expect(page.match(/index-a\.css/g)).toHaveLength(1);
    expect(page).toContain('<link rel="modulepreload" href="/assets/LandingView-b.js" />');
    expect(page).toContain('<html lang="ru" data-k-scheme="light">');
  });

  it("отказывается собирать страницу без пустого контейнера приложения", () => {
    expect(() => landingDocument({ shell: "<html></html>", html: "", themeCss: "", manifest, entry: "x", previewAsset: "y", siteUrl: "s" })).toThrow();
  });
});
