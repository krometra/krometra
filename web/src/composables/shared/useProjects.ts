// Shared projects state (createSharedComposable — singleton)

import { ref } from "vue";
import { createSharedComposable } from "@vueuse/core";
import type { Project } from "@/types/api";
import { useApi } from "../useApi";

export const useProjects = createSharedComposable(() => {
  const projects = ref<Project[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchProjects() {
    isLoading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const response = await api.get<{ projects: Project[] }>("/projects/");
      projects.value = response.projects;
    } catch (e: unknown) {
      const err = e as { error_description?: string; detail?: string };
      error.value = err.error_description || err.detail || "Failed to load projects";
    } finally {
      isLoading.value = false;
    }
  }

  async function createProject(name: string, description?: string) {
    error.value = null;
    try {
      const api = useApi();
      const project = await api.post<Project>("/projects/", {
        name,
        description,
      });
      projects.value.unshift(project);
      return project;
    } catch (e: unknown) {
      const err = e as { error_description?: string; detail?: string };
      error.value = err.error_description || err.detail || "Failed to create project";
      throw e;
    }
  }

  async function updateProject(id: string, data: { name?: string; description?: string }) {
    error.value = null;
    try {
      const api = useApi();
      const updated = await api.patch<Project>(`/projects/${id}`, data);
      const index = projects.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        projects.value[index] = updated;
      }
      return updated;
    } catch (e: unknown) {
      const err = e as { error_description?: string; detail?: string };
      error.value = err.error_description || err.detail || "Failed to update project";
      throw e;
    }
  }

  async function deleteProject(id: string) {
    error.value = null;
    try {
      const api = useApi();
      await api.delete(`/projects/${id}`);
      projects.value = projects.value.filter((p) => p.id !== id);
    } catch (e: unknown) {
      const err = e as { error_description?: string; detail?: string };
      error.value = err.error_description || err.detail || "Failed to delete project";
      throw e;
    }
  }

  return {
    projects,
    isLoading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  };
});
