<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAuth } from "@/composables/shared/useAuth";
import { useI18n } from "@/composables/shared/useI18n";
import { useApiKeys } from "@/composables/account/useApiKeys";
import { toast } from "@/composables/useToast";
import { ApiError, errorMessage } from "@/lib/apiError";
import type { ApiKey } from "@/types/api";
import ApiKeyCreateForm from "@/components/account/ApiKeyCreateForm.vue";
import ApiKeyList from "@/components/account/ApiKeyList.vue";
import ApiKeyReveal from "@/components/account/ApiKeyReveal.vue";
import EmailStatusSection from "@/components/account/EmailStatusSection.vue";
import PasswordChangeForm from "@/components/account/PasswordChangeForm.vue";
import McpConnectGuide from "@/components/account/McpConnectGuide.vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import KrIcon from "@/components/ui/KrIcon.vue";

const auth = useAuth();
const { t } = useI18n();
const apiKeys = useApiKeys();
const origin = window.location.origin;
const emailVerified = computed(() => auth.user.value?.email_verified ?? false);

const deleteTarget = ref<ApiKey | null>(null);
const deleting = ref(false);

onMounted(apiKeys.load);

async function createKey(name: string) {
  try {
    await apiKeys.create(name);
  } catch (error) {
    if (error instanceof ApiError && error.code === "email_not_verified") void auth.fetchMe();
    throw error;
  }
}

async function confirmDelete() {
  const key = deleteTarget.value;
  if (!key) return;
  deleting.value = true;
  try {
    await apiKeys.remove(key.id);
    deleteTarget.value = null;
    toast(t("account.keys.deleted"), "success");
  } catch (error) {
    toast(errorMessage(error, t("account.keys.deleteFailed")), "error");
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div :class="$style.page">
    <header :class="$style.header">
      <router-link to="/projects" :class="$style.back">
        <KrIcon name="arrowLeft" :size="16" />{{ t("account.backToProjects") }}
      </router-link>
    </header>

    <main :class="$style.content">
      <div :class="$style.heading">
        <h1 :class="$style.title">{{ t("account.title") }}</h1>
        <p v-if="auth.user.value" :class="$style.muted">
          {{ t("account.signedInAs", { email: auth.user.value.email }) }}
        </p>
      </div>

      <EmailStatusSection />

      <section :class="$style.section" data-testid="password">
        <h2 :class="$style.sectionTitle">{{ t("account.password.title") }}</h2>
        <p :class="$style.muted">{{ t("account.password.intro") }}</p>
        <PasswordChangeForm />
      </section>

      <section :class="$style.section" data-testid="api-keys">
        <h2 :class="$style.sectionTitle">{{ t("account.keys.title") }}</h2>
        <p :class="$style.muted">{{ t("account.keys.intro") }}</p>

        <ApiKeyReveal
          v-if="apiKeys.revealed.value"
          :created="apiKeys.revealed.value"
          :origin="origin"
          @dismiss="apiKeys.dismissRevealed"
        />

        <div v-if="apiKeys.loading.value" :class="$style.muted">{{ t("account.keys.loading") }}</div>
        <div v-else-if="apiKeys.loadFailure.value" :class="$style.failure" role="alert">
          {{ errorMessage(apiKeys.loadFailure.value, t("account.keys.loadFailed")) }}
          <KrButton variant="secondary" size="sm" @click="apiKeys.load">{{ t("account.keys.retry") }}</KrButton>
        </div>
        <template v-else>
          <ApiKeyCreateForm v-if="emailVerified" :create="createKey" :at-limit="apiKeys.atLimit.value" />
          <p v-else :class="$style.notice" role="status" data-testid="api-key-needs-email">
            {{ t("account.keys.needsVerifiedEmail") }}
          </p>
          <ApiKeyList :keys="apiKeys.keys.value" @remove="deleteTarget = $event" />
        </template>
      </section>

      <McpConnectGuide :class="$style.section" :origin="origin" />
    </main>

    <KrDialog :open="deleteTarget !== null" @update:open="deleteTarget = null">
      <template #title>{{ t("account.keys.deleteTitle") }}</template>
      <p :class="$style.muted">{{ t("account.keys.deleteText", { name: deleteTarget?.name ?? "" }) }}</p>
      <template #footer>
        <KrButton variant="secondary" size="md" @click="deleteTarget = null">{{ t("account.keys.cancel") }}</KrButton>
        <KrButton variant="danger" size="md" :loading="deleting" data-testid="api-key-delete-confirm" @click="confirmDelete">
          {{ t("account.keys.delete") }}
        </KrButton>
      </template>
    </KrDialog>
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
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 30px 64px;
  display: flex;
  flex-direction: column;
  gap: 36px;
}

.heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title {
  margin: 0;
  font-size: var(--kr-font-size-2xl);
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sectionTitle {
  margin: 0;
  font-size: var(--kr-font-size-lg);
  font-weight: var(--kr-font-weight-bold);
}

.muted {
  margin: 0;
  color: var(--kr-text-secondary);
  font-size: 14px;
  line-height: 1.55;
}

.notice {
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--kr-amber-border);
  border-radius: var(--kr-radius-md);
  color: var(--kr-text-secondary);
  font-size: var(--kr-font-size-sm);
  line-height: 1.5;
}

.failure {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--kr-error);
  font-size: var(--kr-font-size-sm);
}

@media (max-width: 600px) {
  .header,
  .content {
    padding-left: 16px;
    padding-right: 16px;
  }
}
</style>
