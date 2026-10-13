import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "foxy-ui-kit/style.css";
import "./styles/sketcher.css";
import { applyTheme } from "foxy-ui-kit";
import { useI18n } from "./composables/shared/useI18n";

applyTheme({ preset: "ocean", scheme: "light", radius: "soft", density: "comfortable" });

const app = createApp(App);
app.use(router);
useI18n()
  .initialize()
  .finally(() => app.mount("#app"));
