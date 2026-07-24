import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  planBatchCreateSchema,
  planCreateSchema,
  planItemCreateSchema,
  planItemsBatchCreateSchema,
  planItemUpdateSchema,
  treatmentCaseActivateSchema,
  treatmentCaseCancelSchema,
  treatmentCasePauseSchema,
  treatmentCaseMilestoneUpdateSchema,
  milestoneAppointmentCreateSchema,
  milestoneAppointmentExecutionSchema,
  milestoneAppointmentLinkSchema,
} from "@shared/validation";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { planService } from "../services/plan.service";
import { treatmentCasesService } from "../services/treatment-cases.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/treatment-plans
router.get(
  "/",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const url = new URL(c.req.url);
    const items = await planService.list(c.env.DB, jwt.tenant_id, {
      patientId: url.searchParams.get("patient_id") ?? undefined,
      status: (url.searchParams.get("status") as "draft" | "approved" | "completed" | "cancelled" | null) ?? undefined,
    });
    return c.json({ items, total: items.length });
  },
);

// Milestones are an ordered operational projection of the approved plan items.
router.get(
  "/:id/case/milestones",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.listMilestones(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

router.patch(
  "/:id/case/milestones/:milestoneId",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("milestone_updated", "treatment_case_milestone"),
  zValidator("json", treatmentCaseMilestoneUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const milestone = await treatmentCasesService.updateMilestone(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"), jwt.sub, c.req.valid("json"),
    );
    return c.json(milestone);
  },
);

router.get(
  "/:id/case/financial-summary",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await treatmentCasesService.financialSummary(c.env.DB, jwt.tenant_id, c.req.param("id")));
  },
);

router.get(
  "/:id/case/milestones/:milestoneId/appointments",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.listMilestoneAppointments(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"),
    );
    return c.json({ items, total: items.length });
  },
);

router.post(
  "/:id/case/milestones/:milestoneId/appointments",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("milestone_appointment_created", "treatment_milestone_appointment"),
  zValidator("json", milestoneAppointmentCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.createMilestoneAppointment(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"),
      { userId: jwt.sub, branchId: jwt.branch_id }, c.req.valid("json"), c.env.ENCRYPTION_KEY ?? undefined,
    );
    return c.json({ items, total: items.length }, 201);
  },
);

router.post(
  "/:id/case/milestones/:milestoneId/link-appointment",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("milestone_appointment_linked", "treatment_milestone_appointment"),
  zValidator("json", milestoneAppointmentLinkSchema),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.linkMilestoneAppointment(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"), jwt.sub, c.req.valid("json"),
    );
    return c.json({ items, total: items.length }, 201);
  },
);

router.patch(
  "/:id/case/milestones/:milestoneId/appointments/:appointmentId/execution",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("milestone_appointment_execution_updated", "treatment_milestone_appointment"),
  zValidator("json", milestoneAppointmentExecutionSchema),
  async (c) => {
    const jwt = getJwt(c);
    return c.json(await treatmentCasesService.updateMilestoneAppointmentExecution(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"), c.req.param("appointmentId"), c.req.valid("json"),
    ));
  },
);

router.delete(
  "/:id/case/milestones/:milestoneId/appointments/:appointmentId",
  requirePermission(PERMISSIONS.WRITE_APPOINTMENTS),
  auditLog("milestone_appointment_unlinked", "treatment_milestone_appointment"),
  async (c) => {
    const jwt = getJwt(c);
    const removed = await treatmentCasesService.unlinkMilestoneAppointment(
      c.env.DB, jwt.tenant_id, c.req.param("id"), c.req.param("milestoneId"), c.req.param("appointmentId"),
    );
    if (!removed) {
      return c.json({ error: "Liên kết lịch hẹn không tồn tại", code: "not_found" }, 404);
    }
    return c.json({ ok: true });
  },
);

// POST /api/treatment-plans
router.post(
  "/",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create", "treatment_plan"),
  zValidator("json", planCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await planService.create(c.env.DB, jwt.tenant_id, data);
    return c.json(created, 201);
  },
);

// POST /api/treatment-plans/batch — create a draft and all validated items atomically.
router.post(
  "/batch",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create_batch", "treatment_plan", {
    entityIdFrom: (body) => (
      typeof body === "object" && body !== null && "plan" in body
      && typeof body.plan === "object" && body.plan !== null && "id" in body.plan
      && typeof body.plan.id === "string"
    ) ? body.plan.id : undefined,
  }),
  zValidator("json", planBatchCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const created = await planService.createWithItems(c.env.DB, jwt.tenant_id, c.req.valid("json"));
    return c.json(created, 201);
  },
);

