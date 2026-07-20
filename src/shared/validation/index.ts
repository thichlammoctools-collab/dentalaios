/**
 * Shared Zod validation schemas.
 *
 * Used by both:
 *   - Worker (apps/api) via @hono/zod-validator middleware
 *   - Frontend (apps/web) for client-side validation before submit
 *
 * Conventions:
 *   - Free-text fields use .trim() refinement to reject whitespace-only strings
 *   - date_of_birth uses .refine() to validate month/day ranges (not just regex)
 *   - Optional fields with .or(z.literal("")) accept empty strings from HTML forms
 */

import { z } from "zod";
import { PLATFORM_AI_APPLICATION, PLATFORM_AI_MODEL_CONFIG_CATALOG } from "@shared/constants";
import { isValidFdiTooth } from "../constants";

/** Non-empty string (after trim) with reasonable max length */
const nonEmpty = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: "Không được để trống" });

/** Optional non-empty string (after trim) — converts "" to undefined */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim())
    .transform((s) => (s === "" ? undefined : s))
    .optional();

/** Validate YYYY-MM-DD with real month/day ranges */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng YYYY-MM-DD")
  .refine(
    (s) => {
      const [y, m, d] = s.split("-").map(Number);
      if (m < 1 || m > 12) return false;
      if (d < 1 || d > 31) return false;
      // Days per month check (Feb / 30-day months)
      const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      // Leap year
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const maxD = m === 2 ? (leap ? 29 : 28) : dim[m - 1];
      return d <= maxD;
    },
    { message: "Ngày không hợp lệ" },
  );

// ──────────────── Auth ────────────────

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được trống"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ──────────────── SaaS Registration ────────────────

export const registerSchema = z.object({
  name: nonEmpty(200),
  email: z.string().email("Email không hợp lệ"),
  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .regex(/[A-Z]/, "Mật khẩu phải có ít nhất 1 chữ hoa")
    .regex(/[a-z]/, "Mật khẩu phải có ít nhất 1 chữ thường")
    .regex(/[0-9]/, "Mật khẩu phải có ít nhất 1 số"),
  clinic_name: nonEmpty(200),
  branch_name: optionalText(200),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const emailVerifySchema = z.object({
  token: z.string().min(1),
});

export type EmailVerifyInput = z.infer<typeof emailVerifySchema>;

export const inviteAcceptSchema = z.object({
  token: z.string().min(1),
  name: nonEmpty(200),
  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .regex(/[A-Z]/, "Mật khẩu phải có ít nhất 1 chữ hoa")
    .regex(/[a-z]/, "Mật khẩu phải có ít nhất 1 chữ thường")
    .regex(/[0-9]/, "Mật khẩu phải có ít nhất 1 số"),
});

export type InviteAcceptInput = z.infer<typeof inviteAcceptSchema>;

// ──────────────── Patient ────────────────

export const patientCreateSchema = z.object({
  branch_id: z.string().min(1),
  name: nonEmpty(200),
  date_of_birth: dateString,
  gender: z.enum(["M", "F", "O"]),
  phone: nonEmpty(20),
  email: optionalText(200).refine(
    (v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: "Email không hợp lệ" },
  ),
  notes: optionalText(2000),
  address: optionalText(500),
  // Family contact
  family_name: optionalText(200),
  family_phone: z.string().max(20).transform((s) => (s === "" ? undefined : s)).optional(),
  family_relation: optionalText(50),
  // Marketing source
  marketing_source: z.enum(["bang_hieu","facebook","youtube","tiktok","zalo","website","google_map","gioi_thieu","khac"]).optional(),
  // Referral tracking
  referral_type: z.enum(["doctor", "staff", "other", "ad", "none"]).optional(),
  referral_user_id: z.string().min(1).nullable().optional(),
  referral_notes: optionalText(500),
  // Body metrics
  height_cm: z.number().positive().max(300).optional(),
  weight_kg: z.number().positive().max(500).optional(),
  cccd: z.string().regex(/^[0-9]{12}$/, "CCCD phải có đúng 12 chữ số").optional(),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

export const patientNoteCreateSchema = z.object({
  content: nonEmpty(2000),
});

export type PatientNoteCreateInput = z.infer<typeof patientNoteCreateSchema>;

// ──────────────── Visit ────────────────

export const visitCreateSchema = z.object({
  patient_id: z.string().min(1),
  branch_id: z.string().min(1),
  clinician_id: z.string().min(1),
  chair_id: z.string().min(1).optional(),
  source_appointment_id: z.string().min(1).optional(),
  date: z.string().datetime({ offset: true }).optional(),
  notes: optionalText(2000),
  // Personnel
  treating_clinician_id: z.string().min(1).nullable().optional(),
  assistant_id: z.string().min(1).nullable().optional(),
  // Vitals
  blood_pressure_systolic:  z.number().int().min(50).max(300).optional(),
  blood_pressure_diastolic: z.number().int().min(30).max(200).optional(),
  blood_sugar_mgdl:        z.number().min(20).max(600).optional(),
}).superRefine((data, ctx) => {
  if (!data.source_appointment_id && !data.chair_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["chair_id"], message: "Vui lòng chọn ghế nha" });
  }
});

export const visitUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  notes: optionalText(2000).optional(),
  chair_id: z.string().min(1).nullable().optional(),
  // Personnel
  treating_clinician_id: z.string().min(1).nullable().optional(),
  assistant_id: z.string().min(1).nullable().optional(),
  // Vitals
  blood_pressure_systolic:  z.number().int().min(50).max(300).optional(),
  blood_pressure_diastolic: z.number().int().min(30).max(200).optional(),
  blood_sugar_mgdl:        z.number().min(20).max(600).optional(),
  vitals_recorded_at:       z.string().datetime({ offset: true }).transform((s) => (s === "" ? undefined : s)).optional(),
});

