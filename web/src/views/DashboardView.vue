<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuth } from "@/composables/shared/useAuth";
import { useProjects } from "@/composables/shared/useProjects";
import { useI18n } from "@/composables/shared/useI18n";
import KrLogo from "@/components/ui/KrLogo.vue";
import KrButton from "@/components/ui/KrButton.vue";
import KrInput from "@/components/ui/KrInput.vue";
import KrDialog from "@/components/ui/KrDialog.vue";
import KrIcon from "@/components/ui/KrIcon.vue";
import ProjectThumbnail from "@/components/projects/ProjectThumbnail.vue";
import type { IconName } from "@/components/ui/icons";
import { pluralize } from "@/lib/plural";
import type { Project } from "@/types/api";

const router = useRouter();
const auth = useAuth();
const projectsStore = useProjects();
const { t } = useI18n();

const search = ref("");

const showCreateDialog = ref(false);
const newProjectName = ref("");
const newProjectDesc = ref("");
const creating = ref(false);

const renameDialog = ref(false);
const renameProjectId = ref("");
const renameProjectName = ref("");
const renaming = ref(false);

const navItems: { label: string; icon: IconName; active?: boolean }[] = [
  { label: "Все проекты", icon: "grid", active: true },
];

const thumbTops = [
  "oklch(0.42 0.03 250)",
  "oklch(0.46 0.06 233)",
  "oklch(0.44 0.05 75)",
  "oklch(0.44 0.05 150)",
];

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return projectsStore.projects.value;
  return projectsStore.projects.value.filter((p) => p.name.toLowerCase().includes(q));
});

const userInitial = computed(() => (auth.user.value?.display_name || auth.user.value?.email || "?").charAt(0).toUpperCase());
const userName = computed(() => auth.user.value?.display_name || auth.user.value?.email || "Пользователь");
// Без введённого имени backend кладёт в display_name почту — не дублируем её строкой ниже
const userEmail = computed(() => {
  const u = auth.user.value;
  return u && u.display_name && u.display_name !== u.email ? u.email : "";
});

onMounted(async () => {
  await projectsStore.fetchProjects();
});

async function handleCreate() {
  if (!newProjectName.value.trim()) return;
  creating.value = true;
  try {
    const project = await projectsStore.createProject(
      newProjectName.value.trim(),
      newProjectDesc.value.trim() || undefined,
    );
    showCreateDialog.value = false;
    newProjectName.value = "";
    newProjectDesc.value = "";
    router.push(`/editor/${project.id}`);
  } catch {
    // handled by store
  } finally {
    creating.value = false;
  }
}

function openRename(project: Project) {
  renameProjectId.value = project.id;
  renameProjectName.value = project.name;
  renameDialog.value = true;
}

async function handleRename() {
  if (!renameProjectName.value.trim()) return;
  renaming.value = true;
  try {
    await projectsStore.updateProject(renameProjectId.value, { name: renameProjectName.value.trim() });
    renameDialog.value = false;
  } catch {
    // handled by store
  } finally {
    renaming.value = false;
  }
}

const deleteTarget = ref<Project | null>(null);
const deleting = ref(false);

async function confirmDelete() {
  const project = deleteTarget.value;
  if (!project) return;
  deleting.value = true;
  try {
    await projectsStore.deleteProject(project.id);
    deleteTarget.value = null;
  } finally {
    deleting.value = false;
  }
}

