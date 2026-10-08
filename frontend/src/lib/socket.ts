import { WS_URL } from "@/lib/api";
import {
  HEARTBEAT_MS, RECONNECT_MAX_MS, RECONNECT_MIN_MS, SOCKET_UNAUTHENTICATED,
} from "@/lib/constants";
import type { ServerEvent } from "@/lib/types";

export type SocketState = "connecting" | "open" | "reconnecting";

export type SocketHandle = {
  send: (type: string, data: object) => void;
  close: () => void;
};

type Handlers = {
  onEvent: (event: ServerEvent) => void;
  /** `reconnected` is true when the socket opens again after a drop. */
  onState: (state: SocketState, reconnected: boolean) => void;
  onUnauthenticated: () => void;
};

/** One WebSocket that keeps itself alive: it pings so idle proxies do not
 * cut it, and reconnects with a growing delay when it drops. */
export function connectSocket(token: string, handlers: Handlers): SocketHandle {
  let socket: WebSocket | null = null;
  let closedByUs = false;
  let hasOpenedBefore = false;
  let delay = RECONNECT_MIN_MS;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const send = (type: string, data: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, data }));
  };

  const open = () => {
    socket = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      delay = RECONNECT_MIN_MS;
      handlers.onState("open", hasOpenedBefore);
      hasOpenedBefore = true;
      heartbeat = setInterval(() => send("ping", {}), HEARTBEAT_MS);
    };

    socket.onmessage = (message) => {
      try {
        handlers.onEvent(JSON.parse(message.data) as ServerEvent);
      } catch {
        // A frame we cannot parse is not worth dropping the connection for.
      }
    };

    socket.onclose = (event) => {
      clearInterval(heartbeat);
      if (closedByUs) return;
      if (event.code === SOCKET_UNAUTHENTICATED) {
        handlers.onUnauthenticated();
        return;
      }
      handlers.onState("reconnecting", false);
      retry = setTimeout(open, delay);
      delay = Math.min(delay * 2, RECONNECT_MAX_MS);
    };
  };

  handlers.onState("connecting", false);
  open();

  return {
    send,
    close: () => {
      closedByUs = true;
      clearInterval(heartbeat);
      clearTimeout(retry);
      socket?.close();
    },
  };
}