export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;

// ──────────────── Clinical finding ────────────────

const SOFT_TISSUE_AREAS = [
  "gum", "tongue", "buccal", "palate",
  "floor_mouth", "lip", "pharynx", "jaw", "tmj", "salivary_gland",
] as const;

export const findingCreateSchema = z.object({
  tooth_number: z.number().int().nullable(),
  scope: z.enum(["tooth", "full_mouth", "soft_tissue"]).default("tooth"),
  area: z.enum(SOFT_TISSUE_AREAS).optional(),
  condition: nonEmpty(100),
  notes: optionalText(2000),
}).superRefine((data, ctx) => {
  if (data.scope === "tooth" && (data.tooth_number == null || !isValidFdiTooth(data.tooth_number))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số răng FDI không hợp lệ" });
  }
  if (data.scope === "soft_tissue" && !data.area) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Vùng mô mềm là bắt buộc khi scope = soft_tissue" });
  }
});

export type FindingCreateInput = z.infer<typeof findingCreateSchema>;

export const findingUpdateSchema = z.object({
  condition: nonEmpty(100),
  notes: optionalText(2000),
});

export type FindingUpdateInput = z.infer<typeof findingUpdateSchema>;

// ──────────────── Treatment plan ────────────────

export const planCreateSchema = z.object({
  visit_id: z.string().min(1),
  patient_id: z.string().min(1),
  currency: z.string().length(3).default("VND"),
  notes: optionalText(2000),
});

export const planItemCreateSchema = z.object({
  tooth_number: z.number().int().nullable(),
  service_code: z.string().trim().min(1).max(40).optional(),
  treating_clinician_id: z.string().min(1).nullable().optional(),
  assistant_id: z.string().min(1).nullable().optional(),
  procedure: nonEmpty(100),
  description: nonEmpty(500),
  unit_cost: z.number().nonnegative(),
}).superRefine((data, ctx) => {
  if (data.tooth_number != null && !isValidFdiTooth(data.tooth_number)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số răng FDI không hợp lệ" });
  }
});

/** Editing a plan item replaces its clinical and pricing selection as one unit. */
export const planItemUpdateSchema = planItemCreateSchema;

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanItemCreateInput = z.infer<typeof planItemCreateSchema>;

