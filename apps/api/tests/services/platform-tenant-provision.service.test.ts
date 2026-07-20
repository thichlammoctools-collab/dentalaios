import { describe, expect, it } from "vitest";
import { verifyPassword } from "../../src/lib/password";
import { platformTenantProvisionService } from "../../src/services/platform-tenant-provision.service";
import { createMockD1 } from "../helpers/mock-db";

describe("platformTenantProvisionService", () => {
  it("creates a tenant administrator with a hashed password", async () => {
    const db = createMockD1();

    await platformTenantProvisionService.provision(db as never, {
      name: "Nha khoa ABC",
      slug: "nha-khoa-abc",
      admin_email: "OWNER@ABC.VN ",
      admin_password: "A-secure-initial-password",
    });

    const tenantInsert = db.__sqlContaining("INSERT INTO tenants");
    const branchInsert = db.__sqlContaining("INSERT INTO branches");
    const roleInserts = db.__sqlContaining("INSERT INTO roles");
    const userInsert = db.__sqlContaining("INSERT INTO users");

    expect(tenantInsert).toHaveLength(1);
    expect(branchInsert).toHaveLength(1);
    expect(roleInserts).toHaveLength(9);
    expect(userInsert).toHaveLength(1);
    expect(userInsert[0].binds[4]).toBe("owner@abc.vn");
    expect(userInsert[0].binds).not.toContain("A-secure-initial-password");
    expect(await verifyPassword("A-secure-initial-password", userInsert[0].binds[6] as string)).toBe(true);
    expect(userInsert[0].binds[1]).toBe(tenantInsert[0].binds[0]);
    expect(userInsert[0].binds[2]).toBe(branchInsert[0].binds[0]);
    expect(userInsert[0].binds[3]).toBe(roleInserts[0].binds[0]);
  });
});