async function handleLogout() {
  await auth.logout();
  router.push("/landing");
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
</script>

<template>
  <div :class="$style.page">
    <!-- sidebar -->
    <aside :class="$style.sidebar">
      <KrLogo :size="24" :class="$style.brand" @click="router.push('/landing')" />
      <button :class="$style.newBtn" @click="showCreateDialog = true">
        <KrIcon name="plus" :size="16" />Новый проект
      </button>

      <nav :class="$style.nav">
        <div
          v-for="n in navItems"
          :key="n.label"
          :class="[$style.navItem, n.active && $style.navItemActive]"
        >
          <KrIcon :name="n.icon" :size="15" />
          {{ n.label }}
        </div>
      </nav>

      <div :class="$style.user">
        <div :class="$style.avatar">{{ userInitial }}</div>
        <div :class="$style.userMeta">
          <div :class="$style.userName">{{ userName }}</div>
          <div v-if="userEmail" :class="$style.userEmail">{{ userEmail }}</div>
        </div>
        <router-link
          v-if="auth.user.value?.is_admin"
          to="/admin"
          :class="[$style.userAction, $style.account]"
          title="Администрирование"
          aria-label="Администрирование"
          data-testid="admin-link"
        >
          <KrIcon name="shield" :size="16" />
        </router-link>
        <router-link
          to="/account"
          :class="[$style.userAction, !auth.user.value?.is_admin && $style.account]"
          :title="t('account.title')"
          :aria-label="t('account.title')"
          data-testid="account-link"
        >
          <KrIcon name="user" :size="16" />
        </router-link>
        <button :class="$style.userAction" title="Выйти" aria-label="Выйти" @click="handleLogout">
          <KrIcon name="logout" :size="16" />
        </button>
      </div>
    </aside>

    <!-- main -->
    <div :class="$style.main">
      <header :class="$style.header">
        <div :class="$style.headerTitle">Мои проекты</div>
        <div :class="$style.search">
          <KrIcon name="search" :size="15" />
          <input v-model="search" :class="$style.searchInput" placeholder="Поиск по проектам…" aria-label="Поиск по проектам" />
        </div>
      </header>

      <div :class="$style.content">
        <div v-if="projectsStore.isLoading.value" :class="$style.muted">Загрузка проектов…</div>

        <template v-else>
          <div v-if="filtered.length > 0" :class="$style.sectionLabel">
            {{ pluralize(filtered.length, "проект", "проекта", "проектов") }}
          </div>

          <div v-if="filtered.length === 0 && search.trim()" :class="$style.empty">
            <p :class="$style.emptyTitle">Ничего не нашлось</p>
            <p :class="$style.muted">По запросу «{{ search.trim() }}» нет проектов.</p>
          </div>

          <div v-else-if="filtered.length === 0" :class="$style.empty">
            <p :class="$style.emptyTitle">Пока нет проектов</p>
            <p :class="$style.muted">Создайте первый проект, чтобы начать.</p>
            <button :class="$style.newBtn" @click="showCreateDialog = true">
              <KrIcon name="plus" :size="16" />Новый проект
            </button>
          </div>

          <div v-else :class="$style.grid">
            <div
              v-for="(p, i) in filtered"
              :key="p.id"
              :class="$style.card"
              @click="router.push(`/editor/${p.id}`)"
            >
              <div :class="$style.cardThumb">
                <ProjectThumbnail :project-id="p.id" :top-color="thumbTops[i % thumbTops.length]" />
                <span :class="$style.badge">Личный</span>
                <div :class="$style.cardActions" @click.stop>
                  <button :class="$style.actionBtn" title="Переименовать" aria-label="Переименовать" @click="openRename(p)">
                    <KrIcon name="pencil" :size="14" />
                  </button>
                  <button :class="$style.actionBtn" title="Удалить" aria-label="Удалить" @click="deleteTarget = p">
                    <KrIcon name="trash" :size="14" />
                  </button>
                </div>
              </div>
              <div :class="$style.cardInfo">
                <div :class="$style.cardName">{{ p.name }}</div>
                <div v-if="p.description" :class="$style.cardDesc">{{ p.description }}</div>
                <div :class="$style.cardMeta">
                  <span>изменён {{ formatDate(p.updated_at) }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <KrDialog v-model:open="showCreateDialog">
      <template #title>Новый проект</template>
      <div :class="$style.dialogForm">
        <KrInput v-model="newProjectName" label="Название проекта" placeholder="Мой CAD-проект" />
        <KrInput v-model="newProjectDesc" label="Описание (необязательно)" placeholder="О чём этот проект?" />
      </div>
      <template #footer>
        <KrButton variant="secondary" size="md" @click="showCreateDialog = false">Отмена</KrButton>
        <KrButton variant="primary" size="md" :loading="creating" @click="handleCreate">Создать</KrButton>
      </template>
    </KrDialog>

    <KrDialog v-model:open="renameDialog">
      <template #title>Переименовать проект</template>
      <KrInput v-model="renameProjectName" label="Название проекта" />
      <template #footer>
        <KrButton variant="secondary" size="md" @click="renameDialog = false">Отмена</KrButton>
        <KrButton variant="primary" size="md" :loading="renaming" @click="handleRename">Сохранить</KrButton>
      </template>
    </KrDialog>

    <KrDialog :open="deleteTarget !== null" @update:open="deleteTarget = null">
      <template #title>Удалить проект?</template>
      <p :class="$style.muted">
        Проект «{{ deleteTarget?.name }}» и вся его история построения будут удалены безвозвратно.
      </p>
      <template #footer>
        <KrButton variant="secondary" size="md" @click="deleteTarget = null">Отмена</KrButton>
        <KrButton variant="danger" size="md" :loading="deleting" @click="confirmDelete">Удалить</KrButton>
      </template>
    </KrDialog>
  </div>
</template>

<style module>
.page {
  display: flex;
  height: 100vh;
  background: var(--kr-surface);
}

.sidebar {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--kr-border-subtle);
  background: var(--kr-surface-alt);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
}

.brand {
  cursor: pointer;
  padding: 0 8px 22px;
}

.newBtn {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--kr-primary);
  color: var(--kr-primary-fg);
  font-weight: var(--kr-font-weight-bold);
  font-size: 14px;
  padding: 10px;
  border: none;
  border-radius: 8px;
  margin-bottom: 20px;
  transition: background var(--kr-transition-fast);
}