const treatmentCaseTypes = ["general", "implant", "orthodontics", "prosthodontics", "full_mouth", "other"] as const;

export const treatmentCaseActivateSchema = z.object({
  case_type: z.enum(treatmentCaseTypes).default("general"),
  title: nonEmpty(200).optional(),
  clinical_summary: optionalText(4000),
  treatment_goal: optionalText(2000),
  target_completed_at: dateString.optional(),
}).strict();

export type TreatmentCaseActivateInput = z.infer<typeof treatmentCaseActivateSchema>;

export const treatmentCasePauseSchema = z.object({
  reason: nonEmpty(1000),
}).strict();

export type TreatmentCasePauseInput = z.infer<typeof treatmentCasePauseSchema>;

export const treatmentCaseCancelSchema = z.object({
  reason: nonEmpty(1000),
}).strict();

export type TreatmentCaseCancelInput = z.infer<typeof treatmentCaseCancelSchema>;

export const treatmentCaseMilestoneUpdateSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed", "skipped"]),
  reason: optionalText(1000),
}).strict().superRefine((data, context) => {
  if (data.status === "skipped" && !data.reason?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "Cần nhập lý do bỏ qua hạng mục" });
  }
});

export type TreatmentCaseMilestoneUpdateInput = z.infer<typeof treatmentCaseMilestoneUpdateSchema>;

const milestoneAppointmentLinkTypes = ["primary", "follow_up", "consultation", "preparation", "delivery"] as const;
const milestoneAppointmentExecutionStatuses = ["planned", "partially_completed", "completed", "not_performed"] as const;

export const milestoneAppointmentLinkSchema = z.object({
  appointment_id: z.string().min(1),
  link_type: z.enum(milestoneAppointmentLinkTypes).default("primary"),
}).strict();
export type MilestoneAppointmentLinkInput = z.infer<typeof milestoneAppointmentLinkSchema>;

export const milestoneAppointmentCreateSchema = z.object({
  milestone_ids: z.array(z.string().min(1)).max(20).optional(),
  clinician_id: z.string().min(1),
  chair_id: z.string().min(1).optional(),
  assistant_id: z.string().min(1).optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(480).default(30),
  notes: optionalText(2000),
  link_type: z.enum(milestoneAppointmentLinkTypes).default("primary"),
}).strict();
export type MilestoneAppointmentCreateInput = z.infer<typeof milestoneAppointmentCreateSchema>;

export const milestoneAppointmentExecutionSchema = z.object({
  execution_status: z.enum(milestoneAppointmentExecutionStatuses),
  notes: optionalText(2000),
}).strict();
export type MilestoneAppointmentExecutionInput = z.infer<typeof milestoneAppointmentExecutionSchema>;
export type PlanItemUpdateInput = z.infer<typeof planItemUpdateSchema>;

export const treatmentServiceUpsertSchema = z.object({
  code: z.string().trim().min(2, "Mã dịch vụ tối thiểu 2 ký tự").max(40).regex(/^[A-Za-z0-9_-]+$/, "Mã dịch vụ chỉ gồm chữ, số, gạch ngang hoặc gạch dưới").transform((value) => value.toUpperCase()),
  name: nonEmpty(200),
  procedure: nonEmpty(100),
  price: z.number().nonnegative("Giá dịch vụ phải lớn hơn hoặc bằng 0"),
  is_active: z.boolean().default(true),
});

export type TreatmentServiceUpsertInput = z.infer<typeof treatmentServiceUpsertSchema>;

// ──────────────── Payment ────────────────

