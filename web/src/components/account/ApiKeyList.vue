<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import { LOCALE_HTML_LANG } from "@/lib/i18n/locale";
import type { ApiKey } from "@/types/api";
import CsButton from "@/components/ui/CsButton.vue";
import CsIcon from "@/components/ui/CsIcon.vue";

defineProps<{ keys: ApiKey[] }>();
const emit = defineEmits<{ remove: [key: ApiKey] }>();

const { t, locale } = useI18n();

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_HTML_LANG[locale.value], { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}
</script>

<template>
  <p v-if="keys.length === 0" :class="$style.empty">{{ t("account.keys.empty") }}</p>
  <ul v-else :class="$style.list" data-testid="api-key-list">
    <li v-for="key in keys" :key="key.id" :class="$style.row">
      <div :class="$style.meta">
        <div :class="$style.name">{{ key.name }}</div>
        <div :class="$style.details">
          <code :class="$style.prefix">{{ key.prefix }}…</code>
          <span>{{ t("account.keys.createdAt", { date: formatDate(key.created_at) }) }}</span>
          <span>
            {{
              key.last_used_at
                ? t("account.keys.lastUsedAt", { date: formatDate(key.last_used_at) })
                : t("account.keys.neverUsed")
            }}
          </span>
        </div>
      </div>
      <CsButton
        variant="ghost"
        size="sm"
        :aria-label="t('account.keys.deleteAria', { name: key.name })"
        data-testid="api-key-delete"
        @click="emit('remove', key)"
      >
        <CsIcon name="trash" :size="14" />
        {{ t("account.keys.delete") }}
      </CsButton>
    </li>
  </ul>
</template>

<style module>
.empty {
  margin: 0;
  color: var(--cs-text-secondary);
  font-size: var(--cs-font-size-sm);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--cs-border);
  border-radius: var(--cs-radius-lg);
  background: var(--cs-surface-raised);
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.row + .row {
  border-top: 1px solid var(--cs-border-subtle);
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  font-weight: var(--cs-font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 3px;
  font-size: var(--cs-font-size-xs);
  color: var(--cs-text-secondary);
}

.prefix {
  font-family: var(--cs-font-mono);
}
</style>
