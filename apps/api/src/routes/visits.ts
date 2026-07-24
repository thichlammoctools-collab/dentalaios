import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { diagnosisCreateSchema, diagnosisImageEvidenceCreateSchema, diagnosisUpdateSchema, findingCreateSchema, findingUpdateSchema, findingsBatchCreateSchema, visitCreateSchema, visitUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { visitService } from "../services/visit.service";
import { diagnosisService } from "../services/diagnosis.service";
import { imageAnnotationsService } from "../services/image-annotations.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/visits
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await visitService.list(c.env.DB, jwt.tenant_id, {
      patientId: url.searchParams.get("patient_id") ?? undefined,
      branchId: url.searchParams.get("branch_id") ?? undefined,
      status: (url.searchParams.get("status") as "in_progress" | "completed" | "cancelled" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

router.get(
  "/:visitId/diagnoses/:diagnosisId/image-evidence",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await imageAnnotationsService.listDiagnosisEvidence(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("diagnosisId"));
    return c.json({ items, total: items.length });
  },
);

router.post(
  "/:visitId/diagnoses/:diagnosisId/image-evidence",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "clinical_diagnosis_image_evidence"),
  zValidator("json", diagnosisImageEvidenceCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await imageAnnotationsService.createEvidence(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("diagnosisId"), jwt.sub, c.req.valid("json")), 201);
  },
);

router.delete(
  "/:visitId/diagnoses/:diagnosisId/image-evidence/:evidenceId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("delete", "clinical_diagnosis_image_evidence"),
  async (c) => {
    const jwt = getJwt(c);
    await imageAnnotationsService.removeEvidence(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("diagnosisId"), c.req.param("evidenceId"));
    return c.json({ id: c.req.param("evidenceId"), ok: true });
  },
);

// POST /api/visits
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_VISITS),
  auditLog("create", "visit"),
  zValidator("json", visitCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await visitService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// GET /api/visits/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const visit = await visitService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(visit, 200);
  },
);

// PATCH /api/visits/:id
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_VISITS),
  auditLog("update", "visit"),
  zValidator("json", visitUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await visitService.update(c.env.DB, jwt.tenant_id, c.req.param("id"), data, jwt.sub);
    return c.json(updated, 200);
  },
);

// GET /api/visits/:id/findings
router.get(
  "/:id/findings",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await visitService.listFindings(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.get(
  "/:id/diagnoses",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await diagnosisService.list(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.post(
  "/:id/diagnoses",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "clinical_diagnosis"),
  zValidator("json", diagnosisCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await diagnosisService.create(c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, c.req.valid("json")), 201);
  },
);

router.patch(
  "/:visitId/diagnoses/:diagnosisId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("update", "clinical_diagnosis"),
  zValidator("json", diagnosisUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await diagnosisService.update(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("diagnosisId"), jwt.sub, c.req.valid("json")));
  },
);

router.get(
  "/:visitId/diagnoses/:diagnosisId/revisions",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await diagnosisService.revisions(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("diagnosisId"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/visits/:id/findings/batch — validate all findings before any insert.
router.post(
  "/:id/findings/batch",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create_batch", "clinical_finding"),
  zValidator("json", findingsBatchCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const created = await visitService.addFindings(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json"));
    return c.json({ items: created, total: created.length }, 201);
  },
);

// POST /api/visits/:id/findings
router.post(
  "/:id/findings",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("create", "clinical_finding"),
  zValidator("json", findingCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await visitService.addFinding(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    return c.json(created, 201);
  },
);

// PATCH /api/visits/:visitId/findings/:findingId
router.patch(
  "/:visitId/findings/:findingId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("update", "clinical_finding"),
  zValidator("json", findingUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const updated = await visitService.updateFinding(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("findingId"),
      data,
    );
    return c.json(updated, 200);
  },
);

// DELETE /api/visits/:visitId/findings/:findingId
router.delete(
  "/:visitId/findings/:findingId",
  requirePermission(PERMISSIONS.WRITE_FINDINGS),
  auditLog("delete", "clinical_finding"),
  async (c) => {
    const jwt = getJwt(c);
    await visitService.deleteFinding(c.env.DB, jwt.tenant_id, c.req.param("visitId"), c.req.param("findingId"));
    return c.body(null, 204);
  },
);

export default router;
