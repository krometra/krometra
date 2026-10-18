import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

/**
 * Файлы с сырыми <button>/<input>, унаследованными до введения гейта
 * (20.08.2026, 74 контрола). Список только сокращается: перевёл файл на
 * KrButton/KrInput — убери строку отсюда. Новый файл сюда не добавляется.
 */
const RAW_CONTROL_DEBTORS = [
  "src/components/editor/EditorRibbon.vue",
  "src/components/editor/ExtrudeRevolvePanel.vue",
  "src/components/editor/ModelTree.vue",
  "src/components/editor/SketchPropsPanel.vue",
  "src/components/properties/PropertiesPanel.vue",
  "src/components/sketcher/ConstraintToolbar.vue",
  "src/components/sketcher/SketcherToolbar.vue",
  "src/components/toolbar/FilletChamferToolbar.vue",
  "src/components/viewport/ViewCube.vue",
  "src/views/DashboardView.vue",
  "src/views/EditorView.vue",
  "src/views/LoginView.vue",
];

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.ts", "**/*.vue"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        self: "readonly",
        crypto: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        ResizeObserver: "readonly",
        MessageEvent: "readonly",
        MouseEvent: "readonly",
        KeyboardEvent: "readonly",
        WheelEvent: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLInputElement: "readonly",
        CanvasRenderingContext2D: "readonly",
        Worker: "readonly",
        btoa: "readonly",
        atob: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".vue"],
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "vue/multi-word-component-names": "off",
      // Потолок размера файла (CLAUDE.md «Размер файла — жёсткое правило»):
      // монолиты EditorView (3358) и ViewportContainer (1620) стоили репозиторию
      // почти всех багов рассинхрона сцены и picking'а. Приблизился к порогу —
      // режь по доменам в composables/, а не дописывай.
      "max-lines": [
        "warn",
        { max: 600, skipBlankLines: false, skipComments: false },
      ],
    },
  },
  {
    // Машинная генерация из OpenAPI-схемы backend (`npm run gen:api`):
    // размер задаёт схема, руками файл не правится — потолок к нему неприменим.
    files: ["src/types/api.generated.ts"],
    rules: { "max-lines": "off" },
  },
  {
    // Дизайн-система (AGENTS.md «UI и дизайн-система»): сырые контролы вне
    // components/ui/ — это разнобой стилей, дублирование CSS и потеря
    // доступности из zag. Правило держит счётчик от роста: новый файл с
    // сырым <button>/<input> валит линт, а не тихо добавляется к долгу.
    files: ["src/**/*.vue"],
    ignores: ["src/components/ui/**", ...RAW_CONTROL_DEBTORS],
    rules: {
      "vue/no-restricted-html-elements": [
        "error",
        {
          element: "button",
          message: "Используй KrButton из components/ui вместо сырого <button>.",
        },
        {
          element: "input",
          message:
            "Используй KrInput/KrNumberInput из components/ui вместо сырого <input>.",
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
  },
];
