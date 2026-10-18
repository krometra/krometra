import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "@krometra/ui-kit/style.css";
import "./styles/sketcher.css";
import { applyTheme } from "@krometra/ui-kit";
import { useI18n } from "./composables/shared/useI18n";
import { APP_THEME } from "./lib/appTheme";

applyTheme(APP_THEME);

const app = createApp(App);
app.use(router);
useI18n()
  .initialize()
  .finally(() => app.mount("#app"));
