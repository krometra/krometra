import type { DomainMessages } from "../../message";

export const projects = {
  "projects.all": "All projects",
  "projects.user": "User",
  "projects.new": "New project",
  "projects.admin": "Administration",
  "projects.logout": "Sign out",
  "projects.title": "My projects",
  "projects.search": "Search projects…",
  "projects.loading": "Loading projects…",
  "projects.emptySearch": "No results",
  "projects.emptySearchDetail": "No projects match “{query}”.",
  "projects.empty": "No projects yet",
  "projects.emptyDetail": "Create your first project to get started.",
  "projects.personal": "Personal",
  "projects.rename": "Rename",
  "projects.delete": "Delete",
  "projects.updated": "Updated {date}",
  "projects.name": "Project name",
  "projects.namePlaceholder": "My CAD project",
  "projects.description": "Description (optional)",
  "projects.descriptionPlaceholder": "What is this project about?",
  "projects.cancel": "Cancel",
  "projects.create": "Create",
  "projects.renameTitle": "Rename project",
  "projects.save": "Save",
  "projects.deleteTitle": "Delete project?",
  "projects.deleteDetail": "The project “{name}” and its entire modeling history will be permanently deleted.",
  "projects.count": {
    "one": "{count} project",
    "other": "{count} projects"
  }
} as const satisfies DomainMessages<"projects">;
