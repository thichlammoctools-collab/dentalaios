import { apiPost } from "@/lib/api";

export type DashboardStreamStatus = "live" | "reconnecting" | "offline";

interface StreamTicketResponse {
  path?: string;
  websocket_path?: string;
  stream_path?: string;
}

interface DashboardStreamOptions {
  onInvalidate: () => void;
  onStatusChange?: (status: DashboardStreamStatus) => void;
}

/** Socket messages are invalidations only; snapshot data always comes from the API. */
export function createDashboardStream({ onInvalidate, onStatusChange }: DashboardStreamOptions) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | undefined;
  let invalidateTimer: number | undefined;
  let attempts = 0;
  let stopped = false;

  const setStatus = (status: DashboardStreamStatus) => onStatusChange?.(status);

  function queueInvalidation() {
    if (invalidateTimer !== undefined) return;
    invalidateTimer = window.setTimeout(() => {
      invalidateTimer = undefined;
      onInvalidate();
    }, 350);
  }

  function scheduleReconnect() {
    if (stopped || document.hidden || reconnectTimer !== undefined) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));
    attempts += 1;
    setStatus("reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  }

  async function connect() {
    if (stopped || document.hidden || socket?.readyState === WebSocket.OPEN) return;
    try {
      const ticket = await apiPost<StreamTicketResponse>("/api/dashboard/stream-ticket");
      const path = ticket.path ?? ticket.websocket_path ?? ticket.stream_path;
      if (!path) throw new Error("Missing stream path");

      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) || window.location.origin;
      const url = new URL(path, apiBase);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      // WebSocket constructors cannot set Authorization headers. The returned
      // path identifies the tenant hub, while the opaque ticket is consumed
      // once by that hub before the socket is accepted.
      socket = new WebSocket(url.toString());
      socket.onopen = () => {
        attempts = 0;
        setStatus("live");
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: unknown };
          if (message.type === "dashboard:invalidate") queueInvalidation();
        } catch {
          // Ignore malformed payloads instead of changing displayed KPIs.
        }
      };
      socket.onclose = () => {
        socket = null;
        scheduleReconnect();
      };
      socket.onerror = () => socket?.close();
    } catch {
      socket = null;
      scheduleReconnect();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      socket?.close();
      socket = null;
      setStatus("offline");
      return;
    }
    onInvalidate();
    void connect();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  void connect();

  return {
    stop() {
      stopped = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (invalidateTimer !== undefined) window.clearTimeout(invalidateTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      socket?.close();
      socket = null;
    },
  };
}
