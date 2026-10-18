import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "@krometra/ui-kit/style.css";
import "./styles/sketcher.css";
import { applyTheme } from "@krometra/ui-kit";
import { useI18n } from "./composables/shared/useI18n";

applyTheme({
  preset: "ocean",
  scheme: "light",
  radius: "soft",
  density: "comfortable",
  accent: "#006eb8",
  accentHover: "#005fa7",
  accentSoft: "#d5ebfe",
  text: "#1e2731",
  textMuted: "#636a71",
  textFaint: "#82878c",
});

const app = createApp(App);
app.use(router);
useI18n()
  .initialize()
  .finally(() => app.mount("#app"));