// GET /api/treatment-plans/:id
router.get(
  "/:id",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const plan = await planService.get(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(plan, 200);
  },
);

// GET /api/treatment-plans/:id/items
router.get(
  "/:id/items",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await planService.listItems(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// GET /api/treatment-plans/:id/case — operational case for an approved plan
router.get(
  "/:id/case",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.getByPlanId(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ case: treatmentCase });
  },
);

// GET /api/treatment-plans/:id/case/history — immutable lifecycle history
router.get(
  "/:id/case/history",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const items = await treatmentCasesService.listStatusHistory(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json({ items, total: items.length });
  },
);

// POST /api/treatment-plans/:id/items/batch
router.post(
  "/:id/items/batch",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create_batch", "treatment_plan_item", {
    entityIdFrom: (body) => (
      typeof body === "object" && body !== null && "items" in body
      && Array.isArray(body.items) && typeof body.items[0] === "object" && body.items[0] !== null
      && "id" in body.items[0] && typeof body.items[0].id === "string"
    ) ? body.items[0].id : undefined,
  }),
  zValidator("json", planItemsBatchCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const { items } = c.req.valid("json");
    const created = await planService.addItems(c.env.DB, jwt.tenant_id, c.req.param("id"), items);
    return c.json({ items: created, total: created.length }, 201);
  },
);

// POST /api/treatment-plans/:id/items
router.post(
  "/:id/items",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("create", "treatment_plan_item"),
  zValidator("json", planItemCreateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const data = c.req.valid("json");
    const created = await planService.addItem(c.env.DB, jwt.tenant_id, c.req.param("id"), data);
    return c.json(created, 201);
  },
);

// PATCH /api/treatment-plans/:id/items/:itemId
router.patch(
  "/:id/items/:itemId",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("update", "treatment_plan_item"),
  zValidator("json", planItemUpdateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const updated = await planService.updateItem(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      c.req.param("itemId"),
      c.req.valid("json"),
    );
    return c.json(updated, 200);
  },
);

// DELETE /api/treatment-plans/:id/items/:itemId
router.delete(
  "/:id/items/:itemId",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("delete", "treatment_plan_item"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await planService.removeItem(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      c.req.param("itemId"),
    );
    if (!ok) return c.json({ error: "Item not found", code: "not_found" }, 404);
    return c.json({ ok: true }, 200);
  },
);

// POST /api/treatment-plans/:id/approve
router.post(
  "/:id/approve",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("approve", "treatment_plan"),
  async (c) => {
    const jwt = getJwt(c);
    const approved = await planService.approve(c.env.DB, jwt.tenant_id, c.req.param("id"));
    return c.json(approved, 200);
  },
);

// POST /api/treatment-plans/:id/case/activate — starts operational treatment after approval
router.post(
  "/:id/case/activate",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("case_activated", "treatment_case"),
  zValidator("json", treatmentCaseActivateSchema),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.activate(
      c.env.DB,
      jwt.tenant_id,
      c.req.param("id"),
      { userId: jwt.sub, branchId: jwt.branch_id },
      c.req.valid("json"),
    );
    return c.json(treatmentCase, 201);
  },
);

router.post(
  "/:id/case/pause",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("case_paused", "treatment_case"),
  zValidator("json", treatmentCasePauseSchema),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.transition(
      c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, "paused", c.req.valid("json").reason,
    );
    return c.json(treatmentCase);
  },
);

router.post(
  "/:id/case/resume",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("case_resumed", "treatment_case"),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.transition(c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, "active");
    return c.json(treatmentCase);
  },
);

router.post(
  "/:id/case/complete",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("case_completed", "treatment_case"),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.transition(c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, "completed");
    return c.json(treatmentCase);
  },
);

router.post(
  "/:id/case/cancel",
  requirePermission(PERMISSIONS.APPROVE_PLANS),
  auditLog("case_cancelled", "treatment_case"),
  zValidator("json", treatmentCaseCancelSchema),
  async (c) => {
    const jwt = getJwt(c);
    const treatmentCase = await treatmentCasesService.transition(
      c.env.DB, jwt.tenant_id, c.req.param("id"), jwt.sub, "cancelled", c.req.valid("json").reason,
    );
    return c.json(treatmentCase);
  },
);

// DELETE /api/treatment-plans/:id
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("delete", "treatment_plan"),
  async (c) => {
    const jwt = getJwt(c);
    const ok = await planService.deletePlan(c.env.DB, jwt.tenant_id, c.req.param("id"));
    if (!ok) return c.json({ error: "Plan not found", code: "not_found" }, 404);
    return c.json({ ok: true }, 200);
  },
);

export default router;
