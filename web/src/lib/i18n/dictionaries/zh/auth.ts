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

  "auth.field.newPassword.label": "新密码",
  "auth.field.confirmPassword.label": "再次输入密码",
  "auth.login.forgotLink": "忘记密码？",
  "auth.login.passwordReset": "密码已修改，请使用新密码登录。",
  "auth.register.verifySent": "我们已向 {email} 发送邮件：打开其中的链接即可确认邮箱。现在就可以开始使用。",

  "auth.forgot.title": "找回密码",
  "auth.forgot.subtitle": "输入账号邮箱，我们会发送设置新密码的链接。",
  "auth.forgot.submit": "发送链接",
  "auth.forgot.submitting": "正在发送…",
  "auth.forgot.sent": "如果该地址存在，我们已向 {email} 发送邮件。链接 1 小时内有效。",
  "auth.forgot.failed": "邮件发送失败。",
  "auth.forgot.backToLogin": "返回登录",

  "auth.reset.title": "新密码",
  "auth.reset.subtitle": "请设置新密码。保存后，所有设备上的会话都将结束。",
  "auth.reset.submit": "保存密码",
  "auth.reset.submitting": "正在保存…",
  "auth.reset.failed": "修改密码失败。",
  "auth.reset.invalidLink": "链接无效或已过期：链接 1 小时内有效，且只能使用一次。",
  "auth.reset.requestNew": "重新获取链接",

  "auth.verify.title": "邮箱确认",
  "auth.verify.subtitle": "邮件中的链接用于确认您的账号邮箱。",
  "auth.verify.pending": "正在检查链接…",
  "auth.verify.success": "邮箱已确认，谢谢！",
  "auth.verify.alreadyVerified": "邮箱已经确认过了。",
  "auth.verify.invalidLink": "链接无效或已过期，请重新发送邮件。",
  "auth.verify.failed": "邮箱确认失败。",
  "auth.verify.loginToResend": "登录后即可重新发送邮件。",
  "auth.verify.toProjects": "前往项目",
  "auth.verify.toLogin": "登录",
};
