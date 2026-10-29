<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import KrButton from "@/components/ui/KrButton.vue";
import KrLogo from "@/components/ui/KrLogo.vue";
import LandingMcp from "@/components/landing/LandingMcp.vue";
import editorPreview from "@/assets/landing/editor-preview.webp";
import { useAuth } from "@/composables/shared/useAuth";

const router = useRouter();
const auth = useAuth();

const userName = computed(() => auth.user.value?.display_name || auth.user.value?.email || "Пользователь");
const userInitial = computed(() => userName.value.charAt(0).toUpperCase());

function openWorkspace() {
  router.push(auth.isAuthenticated.value ? "/projects" : "/login");
}

function startWithAssistant() {
  router.push(auth.isAuthenticated.value ? "/account" : "/login");
}

const nav = [
  { label: "Что умеет", target: "features" },
  { label: "ИИ и MCP", target: "ai" },
  { label: "Как устроено", target: "core" },
];

const stats = [
  { value: "Эскиз", label: "форма и размеры" },
  { value: "Тело", label: "объём и детали" },
  { value: "Печать", label: "STL или STEP", accent: true },
];

const core = [
  {
    title: "Точная геометрия",
    body: "Модель остаётся деталью, а не картинкой из треугольников. Грани и рёбра можно выбирать, менять и использовать в следующих операциях.",
  },
  {
    title: "Понятная история",
    body: "Эскиз, выдавливание, фаска — каждый шаг остаётся в дереве модели. Можно вернуться назад и спокойно попробовать другой вариант.",
  },
  {
    title: "Всё под рукой",
    body: "Проекты открываются с любого компьютера. Ничего не нужно устанавливать и переносить на флешке перед встречей или мастерской.",
  },
];

const features = [
  {
    tag: "01 · ЭСКИЗ",
    title: "Набросайте форму",
    body: "Линии, дуги, окружности и прямоугольники. Размеры и связи держат эскиз в порядке, а изменения видны сразу, пока вы тянете точку мышью.",
  },
  {
    tag: "02 · ТЕЛО",
    title: "Соберите деталь",
    body: "Выдавите профиль, поверните его вокруг оси, добавьте скругления или фаски. Объединяйте и вырезайте тела привычными операциями.",
  },
  {
    tag: "03 · ПЕЧАТЬ",
    title: "Подготовьте результат",
    body: "Скачайте STL для 3D-печати или STEP для производства. Если модель уже есть, загрузите её и продолжайте работу с того места, где остановились.",
  },
];
</script>

<template>
  <div :class="$style.page">
    <nav :class="$style.nav">
      <KrLogo @click="router.push('/')" :class="$style.clickable" />
      <div :class="$style.navLinks">
        <a
          v-for="link in nav"
          :key="link.target"
          :href="`#${link.target}`"
          :class="$style.navLink"
        >{{ link.label }}</a>
        <template v-if="auth.isAuthenticated.value">
          <div :class="$style.account" :title="auth.user.value?.email">
            <span :class="$style.avatar">{{ userInitial }}</span>
            <span :class="$style.accountName">{{ userName }}</span>
          </div>
          <KrButton :class="$style.cta" size="sm" @click="openWorkspace">Мои проекты</KrButton>
        </template>
        <template v-else>
          <RouterLink :class="[$style.navLink, $style.navLinkStrong]" to="/login">Войти</RouterLink>
          <KrButton :class="$style.cta" size="sm" @click="router.push('/login')">Начать бесплатно</KrButton>
        </template>
      </div>
    </nav>

    <section :class="$style.hero">
      <div>
        <div :class="$style.badge">
          <span :class="$style.dot" />CAD В БРАУЗЕРЕ
        </div>
        <h1 :class="$style.h1">От эскиза<br />до готовой<br />детали.</h1>
        <p :class="$style.lead">
          Набросайте форму, задайте размеры и соберите модель. Когда всё готово, подготовьте её
          для 3D-печати или производства.
        </p>
        <div :class="$style.heroActions">
          <KrButton :class="$style.cta" @click="openWorkspace">Открыть редактор</KrButton>
          <KrButton variant="ghost" :class="$style.ghostBtn" @click="openWorkspace">Открыть проекты</KrButton>
        </div>
        <div :class="$style.stats">
          <template v-for="(s, i) in stats" :key="s.label">
            <div v-if="i > 0" :class="$style.statDiv" />
            <div>
              <div :class="[$style.statValue, s.accent && $style.statAccent]">{{ s.value }}</div>
              <div :class="$style.statLabel">{{ s.label }}</div>
            </div>
          </template>
        </div>
      </div>

      <div :class="$style.preview">
        <div :class="$style.previewBar">
          <span :class="$style.win" />
          <span :class="$style.win" />
          <span :class="$style.win" />
          <span :class="$style.previewTitle">Кронштейн датчика · Крометра</span>
        </div>
        <img
          :src="editorPreview"
          :class="$style.previewImage"
          width="1600"
          height="1000"
          alt="Редактор Крометры: кронштейн с отверстиями и скруглениями, дерево модели и история операций"
        />
      </div>
    </section>

    <section id="features" :class="$style.features">
      <div v-for="f in features" :key="f.tag" :class="$style.featureCard">
        <div :class="$style.featureTag">{{ f.tag }}</div>
        <div :class="$style.featureTitle">{{ f.title }}</div>
        <div :class="$style.featureBody">{{ f.body }}</div>
      </div>
    </section>

    <LandingMcp @start="startWithAssistant" />

    <section id="core" :class="$style.core">
      <h2 :class="$style.h2">Как это устроено</h2>
      <div :class="$style.coreGrid">
        <div v-for="c in core" :key="c.title" :class="$style.coreItem">
          <div :class="$style.coreTitle">{{ c.title }}</div>
          <div :class="$style.featureBody">{{ c.body }}</div>
        </div>
      </div>
    </section>

    <footer :class="$style.footer">
      Крометра · параметрическое моделирование в браузере ·
      <a :class="$style.footerLink" href="/privacy">политика обработки персональных данных</a> ·
      <a :class="$style.footerLink" href="/THIRD_PARTY_NOTICES.txt">лицензии сторонних компонентов</a>
    </footer>
  </div>
