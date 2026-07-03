/**
 * Shared Zod validation schemas.
 *
 * Used by both:
 *   - Worker (apps/api) via @hono/zod-validator middleware
 *   - Frontend (apps/web) for client-side validation before submit
 */

import { z } from "zod";
import { isValidFdiTooth } from "../constants";

// ──────────────── Auth ────────────────

export const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được trống"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ──────────────── Patient ────────────────

export const patientCreateSchema = z.object({
  branch_id: z.string().min(1, "branch_id required"),
  name: z.string().min(1, "Tên không được trống").max(200),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Định dạng YYYY-MM-DD"),
  gender: z.enum(["M", "F", "O"]),
  phone: z.string().min(1, "Số điện thoại không được trống").max(20),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
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
  notes: z.string().max(2000).optional(),
});

export const visitUpdateSchema = z.object({
  status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
  notes: z.string().max(2000).optional(),
});

export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;

// ──────────────── Clinical finding ────────────────

export const findingCreateSchema = z.object({
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, { message: "Số răng FDI không hợp lệ" }),
  condition: z.string().min(1, "Tình trạng không được trống").max(100),
  notes: z.string().max(2000).optional(),
});

export type FindingCreateInput = z.infer<typeof findingCreateSchema>;

// ──────────────── Treatment plan ────────────────

export const planCreateSchema = z.object({
  visit_id: z.string().min(1),
  patient_id: z.string().min(1),
  currency: z.string().length(3).default("VND"),
  notes: z.string().max(2000).optional(),
});

export const planItemCreateSchema = z.object({
  tooth_number: z
    .number()
    .int()
    .refine(isValidFdiTooth, { message: "Số răng FDI không hợp lệ" }),
  procedure: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
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
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;