import type { Translation } from "../../message";
import type { account as source } from "../ru/account";

export const account: Translation<typeof source> = {
  "account.title": "账号",
  "account.backToProjects": "我的项目",
  "account.signedInAs": "当前登录：{email}",

  "account.keys.title": "AI 访问密钥（MCP）",
  "account.keys.intro":
    "密钥让 AI 助手（例如 Claude Code）通过 MCP 服务器访问您的项目。它取代助手设置中的邮箱和密码，可随时撤销，无需修改密码。",
  "account.keys.name.label": "密钥名称",
  "account.keys.name.placeholder": "例如：笔记本上的 Claude Code",
  "account.keys.name.required": "请输入密钥名称。",
  "account.keys.name.tooLong": {
    other: "名称不能超过 {count} 个字符。",
  },
  "account.keys.create": "创建密钥",
  "account.keys.createFailed": "无法创建密钥。",
  "account.keys.limitReached": {
    other: "已有 {count} 个密钥，已达上限。删除不再需要的密钥后才能创建新的。",
  },
  "account.keys.loading": "正在加载密钥…",
  "account.keys.loadFailed": "无法加载密钥。",
  "account.keys.retry": "重试",
  "account.keys.empty": "还没有密钥。创建一个即可连接助手。",
  "account.keys.createdAt": "创建于 {date}",
  "account.keys.lastUsedAt": "最近使用 {date}",
  "account.keys.neverUsed": "尚未使用",
  "account.keys.delete": "删除",
  "account.keys.deleteAria": "删除密钥“{name}”",
  "account.keys.deleteTitle": "删除密钥？",
  "account.keys.deleteText": "密钥“{name}”将立即失效：使用它连接的助手会失去对项目的访问权限。此操作无法撤销。",
  "account.keys.deleteFailed": "无法删除密钥。",
  "account.keys.deleted": "密钥已删除。",
  "account.keys.cancel": "取消",

  "account.created.title": "密钥“{name}”已创建",
  "account.created.warning": "请立即复制密钥：之后不会再显示。如果丢失，请删除该密钥并创建新的。",
  "account.created.keyLabel": "访问密钥",
  "account.created.commandLabel": "Claude Code 连接命令（已填入密钥和网站地址）",
  "account.created.done": "完成，我已保存密钥",

  "account.copy": "复制",
  "account.copied": "已复制",
  "account.copyFailed": "无法复制。请选中文本手动复制。",

  "account.guide.title": "如何连接",
  "account.guide.install.title": "安装 MCP 服务器",
  "account.guide.install.text":
    "需要 git、Node.js 22 或更高版本以及 Claude Code。服务器通过 Chromium 浏览器操作编辑器，因此会随依赖一起安装：",
  "account.guide.connect.title": "将其连接到 Claude Code",
  "account.guide.connect.text": "在上方创建密钥并运行旁边显示的命令：其中已填入密钥和本网站地址。命令的一般形式：",
  "account.guide.verify.title": "检查连接",
  "account.guide.verify.text": "列表中应出现状态为 Connected 的 {server} 服务器。然后让助手列出您的项目。",
  "account.guide.revoke.title": "不再需要时撤销密钥",
  "account.guide.revoke.text": "在上方列表中删除密钥：访问权限会立即失效，即使助手已在运行。从 Claude Code 中移除服务器：",
  "account.guide.more": "详细说明和环境变量",
};