</template>

<style module>
.page {
  height: 100vh;
  overflow-y: auto;
  background: radial-gradient(100% 70% at 80% -10%, oklch(0.93 0.035 244) 0%, var(--kr-surface) 58%);
}

.nav {
  max-width: 1240px;
  margin: 0 auto;
  padding: 22px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.clickable {
  cursor: pointer;
}

.navLinks {
  display: flex;
  align-items: center;
  gap: 30px;
  font-size: 14px;
  color: var(--kr-text-secondary);
}

.navLink {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: color var(--kr-transition-fast);
}

.navLink:hover {
  color: var(--kr-text);
}

.navLinkStrong {
  color: var(--kr-text);
}

.account {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: var(--kr-font-weight-bold);
}

.accountName {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--kr-text);
  font-weight: var(--kr-font-weight-medium);
}

.cta.cta {
  font-weight: var(--kr-font-weight-bold);
  font-size: 15px;
  padding: 13px 24px;
  border-radius: 9px;
}

.nav .cta {
  font-size: 14px;
  padding: 9px 16px;
}

.hero {
  max-width: 1240px;
  margin: 0 auto;
  padding: 64px 40px 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-primary);
  border: 1px solid var(--kr-primary-border);
  border-radius: 20px;
  padding: 5px 13px;
  margin-bottom: 26px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--kr-green);
}

.h1 {
  font-size: 54px;
  line-height: 1.04;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.03em;
  margin: 0 0 22px;
}

.lead {
  font-size: 18px;
  line-height: 1.55;
  color: var(--kr-text-secondary);
  margin: 0 0 34px;
  max-width: 480px;
  text-wrap: pretty;
}

.heroActions {
  display: flex;
  gap: 14px;
  align-items: center;
}

.ghostBtn.ghostBtn {
  border: 1px solid var(--kr-border-strong);
  color: var(--kr-text);
  font-weight: var(--kr-font-weight-medium);
  font-size: 15px;
  padding: 13px 22px;
  border-radius: 9px;
}

.ghostBtn.ghostBtn:hover {
  border-color: var(--kr-text-muted);
}

.stats {
  display: flex;
  gap: 26px;
  margin-top: 46px;
  font-family: var(--kr-font-mono);
}

.statDiv {
  width: 1px;
  background: var(--kr-border-strong);
}

.statValue {
  font-size: 22px;
  white-space: nowrap;
  font-weight: var(--kr-font-weight-medium);
}

.statAccent {
  color: var(--kr-primary);
}

.statLabel {
  font-size: 12px;
  color: var(--kr-text-muted);
  margin-top: 3px;
}

.preview {
  border: 1px solid var(--kr-border-strong);
  border-radius: 12px;
  overflow: hidden;
  background: var(--kr-surface-raised);
  box-shadow: var(--kr-shadow-lg);
}

.previewBar {
  height: 34px;
  background: var(--kr-surface-alt);
  border-bottom: 1px solid var(--kr-border-strong);
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 13px;
}

.win {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--kr-border-strong);
}

.previewTitle {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
  margin-left: 8px;
}

.previewImage {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
}

.features {
  max-width: 1240px;
  margin: 0 auto;
  padding: 90px 40px 80px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}

.featureCard {
  border: 1px solid var(--kr-border);
  border-radius: 11px;
  padding: 26px;
  background: var(--kr-surface-raised);
  box-shadow: var(--kr-shadow-sm);
  transition: border-color var(--kr-transition-fast);
}

.featureCard:hover {
  border-color: var(--kr-primary-border);
}

.featureTag {
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-primary);
  margin-bottom: 14px;
}

.featureTitle {
  font-size: 18px;
  font-weight: var(--kr-font-weight-bold);
  margin-bottom: 9px;
}

.featureBody {
  font-size: 14px;
  line-height: 1.55;
  color: var(--kr-text-secondary);
  text-wrap: pretty;
}

.core {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px 90px;
}

.h2 {
  font-size: 30px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
  margin: 0 0 28px;
}

.coreGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
}

.coreItem {
  border-top: 1px solid var(--kr-border-strong);
  padding-top: 16px;
}

.coreTitle {
  font-size: 16px;
  font-weight: var(--kr-font-weight-bold);
  margin-bottom: 8px;
}

.footer {
  border-top: 1px solid var(--kr-border-subtle);
  padding: 26px 40px;
  text-align: center;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-text-muted);
}

.footerLink {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.footerLink:hover {
  color: var(--kr-text-secondary);
}
</style>
