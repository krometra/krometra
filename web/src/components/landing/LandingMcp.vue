<script setup lang="ts">
import { computed } from "vue";
import KrButton from "@/components/ui/KrButton.vue";
import { MCP_README_URL, connectCommand } from "@/lib/mcpConnect";
import { siteOrigin } from "@/lib/siteOrigin";

const emit = defineEmits<{ start: [] }>();

const command = computed(() => connectCommand(siteOrigin(), "krm_..."));

const steps = [
  { title: "Создайте ключ", body: "На странице аккаунта, один раз. Ключ даёт ассистенту доступ только к вашим проектам." },
  { title: "Подключите сервер", body: "Одной командой в Claude Code или в настройках другого клиента MCP." },
  { title: "Откройте проект", body: "Ассистент работает в вашей вкладке редактора: каждый шаг виден сразу, любой можно отменить." },
];
</script>

<template>
  <section id="ai" :class="$style.section">
    <div :class="$style.intro">
      <div :class="$style.tag">ИИ-АССИСТЕНТ · MCP</div>
      <h2 :class="$style.h2">Опишите деталь словами</h2>
      <p :class="$style.lead">
        Крометра подключается к Claude и другим ассистентам по протоколу MCP. Ассистент сам рисует
        эскизы, выдавливает тела, скругляет рёбра и проверяет размеры, а вы смотрите на модель
        и правите то, что не понравилось.
      </p>
      <ol :class="$style.steps">
        <li v-for="(step, i) in steps" :key="step.title" :class="$style.step">
          <span :class="$style.stepNumber">{{ i + 1 }}</span>
          <div>
            <div :class="$style.stepTitle">{{ step.title }}</div>
            <div :class="$style.stepBody">{{ step.body }}</div>
          </div>
        </li>
      </ol>
      <div :class="$style.actions">
        <KrButton :class="$style.cta" @click="emit('start')">Подключить ассистента</KrButton>
        <a :class="$style.docsLink" :href="MCP_README_URL" target="_blank" rel="noopener">Инструкция по подключению</a>
      </div>
    </div>

    <div :class="$style.demo">
      <div :class="$style.chat">
        <div :class="[$style.message, $style.messageUser]">
          Сделай кронштейн 60×40 мм толщиной 4 мм, два отверстия под M4 и скругли углы на 3 мм
        </div>
        <div :class="[$style.message, $style.messageAgent]">
          <div :class="$style.trace">
            <span>sketch.create</span><span>extrude 4 мм</span><span>hole Ø4.5 ×2</span><span>fillet 3 мм</span>
          </div>
          Готово. Кронштейн открыт у вас в редакторе: четыре операции в истории, отверстия на
          расстоянии 40 мм. Если нужно толще, поменяю выдавливание.
        </div>
      </div>
      <pre :class="$style.command" data-testid="landing-mcp-command">{{ command }}</pre>
    </div>
  </section>
</template>

<style module>
.section {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 40px 90px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}

.tag {
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-primary);
  margin-bottom: 14px;
}

.h2 {
  font-size: 30px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
  margin: 0 0 16px;
}

.lead {
  font-size: 16px;
  line-height: 1.6;
  color: var(--kr-text-secondary);
  margin: 0 0 26px;
  max-width: 520px;
  text-wrap: pretty;
}

.steps {
  list-style: none;
  padding: 0;
  margin: 0 0 30px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.stepNumber {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--kr-primary-border);
  color: var(--kr-primary);
  display: grid;
  place-items: center;
  font-family: var(--kr-font-mono);
  font-size: 12px;
}

.stepTitle {
  font-size: 15px;
  font-weight: var(--kr-font-weight-bold);
  margin-bottom: 3px;
}

.stepBody {
  font-size: 14px;
  line-height: 1.5;
  color: var(--kr-text-secondary);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
}

.cta.cta {
  font-weight: var(--kr-font-weight-bold);
  font-size: 15px;
  padding: 13px 24px;
  border-radius: 9px;
}

.docsLink {
  font-size: 14px;
  color: var(--kr-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.docsLink:hover {
  color: var(--kr-text);
}

.demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.chat {
  border: 1px solid var(--kr-border-strong);
  border-radius: 12px;
  background: var(--kr-surface-raised);
  box-shadow: var(--kr-shadow-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  font-size: 14px;
  line-height: 1.55;
  padding: 12px 14px;
  border-radius: 10px;
  max-width: 88%;
}

.messageUser {
  align-self: flex-end;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
}

.messageAgent {
  align-self: flex-start;
  background: var(--kr-surface-alt);
  color: var(--kr-text);
}

.trace {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.trace span {
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
  border: 1px solid var(--kr-border);
  border-radius: 6px;
  padding: 2px 7px;
  background: var(--kr-surface-raised);
}

.command {
  margin: 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: oklch(0.24 0.02 250);
  color: oklch(0.92 0.01 250);
  font-family: var(--kr-font-mono);
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
}

@media (max-width: 900px) {
  .section {
    grid-template-columns: 1fr;
    padding: 0 16px 64px;
    gap: 32px;
  }
}
</style>
