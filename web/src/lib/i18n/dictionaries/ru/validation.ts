import type { DomainMessages } from "../../message";

export const validation = {
  "validation.email.required": "Введите адрес почты.",
  "validation.email.invalid": "Похоже на опечатку — проверьте адрес почты.",
  "validation.password.required": "Введите пароль.",
  "validation.password.tooShort": {
    one: "Пароль должен быть не короче {count} символа.",
    few: "Пароль должен быть не короче {count} символов.",
    many: "Пароль должен быть не короче {count} символов.",
    other: "Пароль должен быть не короче {count} символа.",
  },
  "validation.password.confirmRequired": "Повторите пароль.",
  "validation.password.mismatch": "Пароли не совпадают.",
  "validation.consent.required": "Без согласия на обработку персональных данных создать аккаунт нельзя.",
} as const satisfies DomainMessages<"validation">;
