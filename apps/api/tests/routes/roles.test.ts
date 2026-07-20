/**
 * Integration tests for /api/roles routes.
 */

import { describe, it, expect } from "vitest";
import rolesRoutes from "../../src/routes/roles";
import { mountRoute, authedRequestWithDB } from "../helpers/api";

const roleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "role-1",
  tenant_id: "test-tenant",
  name: "doctor",
  permissions: ["read_patients", "write_findings", "write_plans", "approve_plans"],
  created_at: "2026-01-01",
  ...overrides,
});

describe("GET /api/roles", () => {
  it("returns role list for admin", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/roles",
      new Map([["FROM roles", [
        { ...roleRow(), permissions: JSON.stringify(roleRow().permissions) },
        { ...roleRow({ id: "role-2", name: "receptionist" }), permissions: JSON.stringify(["read_patients"]) },
      ]]]),
      { permissions: ["manage_roles"] },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { name: string }[] };
    expect(body.items).toHaveLength(2);
  });

  it("returns 403 for non-admin", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "GET",
      "/api/roles",
      new Map(),
      { permissions: ["manage_users"] }, // has manage_users but not manage_roles
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/roles/:id", () => {
  it("rejects attempts to change system role permissions", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/roles/role-1",
      new Map(),
      {
        permissions: ["all"],
        body: {
          permissions: ["read_patients", "write_findings"],
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 + updated role when renaming", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const updated = roleRow({ name: "Bác sĩ điều trị", system_key: "doctor" });
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/roles/role-1",
      new Map<string, unknown[]>([
        ["FROM roles", [updated]],
      ]),
      {
        permissions: ["manage_roles"],
        body: { name: "Bác sĩ điều trị" },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe("Bác sĩ điều trị");
  });

  it("returns 404 for non-existent role", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/roles/ghost",
      new Map(), // empty → role not found → returns null → 404
      {
        permissions: ["manage_roles"],
        body: { name: "x" },
      },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid name (whitespace)", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "PUT",
      "/api/roles/role-1",
      new Map(),
      {
        permissions: ["manage_roles"],
        body: { name: "   " },
      },
    );
    expect(res.status).toBe(400);
  });

  it("does not expose deletion for system roles", async () => {
    const app = mountRoute("/api/roles", rolesRoutes);
    const res = await authedRequestWithDB(
      app,
      "DELETE",
      "/api/roles/role-1",
      new Map(),
      {
        permissions: ["all"],
      },
    );
    expect(res.status).toBe(404);
  });
});
