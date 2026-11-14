<script setup lang="ts">
import { useI18n } from "@/composables/shared/useI18n";
import LegalLayout from "@/components/legal/LegalLayout.vue";
import { operator } from "@/lib/legal";

const { t } = useI18n();
</script>

<template>
  <LegalLayout :title="t('legalText.privacyTitle')">
    <h2>{{ t("legalText.privacy.h1") }}</h2>
    <p>{{ t("legalText.privacy.p1", { product: t("common.productName") }) }}</p>
    <p>{{ t("legalText.privacy.operator", { name: operator.name }) }} <a :href="`mailto:${operator.email}`">{{ operator.email }}</a>.</p>
    <p>{{ t("legalText.privacy.url") }}</p>

    <h2>{{ t("legalText.privacy.h2") }}</h2>
    <ul>
      <li>{{ t("legalText.privacy.d1") }}</li>
      <li>{{ t("legalText.privacy.d2") }}</li>
      <li>{{ t("legalText.privacy.d3") }}</li>
      <li>{{ t("legalText.privacy.d4") }}</li>
      <li>{{ t("legalText.privacy.d5") }}</li>
    </ul>
    <p>{{ t("legalText.privacy.special") }}</p>

    <h2>{{ t("legalText.privacy.h3") }}</h2>
    <ul>
      <li>{{ t("legalText.privacy.g1") }}</li>
      <li>{{ t("legalText.privacy.g2") }}</li>
      <li>{{ t("legalText.privacy.g3") }}</li>
      <li>{{ t("legalText.privacy.g4") }}</li>
    </ul>
    <p>{{ t("legalText.privacy.noAds") }}</p>

    <h2>{{ t("legalText.privacy.h4") }}</h2>
    <p>{{ t("legalText.privacy.consentIntro") }} <router-link to="/consent">{{ t("legalText.consentTitle") }}</router-link>.</p>
    <p>{{ t("legalText.privacy.logs") }}</p>

    <h2>{{ t("legalText.privacy.h5") }}</h2>
    <p>{{ t("legalText.privacy.processing") }}</p>
    <p>{{ t("legalText.privacy.storage") }}</p>
    <p>{{ t("legalText.privacy.providers") }}</p>
    <p>{{ t("legalText.privacy.ai") }}</p>

    <h2>{{ t("legalText.privacy.h6") }}</h2>
    <p>{{ t("legalText.privacy.cookies") }}</p>

    <h2>{{ t("legalText.privacy.h7") }}</h2>
    <p>{{ t("legalText.privacy.retention") }}</p>

    <h2>{{ t("legalText.privacy.h8") }}</h2>
    <ul>
      <li>{{ t("legalText.privacy.r1") }}</li>
      <li>{{ t("legalText.privacy.r2") }}</li>
      <li>{{ t("legalText.privacy.r3") }}</li>
      <li>{{ t("legalText.privacy.r4") }}</li>
    </ul>
    <p>{{ t("legalText.privacy.request1") }} <a :href="`mailto:${operator.email}`">{{ operator.email }}</a> {{ t("legalText.privacy.request2") }}</p>

    <h2>{{ t("legalText.privacy.h9") }}</h2>
    <p>{{ t("legalText.privacy.security") }}</p>
    <h2>{{ t("legalText.privacy.h10") }}</h2>
    <p>{{ t("legalText.privacy.changes") }}</p>
  </LegalLayout>
</template>
