import { Hono } from "hono";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth } from "../middleware/auth";
import type { AuthContext } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { createClinicalTerminologyRepository } from "../repositories/clinical-terminology.repo";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();
router.use("*", requireAuth());

router.get("/concepts", requirePermission(PERMISSIONS.READ_PATIENTS), async (c) => {
  const url = new URL(c.req.url);
  const terminology = createClinicalTerminologyRepository(c.env.DB);
  const concepts = await terminology.listConcepts({
    activeOnly: true,
    category: url.searchParams.get("category") ?? undefined,
    scope: url.searchParams.get("scope") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  });
  const items = await Promise.all(concepts.map(async (concept) => {
    const mapping = await terminology.getActiveMapping(concept.id);
    return { ...concept, default_icd10: mapping?.code };
  }));
  return c.json({ items, total: items.length });
});

router.get("/icd10", requirePermission(PERMISSIONS.READ_PATIENTS), async (c) => {
  const items = await createClinicalTerminologyRepository(c.env.DB).listIcd10({ query: new URL(c.req.url).searchParams.get("q") ?? undefined, activeOnly: true });
  return c.json({ items, total: items.length });
});

export default router;
