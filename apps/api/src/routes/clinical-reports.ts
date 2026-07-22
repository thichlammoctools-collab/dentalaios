import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { getJwt, requireAuth } from "../middleware/auth";
import type { AuthContext } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { createDiagnosesRepository } from "../repositories/diagnoses.repo";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();
router.use("*", requireAuth());

router.get("/diagnoses", requirePermission(PERMISSIONS.VIEW_CLINICAL_REPORTS), async (c) => {
  const jwt = getJwt(c);
  const url = new URL(c.req.url);
  const items = await createDiagnosesRepository(c.env.DB).listConfirmedReport(jwt.tenant_id, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    icd10: url.searchParams.get("icd10") ?? undefined,
    branchId: url.searchParams.get("branch_id") ?? undefined,
  });
  return c.json({ items, total: items.length });
});

export default router;