export const paymentCreateSchema = z.object({
  treatment_plan_id: z.string().min(1),
  patient_id: z.string().min(1),
  amount: z.number().positive("Số tiền phải > 0"),
  currency: z.string().length(3).default("VND"),
  method: z.enum(["cash", "transfer", "card", "other"]),
  reference: optionalText(200),
  notes: optionalText(500),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

/**
 * Patch schema for editing an existing payment.
 *
 * `.strict()` is critical: it rejects any field other than these four
 * (status, code, patient_id, treatment_plan_id). Status changes go through
 * the dedicated /confirm and /fail endpoints, not PATCH.
 */
export const paymentUpdateSchema = z
  .object({
    amount: z.number().positive("Số tiền phải > 0").optional(),
    method: z.enum(["cash", "transfer", "card", "other"]).optional(),
    reference: optionalText(200),
    notes: optionalText(500),
  })
  .strict();

export type PaymentUpdateInput = z.infer<typeof paymentUpdateSchema>;

export const paymentAdjustmentSchema = z.object({
  amount: z.number().finite().refine((value) => value !== 0, "Số tiền điều chỉnh không được bằng 0"),
  reason: nonEmpty(500),
  notes: optionalText(500),
});
export type PaymentAdjustmentInput = z.infer<typeof paymentAdjustmentSchema>;

export const paymentAttachmentCreateSchema = z.object({
  file_id: z.string().min(1),
  kind: z.enum(["transfer_receipt", "receipt", "invoice", "other"]),
  description: optionalText(500),
});
export type PaymentAttachmentCreateInput = z.infer<typeof paymentAttachmentCreateSchema>;

/** Tenant-configurable payment code prefix (e.g. "TT", "PK1"). */
export const paymentPrefixSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(2, "Tối thiểu 2 ký tự")
    .max(8, "Tối đa 8 ký tự")
    .regex(/^[A-Z0-9]+$/, "Chỉ gồm chữ in hoa và số, không dấu")
    .transform((v) => v.toUpperCase()),
});

export type PaymentPrefixInput = z.infer<typeof paymentPrefixSchema>;

// ──────────────── Medical alerts ────────────────

export const medicalAlertCreateSchema = z.object({
  type: nonEmpty(50),
  description: nonEmpty(500),
  severity: z.enum(["low", "medium", "high"]),
});

export type MedicalAlertCreateInput = z.infer<typeof medicalAlertCreateSchema>;

// ──────────────── Users ────────────────

export const userCreateSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  name: nonEmpty(200),
  password: z.string().min(6, "Mật khẩu phải ≥ 6 ký tự"),
  role_id: z.string().min(1),
  branch_id: z.string().min(1),
});

export const userUpdateSchema = z.object({
  name: nonEmpty(200).optional(),
  role_id: z.string().min(1).optional(),
  branch_id: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  is_active: z.boolean().optional(),
});

// ──────────────── Avatars ────────────────

export const avatarPresignSchema = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
});

export const avatarFileSchema = z.object({
  file_id: z.string().min(1),
});

// ──────────────── Patient Images ────────────────

export const patientImageCreateSchema = z.object({
  patient_id: z.string().min(1),
  visit_id: z.string().min(1).optional(),
  image_type: z.enum(["cbct","scan_3d","dicom","photo_before","photo_after","xray","intraoral","other"]),
  description: optionalText(500),
  file_id: z.string().min(1),
  thumb_key: z.string().optional(),
  original_name: z.string().min(1).max(200).optional(),
  original_size: z.number().int().positive().optional(),
});
export type PatientImageCreateInput = z.infer<typeof patientImageCreateSchema>;

export const patientImagePresignSchema = z.object({
  filename: z.string().min(1).max(200),
  content_type: z.string().min(1).max(100),
  size: z.number().int().positive(),
});
export type PatientImagePresignInput = z.infer<typeof patientImagePresignSchema>;

export const aiAnalyzeImageSchema = z.object({
  file_id: z.string().min(1),
  visit_id: z.string().min(1).optional(),
  image_type: z.enum(["cbct","scan_3d","dicom","photo_before","photo_after","xray","intraoral","other"]),
  prompt: z.string().min(1).max(1000).optional(),
});
export type AiAnalyzeImageInput = z.infer<typeof aiAnalyzeImageSchema>;

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ──────────────── Roles ────────────────

