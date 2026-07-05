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
});

export const visitUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  notes: optionalText(2000).optional(),
});

export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;

// ──────────────── Clinical finding ────────────────

export const findingCreateSchema = z.object({
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, { message: "Số răng FDI không hợp lệ" }),
  condition: nonEmpty(100),
  notes: optionalText(2000),
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
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, { message: "Số răng FDI không hợp lệ" }),
  procedure: nonEmpty(100),
  description: nonEmpty(500),
  unit_cost: z.number().nonnegative(),
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
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

// ──────────────── Roles ────────────────

export const roleUpdateSchema = z.object({
  name: nonEmpty(50).optional(),
  permissions: z.array(z.string()).optional(),
});

export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;