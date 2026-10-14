import { describe, expect, it } from "vitest";
import { parseRelayMessage, reconnectDelay, relayUrl } from "./relayProtocol";

describe("relayProtocol", () => {
  it("строит адрес ретранслятора по схеме страницы", () => {
    expect(relayUrl({ protocol: "https:", host: "krometra.ru" })).toBe("wss://krometra.ru/mcp/ws");
    expect(relayUrl({ protocol: "http:", host: "localhost:5173" })).toBe("ws://localhost:5173/mcp/ws");
  });

  it("растягивает паузу переподключения до 30 секунд", () => {
    expect([0, 1, 2, 3, 4, 9].map(reconnectDelay)).toEqual([1000, 2000, 5000, 10000, 30000, 30000]);
  });

  it("принимает только известные сообщения", () => {
    expect(parseRelayMessage('{"type":"request","id":"r1","request":{"op":"state"}}')).toEqual({
      type: "request",
      id: "r1",
      request: { op: "state" },
    });
    expect(parseRelayMessage('{"type":"session","attached":true}')).toEqual({ type: "session", attached: true });
    expect(parseRelayMessage('{"type":"request","id":"r1","request":{}}')).toBeNull();
    expect(parseRelayMessage("не json")).toBeNull();
  });
});