export const roleUpdateSchema = z.object({
  name: nonEmpty(50).optional(),
  description: optionalText(200).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Cần cập nhật ít nhất một trường");

export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

// ──────────────── Appointment ────────────────

export const appointmentCreateSchema = z.object({
  patient_id: z.string().min(1),
  clinician_id: z.string().min(1),
  assistant_id: z.string().min(1).optional(),
  chair_id: z.string().min(1).optional(),
  scheduled_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(480).default(30),
  procedure: optionalText(100),
  notes: optionalText(2000),
  source_visit_id: z.string().min(1).optional(),
  source: z.enum(["manual", "ai_chat", "ai_next_visit", "reschedule"]).default("manual"),
});

export const appointmentUpdateSchema = z.object({
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  duration_min: z.number().int().min(15).max(480).optional(),
  clinician_id: z.string().min(1).optional(),
  assistant_id: z.string().min(1).nullable().optional(),
  chair_id: z.string().min(1).nullable().optional(),
  status: z.enum(["booked", "confirmed", "arrived", "completed", "cancelled", "no_show"]).optional(),
  procedure: optionalText(100).optional(),
  notes: optionalText(2000).optional(),
  cancelled_reason: optionalText(500).optional(),
});

export type AppointmentCreateInput = z.infer<typeof appointmentCreateSchema>;
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateSchema>;
export const appointmentSlotQuerySchema = z.object({
  doctor_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type AppointmentSlotQuery = z.infer<typeof appointmentSlotQuerySchema>;

// ──────────────── Tenant management dashboard ────────────────

export const managementDashboardQuerySchema = z.object({
  range: z.coerce.number().int().refine((value): value is 7 | 30 | 90 => [7, 30, 90].includes(value), {
    message: "Khoảng thời gian phải là 7, 30 hoặc 90 ngày",
  }).default(30),
  branch_id: z.string().trim().min(1).optional(),
});

export type ManagementDashboardQuery = z.infer<typeof managementDashboardQuerySchema>;

// ──────────────── Dental chairs ────────────────

const chairTypeSchema = z.enum(["general", "surgery", "orthodontic", "pediatric", "hygiene"]);
const chairOperationalStatusSchema = z.enum(["available", "cleaning", "maintenance", "out_of_service"]);

export const chairCreateSchema = z.object({
  branch_id: z.string().min(1),
  code: z.string().trim().min(1, "Không được để trống").max(50)
    .regex(/^[A-Za-z0-9_-]+$/, "Mã ghế chỉ gồm chữ, số, gạch ngang hoặc gạch dưới"),
  name: nonEmpty(100),
  room_id: z.string().min(1).nullable().optional(),
  chair_type: chairTypeSchema.default("general"),
  operational_status: chairOperationalStatusSchema.default("available"),
  default_doctor_id: z.string().min(1).nullable().optional(),
  default_assistant_id: z.string().min(1).nullable().optional(),
  turnover_min: z.number().int().min(0).max(120).default(10),
  sort_order: z.number().int().min(0).max(10000).default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Màu phải ở dạng #RRGGBB").optional(),
  is_active: z.boolean().default(true),
  notes: optionalText(1000),
});

export const chairUpdateSchema = chairCreateSchema
  .omit({ branch_id: true, code: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "Cần ít nhất một trường để cập nhật" });

export const chairStatusUpdateSchema = z.object({
  operational_status: chairOperationalStatusSchema,
}).strict();

export const chairAvailabilityQuerySchema = z.object({
  branch_id: z.string().min(1),
  start_at: z.string().datetime({ offset: true }),
  duration_min: z.coerce.number().int().min(15).max(480),
  exclude_appointment_id: z.string().min(1).optional(),
});

export const chairBoardQuerySchema = z.object({
  branch_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const chairRevenueReportQuerySchema = z.object({
  branch_id: z.string().min(1),
  range: z.coerce.number().int().refine((value): value is 7 | 30 | 90 => [7, 30, 90].includes(value), {
    message: "Khoảng thời gian phải là 7, 30 hoặc 90 ngày",
  }).default(30),
});

export type ChairCreateInput = z.infer<typeof chairCreateSchema>;
export type ChairUpdateInput = z.infer<typeof chairUpdateSchema>;
export type ChairStatusUpdateInput = z.infer<typeof chairStatusUpdateSchema>;

export const roomCreateSchema = z.object({
  branch_id: z.string().min(1),
  name: nonEmpty(100),
  sort_order: z.number().int().min(0).max(10000).default(0),
});

export type RoomCreateInput = z.infer<typeof roomCreateSchema>;

// ──────────────── Doctor Schedule ────────────────

export const doctorScheduleEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  slot_minutes: z.number().int().min(15).max(120).default(30),
});

export const doctorScheduleBulkUpdateSchema = z.object({
  doctor_id: z.string().min(1),
  branch_id: z.string().min(1),
  entries: z.array(doctorScheduleEntrySchema).max(7),
});

export type DoctorScheduleEntry = z.infer<typeof doctorScheduleEntrySchema>;
export type DoctorScheduleBulkUpdate = z.infer<typeof doctorScheduleBulkUpdateSchema>;

// ──────────────── Clinic Schedule ────────────────

export const clinicScheduleEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  open_time: z.string().regex(/^\d{2}:\d{2}$/),
  close_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_closed: z.boolean().default(false),
});

export const clinicScheduleBulkUpdateSchema = z.object({
  branch_id: z.string().min(1),
  entries: z.array(clinicScheduleEntrySchema).max(7),
});

export type ClinicScheduleEntry = z.infer<typeof clinicScheduleEntrySchema>;
export type ClinicScheduleBulkUpdate = z.infer<typeof clinicScheduleBulkUpdateSchema>;

// ──────────────── Branch ────────────────

export const branchCreateSchema = z.object({
  name: nonEmpty(200),
  address: optionalText(500),
  phone: optionalText(20),
  email: optionalText(200).refine(
    (v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: "Email không hợp lệ" },
  ),
  manager_name: optionalText(200),
  opening_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const branchUpdateSchema = branchCreateSchema.partial();

export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

// ---------------- Platform administration ----------------

const platformPassword = z.string().min(14, "Mật khẩu phải có ít nhất 14 ký tự");
const platformPage = z.coerce.number().int().min(1).max(100).default(25);
const platformCursor = z.string().datetime({ offset: true }).optional();
const platformIsoDate = z.string().datetime({ offset: true });

export const platformLoginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được trống"),
}).strict();

export const platformMfaVerifySchema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().trim().min(6).max(32),
}).strict();

