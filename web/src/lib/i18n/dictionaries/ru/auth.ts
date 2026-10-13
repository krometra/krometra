import type { DomainMessages } from "../../message";

export const auth = {
  "auth.field.email.label": "Почта",
  "auth.field.email.placeholder": "инженер@компания.ru",
  "auth.field.password.label": "Пароль",
  "auth.field.password.hint": {
    one: "Минимум {count} символ",
    few: "Минимум {count} символа",
    many: "Минимум {count} символов",
    other: "Минимум {count} символа",
  },
  "auth.field.name.label": "Имя",
  "auth.field.name.placeholder": "Необязательно",

  "auth.login.title": "Вход в рабочее пространство",
  "auth.login.subtitle": "Проекты, общий доступ и история правок привязаны к аккаунту.",
  "auth.login.emailDivider": "или по почте",
  "auth.login.submit": "Продолжить",
  "auth.login.submitting": "Входим…",
  "auth.login.terms": "Продолжая, вы соглашаетесь с условиями использования\nи политикой обработки данных.",
  "auth.login.noAccount": "Нет аккаунта?",
  "auth.login.registerLink": "Создать",
  "auth.login.failed": "Не удалось войти.",

  "auth.register.title": "Создание аккаунта",
  "auth.register.subtitle": "Личное рабочее пространство для ваших CAD-проектов.",
  "auth.register.submit": "Создать аккаунт",
  "auth.register.submitting": "Создаём…",
  "auth.register.hasAccount": "Уже есть аккаунт?",
  "auth.register.loginLink": "Войти",
  "auth.register.failed": "Не удалось зарегистрироваться.",
} as const satisfies DomainMessages<"auth">;
