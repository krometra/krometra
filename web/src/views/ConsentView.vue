<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import LegalLayout from "@/components/legal/LegalLayout.vue";
import { operator } from "@/lib/legal";

const { t } = useI18n();
</script>

<template>
  <LegalLayout :title="t('legalText.consentTitle')">
    <p>
      {{ t("legalText.consent.intro", { product: t("common.productName"), name: operator.name }) }}
      <a :href="`mailto:${operator.email}`">{{ operator.email }}</a>{{ t("legalText.consent.introEnd") }}
    </p>
    <h2>{{ t("legalText.consent.h1") }}</h2>
    <p>{{ t("legalText.consent.data") }}</p>
    <h2>{{ t("legalText.consent.h2") }}</h2>
    <p>{{ t("legalText.consent.purposes") }}</p>
    <h2>{{ t("legalText.consent.h3") }}</h2>
    <p>{{ t("legalText.consent.actions") }}</p>
    <h2>{{ t("legalText.consent.h4") }}</h2>
    <p>{{ t("legalText.consent.duration") }}</p>
    <h2>{{ t("legalText.consent.h5") }}</h2>
    <p>{{ t("legalText.consent.revoke1") }} <a :href="`mailto:${operator.email}`">{{ operator.email }}</a> {{ t("legalText.consent.revoke2") }}</p>
    <p>{{ t("legalText.consent.more") }} <router-link to="/privacy">{{ t("legalText.privacyTitle") }}</router-link>.</p>
  </LegalLayout>
</template>