export const platformReauthSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(32),
}).strict();

export const platformTenantListQuerySchema = z.object({
  limit: platformPage,
  cursor: platformCursor,
  status: z.enum(["active", "suspended"]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["created_at", "name", "updated_at"]).default("created_at"),
}).strict();

export const platformTenantCreateSchema = z.object({
  name: nonEmpty(200),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  admin_email: z.string().trim().email("Email quản trị không hợp lệ"),
  admin_password: platformPassword,
}).strict();

export const platformTenantUpdateSchema = z.object({
  name: nonEmpty(200).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).nullable().optional(),
  expected_updated_at: z.string().min(1).optional(),
}).strict().refine((data) => Object.keys(data).some((key) => key !== "expected_updated_at"), "Cần ít nhất một trường để cập nhật");

export const platformLifecycleSchema = z.object({
  reason: nonEmpty(500),
  expected_updated_at: z.string().min(1).optional(),
}).strict();

export const platformFlagSchema = z.object({
  key: z.string().trim().min(2).max(100).regex(/^[a-z0-9._-]+$/),
  description: nonEmpty(300),
  default_enabled: z.boolean(),
}).strict();

export const platformFlagOverrideSchema = z.object({ enabled: z.boolean() }).strict();

export const platformLimitsSchema = z.object({
  max_users: z.number().int().min(0).max(100000),
  max_branches: z.number().int().min(0).max(10000),
  storage_quota_bytes: z.number().int().min(0).max(10_000_000_000_000),
}).strict();

