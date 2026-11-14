import type { DomainMessages } from "../../message";

export const projects = {
  "projects.all": "所有项目",
  "projects.user": "用户",
  "projects.new": "新建项目",
  "projects.admin": "管理",
  "projects.logout": "退出登录",
  "projects.title": "我的项目",
  "projects.search": "搜索项目…",
  "projects.loading": "正在加载项目…",
  "projects.emptySearch": "没有搜索结果",
  "projects.emptySearchDetail": "没有与“{query}”匹配的项目。",
  "projects.empty": "暂无项目",
  "projects.emptyDetail": "创建您的第一个项目以开始使用。",
  "projects.personal": "个人",
  "projects.rename": "重命名",
  "projects.delete": "删除",
  "projects.updated": "更新于 {date}",
  "projects.name": "项目名称",
  "projects.namePlaceholder": "我的 CAD 项目",
  "projects.description": "描述（可选）",
  "projects.descriptionPlaceholder": "这个项目是关于什么的？",
  "projects.cancel": "取消",
  "projects.create": "创建",
  "projects.renameTitle": "重命名项目",
  "projects.save": "保存",
  "projects.deleteTitle": "删除项目？",
  "projects.deleteDetail": "项目“{name}”及其全部建模历史将被永久删除。",
  "projects.count": {
    "other": "{count} 个项目"
  }
} as const satisfies DomainMessages<"projects">;
