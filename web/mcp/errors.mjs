const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const MIN_SECRET_LENGTH = 6;
const MASK = "***";

export class ToolError extends Error {}

export function firstLine(text) {
  const [line] = String(text ?? "").split("\n");
  return line.trim().replace(/\.$/, "");
}

export function createRedactor() {
  const secrets = new Set();
  return {
    add(value) {
      if (typeof value === "string" && value.length >= MIN_SECRET_LENGTH) secrets.add(value);
    },
    redact(text) {
      let clean = String(text);
      for (const secret of secrets) clean = clean.split(secret).join(MASK);
      return clean.replace(JWT_PATTERN, MASK);
    },
  };
}
