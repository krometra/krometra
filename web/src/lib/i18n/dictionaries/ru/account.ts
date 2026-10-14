import type { DomainMessages } from "../../message";

export const account = {
  "account.title": "Аккаунт",
  "account.backToProjects": "Мои проекты",
  "account.signedInAs": "Вы вошли как {email}",

  "account.keys.title": "Ключи доступа для ИИ (MCP)",
  "account.keys.intro":
    "Ключ даёт ИИ-ассистенту, например Claude Code, доступ к вашим проектам через MCP-сервер. Он заменяет почту и пароль в настройках ассистента и отзывается в любой момент без смены пароля.",
  "account.keys.name.label": "Название ключа",
  "account.keys.name.placeholder": "Например, Claude Code на ноутбуке",
  "account.keys.name.required": "Введите название ключа.",
  "account.keys.name.tooLong": {
    one: "Название не длиннее {count} символа.",
    few: "Название не длиннее {count} символов.",
    many: "Название не длиннее {count} символов.",
    other: "Название не длиннее {count} символа.",
  },
  "account.keys.create": "Создать ключ",
  "account.keys.createFailed": "Не удалось создать ключ.",
  "account.keys.limitReached": {
    one: "Создан {count} ключ — это максимум. Удалите ненужный, чтобы создать новый.",
    few: "Создано {count} ключа — это максимум. Удалите ненужный, чтобы создать новый.",
    many: "Создано {count} ключей — это максимум. Удалите ненужный, чтобы создать новый.",
    other: "Создано {count} ключа — это максимум. Удалите ненужный, чтобы создать новый.",
  },
  "account.keys.loading": "Загружаем ключи…",
  "account.keys.loadFailed": "Не удалось загрузить ключи.",
  "account.keys.retry": "Повторить",
  "account.keys.empty": "Ключей пока нет. Создайте первый, чтобы подключить ассистента.",
  "account.keys.createdAt": "Создан {date}",
  "account.keys.lastUsedAt": "Использован {date}",
  "account.keys.neverUsed": "Ещё не использовался",
  "account.keys.delete": "Удалить",
  "account.keys.deleteAria": "Удалить ключ «{name}»",
  "account.keys.deleteTitle": "Удалить ключ?",
  "account.keys.deleteText":
    "Ключ «{name}» перестанет работать сразу: ассистент, подключённый с ним, потеряет доступ к проектам. Отменить удаление нельзя.",
  "account.keys.deleteFailed": "Не удалось удалить ключ.",
  "account.keys.deleted": "Ключ удалён.",
  "account.keys.cancel": "Отмена",

  "account.created.title": "Ключ «{name}» создан",
  "account.created.warning":
    "Скопируйте ключ сейчас: больше его не покажут. Потеряли — удалите ключ и создайте новый.",
  "account.created.keyLabel": "Ключ доступа",
  "account.created.commandLabel": "Команда подключения к Claude Code — ключ и адрес сайта уже подставлены",
  "account.created.done": "Готово, ключ сохранён",

  "account.copy": "Скопировать",
  "account.copied": "Скопировано",
  "account.copyFailed": "Не удалось скопировать. Выделите текст и скопируйте вручную.",

  "account.guide.title": "Как подключить",
  "account.guide.install.title": "Установите MCP-сервер",
  "account.guide.install.text":
    "Нужны git, Node.js 22 или новее и Claude Code. Сервер управляет редактором через браузер Chromium, поэтому вместе с зависимостями ставится и он:",
  "account.guide.connect.title": "Подключите его к Claude Code",
  "account.guide.connect.text":
    "Создайте ключ выше и выполните команду, которая появится рядом с ним: в ней уже стоят ключ и адрес этого сайта. Общий вид команды:",
  "account.guide.verify.title": "Проверьте подключение",
  "account.guide.verify.text":
    "В списке должен быть сервер {server} со статусом Connected. Затем попросите ассистента показать список ваших проектов.",
  "account.guide.revoke.title": "Отзовите ключ, когда он больше не нужен",
  "account.guide.revoke.text":
    "Удалите ключ в списке выше: доступ пропадёт сразу, даже у уже запущенного ассистента. Сервер из Claude Code убирается командой:",
  "account.guide.more": "Подробная инструкция и переменные окружения",
} as const satisfies DomainMessages<"account">;
