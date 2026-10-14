/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "src") },
      // Условие "development" отдаёт исходники foxy-ui-kit с голыми импортами
      // @zag-js 1.x, и в dev они сталкиваются с нашими @zag-js 0.77 в кэше Vite.
      { find: /^foxy-ui-kit$/, replacement: resolve(__dirname, "node_modules/foxy-ui-kit/dist/foxy-ui-kit.js") },
    ],
  },
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
      "/mcp": {
        target: process.env.VITE_MCP_TARGET || "http://localhost:8787",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    // three.js — монолитная библиотека, её чанк ~520 KB и не растёт с нашим кодом
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "three/examples/jsm/controls/OrbitControls.js"],
        },
      },
    },
  },
  // Юнит-тесты живут рядом с кодом в src/; e2e (playwright) — в e2e/
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    benchmark: {
      include: ["src/bench/**/*.bench.ts"],
    },
  },
});
