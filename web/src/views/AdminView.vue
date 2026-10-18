<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

const overview = useAdminOverview();
const tab = ref("users");

const periodOptions = ADMIN_PERIODS.map((days) => ({ value: days, label: `${days} дней` }));
const tabs = [
  { id: "users", label: "Пользователи" },
  { id: "projects", label: "Проекты" },
];
const tiles = computed(() => (overview.overview.value ? kpiTiles(overview.overview.value) : []));

onMounted(overview.load);
</script>

<template>
  <div :class="$style.page">
    <header :class="$style.header">
      <router-link to="/" :class="$style.back"><KrIcon name="arrowLeft" :size="16" />К проектам</router-link>
    </header>

    <main :class="$style.content">
      <div :class="$style.heading">
        <div>
          <h1 :class="$style.title">Администрирование</h1>
          <p v-if="overview.overview.value" :class="$style.muted">
            Данные на {{ formatDate(overview.overview.value.generated_at) }}, период с
            {{ formatDate(overview.overview.value.since) }}
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
        {{ errorMessage(overview.failure.value, "Не удалось загрузить аналитику.") }}
        <KrButton variant="secondary" size="sm" @click="overview.load">Повторить</KrButton>
      </div>

      <template v-if="overview.overview.value">
        <AdminKpiGrid :tiles="tiles" :class="{ [$style.stale]: overview.loading.value }" />
        <div :class="$style.panels">
          <section :class="$style.card">
            <h2 :class="$style.cardTitle">Активность по дням</h2>
            <AdminActivityChart :points="overview.overview.value.series" />
          </section>
          <section :class="$style.card">
            <h2 :class="$style.cardTitle">Операции по типам</h2>
            <AdminOperationBars
              :operations="overview.overview.value.operations"
              :period-days="overview.overview.value.period_days"
            />
          </section>
        </div>
      </template>
      <p v-else-if="overview.loading.value" :class="$style.muted">Загрузка аналитики…</p>

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
