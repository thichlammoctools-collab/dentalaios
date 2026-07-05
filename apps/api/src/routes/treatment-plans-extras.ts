import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { PERMISSIONS } from "@shared/constants";
import type { Env } from "../index";
import { requireAuth, getJwt } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { auditLog } from "../middleware/audit";
import type { AuthContext } from "../middleware/auth";
import { planService } from "../services/plan.service";
import { patientService } from "../services/patient.service";
import { buildProposalPdf } from "../services/pdf.service";
import { larkService } from "../services/lark.service";
import { authService } from "../services/auth.service";
import { ValidationError } from "../lib/errors";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

router.use("*", requireAuth());

// GET /api/treatment-plans/:id/pdf — generate proposal PDF
router.get(
  "/:id/pdf",
  requirePermission(PERMISSIONS.READ_PATIENTS),
  async (c) => {
    const jwt = getJwt(c);
    const planId = c.req.param("id");

    let plan;
    let items: Awaited<ReturnType<typeof planService.listItems>> = [];
    let me;
    let patient;

    try {
      [plan, items, me] = await Promise.all([
        planService.get(c.env.DB, jwt.tenant_id, planId),
        planService.listItems(c.env.DB, jwt.tenant_id, planId),
        authService.getMe(
          { db: c.env.DB, jwtSecret: c.env.JWT_SECRET },
          jwt.sub,
          jwt.tenant_id,
        ),
      ]);
    } catch (err) {
      console.error("[/pdf] fetch plan/items/me failed:", err);
      throw err;
    }

    if (!plan) throw new ValidationError("Ke hoach khong ton tai");
    if (!me) throw new ValidationError("User not found");
    try {
      patient = await patientService.get(c.env.DB, jwt.tenant_id, plan.patient_id);
    } catch (err) {
      console.error("[/pdf] fetch patient failed:", err);
      throw err;
    }
    if (!patient) throw new ValidationError("Benh nhan khong ton tai");

    let bytes: Uint8Array;
    try {
      bytes = await buildProposalPdf({
        tenant: me.tenant,
        branch: me.branch,
        patient,
        plan,
        items,
        approverName: me.user.name,
      });
    } catch (err) {
      console.error("[/pdf] buildProposalPdf failed:", err);
      throw err;
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Ke-hoach-dieu-tri-${planId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
);

const larkHandoverSchema = z.object({
  scheduled_at: z.string().datetime({ offset: true }).optional(),
});

// POST /api/treatment-plans/:id/lark-handover
router.post(
  "/:id/lark-handover",
  requirePermission(PERMISSIONS.WRITE_PLANS),
  auditLog("lark_handover", "treatment_plan"),
  zValidator("json", larkHandoverSchema),
  async (c) => {
    const jwt = getJwt(c);
    const planId = c.req.param("id");
    const body = c.req.valid("json");

    const [plan, items, me] = await Promise.all([
      planService.get(c.env.DB, jwt.tenant_id, planId),
      planService.listItems(c.env.DB, jwt.tenant_id, planId),
      authService.getMe(
        { db: c.env.DB, jwtSecret: c.env.JWT_SECRET },
        jwt.sub,
        jwt.tenant_id,
      ),
    ]);

    if (plan.status !== "approved") {
      throw new ValidationError("Chỉ có thể tạo Lark task sau khi plan được duyệt");
    }
    if (!me) throw new ValidationError("User not found");

    const realPatient = await patientService.get(c.env.DB, jwt.tenant_id, plan.patient_id);
    if (!realPatient) throw new ValidationError("Patient not found");

    const result = await larkService.createHandover(c.env, {
      patient: { name: realPatient.name, phone: realPatient.phone },
      plan: {
        id: plan.id,
        status: plan.status,
      },
      itemCount: items.length,
      approverName: me.user.name,
      scheduledAt: body.scheduled_at,
    });

    // Log to lark_sync_logs
    await c.env.DB.prepare(
      `INSERT INTO lark_sync_logs
         (id, tenant_id, entity_type, entity_id, lark_event_id, status)
       VALUES (?, ?, 'treatment_plan', ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        jwt.tenant_id,
        planId,
        result.taskId,
        result.mocked ? "failed" : "synced",
      )
      .run();

    return c.json(result, 200);
  },
);

export default router;