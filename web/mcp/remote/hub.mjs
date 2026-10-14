import { randomUUID } from "node:crypto";

const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;

function parse(data) {
  try {
    return JSON.parse(String(data));
  } catch {
    return null;
  }
}

export class TabHub {
  #tabs = new Set();
  #waiters = new Set();
  #verifyToken;
  #log;
  #heartbeat;

  constructor({ verifyToken, log }) {
    this.#verifyToken = verifyToken;
    this.#log = log;
    this.#heartbeat = setInterval(() => this.#ping(), HEARTBEAT_MS);
    this.#heartbeat.unref?.();
  }

  attach(socket, forwardedFor) {
    const helloTimer = setTimeout(() => socket.close(4401, "hello timeout"), HELLO_TIMEOUT_MS);
    let tab = null;
    socket.on("pong", () => {
      if (tab) tab.alive = true;
    });
    socket.on("message", async (data) => {
      const message = parse(data);
      if (!message) return;
      if (!tab && message.type === "hello") {
        clearTimeout(helloTimer);
        tab = await this.#register(socket, message, forwardedFor);
        return;
      }
      if (tab && message.type === "reply") this.#settle(tab, message);
    });
    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (tab) this.#unregister(tab);
    });
  }

  get size() {
    return this.#tabs.size;
  }

  find(userId, projectId) {
    let latest = null;
    for (const tab of this.#tabs) {
      if (tab.userId === userId && tab.projectId === projectId && (!latest || tab.connectedAt > latest.connectedAt)) latest = tab;
    }
    return latest;
  }

  waitFor(userId, projectId, timeoutMs) {
    const existing = this.find(userId, projectId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const waiter = {
        userId,
        projectId,
        resolve: (tab) => {
          clearTimeout(waiter.timer);
          this.#waiters.delete(waiter);
          resolve(tab);
        },
      };
      waiter.timer = setTimeout(() => waiter.resolve(null), timeoutMs);
      this.#waiters.add(waiter);
    });
  }

  request(tab, request, timeoutMs) {
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        tab.pending.delete(id);
        reject(new Error(`вкладка не ответила за ${Math.round(timeoutMs / 1000)} с`));
      }, timeoutMs);
      tab.pending.set(id, { resolve, reject, timer });
      tab.socket.send(JSON.stringify({ type: "request", id, request }));
    });
  }

  announce(tab, attached) {
    if (tab.socket.readyState === tab.socket.OPEN) tab.socket.send(JSON.stringify({ type: "session", attached }));
  }

  close() {
    clearInterval(this.#heartbeat);
    for (const tab of this.#tabs) tab.socket.terminate();
  }

  async #register(socket, hello, forwardedFor) {
    const projectId = typeof hello.projectId === "string" ? hello.projectId : "";
    const userId = projectId && typeof hello.token === "string" ? await this.#verifyToken(hello.token, forwardedFor).catch(() => null) : null;
    if (!userId) {
      socket.send(JSON.stringify({ type: "rejected", reason: "Вход не подтверждён: обновите страницу редактора." }));
      socket.close(4401, "unauthorized");
      return null;
    }
    const tab = { socket, userId, projectId, channelVersion: hello.channelVersion ?? null, connectedAt: Date.now(), alive: true, pending: new Map() };
    this.#tabs.add(tab);
    socket.send(JSON.stringify({ type: "welcome" }));
    this.#log(`tab connected: project ${projectId}`);
    for (const waiter of [...this.#waiters]) {
      if (waiter.userId === userId && waiter.projectId === projectId) waiter.resolve(tab);
    }
    return tab;
  }

  #unregister(tab) {
    this.#tabs.delete(tab);
    for (const { reject, timer } of tab.pending.values()) {
      clearTimeout(timer);
      reject(new Error("вкладка редактора закрылась"));
    }
    tab.pending.clear();
  }

  #settle(tab, message) {
    const pending = tab.pending.get(message.id);
    if (!pending) return;
    tab.pending.delete(message.id);
    clearTimeout(pending.timer);
    pending.resolve(message.reply);
  }

  #ping() {
    for (const tab of this.#tabs) {
      if (!tab.alive) {
        tab.socket.terminate();
        continue;
      }
      tab.alive = false;
      tab.socket.ping();
    }
  }
}
