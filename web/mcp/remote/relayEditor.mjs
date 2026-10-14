import { isReply, unwrap } from "../channel.mjs";
import { ToolError } from "../errors.mjs";

const REPLY_EXCERPT = 300;

export class RelayEditor {
  #hub;
  #session;
  #config;
  #opened = null;

  constructor({ hub, session, config }) {
    this.#hub = hub;
    this.#session = session;
    this.#config = config;
  }

  editorUrl(projectId) {
    return `${this.#config.publicUrl}/editor/${encodeURIComponent(projectId)}`;
  }

  async open(projectId) {
    const userId = await this.#session.userId();
    const url = this.editorUrl(projectId);
    const tab = await this.#hub.waitFor(userId, projectId, this.#config.openTimeoutMs);
    if (!tab) {
      throw new ToolError(
        `Проект не открыт в браузере: попроси пользователя открыть ${url} (вкладка сама подключится к MCP) и повтори cad_open_project. ` +
          `Ждал ${Math.round(this.#config.openTimeoutMs / 1000)} с.`,
      );
    }
    if (this.#opened) this.#announce(false);
    this.#opened = { projectId, userId };
    this.#hub.announce(tab, true);
    return { url, channelVersion: tab.channelVersion, note: "Команды выполняются во вкладке пользователя: он видит модель вживую." };
  }

  async request(op, params) {
    const tab = this.#tab();
    let reply;
    try {
      reply = await this.#hub.request(tab, params === undefined ? { op } : { op, params }, this.#config.requestTimeoutMs);
    } catch (error) {
      throw new ToolError(`"${op}": ${error.message}. Проверь, что вкладка ${this.editorUrl(this.#opened.projectId)} открыта, и повтори.`);
    }
    if (isReply(reply)) return reply;
    throw new ToolError(`Вкладка ответила на "${op}" не по контракту: ${JSON.stringify(reply)?.slice(0, REPLY_EXCERPT)}`);
  }

  async query(op, params) {
    return unwrap(await this.request(op, params));
  }

  close() {
    if (this.#opened) this.#announce(false);
    this.#opened = null;
  }

  #tab() {
    if (!this.#opened) throw new ToolError("Проект не открыт: сначала вызови cad_open_project.");
    const tab = this.#hub.find(this.#opened.userId, this.#opened.projectId);
    if (!tab) {
      throw new ToolError(
        `Вкладка проекта закрыта или потеряла связь: попроси открыть ${this.editorUrl(this.#opened.projectId)} и повтори вызов.`,
      );
    }
    return tab;
  }

  #announce(attached) {
    const tab = this.#hub.find(this.#opened.userId, this.#opened.projectId);
    if (tab) this.#hub.announce(tab, attached);
  }
}
