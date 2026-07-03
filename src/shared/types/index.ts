/**
 * Shared entity types — used by both apps/api (Worker) and apps/web (frontend).
 *
 * Architecture rule #10: "Keep repository interfaces so D1 can migrate later."
 * Repositories return these plain types; D1 rows are mapped inside the repository layer.
 *
 * Naming convention:
 *   - ISO 8601 date strings for *_at fields and date fields
 *   - IDs are strings (TEXT in SQLite) so we can use UUIDs / cuid / nanoid
 *   - Optional fields use `?:` (matches D1 NULL semantics)
 */

// ───────────────────────── Core tenant & auth ─────────────────────────

export interface Tenant {
  id: string;
  name: string;
  created_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  permissions: string[]; // JSON array stored as TEXT in D1
  created_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  branch_id: string;
  role_id: string;
  email: string;
  name: string;
  // password_hash lives in DB but is NEVER returned to clients — repos strip it.
  created_at: string;
}

// ───────────────────────── Patient ─────────────────────────

export type Gender = "M" | "F" | "O";

export interface Patient {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  date_of_birth: string; // ISO date "YYYY-MM-DD"
  gender: Gender;
  phone: string;
  email?: string;
  notes?: string;
  created_at: string;
}

export type AlertSeverity = "low" | "medium" | "high";

export interface MedicalAlert {
  id: string;
  tenant_id: string;
  patient_id: string;
  type: string; // e.g. "allergy", "chronic", "medication"
  description: string;
  severity: AlertSeverity;
  created_at: string;
}

// ───────────────────────── Clinical ─────────────────────────

export type VisitStatus = "in_progress" | "completed" | "cancelled";

export interface Visit {
  id: string;
  tenant_id: string;
  patient_id: string;
  branch_id: string;
  clinician_id: string; // FK to User
  date: string; // ISO datetime
  status: VisitStatus;
  notes?: string;
  created_at: string;
}

/** Tooth numbering system — only FDI supported in V1 per user decision. */
export type ToothSystem = "FDI";

export interface ClinicalFinding {
  id: string;
  tenant_id: string;
  visit_id: string;
  tooth_number: number; // 11–48 (permanent), 51–85 (primary) in FDI
  tooth_system: ToothSystem;
  condition: string; // e.g. "caries", "fracture", "missing", "periapical"
  notes?: string;
  created_at: string;
}

// ───────────────────────── Treatment ─────────────────────────

export type TreatmentPlanStatus = "draft" | "approved" | "completed" | "cancelled";

export interface TreatmentPlan {
  id: string;
  tenant_id: string;
  visit_id: string;
  patient_id: string;
  status: TreatmentPlanStatus;
  total_cost: number; // sum of TreatmentPlanItem.unit_cost (recomputed on save)
  currency: string; // ISO 4217 e.g. "VND"
  notes?: string;
  approved_at?: string;
  created_at: string;
}

export type TreatmentItemStatus = "planned" | "in_progress" | "completed";

export interface TreatmentPlanItem {
  id: string;
  tenant_id: string;
  treatment_plan_id: string;
  tooth_number: number;
  procedure: string; // e.g. "root_canal", "crown", "implant", "filling"
  description: string;
  unit_cost: number;
  status: TreatmentItemStatus;
  created_at: string;
}

// ───────────────────────── Billing ─────────────────────────

export type PaymentMethod = "cash" | "transfer" | "card" | "other";
export type PaymentStatus = "pending" | "confirmed" | "failed";

export interface Payment {
  id: string;
  tenant_id: string;
  treatment_plan_id: string;
  patient_id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string; // bank txn ref / receipt number
  notes?: string;
  created_at: string;
}

// ───────────────────────── Files & Audit ─────────────────────────

export interface FileObject {
  id: string;
  tenant_id: string;
  r2_key: string; // private key — never expose as URL
  filename: string;
  content_type: string;
  size: number;
  uploaded_by: string; // FK to User
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string; // e.g. "create", "update", "delete", "approve"
  entity_type: string; // e.g. "patient", "treatment_plan"
  entity_id: string;
  details?: string; // JSON string — NEVER raw patient data per rule #8
  ip_address: string;
  created_at: string;
}

// ───────────────────────── Lark sync ─────────────────────────

export type LarkSyncStatus = "pending" | "synced" | "failed";

export interface LarkSyncLog {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  lark_event_id?: string;
  status: LarkSyncStatus;
  error?: string;
  created_at: string;
}

// ───────────────────────── Auth response shape ─────────────────────────

export interface AuthSession {
  user: User;
  role: Role;
  tenant: Tenant;
  branch: Branch;
  token: string; // JWT
  expires_at: string;
}

// ───────────────────────── API DTOs (request/response) ─────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  session: AuthSession;
}

export interface MeResponse {
  user: User;
  role: Role;
  tenant: Tenant;
  branch: Branch;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

/** Payload inside JWT — minimal, never includes sensitive data. */
export interface JwtPayload {
  sub: string; // user id
  tenant_id: string;
  branch_id: string;
  role_id: string;
  // Roles rarely change; include name + permissions to skip DB lookup per request
  permissions: string[];
  exp: number; // unix timestamp
  iat: number;
}