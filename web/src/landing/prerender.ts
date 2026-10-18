import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { createMemoryHistory, createRouter } from "vue-router";
import { themeToCss } from "@krometra/ui-kit";
import LandingView from "@/views/LandingView.vue";
import { APP_THEME } from "@/lib/appTheme";

export { landingDocument } from "./landingDocument";

export async function renderLanding(): Promise<{ html: string; themeCss: string }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:path(.*)*", component: LandingView }],
  });
  const app = createSSRApp(LandingView);
  app.use(router);
  await router.push("/");
  await router.isReady();
  return { html: await renderToString(app), themeCss: themeToCss(APP_THEME) };
}