const platformAiUseCases = PLATFORM_AI_MODEL_CONFIG_CATALOG.map((item) => item.use_case) as [string, ...string[]];
const platformAiModelIds = [...new Set(PLATFORM_AI_MODEL_CONFIG_CATALOG.flatMap((item) => item.allowed_models.map((model) => model.id)))] as [string, ...string[]];

export const platformAiModelConfigSchema = z.object({
  application_key: z.literal(PLATFORM_AI_APPLICATION),
  use_case: z.enum(platformAiUseCases),
  model_id: z.enum(platformAiModelIds),
  is_enabled: z.boolean(),
}).strict();

export const procedureCatalogCreateSchema = z.object({
  code: z.string().trim().min(2, "Mã thủ thuật tối thiểu 2 ký tự").max(100).regex(/^[a-z0-9_-]+$/, "Mã thủ thuật chỉ gồm chữ thường, số, gạch ngang hoặc gạch dưới"),
  name: nonEmpty(200),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10_000).default(0),
}).strict();

export const procedureCatalogUpdateSchema = z.object({
  name: nonEmpty(200).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Cần ít nhất một trường để cập nhật");

export const platformContentCreateSchema = z.object({
  kind: z.enum(["announcement", "help_article"]),
  title: nonEmpty(200),
  body_markdown: nonEmpty(50_000),
  status: z.enum(["draft", "scheduled", "published", "archived"]).default("draft"),
  audience: z.enum(["global", "tenant"]),
  tenant_id: z.string().min(1).optional(),
  publish_at: platformIsoDate.optional(),
  expire_at: platformIsoDate.optional(),
}).strict().superRefine((data, ctx) => {
  if (data.audience === "tenant" && !data.tenant_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tenant_id"], message: "Tenant là bắt buộc" });
  if (data.audience === "global" && data.tenant_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tenant_id"], message: "Nội dung toàn cục không có tenant" });
  if (data.status === "scheduled" && !data.publish_at) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publish_at"], message: "Lịch phát hành là bắt buộc" });
});

export const platformContentUpdateSchema = z.object({
  kind: z.enum(["announcement", "help_article"]).optional(),
  title: nonEmpty(200).optional(),
  body_markdown: nonEmpty(50_000).optional(),
  status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
  audience: z.enum(["global", "tenant"]).optional(),
  tenant_id: z.string().min(1).nullable().optional(),
  publish_at: platformIsoDate.nullable().optional(),
  expire_at: platformIsoDate.nullable().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Cần ít nhất một trường để cập nhật");

export const platformAdminCreateSchema = z.object({
  email: z.string().email(),
  name: nonEmpty(200),
  password: platformPassword,
  role_key: z.enum(["platform_owner", "platform_operator", "platform_auditor"]),
}).strict();

export const platformAdminUpdateSchema = z.object({
  name: nonEmpty(200).optional(),
  role_key: z.enum(["platform_owner", "platform_operator", "platform_auditor"]).optional(),
  is_active: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Cần ít nhất một trường để cập nhật");

export const platformAuditQuerySchema = z.object({
  limit: platformPage,
  cursor: platformCursor,
  action: z.string().trim().min(1).max(100).optional(),
  tenant_id: z.string().min(1).optional(),
}).strict();

export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;
export type PlatformMfaVerifyInput = z.infer<typeof platformMfaVerifySchema>;
export type PlatformReauthInput = z.infer<typeof platformReauthSchema>;
export type PlatformTenantCreateInput = z.infer<typeof platformTenantCreateSchema>;
export type PlatformTenantUpdateInput = z.infer<typeof platformTenantUpdateSchema>;
export type PlatformLifecycleInput = z.infer<typeof platformLifecycleSchema>;
export type PlatformFlagInput = z.infer<typeof platformFlagSchema>;
export type PlatformLimitsInput = z.infer<typeof platformLimitsSchema>;
export type PlatformContentCreateInput = z.infer<typeof platformContentCreateSchema>;
