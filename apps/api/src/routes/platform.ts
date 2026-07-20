import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PLATFORM_PERMISSIONS } from "@shared/constants";
import {
  platformAdminCreateSchema,
  platformAdminUpdateSchema,
  platformAuditQuerySchema,
  platformContentCreateSchema,
  platformContentUpdateSchema,
  platformFlagOverrideSchema,
  platformFlagSchema,
  platformLifecycleSchema,
  platformLimitsSchema,
  procedureCatalogCreateSchema,
  procedureCatalogUpdateSchema,
  platformTenantCreateSchema,
  platformTenantListQuerySchema,
  platformTenantUpdateSchema,
} from "@shared/validation";
import type { Env } from "../index";
import { newId } from "../lib/ids";
import { NotFoundError, ForbiddenError, ConflictError } from "../lib/errors";
import { hashPassword } from "../lib/password";
import {
  getPlatformJwt,
  requirePlatformAuth,
  requireRecentPlatformMfa,
  type PlatformAuthContext,
} from "../middleware/platform-auth";
import { requirePlatformPermission } from "../middleware/platform-rbac";
import { platformAudit } from "../middleware/platform-audit";
import { createPlatformAuditLogsRepository } from "../repositories/platform-audit-logs.repo";
import { createPlatformConfigRepository } from "../repositories/platform-config.repo";
import { createPlatformContentRepository } from "../repositories/platform-content.repo";
import { createPlatformTenantsRepository } from "../repositories/platform-tenants.repo";
import { createPlatformUsersRepository } from "../repositories/platform-users.repo";
import { createProcedureCatalogRepository } from "../repositories/procedure-catalog.repo";
import { platformService } from "../services/platform.service";
import { platformTenantProvisionService } from "../services/platform-tenant-provision.service";
const router = new Hono<{ Bindings: Env; Variables: PlatformAuthContext }>();
const actor = (c: any) => ({
  user_id: getPlatformJwt(c).sub,
  request_id: c.req.header("cf-ray") ?? undefined,
  ip: c.req.header("cf-connecting-ip") ?? "",
  user_agent: c.req.header("user-agent") ?? "",
});
async function tenant(c: { env: Env }, id: string) {
  const value = await createPlatformTenantsRepository(c.env.DB).get(id);
  if (!value) throw new NotFoundError("Tenant not found");
  return value;
}

function validateContentScope(
  current: { audience: "global" | "tenant"; tenant_id?: string | null },
  update: { audience?: "global" | "tenant"; tenant_id?: string | null },
): void {
  const audience = update.audience ?? current.audience;
  const tenantId = update.tenant_id === undefined ? current.tenant_id : update.tenant_id;
  if (audience === "tenant" && !tenantId) {
    throw new ConflictError("Tenant content requires a tenant");
  }
  if (audience === "global" && tenantId) {
    throw new ConflictError("Global content cannot target a tenant");
  }
}
router.use("*", requirePlatformAuth());
router.get(
  "/procedures",
  requirePlatformPermission(PLATFORM_PERMISSIONS.PROCEDURES_READ),
  async (c) => c.json({ items: await createProcedureCatalogRepository(c.env.DB).list() }),
);
router.post(
  "/procedures",
  requirePlatformPermission(PLATFORM_PERMISSIONS.PROCEDURES_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", procedureCatalogCreateSchema),
  async (c) => {
    const item = await createProcedureCatalogRepository(c.env.DB).create(c.req.valid("json"));
    await platformAudit(c.env.DB, { ...actor(c), action: "procedure.created", entity_type: "procedure", entity_id: item.code });
    return c.json(item, 201);
  },
);
router.patch(
  "/procedures/:code",
  requirePlatformPermission(PLATFORM_PERMISSIONS.PROCEDURES_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", procedureCatalogUpdateSchema),
  async (c) => {
    const item = await createProcedureCatalogRepository(c.env.DB).update(c.req.param("code"), c.req.valid("json"));
    if (!item) throw new NotFoundError("Procedure not found");
    await platformAudit(c.env.DB, { ...actor(c), action: "procedure.updated", entity_type: "procedure", entity_id: item.code, details: { fields: Object.keys(c.req.valid("json")) } });
    return c.json(item);
  },
);
router.get(
  "/dashboard",
  requirePlatformPermission(PLATFORM_PERMISSIONS.DASHBOARD_READ),
  async (c) => {
    const range = Number(new URL(c.req.url).searchParams.get("range") ?? 30);
    if (![7, 30, 90].includes(range))
      return c.json({ error: "Invalid range", code: "validation_error" }, 400);
    return c.json(
      await platformService.dashboard(c.env.DB, range as 7 | 30 | 90),
    );
  },
);
router.get(
  "/tenants",
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_READ),
  async (c) => {
    const parsed = platformTenantListQuerySchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!parsed.success)
      return c.json(
        { error: "Invalid tenant query", code: "validation_error" },
        400,
      );
    return c.json(
      await createPlatformTenantsRepository(c.env.DB).list(parsed.data),
    );
  },
);
router.post(
  "/tenants",
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformTenantCreateSchema),
  async (c) => {
    const data = c.req.valid("json");
    const id = await platformTenantProvisionService.provision(c.env.DB, data);
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "tenant.created",
      entity_type: "tenant",
      entity_id: id,
      tenant_id: id,
    });
    return c.json(await tenant(c, id), 201);
  },
);
router.get(
  "/tenants/:id",
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_READ),
  async (c) =>
    c.json(await platformService.tenantDetail(c.env.DB, c.req.param("id"))),
);
router.patch(
  "/tenants/:id",
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformTenantUpdateSchema),
  async (c) => {
    const id = c.req.param("id");
    await tenant(c, id);
    const data = c.req.valid("json");
    await createPlatformTenantsRepository(c.env.DB).update(id, data);
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "tenant.updated",
      entity_type: "tenant",
      entity_id: id,
      tenant_id: id,
      details: {
        fields: Object.keys(data).filter(
          (key) => key !== "expected_updated_at",
        ),
      },
    });
    return c.json(await tenant(c, id));
  },
);
for (const [path, active, action] of [
  ["/tenants/:id/suspend", false, "tenant.suspended"],
  ["/tenants/:id/activate", true, "tenant.activated"],
] as const)
  router.post(
    path,
    requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_WRITE),
    requireRecentPlatformMfa(),
    zValidator("json", platformLifecycleSchema),
    async (c) => {
      const id = c.req.param("id");
      await tenant(c, id);
      const data = c.req.valid("json");
      await createPlatformTenantsRepository(c.env.DB).update(id, {
        is_active: active,
      });
      await platformAudit(c.env.DB, {
        ...actor(c),
        action,
        entity_type: "tenant",
        entity_id: id,
        tenant_id: id,
        reason: data.reason,
      });
      return c.json(await tenant(c, id));
    },
  );
