import type { Translation } from "../../message";
import type { validation as source } from "../ru/validation";

export const validation: Translation<typeof source> = {
  "validation.email.required": "请输入邮箱地址。",
  "validation.email.invalid": "邮箱地址似乎有误，请检查。",
  "validation.password.required": "请输入密码。",
  "validation.password.tooShort": {
    other: "密码长度不能少于 {count} 个字符。",
  },
  "validation.password.confirmRequired": "请再次输入密码。",
  "validation.password.mismatch": "两次输入的密码不一致。",
  "validation.consent.required": "未同意处理个人数据，无法创建账户。",
};
