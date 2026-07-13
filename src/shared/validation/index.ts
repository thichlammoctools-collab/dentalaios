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

// ──────────────── Visit ────────────────

export const visitCreateSchema = z.object({
  patient_id: z.string().min(1),
  branch_id: z.string().min(1),
  clinician_id: z.string().min(1),
  date: z.string().datetime({ offset: true }).optional(),
  notes: optionalText(2000),
  // Personnel
  treating_clinician_id: z.string().min(1).nullable().optional(),
  assistant_id: z.string().min(1).nullable().optional(),
  // Vitals
  blood_pressure_systolic:  z.number().int().min(50).max(300).optional(),
  blood_pressure_diastolic: z.number().int().min(30).max(200).optional(),
  blood_sugar_mgdl:        z.number().min(20).max(600).optional(),
});

export const visitUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  notes: optionalText(2000).optional(),
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
  procedure: nonEmpty(100),
  description: nonEmpty(500),
  unit_cost: z.number().nonnegative(),
}).superRefine((data, ctx) => {
  if (data.tooth_number != null && !isValidFdiTooth(data.tooth_number)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Số răng FDI không hợp lệ" });
  }
});

export type PlanCreateInput = z.infer<typeof planCreateSchema>;
export type PlanItemCreateInput = z.infer<typeof planItemCreateSchema>;

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

export const roleCreateSchema = z.object({
  name: nonEmpty(50),
  description: optionalText(200),
  permissions: z.array(z.string()).default([]),
});

export const roleUpdateSchema = z.object({
  name: nonEmpty(50).optional(),
  description: optionalText(200).optional(),
  permissions: z.array(z.string()).optional(),
});

export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

// ──────────────── Appointment ────────────────

export const appointmentCreateSchema = z.object({
  patient_id: z.string().min(1),
  clinician_id: z.string().min(1),
  assistant_id: z.string().min(1).optional(),
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
