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
  "account.guide.connect.title":
    "Подключите сервер к Claude Code",
  "account.guide.connect.text":
    "Сервер работает на этом сайте — ставить ничего не нужно. Создайте ключ выше и выполните команду, которая появится рядом с ним: в ней уже стоят ключ и адрес сайта. Общий вид команды:",
  "account.guide.verify.title": "Проверьте подключение",
  "account.guide.verify.text":
    "В списке должен быть сервер {server} со статусом Connected. Затем попросите ассистента показать список ваших проектов.",
  "account.guide.revoke.title": "Отзовите ключ, когда он больше не нужен",
  "account.guide.revoke.text":
    "Удалите ключ в списке выше: доступ пропадёт сразу, даже у уже запущенного ассистента. Сервер из Claude Code убирается командой:",
  "account.guide.open.title":
    "Держите проект открытым в браузере",
  "account.guide.open.text":
    "Ассистент работает в открытой вкладке редактора: модель меняется у вас на глазах, пока горит значок «ИИ-агент управляет редактором». Если вкладка закрыта, ассистент пришлёт ссылку на проект — откройте её.",
  "account.guide.local.title":
    "Локальный сервер — если держать вкладку открытой неудобно",
  "account.guide.local.text":
    "Сервер ставится на ваш компьютер и сам открывает редактор в фоновом браузере Chromium. Нужны git, Node.js 22 или новее и Claude Code. Установка:",
  "account.guide.local.connect":
    "Подключение (вместо команды из шага 1):",
  "account.guide.more": "Подробная инструкция и переменные окружения",
  "account.guide.agent": "Скопировать инструкцию для агента",
  "account.agent.prompt":
    "Подключи к Claude Code MCP-сервер «{product}» (браузерная 3D CAD) и проверь, что он работает. Сервер работает на сайте, устанавливать ничего не нужно.\n\n1. Подключи сервер для всех проектов пользователя:\n\n```bash\n{connect}\n```\n\n{keyNote}\n\n2. Проверь подключение: в выводе команды должен быть сервер krometra со статусом Connected.\n\n```bash\n{verify}\n```\n\n3. Перезапусти Claude Code или выполни /mcp, затем вызови инструмент cad_list_projects.\n\nКак работать с редактором: cad_open_project — команды выполняются в открытой у пользователя вкладке редактора, поэтому, если инструмент попросит, передай пользователю ссылку на проект. Затем cad_capabilities (единственный источник правды об операциях), cad_state и cad_snapshot для чтения модели, cad_request для операций. Размеры в миллиметрах. Подробности: {readme}",
  "account.agent.keyPlaceholder": "Вместо krm_... подставь ключ доступа со страницы «Аккаунт» ({origin}/account): попроси его у пользователя.",
  "account.agent.keyFilled": "Ключ доступа и адрес сайта в команде уже подставлены.",
} as const satisfies DomainMessages<"account">;
