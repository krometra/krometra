import { createRouter, createWebHistory } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { syncSignedInHint } from "@/lib/signedInHint";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "landing",
      component: () => import("@/views/LandingView.vue"),
    },
    { path: "/landing", redirect: "/" },
    {
      path: "/privacy",
      name: "privacy",
      component: () => import("@/views/PrivacyView.vue"),
    },
    {
      path: "/consent",
      name: "consent",
      component: () => import("@/views/ConsentView.vue"),
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { guest: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("@/views/RegisterView.vue"),
      meta: { guest: true },
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      component: () => import("@/views/ForgotPasswordView.vue"),
    },
    {
      path: "/reset-password",
      name: "reset-password",
      component: () => import("@/views/ResetPasswordView.vue"),
    },
    {
      path: "/verify-email",
      name: "verify-email",
      component: () => import("@/views/VerifyEmailView.vue"),
    },
    {
      path: "/projects",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/account",
      name: "account",
      component: () => import("@/views/AccountView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: () => import("@/views/AdminView.vue"),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: "/editor/:id",
      name: "editor",
      component: () => import("@/views/EditorView.vue"),
      meta: { requiresAuth: true },
      props: (route) => ({ id: route.params.id, watch: route.query.watch === "1" }),
    },
  ],
});

// Global auth guard
router.beforeEach(async (to, _from, next) => {
  const auth = useAuth();

  // If we don't have a token yet, try to refresh
  if (!auth.isAuthenticated.value) {
    await auth.initialize();
  }
  syncSignedInHint(auth.isAuthenticated.value);

  if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
    next({ name: "login", query: { redirect: to.fullPath } });
  } else if (to.meta.guest && auth.isAuthenticated.value) {
    next({ name: "dashboard" });
  } else if (to.meta.requiresAdmin && !auth.user.value?.is_admin) {
    next({ name: "dashboard" });
  } else {
    next();
  }
});

export default router;