.newBtn:hover {
  background: var(--kr-primary-hover);
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.navItem {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13.5px;
  color: var(--kr-text-secondary);
  transition: background var(--kr-transition-fast);
}

.navItem:hover {
  background: var(--kr-surface-hover);
}

.navItemActive {
  color: var(--kr-text);
  background: var(--kr-primary-soft);
}

.navItem svg {
  color: var(--kr-text-muted);
  flex-shrink: 0;
}

.user {
  margin-top: auto;
  border-top: 1px solid var(--kr-border-subtle);
  padding-top: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--kr-red);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: var(--kr-font-weight-bold);
  font-size: 13px;
  color: #fff;
  flex-shrink: 0;
}

.userMeta {
  line-height: 1.3;
  min-width: 0;
}

.userName {
  font-size: 13px;
  font-weight: var(--kr-font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.userEmail {
  font-size: 11px;
  color: var(--kr-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.userAction {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--kr-text-muted);
  cursor: pointer;
  transition: color var(--kr-transition-fast);
}

.userAction:hover {
  color: var(--kr-text);
}

.account {
  margin-left: auto;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--kr-surface);
}

.header {
  height: 64px;
  border-bottom: 1px solid var(--kr-border-subtle);
  display: flex;
  align-items: center;
  padding: 0 30px;
  gap: 16px;
}

.headerTitle {
  font-size: 18px;
  font-weight: var(--kr-font-weight-bold);
  letter-spacing: -0.02em;
}

.search {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--kr-surface-raised);
  border: 1px solid var(--kr-border-strong);
  border-radius: 8px;
  padding: 8px 13px;
  width: 240px;
  color: var(--kr-text-muted);
  font-size: 13px;
}

.searchInput {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--kr-text);
  font-family: inherit;
  font-size: 13px;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 28px 30px;
}

.sectionLabel {
  margin-bottom: 18px;
  font-family: var(--kr-font-mono);
  font-size: 12px;
  color: var(--kr-text-secondary);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}

.card {
  cursor: pointer;
  border: 1px solid var(--kr-border);
  border-radius: 11px;
  overflow: hidden;
  background: var(--kr-surface-raised);
  box-shadow: var(--kr-shadow-sm);
  transition: border-color var(--kr-transition-fast);
}

.card:hover {
  border-color: var(--kr-primary-border);
}

.cardThumb {
  height: 150px;
  position: relative;
}

.badge {
  position: absolute;
  top: 10px;
  right: 10px;
  font-family: var(--kr-font-mono);
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 20px;
  background: oklch(1 0 0 / 0.86);
  border: 1px solid var(--kr-border-strong);
  color: var(--kr-text-secondary);
}

.cardActions {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity var(--kr-transition-fast);
}

.card:hover .cardActions {
  opacity: 1;
}

.actionBtn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: oklch(1 0 0 / 0.92);
  border: 1px solid var(--kr-border-strong);
  color: var(--kr-text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: color var(--kr-transition-fast);
}

.actionBtn:hover {
  color: var(--kr-text);
}

.cardInfo {
  padding: 14px 15px;
}

.cardName {
  font-size: 14px;
  font-weight: var(--kr-font-weight-bold);
  margin-bottom: 5px;
}

.cardDesc {
  font-size: 12px;
  color: var(--kr-text-secondary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cardMeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--kr-font-mono);
  font-size: 11px;
  color: var(--kr-text-muted);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.emptyTitle {
  font-size: 16px;
  font-weight: var(--kr-font-weight-medium);
}

.muted {
  color: var(--kr-text-secondary);
  font-size: 14px;
}

.dialogForm {
  display: flex;
  flex-direction: column;
  gap: var(--kr-spacing-md);
}
</style>
