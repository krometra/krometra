import { randomBytes } from "node:crypto";

export class FileStore {
  #files = new Map();
  #ttlMs;
  #maxFiles;

  constructor({ ttlMs, maxFiles }) {
    this.#ttlMs = ttlMs;
    this.#maxFiles = maxFiles;
  }

  put({ ownerId, filename, mime, bytes }) {
    this.#sweep();
    while (this.#files.size >= this.#maxFiles) this.#files.delete(this.#files.keys().next().value);
    const token = randomBytes(24).toString("base64url");
    this.#files.set(token, { ownerId, filename, mime, bytes, expiresAt: Date.now() + this.#ttlMs });
    return token;
  }

  get(token) {
    this.#sweep();
    return this.#files.get(token) ?? null;
  }

  take(token, ownerId) {
    const file = this.get(token);
    if (!file || file.ownerId !== ownerId) return null;
    this.#files.delete(token);
    return file;
  }

  #sweep() {
    const now = Date.now();
    for (const [token, file] of this.#files) if (file.expiresAt <= now) this.#files.delete(token);
  }
}
