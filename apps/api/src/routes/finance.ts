import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "@shared/constants";
import { expenseCreateSchema, expenseVoidSchema, financeQuerySchema } from "@shared/validation";
import type { Env } from "../index";
import type { AuthContext } from "../middleware/auth";
import { getJwt, requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import { financeService } from "../services/finance.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

router.get("/summary", requirePermission(PERMISSIONS.VIEW_FINANCE), async (c) => {
  const parsed = financeQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid finance filter", code: "validation_error" }, 400);
  const jwt = getJwt(c);
  return c.json(await financeService.getSnapshot(c.env.DB, jwt.tenant_id, parsed.data));
});

router.post(
  "/expenses",
  requirePermission(PERMISSIONS.MANAGE_FINANCE),
  auditLog("create", "expense"),
  zValidator("json", expenseCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const expense = await financeService.createExpense(c.env.DB, jwt.tenant_id, jwt.sub, c.req.valid("json"));
    return c.json(expense, 201);
  },
);

router.post(
  "/expenses/:id/void",
  requirePermission(PERMISSIONS.MANAGE_FINANCE),
  auditLog("void", "expense"),
  zValidator("json", expenseVoidSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await financeService.voidExpense(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json")));
  },
);

export default router;
