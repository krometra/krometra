import { onBeforeUnmount, onMounted, ref } from "vue";
import { useAuth } from "@/composables/shared/useAuth";
import { useApi } from "@/composables/useApi";
import { CONTROL_VERSION, type ControlChannel } from "@/lib/control/protocol";
import { parseRelayMessage, reconnectDelay, relayUrl } from "@/lib/control/relayProtocol";

export function useControlRelay(deps: { projectId: string; channel: ControlChannel }) {
  const auth = useAuth();
  const api = useApi();
  const connected = ref(false);
  const attached = ref(false);
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function schedule() {
    if (stopped) return;
    timer = setTimeout(connect, reconnectDelay(attempt++));
  }

  async function freshToken() {
    await api.get("/auth/me").catch(() => undefined);
    return auth.accessToken.value;
  }

  async function connect() {
    const token = await freshToken();
    if (stopped || !token) return schedule();
    const ws = new WebSocket(relayUrl(window.location));
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token, projectId: deps.projectId, channelVersion: CONTROL_VERSION }));
    ws.onmessage = async (event) => {
      const message = parseRelayMessage(String(event.data));
      if (!message) return;
      if (message.type === "welcome") {
        connected.value = true;
        attempt = 0;
      } else if (message.type === "session") {
        attached.value = message.attached;
      } else if (message.type === "request") {
        const reply = await deps.channel.request(message.request);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "reply", id: message.id, reply }));
      }
    };
    ws.onclose = () => {
      connected.value = false;
      attached.value = false;
      if (socket === ws) socket = null;
      schedule();
    };
  }

  onMounted(async () => {
    if (import.meta.env.VITE_MCP_RELAY !== "1") return;
    await deps.channel.ready;
    if (!stopped) void connect();
  });

  onBeforeUnmount(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  });

  return { connected, attached };
}
