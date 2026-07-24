import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { clinicalReviewEditAndAcceptSchema, clinicalReviewRejectSchema, clinicalReviewRouteParamsSchema, diagnosisCreateSchema, diagnosisImageEvidenceCreateSchema, diagnosisUpdateSchema, findingCreateSchema, findingUpdateSchema, findingsBatchCreateSchema, preExamSubmitSchema, visitCreateSchema, visitSafetyAcknowledgementSchema, visitUpdateSchema } from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requireAnyPermission, requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { visitService } from "../services/visit.service";
import { diagnosisService } from "../services/diagnosis.service";
import { imageAnnotationsService } from "../services/image-annotations.service";
import { clinicalReviewService } from "../services/clinical-review.service";
import { createVisitInitialAssessmentsRepository } from "../repositories/visit-initial-assessments.repo";
import { visitSafetyService } from "../services/visit-safety.service";

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

// POST /api/visits/:id/pre-exam/submit - assistant/doctor drafts awaiting review.
router.post(
  "/:id/pre-exam/submit",
  requireAnyPermission([PERMISSIONS.WRITE_PRE_EXAM_DRAFTS, PERMISSIONS.WRITE_FINDINGS]),
  auditLog("pre_exam_submitted", "visit", {
    entityIdFrom: (body) => typeof body === "object" && body !== null && "visit_id" in body && typeof body.visit_id === "string"
      ? body.visit_id
      : undefined,
  }),
  zValidator("json", preExamSubmitSchema),
  async (c) => {
    const jwt = getJwt(c);
    const entrySource = jwt.permissions.includes(PERMISSIONS.WRITE_PRE_EXAM_DRAFTS)
      && !jwt.permissions.includes(PERMISSIONS.WRITE_FINDINGS)
      ? "assistant" as const
      : "doctor" as const;
    return c.json(await clinicalReviewService.submitPreExam(
      c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, entrySource, c.req.valid("json"),
    ), 201);
  },
);

router.get(
  "/:id/review-queue",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await clinicalReviewService.listPending(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.get(
  "/:id/initial-assessment",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const assessment = await createVisitInitialAssessmentsRepository(c.env.DB).getByVisit(jwt.tenant_id, c.req.param("id"));
    return c.json({ assessment });
  },
);

router.get(
  "/:id/safety-acknowledgements",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await visitSafetyService.list(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.post(
  "/:id/safety-acknowledgements",
  requirePermission(PERMISSIONS.REVIEW_CLINICAL_DRAFTS),
  auditLog("visit_safety_acknowledged", "visit_safety_acknowledgement"),
  zValidator("json", visitSafetyAcknowledgementSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await visitSafetyService.acknowledge(c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, c.req.valid("json")), 201);
  },
);

router.post(
  "/:id/reviews/:entityType/:entityId/accept",
  requirePermission(PERMISSIONS.REVIEW_CLINICAL_DRAFTS),
  auditLog("clinical_review_accepted", "clinical_review_event"),
  zValidator("param", clinicalReviewRouteParamsSchema),
  async (c) => {
    const jwt = getJwt(c);
    const params = c.req.valid("param");
    return c.json(await clinicalReviewService.accept(
      c.env.DB, jwt.tenant_id, params.id, params.entityType, params.entityId, jwt.sub,
    ));
  },
);

router.post(
  "/:id/reviews/:entityType/:entityId/reject",
  requirePermission(PERMISSIONS.REVIEW_CLINICAL_DRAFTS),
  auditLog("clinical_review_rejected", "clinical_review_event"),
  zValidator("param", clinicalReviewRouteParamsSchema),
  zValidator("json", clinicalReviewRejectSchema),
  async (c) => {
    const jwt = getJwt(c);
    const params = c.req.valid("param");
    return c.json(await clinicalReviewService.reject(
      c.env.DB, jwt.tenant_id, params.id, params.entityType, params.entityId, jwt.sub, c.req.valid("json"),
    ));
  },
);

router.post(
  "/:id/reviews/:entityType/:entityId/edit-and-accept",
  requirePermission(PERMISSIONS.REVIEW_CLINICAL_DRAFTS),
  auditLog("clinical_review_edited_and_accepted", "clinical_review_event"),
  zValidator("param", clinicalReviewRouteParamsSchema),
  zValidator("json", clinicalReviewEditAndAcceptSchema),
  async (c) => {
    const jwt = getJwt(c);
    const params = c.req.valid("param");
    return c.json(await clinicalReviewService.editAndAccept(
      c.env.DB, jwt.tenant_id, params.id, params.entityType, params.entityId, jwt.sub, c.req.valid("json"),
    ));
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
  auditLog("create_batch", "clinical_finding", {
    entityIdFrom: (body) => (
      typeof body === "object" && body !== null && "items" in body
      && Array.isArray(body.items) && typeof body.items[0] === "object" && body.items[0] !== null
      && "id" in body.items[0] && typeof body.items[0].id === "string"
    ) ? body.items[0].id : undefined,
  }),
  zValidator("json", findingsBatchCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const created = await visitService.addFindings(c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.valid("json"), { userId: jwt.sub });
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
    const created = await visitService.addFinding(c.env.DB, jwt.tenant_id, c.req.param("id"), data, { userId: jwt.sub });
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
