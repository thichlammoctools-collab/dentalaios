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
  phone: string;
  email: string;
  manager_name: string;
  opening_date: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  system_key?: string;
  name: string;
  description?: string;
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
  avatar_file_id?: string;
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
  avatar_file_id?: string;
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
  cccd?: string;
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

/** Immutable note entry on a patient's record, including its author. */
export interface PatientNote {
  id: string;
  tenant_id: string;
  patient_id: string;
  user_id: string;
  user_name: string;
  content: string;
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
  // Operational chair snapshot, retained to attribute confirmed payments.
  chair_id?: string;
  chair_name?: string;
  chair_room_name?: string;
  source_appointment_id?: string;
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

/** Tenant-configured treatment service. `price` always includes VAT. */
export interface TreatmentService {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  procedure: string;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

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
  service_code?: string;
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
  code: string;       // immutable human-readable code, e.g. "TT-20260713-0001"
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

// ───────────────────────── Tenant management dashboard ─────────────────────────

export type ManagementDashboardRange = 7 | 30 | 90;

export interface ManagementDashboardFilter {
  range: ManagementDashboardRange;
  branch_id?: string;
}

export interface ManagementDashboardBranch {
  id: string;
  name: string;
}

export interface ManagementDashboardToday {
  scheduled: number;
  arrived: number;
  completed: number;
  in_progress_visits: number;
  confirmed_revenue: number;
  cancellations: number;
  no_shows: number;
}

export interface ManagementDashboardRangeKpis {
  confirmed_revenue: number;
  previous_revenue: number;
  visits: number;
  previous_visits: number;
  appointments: number;
  completion_rate: number | null;
  new_patients: number;
  pending_plans: number;
  cancellations: number;
  no_shows: number;
}

export interface ManagementDashboardDailyPoint {
  date: string;
  visits: number;
  revenue: number;
}

export interface ManagementDashboardBranchPerformance {
  branch_id: string;
  branch_name: string;
  confirmed_revenue: number;
  previous_revenue: number;
  visits: number;
  previous_visits: number;
  appointments: number;
  completion_rate: number | null;
  new_patients: number;
  pending_plans: number;
  cancellations: number;
  no_shows: number;
}

export type ManagementDashboardExceptionKind = "overdue_appointment" | "appointment_outcome" | "pending_plan";

export interface ManagementDashboardException {
  kind: ManagementDashboardExceptionKind;
  branch_id: string;
  branch_name: string;
  count: number;
}

export interface ManagementDashboardSnapshot {
  generated_at: string;
  timezone: "Asia/Ho_Chi_Minh";
  today_start: string;
  today_end: string;
  range: ManagementDashboardRange;
  range_start: string;
  range_end: string;
  branch_id?: string;
  branches: ManagementDashboardBranch[];
  today: ManagementDashboardToday;
  kpis: ManagementDashboardRangeKpis;
  daily: ManagementDashboardDailyPoint[];
  branch_performance: ManagementDashboardBranchPerformance[];
  exceptions: ManagementDashboardException[];
}

/** A data-free signal that tells an authenticated dashboard client to refetch. */
export interface DashboardInvalidation {
  type: "dashboard:invalidate";
  entity_type: string;
  occurred_at: string;
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

/**
 * Per-tenant Lark configuration. Returned to clients WITHOUT the secret —
 * only `app_id`, `enabled`, and `calendar_id` are visible to the UI.
 * The secret is encrypted at rest in D1 (AES-256-GCM) and never leaves the Worker.
 */
export interface LarkConfigPublic {
  tenant_id: string;
  app_id: string;
  /** True if a secret is configured (regardless of value). */
  has_secret: boolean;
  calendar_id?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LarkConfigUpdate {
  app_id: string;
  app_secret: string;
  calendar_id?: string;
  enabled?: boolean;
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

// ───────────────────────── Appointments ─────────────────────────

export type AppointmentStatus =
  | "booked"      // Created, waiting for patient confirmation
  | "confirmed"   // Patient confirmed
  | "arrived"     // Patient arrived at clinic
  | "completed"   // Visit happened, appointment fulfilled
  | "cancelled"   // Cancelled by clinic or patient
  | "no_show";    // Patient did not show up

export type AppointmentSource = "manual" | "ai_chat" | "ai_next_visit" | "reschedule";

export type DentalChairType = "general" | "surgery" | "orthodontic" | "pediatric" | "hygiene";
export type ChairOperationalStatus = "available" | "cleaning" | "maintenance" | "out_of_service";

export interface DentalRoom {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DentalChair {
  id: string;
  tenant_id: string;
  branch_id: string;
  code: string;
  name: string;
  room_id?: string;
  room_name?: string;
  chair_type: DentalChairType;
  operational_status: ChairOperationalStatus;
  default_doctor_id?: string;
  default_assistant_id?: string;
  turnover_min: number;
  sort_order: number;
  color?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ChairRevenueMetrics {
  confirmed_revenue: number;
  payment_count: number;
  completed_minutes: number;
  revenue_per_completed_hour: number | null;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  branch_id: string;
  clinician_id: string;
  patient_id: string;
  assistant_id?: string;
  chair_id?: string;
  source_visit_id?: string;
  scheduled_at: string;  // ISO datetime
  duration_min: number;
  status: AppointmentStatus;
  procedure?: string;
  notes?: string;
  source: AppointmentSource;
  lark_event_id?: string;
  reminder_sent_at?: string;
  reminder_method?: string;
  cancelled_reason?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ───────────────────────── Schedules ─────────────────────────

export interface ClinicSchedule {
  id: string;
  tenant_id: string;
  branch_id: string;
  weekday: number;  // 1=Mon..7=Sun
  open_time: string;  // "HH:MM"
  close_time: string; // "HH:MM"
  is_closed: boolean;
  created_at: string;
}

export interface DoctorSchedule {
  id: string;
  tenant_id: string;
  branch_id: string;
  doctor_id: string;
  weekday: number;  // 1=Mon..7=Sun
  start_time: string;
  end_time: string;
  slot_minutes: number;
  created_at: string;
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
  role_key?: string;
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

export interface ImageAnalysisFinding {
  tooth_number: number | null;
  scope: "tooth" | "full_mouth" | "soft_tissue";
  area?: string;
  condition: string;
  description: string;
  recommendation: string;
}

export interface AnalyzeImageResult {
  analysis: string;
  findings: ImageAnalysisFinding[];
  ai_model: string;
  generated_at: string;
}