router.get(
  "/feature-flags",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_READ),
  async (c) =>
    c.json({ items: await createPlatformConfigRepository(c.env.DB).flags() }),
);
router.put(
  "/feature-flags",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformFlagSchema),
  async (c) => {
    const data = c.req.valid("json");
    await createPlatformConfigRepository(c.env.DB).upsertFlag(data);
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "flag.updated",
      entity_type: "feature_flag",
      entity_id: data.key,
    });
    return c.json(data);
  },
);
router.get(
  "/tenants/:id/feature-flags",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_READ),
  async (c) => {
    await tenant(c, c.req.param("id"));
    return c.json({
      items: await createPlatformConfigRepository(c.env.DB).tenantFlags(
        c.req.param("id"),
      ),
    });
  },
);
router.put(
  "/tenants/:id/feature-flags/:key",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformFlagOverrideSchema),
  async (c) => {
    const id = c.req.param("id");
    await tenant(c, id);
    const config = createPlatformConfigRepository(c.env.DB);
    if (!(await config.hasFlag(c.req.param("key")))) {
      throw new NotFoundError("Feature flag not found");
    }
    const data = c.req.valid("json");
    await config.setTenantFlag(
      id,
      c.req.param("key"),
      data.enabled,
      getPlatformJwt(c).sub,
    );
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "flag.override.updated",
      entity_type: "feature_flag",
      entity_id: c.req.param("key"),
      tenant_id: id,
      details: { enabled: data.enabled },
    });
    return c.json({ ok: true });
  },
);
router.get(
  "/tenants/:id/limits",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_READ),
  async (c) => {
    await tenant(c, c.req.param("id"));
    return c.json(
      (await createPlatformConfigRepository(c.env.DB).limits(
        c.req.param("id"),
      )) ?? {},
    );
  },
);
router.put(
  "/tenants/:id/limits",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformLimitsSchema),
  async (c) => {
    const id = c.req.param("id");
    await tenant(c, id);
    const data = c.req.valid("json");
    await createPlatformConfigRepository(c.env.DB).setLimits(
      id,
      data,
      getPlatformJwt(c).sub,
    );
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "tenant.limits.updated",
      entity_type: "tenant",
      entity_id: id,
      tenant_id: id,
      details: data,
    });
    return c.json(await createPlatformConfigRepository(c.env.DB).limits(id));
  },
);
router.get(
  "/integrations/status",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONFIG_READ),
  async (c) =>
    c.json({
      items: await createPlatformConfigRepository(c.env.DB).integrations(
        new URL(c.req.url).searchParams.get("tenant_id") ?? undefined,
      ),
    }),
);
router.get(
  "/content",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONTENT_READ),
  async (c) =>
    c.json({ items: await createPlatformContentRepository(c.env.DB).list() }),
);
router.post(
  "/content",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONTENT_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformContentCreateSchema),
  async (c) => {
    const data = c.req.valid("json");
    if (data.tenant_id) await tenant(c, data.tenant_id);
    const id = newId();
    await createPlatformContentRepository(c.env.DB).create(
      id,
      data,
      getPlatformJwt(c).sub,
    );
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "content.created",
      entity_type: "content",
      entity_id: id,
      tenant_id: data.tenant_id ?? undefined,
    });
    return c.json(await createPlatformContentRepository(c.env.DB).get(id), 201);
  },
);
router.patch(
  "/content/:id",
  requirePlatformPermission(PLATFORM_PERMISSIONS.CONTENT_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformContentUpdateSchema),
  async (c) => {
    const id = c.req.param("id");
    const repository = createPlatformContentRepository(c.env.DB);
    const existing = await repository.get(id);
    if (!existing) throw new NotFoundError("Content not found");
    const data = c.req.valid("json");
    validateContentScope(existing, data);
    if (data.tenant_id) await tenant(c, data.tenant_id);
    await repository.update(
      id,
      data,
      getPlatformJwt(c).sub,
    );
    await platformAudit(c.env.DB, {
      ...actor(c),
      action:
        data.status === "published"
          ? "content.published"
          : data.status === "archived"
            ? "content.archived"
            : "content.updated",
      entity_type: "content",
      entity_id: id,
      tenant_id:
        data.tenant_id === undefined
          ? existing.tenant_id ?? undefined
          : data.tenant_id ?? undefined,
    });
    return c.json(await createPlatformContentRepository(c.env.DB).get(id));
  },
);
router.get(
  "/admins",
  requirePlatformPermission(PLATFORM_PERMISSIONS.ADMINS_READ),
  async (c) =>
    c.json({
      items: (await createPlatformUsersRepository(c.env.DB).list()).map(
        ({ user, role }) => ({ ...user, role }),
      ),
    }),
);
router.post(
  "/admins",
  requirePlatformPermission(PLATFORM_PERMISSIONS.ADMINS_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformAdminCreateSchema),
  async (c) => {
    const data = c.req.valid("json");
    const users = createPlatformUsersRepository(c.env.DB);
    const roleId = await users.roleId(data.role_key);
    if (!roleId) throw new NotFoundError("Platform role not found");
    const id = newId();
    await users.create({
      id,
      email: data.email,
      name: data.name,
      password_hash: await hashPassword(data.password),
      role_id: roleId,
    });
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "admin.created",
      entity_type: "platform_user",
      entity_id: id,
      details: { role_key: data.role_key },
    });
    return c.json((await users.findById(id))!.user, 201);
  },
);
router.patch(
  "/admins/:id",
  requirePlatformPermission(PLATFORM_PERMISSIONS.ADMINS_WRITE),
  requireRecentPlatformMfa(),
  zValidator("json", platformAdminUpdateSchema),
  async (c) => {
    const id = c.req.param("id");
    const jwt = getPlatformJwt(c);
    if (id === jwt.sub && c.req.valid("json").is_active === false)
      throw new ForbiddenError("Cannot deactivate yourself");
    const users = createPlatformUsersRepository(c.env.DB);
    const target = await users.findById(id);
    if (!target) throw new NotFoundError("Platform admin not found");
    const data = c.req.valid("json");
    if (
      target.role.key === "platform_owner" &&
      (data.is_active === false ||
        (data.role_key && data.role_key !== "platform_owner")) &&
      (await users.ownerCount()) <= 1
    )
      throw new ForbiddenError("Cannot remove the last platform owner");
    const resolvedRoleId = data.role_key
      ? await users.roleId(data.role_key)
      : undefined;
    if (data.role_key && !resolvedRoleId)
      throw new NotFoundError("Platform role not found");
    await users.update(id, {
      name: data.name,
      is_active: data.is_active,
      role_id: resolvedRoleId ?? undefined,
    });
    if (data.is_active === false || data.role_key)
      await users.revokeAllSessions(id);
    await platformAudit(c.env.DB, {
      ...actor(c),
      action: "admin.updated",
      entity_type: "platform_user",
      entity_id: id,
      details: { fields: Object.keys(data) },
    });
    return c.json((await users.findById(id))!.user);
  },
);
router.get(
  "/audit-logs",
  requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_READ),
  async (c) => {
    const parsed = platformAuditQuerySchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!parsed.success)
      return c.json(
        { error: "Invalid audit query", code: "validation_error" },
        400,
      );
    return c.json(
      await createPlatformAuditLogsRepository(c.env.DB).list(parsed.data),
    );
  },
);
export default router;
