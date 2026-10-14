import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { verifyAccessToken } from "./apiSession.mjs";
import { FileStore } from "./fileStore.mjs";
import { createRemoteHandler } from "./http.mjs";
import { TabHub } from "./hub.mjs";

const FILE_TTL_MINUTES = 15;
const MAX_TAB_MESSAGE_BYTES = 80 * 1024 * 1024;

export function startRemoteServer(options, log) {
  const config = { fileTtlMinutes: FILE_TTL_MINUTES, ...options };
  const hub = new TabHub({ verifyToken: (token, forwardedFor) => verifyAccessToken(config.backendUrl, token, forwardedFor), log });
  const ttlMs = config.fileTtlMinutes * 60_000;
  const files = new FileStore({ ttlMs, maxFiles: 200 });
  const uploads = new FileStore({ ttlMs, maxFiles: 50 });
  const server = createServer(createRemoteHandler({ config, hub, files, uploads, log }));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_TAB_MESSAGE_BYTES });

  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/mcp/ws") {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => hub.attach(ws, request.headers["x-forwarded-for"]));
  });

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      resolve({
        port: server.address().port,
        close: () =>
          new Promise((done) => {
            hub.close();
            sockets.close();
            server.closeAllConnections();
            server.close(done);
          }),
      });
    });
  });
}
