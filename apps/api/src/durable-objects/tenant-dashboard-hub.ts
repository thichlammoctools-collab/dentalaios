import type { DashboardInvalidation } from "@shared/types";

interface StreamTicket {
  tenant_id: string;
  user_id: string;
  expires_at: number;
}

/**
 * Tenant-specific hub for dashboard invalidation signals. It never stores or
 * broadcasts clinical/business data; connected clients re-fetch over the API.
 */
export class TenantDashboardHub implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/tickets") {
      return this.createTicket(request);
    }
    if (request.method === "POST" && url.pathname === "/publish") {
      return this.publish(request);
    }
    if (url.pathname === "/connect") {
      return this.openConnection(request, url.searchParams.get("ticket"));
    }
    return new Response("Not found", { status: 404 });
  }

  private async createTicket(request: Request): Promise<Response> {
    const body = await request.json<{ tenant_id?: string; user_id?: string }>();
    if (!body.tenant_id || !body.user_id) return new Response("Invalid ticket request", { status: 400 });

    const ticket = crypto.randomUUID();
    const value: StreamTicket = {
      tenant_id: body.tenant_id,
      user_id: body.user_id,
      expires_at: Date.now() + 60_000,
    };
    await this.state.storage.put(`ticket:${ticket}`, value);
    await this.state.storage.setAlarm(value.expires_at);
    return Response.json({ ticket, expires_at: new Date(value.expires_at).toISOString() });
  }

  private async openConnection(request: Request, ticket: string | null): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    if (!ticket) return new Response("Missing stream ticket", { status: 401 });

    const key = `ticket:${ticket}`;
    // Consume inside one storage transaction before accepting the upgrade so
    // concurrent connection attempts cannot replay the same opaque ticket.
    const stored = await this.state.storage.transaction(async (storage) => {
      const value = await storage.get<StreamTicket>(key);
      await storage.delete(key);
      return value;
    });
    if (!stored || stored.expires_at < Date.now()) return new Response("Invalid or expired stream ticket", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    // Hibernation keeps socket metadata managed by the Durable Object runtime,
    // rather than retaining sockets in instance memory between evictions.
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async publish(request: Request): Promise<Response> {
    const body = await request.json<{ entity_type?: string }>();
    if (!body.entity_type) return new Response("Invalid event", { status: 400 });

    const event: DashboardInvalidation = {
      type: "dashboard:invalidate",
      entity_type: body.entity_type,
      occurred_at: new Date().toISOString(),
    };
    const serialized = JSON.stringify(event);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch {
        socket.close(1011, "Dashboard stream unavailable");
      }
    }
    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    const tickets = await this.state.storage.list<StreamTicket>({ prefix: "ticket:" });
    const now = Date.now();
    const expired = [...tickets]
      .filter(([, ticket]) => ticket.expires_at <= now)
      .map(([key]) => key);
    if (expired.length) await this.state.storage.delete(expired);

    const nextExpiry = [...tickets]
      .map(([, ticket]) => ticket.expires_at)
      .filter((expiresAt) => expiresAt > now)
      .sort((left, right) => left - right)[0];
    if (nextExpiry) await this.state.storage.setAlarm(nextExpiry);
  }

  webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): void {
    if (socket.readyState < 2) socket.close(code, reason);
    void wasClean;
  }

  webSocketError(socket: WebSocket): void {
    if (socket.readyState < 2) socket.close(1011, "Dashboard stream error");
  }
}
