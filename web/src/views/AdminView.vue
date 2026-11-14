<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "@/composables/shared/useI18n";
import { KSegmented } from "@krometra/ui-kit";
import { ADMIN_PERIODS, useAdminOverview, type AdminPeriod } from "@/composables/admin/useAdminOverview";
import { errorMessage } from "@/lib/apiError";
import { formatDate } from "@/lib/admin/format";
import { kpiTiles } from "@/lib/admin/overviewView";
import AdminActivityChart from "@/components/admin/AdminActivityChart.vue";
import AdminKpiGrid from "@/components/admin/AdminKpiGrid.vue";
import AdminOperationBars from "@/components/admin/AdminOperationBars.vue";
import AdminProjectsPanel from "@/components/admin/AdminProjectsPanel.vue";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel.vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import KrTabs from "@/components/ui/KrTabs.vue";
import LocaleSwitcher from "@/components/i18n/LocaleSwitcher.vue";

const { t, locale } = useI18n();
const overview = useAdminOverview();
const tab = ref("users");

const periodOptions = computed(() => ADMIN_PERIODS.map((days) => ({ value: days, label: t("admin.days", { count: days }) })));
const tabs = computed(() => [
  { id: "users", label: t("admin.users") },
  { id: "projects", label: t("admin.projects") },
]);
const tiles = computed(() => (overview.overview.value ? kpiTiles(overview.overview.value, t, locale.value) : []));

onMounted(overview.load);
</script>

<template>
  <div :class="$style.page">
    <header :class="$style.header">
      <router-link to="/projects" :class="$style.back"><KrIcon name="arrowLeft" :size="16" />{{ t("admin.back") }}</router-link>
      <LocaleSwitcher />
    </header>

    <main :class="$style.content">
      <div :class="$style.heading">
        <div>
          <h1 :class="$style.title">{{ t("admin.title") }}</h1>
          <p v-if="overview.overview.value" :class="$style.muted">
            {{ t("admin.overviewDate", { date: formatDate(overview.overview.value.generated_at, locale), since: formatDate(overview.overview.value.since, locale) }) }}
          </p>
        </div>
        <KSegmented
          :model-value="overview.period.value"
          :options="periodOptions"
          size="sm"
          data-testid="admin-period"
          @update:model-value="overview.setPeriod($event as AdminPeriod)"
        />
      </div>

      <div v-if="overview.failure.value" :class="$style.failure" role="alert">
        {{ errorMessage(overview.failure.value, t("admin.loadFailed")) }}
        <KrButton variant="secondary" size="sm" @click="overview.load">{{ t("admin.retry") }}</KrButton>
      </div>

      <template v-if="overview.overview.value">
        <AdminKpiGrid :tiles="tiles" :class="{ [$style.stale]: overview.loading.value }" />
        <div :class="$style.panels">
          <section :class="$style.card">
            <h2 :class="$style.cardTitle">{{ t("admin.activity") }}</h2>
            <AdminActivityChart :points="overview.overview.value.series" />
          </section>
          <section :class="$style.card">
            <h2 :class="$style.cardTitle">{{ t("admin.operationsByType") }}</h2>
            <AdminOperationBars
              :operations="overview.overview.value.operations"
              :period-days="overview.overview.value.period_days"
            />
          </section>
        </div>
      </template>
      <p v-else-if="overview.loading.value" :class="$style.muted">{{ t("admin.loading") }}</p>

      <KrTabs v-model="tab" :tabs="tabs">
        <AdminUsersPanel v-if="tab === 'users'" />
        <AdminProjectsPanel v-else />
      </KrTabs>
    </main>
  </div>
</template>

<style module>
.page {
  height: 100vh;
  overflow-y: auto;
  background: var(--kr-surface);
  color: var(--kr-text);
}

.header {
  height: 64px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
  border-bottom: 1px solid var(--kr-border-subtle);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--kr-text-secondary);
  text-decoration: none;
  font-size: var(--kr-font-size-sm);
  transition: color var(--kr-transition-fast);
}

.back:hover {
  color: var(--kr-text);
}

.content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px 30px 64px;
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-lg);
}

.heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--kr-spacing-md);
  flex-wrap: wrap;
}

.title {
  margin: 0 0 6px;
  font-size: var(--kr-font-size-2xl);
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
}

.muted {
  margin: 0;
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
}

.failure {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--kr-error);
  font-size: var(--kr-font-size-sm);
}

.stale {
  opacity: 0.6;
}

.panels {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--kr-spacing-md);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
  padding: var(--kr-spacing-md) var(--kr-spacing-lg);
  border: 1px solid var(--kr-border-subtle);
  border-radius: var(--kr-radius-lg);
  background: var(--kr-surface-raised);
}

.cardTitle {
  margin: 0;
  font-size: var(--kr-font-size-md);
  font-weight: var(--kr-font-weight-bold);
}

@media (max-width: 960px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .header,
  .content {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
