import type { DomainMessages } from "../../message";

export const projects = {
  "projects.all": "Все проекты",
  "projects.user": "Пользователь",
  "projects.new": "Новый проект",
  "projects.admin": "Администрирование",
  "projects.logout": "Выйти",
  "projects.title": "Мои проекты",
  "projects.search": "Поиск по проектам…",
  "projects.loading": "Загрузка проектов…",
  "projects.emptySearch": "Ничего не нашлось",
  "projects.emptySearchDetail": "По запросу «{query}» нет проектов.",
  "projects.empty": "Пока нет проектов",
  "projects.emptyDetail": "Создайте первый проект, чтобы начать.",
  "projects.personal": "Личный",
  "projects.rename": "Переименовать",
  "projects.delete": "Удалить",
  "projects.updated": "изменён {date}",
  "projects.name": "Название проекта",
  "projects.namePlaceholder": "Мой CAD-проект",
  "projects.description": "Описание (необязательно)",
  "projects.descriptionPlaceholder": "О чём этот проект?",
  "projects.cancel": "Отмена",
  "projects.create": "Создать",
  "projects.renameTitle": "Переименовать проект",
  "projects.save": "Сохранить",
  "projects.deleteTitle": "Удалить проект?",
  "projects.deleteDetail": "Проект «{name}» и вся его история построения будут удалены безвозвратно.",
  "projects.count": {
    "one": "{count} проект",
    "few": "{count} проекта",
    "many": "{count} проектов",
    "other": "{count} проекта"
  }
} as const satisfies DomainMessages<"projects">;
