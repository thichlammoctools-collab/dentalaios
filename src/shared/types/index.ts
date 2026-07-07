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
  slug?: string;
  email?: string;
  is_active: boolean;
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
  is_active: boolean;
  // password_hash lives in DB but is NEVER returned to clients — repos strip it.
  created_at: string;
}

// ───────────────────────── Patient ─────────────────────────

export type Gender = "M" | "F" | "O";

export type ReferralType = "doctor" | "staff" | "other" | "ad" | "none";

export interface Patient {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  date_of_birth: string; // ISO date "YYYY-MM-DD"
  gender: Gender;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  // Family contact
  family_name?: string;
  family_phone?: string;
  family_relation?: string;
  // Marketing
  marketing_source?: string;
  // Referral tracking
  referral_type?: ReferralType;
  referral_user_id?: string;
  referral_user_name?: string;
  referral_notes?: string;
  // Body metrics
  height_cm?: number;
  weight_kg?: number;
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
  clinician_id: string; // FK to User — bác sĩ khám
  date: string; // ISO datetime
  status: VisitStatus;
  notes?: string;
  created_at: string;
  // Vitals
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  blood_sugar_mgdl?: number;
  vitals_recorded_at?: string;
  // Personnel
  treating_clinician_id?: string; // FK to User — bác sĩ điều trị
  treating_clinician_name?: string;
  assistant_id?: string; // FK to User — phụ tá
  assistant_name?: string;
}

/** Tooth numbering system — only FDI supported in V1 per user decision. */
export type ToothSystem = "FDI";

/**
 * Scope of a clinical finding:
 *  - "tooth"         — specific FDI tooth
 *  - "full_mouth"    — entire dentition (e.g. scaling)
 *  - "soft_tissue"   — oral soft tissue (gums, tongue, etc.)
 */
export type FindingScope = "tooth" | "full_mouth" | "soft_tissue";

/** Valid soft-tissue areas when scope = "soft_tissue" */
export type SoftTissueArea =
  | "gum"           // nướu
  | "tongue"        // lưỡi
  | "buccal"        // niêm mạc má
  | "palate"        // vòm miệng
  | "floor_mouth"   // đáy miệng
  | "lip"           // môi
  | "pharynx"       // họng
  | "jaw"           // xương hàm
  | "tmj"           // khớp thái dương hàm
  | "salivary_gland"; // tuyến nước bọt

export interface ClinicalFinding {
  id: string;
  tenant_id: string;
  visit_id: string;
  tooth_number?: number; // present when scope = "tooth"; absent for full_mouth / soft_tissue
  tooth_system?: ToothSystem; // always present when tooth_number is present
  scope: FindingScope;
  area?: SoftTissueArea; // required when scope = "soft_tissue"
  condition: string; // e.g. "caries", "fracture", "gingivitis", "ulcer"
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
  tooth_number?: number; // present for per-tooth items; absent for full-mouth procedures
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

// ───────────────────────── Voice ─────────────────────────

export interface VoiceParsedFinding {
  scope: "tooth" | "full_mouth" | "soft_tissue";
  tooth_number: number | null;
  area?: string;
  condition: string;
  notes: string;
}

export interface VoiceFindingsResult {
  findings: VoiceParsedFinding[];
  ai_model: string;
  generated_at: string;
}

// ───────────────────────── AI ─────────────────────────

export interface GeneratePlanItemDraft {
  tooth: number | null; // null = full-mouth procedure
  procedure: string;
  description: string;
  cost: number;
}

export interface GeneratePlanResult {
  items: GeneratePlanItemDraft[];
  notes: string;
  ai_model: string;
  generated_at: string;
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

// ───────────────────────── SaaS Registration ─────────────────────────

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  clinic_name: string;
  branch_name?: string;
}

export interface RegisterResponse {
  message: string;
  pending_email_verification: boolean;
}

export interface EmailVerifyRequest {
  token: string;
}

export interface EmailVerifyResponse {
  message: string;
  session: AuthSession;
}

export interface InviteRequest {
  email: string;
  role_id: string;
  branch_id: string;
}

export interface InviteAcceptRequest {
  token: string;
  name: string;
  password: string;
}

/** User enriched with role_name and branch_name — returned by listByBranch. */
export interface UserWithDetails extends User {
  role_name: string;
  branch_name: string;
}

// ───────────────────────── Patient Images ─────────────────────────

export type PatientImageType =
  | "cbct"
  | "scan_3d"
  | "dicom"
  | "photo_before"
  | "photo_after"
  | "xray"
  | "intraoral"
  | "other";

export const PATIENT_IMAGE_TYPE_LABELS: Record<PatientImageType, string> = {
  cbct: "CBCT",
  scan_3d: "Scan 3D",
  dicom: "DICOM",
  photo_before: "Hình trước",
  photo_after: "Hình sau",
  xray: "X-quang",
  intraoral: "Intraoral",
  other: "Khác",
};

export interface PatientImage {
  id: string;
  tenant_id: string;
  patient_id: string;
  visit_id?: string;
  uploaded_by: string;
  image_type: PatientImageType;
  description?: string;
  file_id: string;
  thumb_key?: string;
  original_name?: string;
  original_size?: number;
  uploader_name?: string;
  created_at: string;
}