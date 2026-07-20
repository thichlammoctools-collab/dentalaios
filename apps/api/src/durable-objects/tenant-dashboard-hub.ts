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
  private readonly sockets = new Set<WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: unknown,
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
      return this.connect(request, url.searchParams.get("ticket"));
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
    return Response.json({ ticket, expires_at: new Date(value.expires_at).toISOString() });
  }

  private async connect(request: Request, ticket: string | null): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    if (!ticket) return new Response("Missing stream ticket", { status: 401 });

    const key = `ticket:${ticket}`;
    const stored = await this.state.storage.get<StreamTicket>(key);
    // Consume before accepting the upgrade so a ticket cannot be replayed.
    await this.state.storage.delete(key);
    if (!stored || stored.expires_at < Date.now()) return new Response("Invalid or expired stream ticket", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.sockets.add(server);
    server.addEventListener("close", () => this.sockets.delete(server));
    server.addEventListener("error", () => this.sockets.delete(server));
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
    for (const socket of this.sockets) {
      try {
        socket.send(serialized);
      } catch {
        this.sockets.delete(socket);
      }
    }
    return Response.json({ ok: true });
  }
}
