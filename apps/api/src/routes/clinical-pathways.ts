/**
 * Clinical Pathway routes — V1: endodontic pain.
 *
 * Mounted at /api/visits — adds sub-routes under /:visitId/clinical-pathways/endodontic-pain.
 * Also provides metrics at /api/clinical-copilot/metrics.
 *
 * Permission model:
 *  - WRITE_PATHWAYS: create/update/close assessment (doctor creates effective immediately)
 *  - REVIEW_PATHWAYS: accept/reject assistant drafts
 *  - READ_PATIENTS: read pathway data
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PERMISSIONS } from "@shared/constants";
import {
  pathwayAssessmentCreateSchema,
  pathwayAssessmentUpdateSchema,
  pathwayAssessmentCloseSchema,
  pathwayItemUpdateSchema,
} from "@shared/validation";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { clinicalPathwayService } from "../services/clinical-pathway.service";
import { ForbiddenError } from "../lib/errors";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/visits/:visitId/clinical-pathways/endodontic-pain
router.get(
  "/:visitId/clinical-pathways/endodontic-pain",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const result = await clinicalPathwayService.getVisitPathway(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
    );
    return c.json(result);
  },
);

// GET pending review (assistant drafts)
router.get(
  "/:visitId/clinical-pathways/endodontic-pain/review",
  requirePermission(PERMISSIONS.REVIEW_PATHWAYS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await clinicalPathwayService.listPendingReview(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
    );
    return c.json({ items, total: items.length });
  },
);

// POST — create assessment
router.post(
  "/:visitId/clinical-pathways/endodontic-pain/assessments",
  requirePermission(PERMISSIONS.WRITE_PATHWAYS),
  auditLog("pathway_assessment_created", "clinical_pathway_assessment"),
  zValidator("json", pathwayAssessmentCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const isDoctor = jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) || jwt.permissions.includes(PERMISSIONS.ALL);
    const result = await clinicalPathwayService.createAssessment(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      jwt.sub,
      isDoctor,
      c.req.valid("json"),
    );
    return c.json(result, 201);
  },
);

// PATCH — update assessment payload
router.patch(
  "/:visitId/clinical-pathways/endodontic-pain/assessments/:assessmentId",
  requirePermission(PERMISSIONS.WRITE_PATHWAYS),
  auditLog("pathway_assessment_updated", "clinical_pathway_assessment"),
  zValidator("json", pathwayAssessmentUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const isDoctor = jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) || jwt.permissions.includes(PERMISSIONS.ALL);
    const result = await clinicalPathwayService.updateAssessment(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("assessmentId"),
      jwt.sub,
      isDoctor,
      c.req.valid("json"),
    );
    return c.json(result);
  },
);

// POST — close assessment
router.post(
  "/:visitId/clinical-pathways/endodontic-pain/assessments/:assessmentId/close",
  requirePermission(PERMISSIONS.WRITE_PATHWAYS),
  auditLog("pathway_assessment_closed", "clinical_pathway_assessment"),
  zValidator("json", pathwayAssessmentCloseSchema),
  async (c) => {
    const jwt = getJwt(c);
    const isDoctor = jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) || jwt.permissions.includes(PERMISSIONS.ALL);
    const result = await clinicalPathwayService.closeAssessment(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("assessmentId"),
      jwt.sub,
      isDoctor,
      c.req.valid("json"),
    );
    return c.json(result);
  },
);

// PATCH — update a single checklist item
router.patch(
  "/:visitId/clinical-pathways/endodontic-pain/assessments/:assessmentId/items/:itemKey",
  requirePermission(PERMISSIONS.WRITE_PATHWAYS),
  auditLog("pathway_item_updated", "clinical_pathway_assessment_item", {
    entityIdFrom: (body) => {
      if (body && typeof body === "object" && "id" in body) return (body as { id?: string }).id;
      return undefined;
    },
  }),
  zValidator("json", pathwayItemUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const isDoctor = jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) || jwt.permissions.includes(PERMISSIONS.ALL);
    const result = await clinicalPathwayService.updateItem(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("assessmentId"),
      c.req.param("itemKey"),
      jwt.sub,
      isDoctor,
      c.req.valid("json"),
    );
    return c.json(result);
  },
);

// POST — accept draft assessment (doctor review)
router.post(
  "/:visitId/clinical-pathways/endodontic-pain/assessments/:assessmentId/accept",
  requirePermission(PERMISSIONS.REVIEW_PATHWAYS),
  auditLog("pathway_assessment_accepted", "clinical_pathway_assessment"),
  async (c) => {
    const jwt = getJwt(c);
    if (!jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) && !jwt.permissions.includes(PERMISSIONS.ALL)) throw new ForbiddenError("Chỉ bác sĩ được duyệt assessment pathway");
    const result = await clinicalPathwayService.acceptDraft(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("assessmentId"),
      jwt.sub,
    );
    return c.json(result);
  },
);

// POST — reject draft assessment
router.post(
  "/:visitId/clinical-pathways/endodontic-pain/assessments/:assessmentId/reject",
  requirePermission(PERMISSIONS.REVIEW_PATHWAYS),
  auditLog("pathway_assessment_rejected", "clinical_pathway_assessment"),
  zValidator("json", pathwayAssessmentCloseSchema),
  async (c) => {
    const jwt = getJwt(c);
    if (!jwt.permissions.includes(PERMISSIONS.SIGN_CLINICAL_RECORDS) && !jwt.permissions.includes(PERMISSIONS.ALL)) throw new ForbiddenError("Chỉ bác sĩ được duyệt assessment pathway");
    await clinicalPathwayService.rejectDraft(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("visitId"),
      c.req.param("assessmentId"),
      jwt.sub,
      c.req.valid("json").close_note ?? "Từ chối assessment",
    );
    return c.json({ ok: true });
  },
);

// ── Metrics (separate sub-router) ──

export const clinicalCopilotMetricsRouter = new Hono<{ Bindings: Env; Variables: AuthContext }>();

clinicalCopilotMetricsRouter.use("*", requireAuth());

// GET /api/clinical-copilot/metrics/endodontic-pain
clinicalCopilotMetricsRouter.get(
  "/endodontic-pain",
  requirePermission(PERMISSIONS.VIEW_CLINICAL_REPORTS),
  async (c) => {
    const jwt = getJwt(c);
    const metrics = await clinicalPathwayService.getMetrics(c.env.DB, jwt.tenant_id);
    return c.json(metrics);
  },
);

export default router;
