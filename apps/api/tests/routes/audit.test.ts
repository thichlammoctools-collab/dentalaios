/**
 * Integration tests for /api/audit-logs route.
 */

import { describe, it, expect } from "vitest";
import auditRoutes from "../../src/routes/audit";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const logRow = (overrides: Record<string, unknown> = {}) => ({
  id: "log-1",
  tenant_id: "test-tenant",
  user_id: "user-1",
  action: "create",
  entity_type: "patient",
  entity_id: "patient-1",
  details: null,
  ip_address: "1.2.3.4",
  created_at: "2026-01-01",
  ...overrides,
});

describe("GET /api/audit-logs", () => {
  it("returns list of audit logs for admin user", async () => {
    const app = mountRoute("/api/audit-logs", auditRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/audit-logs",
      new Map([["FROM audit_logs", [logRow(), logRow({ id: "log-2", action: "update" })]]]),
      { permissions: ["manage_users"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: string; action: string }[] };
    expect(body.items).toHaveLength(2);
  });

  it("filters by user_id", async () => {
    const app = mountRoute("/api/audit-logs", auditRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/audit-logs?user_id=user-1",
      new Map([["FROM audit_logs", [logRow()]]]),
      { permissions: ["manage_users"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("filters by action", async () => {
    const app = mountRoute("/api/audit-logs", auditRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/audit-logs?action=create",
      new Map([["FROM audit_logs", [logRow()]]]),
      { permissions: ["manage_users"] },
    );
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-admin user (no manage_users)", async () => {
    const app = mountRoute("/api/audit-logs", auditRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/audit-logs",
      new Map(),
      { permissions: ["read_patients"] },
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const app = mountRoute("/api/audit-logs", auditRoutes);
    const res = await app.request(
      "/api/audit-logs",
      { method: "GET" },
      {
        DB: undefined as any,
        FILES: {} as R2Bucket,
        JOBS: {} as Queue,
        ENVIRONMENT: "test",
        FRONTEND_ORIGIN: "",
        JWT_SECRET: "test",
      } as any,
    );
    expect(res.status).toBe(401);
  });
});