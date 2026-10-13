import type { Translation } from "../../message";
import type { auth as source } from "../ru/auth";

export const auth: Translation<typeof source> = {
  "auth.field.email.label": "邮箱",
  "auth.field.email.placeholder": "engineer@company.com",
  "auth.field.password.label": "密码",
  "auth.field.password.hint": {
    other: "至少 {count} 个字符",
  },
  "auth.field.name.label": "姓名",
  "auth.field.name.placeholder": "选填",

  "auth.login.title": "登录工作区",
  "auth.login.subtitle": "项目、共享和修改历史都与账号绑定。",
  "auth.login.emailDivider": "或使用邮箱",
  "auth.login.submit": "继续",
  "auth.login.submitting": "正在登录…",
  "auth.login.terms": "继续即表示您同意使用条款\n和数据处理政策。",
  "auth.login.noAccount": "还没有账号？",
  "auth.login.registerLink": "注册",
  "auth.login.failed": "登录失败。",

  "auth.register.title": "创建账号",
  "auth.register.subtitle": "用于存放 CAD 项目的个人工作区。",
  "auth.register.submit": "创建账号",
  "auth.register.submitting": "正在创建…",
  "auth.register.hasAccount": "已有账号？",
  "auth.register.loginLink": "登录",
  "auth.register.failed": "注册失败。",
};
