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
  logo_file_id?: string;
  tax_code: string;
  tax_address: string;
  hotline: string;
  bank_account_number: string;
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

export type ReferrerType = "patient" | "doctor" | "assistant" | "partner";
export type ReferrerStatus = "active" | "inactive";
export type ReferralProgramStatus = "draft" | "active" | "inactive";
export type ReferralRewardKind = "cash" | "voucher";
export type ReferralCalculationType = "fixed" | "percentage";
export type ReferralCaseStatus = "pending_conversion" | "eligible" | "pending_approval" | "approved" | "rejected" | "expired" | "recovery_required" | "recovered" | "cancelled";
export type ReferralRewardStatus = "pending_approval" | "cash_payable" | "cash_paid" | "voucher_issued" | "rejected" | "expired" | "recovery_required" | "recovered";

export interface Referrer {
  id: string;
  tenant_id: string;
  type: ReferrerType;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  linked_patient_id?: string;
  linked_user_id?: string;
  status: ReferrerStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralProgram {
  id: string;
  tenant_id: string;
  name: string;
  status: ReferralProgramStatus;
  starts_at: string;
  ends_at?: string;
  priority: number;
  conversion_window_days: number;
  review_window_days: number;
  current_version: number;
  branch_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralRewardRule {
  id: string;
  tenant_id: string;
  program_id: string;
  program_version: number;
  referrer_type: ReferrerType;
  min_net_revenue: number;
  reward_kind: ReferralRewardKind;
  calculation_type: ReferralCalculationType;
  value: number;
  voucher_valid_days?: number;
  created_at: string;
}

export interface ReferralCase {
  id: string;
  tenant_id: string;
  patient_id: string;
  referrer_id: string;
  referrer_name?: string;
  referrer_code?: string;
  referrer_type?: ReferrerType;
  branch_id: string;
  program_id: string;
  program_name?: string;
  program_version: number;
  source: "code" | "manual";
  status: ReferralCaseStatus;
  registered_at: string;
  conversion_ends_at: string;
  eligible_at?: string;
  review_due_at?: string;
  risk_flags: string[];
  created_by: string;
  updated_at: string;
}

export interface ReferralReward {
  id: string;
  tenant_id: string;
  referral_case_id: string;
  rule_id: string;
  reward_kind: ReferralRewardKind;
  calculation_type: ReferralCalculationType;
  configured_value: number;
  basis_net_revenue: number;
  calculated_amount: number;
  currency: string;
  status: ReferralRewardStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  paid_by?: string;
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
  recovery_by?: string;
  recovered_at?: string;
  recovery_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralVoucher {
  id: string;
  tenant_id: string;
  reward_id: string;
  code: string;
  face_value: number;
  issued_at: string;
  expires_at: string;
  status: "issued" | "expired" | "cancelled";
}

export interface Patient {
  id: string;
  tenant_id: string;
  branch_id: string;
  name: string;
  date_of_birth: string; // ISO date "YYYY-MM-DD"
  gender: Gender;
  phone: string;
  email?: string;
  /** Legacy human-readable address retained for existing records and search. */
  address?: string;
  /** Detail such as house number, street, hamlet, or building. */
  address_line?: string;
  ward_name?: string;
  ward_code?: string;
  district_name?: string;
  district_code?: string;
  province_name?: string;
  country_name?: string;
  country_code?: string;
  notes?: string;
  avatar_file_id?: string;
  created_at: string;
  archived_at?: string;
  archived_by?: string;
  archive_reason?: string;
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
  user_avatar_file_id?: string;
  content: string;
  created_at: string;
}

// ───────────────────────── Clinical ─────────────────────────

export type VisitStatus = "in_progress" | "completed" | "cancelled";

export interface Visit {
  id: string;
  code?: string;
  tenant_id: string;
  patient_id: string;
  branch_id: string;
  branch_name?: string;
  clinician_id: string; // FK to User — bác sĩ khám
  date: string; // ISO datetime
  status: VisitStatus;
  completed_at?: string;
  completed_by?: string;
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
  treating_clinician_avatar_file_id?: string;
  assistant_id?: string; // FK to User — phụ tá
  assistant_name?: string;
  assistant_avatar_file_id?: string;
}

/** Tooth numbering system — only FDI supported in V1 per user decision. */
export type ToothSystem = "FDI";

/**
 * Clinical discipline of a finding. This is distinct from its physical scope.
 */
export type FindingCategory =
  | "tooth_hard_tissue"
  | "periodontal"
  | "oral_soft_tissue"
  | "occlusion_orthodontics"
  | "tmj_function"
  | "preventive_general";

/** Physical scope of a clinical finding. */
export type FindingScope = "tooth" | "region" | "full_mouth";

/** Valid anatomical sites used by non-tooth clinical findings. */
export type AnatomicalSite =
  | "gum"           // nướu
  | "tongue"        // lưỡi
  | "buccal"        // niêm mạc má
  | "palate"        // vòm miệng
  | "floor_mouth"   // đáy miệng
  | "lip"           // môi
  | "pharynx"       // họng
  | "jaw"           // xương hàm
  | "tmj"           // khớp thái dương hàm
  | "salivary_gland" // tuyến nước bọt (legacy)
  | "parotid_gland"
  | "submandibular_gland"
  | "sublingual_gland"
  | "minor_salivary_gland";

/** Legacy name retained for API consumers during the clinical finding migration. */
export type SoftTissueArea = AnatomicalSite;

export interface FindingLocationDetails {
  quadrant?: "upper_right" | "upper_left" | "lower_right" | "lower_left";
  laterality?: "right" | "left" | "bilateral" | "midline";
  vertical_position?: "upper" | "lower";
  surface_orientation?: "internal" | "external";
  tooth_surfaces?: Array<"occlusal" | "mesial" | "distal" | "buccal" | "lingual">;
  periodontal_surfaces?: Array<"mesial" | "distal" | "buccal" | "lingual">;
}

export interface PeriodontalPocketDepths {
  mesiobuccal?: number;
  midbuccal?: number;
  distobuccal?: number;
  mesiolingual?: number;
  midlingual?: number;
  distolingual?: number;
}

export type FindingMeasurements = Record<string, string | number | boolean | PeriodontalPocketDepths>;

export interface ClinicalFinding {
  id: string;
  /** Immutable human-readable finding code, e.g. FND-20260722-0001. */
  code?: string;
  tenant_id: string;
  visit_id: string;
  category: FindingCategory;
  /** Optional standardized concept. Legacy rows retain only `condition`. */
  concept_id?: string;
  tooth_number?: number; // present when scope = "tooth"
  tooth_system?: ToothSystem; // always present when tooth_number is present
  scope: FindingScope;
  anatomical_site?: AnatomicalSite;
  location_details?: FindingLocationDetails;
  measurements?: FindingMeasurements;
  condition: string; // e.g. "caries", "fracture", "gingivitis", "ulcer"
  notes?: string;
  created_at: string;
}

export type ClinicalConceptKind = "diagnosis" | "observation" | "symptom" | "risk" | "preventive";
export type TerminologySystem = "LOCAL" | "ICD10_VN";
export type TerminologyVersionStatus = "draft" | "approved" | "retired";
export type ClinicalDiagnosisStatus = "suspected" | "confirmed" | "ruled_out" | "resolved";
export type ClinicalDiagnosisSource = "manual" | "finding_confirmed" | "voice_suggestion" | "image_suggestion" | "backfill";

export interface TerminologyVersion {
  id: string;
  system: TerminologySystem;
  version_key: string;
  title: string;
  publisher?: string;
  published_at?: string;
  source_url?: string;
  source_file_name?: string;
  source_sha256?: string;
  status: TerminologyVersionStatus;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicalConcept {
  id: string;
  code: string;
  legacy_condition: string;
  kind: ClinicalConceptKind;
  category: FindingCategory;
  default_scope: FindingScope;
  default_anatomical_site?: AnatomicalSite;
  display_vi: string;
  description_vi?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  version_id?: string;
  default_icd10?: Icd10Code;
}

export interface Icd10Code {
  id: string;
  terminology_version_id: string;
  code: string;
  display_vi: string;
  parent_code?: string;
  is_billable: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ClinicalConceptIcd10Mapping {
  id: string;
  concept_version_id: string;
  icd10_code_id: string;
  mapping_role: "primary" | "alternative";
  is_active: boolean;
  created_at: string;
}

export interface ClinicalDiagnosis {
  id: string;
  tenant_id: string;
  visit_id: string;
  patient_id: string;
  source_finding_id?: string;
  concept_id: string;
  concept_version_id: string;
  status: ClinicalDiagnosisStatus;
  icd10_code_id?: string;
  icd10_version_id?: string;
  icd10_code_snapshot?: string;
  icd10_display_vi_snapshot?: string;
  concept_code_snapshot: string;
  concept_display_vi_snapshot: string;
  mapping_id?: string;
  mapping_role?: "primary" | "alternative";
  source: ClinicalDiagnosisSource;
  source_text?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  ruled_out_at?: string;
  resolved_at?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_revision: number;
}

export interface ClinicalDiagnosisRevision {
  id: string;
  tenant_id: string;
  diagnosis_id: string;
  revision_no: number;
  change_reason: string;
  before_json: string;
  after_json: string;
  changed_by: string;
  changed_at: string;
}

export interface ClinicalJourneyVisit {
  id: string;
  date: string;
  status: VisitStatus;
  treating_clinician_name?: string;
  assistant_name?: string;
}

export interface ClinicalJourneyFinding {
  id: string;
  code?: string;
  visit_id: string;
}

export interface ClinicalJourneyPlan {
  id: string;
  code?: string;
  visit_id: string;
  status: TreatmentPlanStatus;
  clinician_names: string[];
  assistant_names: string[];
}

export interface ClinicalJourneyCompletedProcedure {
  id: string;
  completed_at: string;
  treatment_plan_id: string;
  plan_code?: string;
  procedure: string;
  service_name?: string;
  tooth_number?: number;
  notes?: string;
  clinician_name?: string;
  assistant_name?: string;
}

export interface ClinicalJourney {
  visits: ClinicalJourneyVisit[];
  findings: ClinicalJourneyFinding[];
  plans: ClinicalJourneyPlan[];
  completed_procedures: ClinicalJourneyCompletedProcedure[];
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
  estimated_duration_min: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreatmentPlanServiceSummary {
  total_count: number;
  completed_count: number;
  remaining_count: number;
  skipped_count: number;
  completed_revenue: number;
  remaining_revenue: number;
}

export interface TreatmentPlan {
  id: string;
  code?: string;
  tenant_id: string;
  visit_id: string;
  patient_id: string;
  status: TreatmentPlanStatus;
  total_cost: number; // sum of TreatmentPlanItem.unit_cost (recomputed on save)
  estimated_duration_min: number; // sum of item duration snapshots, computed on read
  currency: string; // ISO 4217 e.g. "VND"
  notes?: string;
  approved_at?: string;
  created_at: string;
  can_delete?: boolean;
  service_summary?: TreatmentPlanServiceSummary;
}


export type TreatmentItemStatus = "planned" | "in_progress" | "completed";

export interface TreatmentPlanItem {
  id: string;
  tenant_id: string;
  treatment_plan_id: string;
  tooth_number?: number; // present for per-tooth items; absent for full-mouth procedures
  service_code?: string;
  service_name?: string;
  procedure: string; // e.g. "root_canal", "crown", "implant", "filling"
  description: string;
  unit_cost: number;
  estimated_duration_min: number;
  price_includes_vat: boolean;
  price_snapshot_at?: string;
  treating_clinician_id?: string;
  treating_clinician_name?: string;
  assistant_id?: string;
  assistant_name?: string;
  status: TreatmentItemStatus;
  created_at: string;
}

/**
 * One event in a single tooth's cross-visit history.
 *  - kind "finding"   — a clinical finding recorded during a visit
 *  - kind "treatment" — a treatment plan item targeting the tooth
 * `date` is the owning visit's date (ISO datetime); entries are sorted newest first.
 */
export interface ToothHistoryEntry {
  kind: "finding" | "treatment";
  id: string;
  date: string;
  visit_id: string;
  visit_code?: string;
  clinician_name?: string;
  // finding-only
  condition?: string;
  // treatment-only
  procedure?: string;
  service_name?: string;
  status?: TreatmentItemStatus;
  // shared
  description?: string;
  notes?: string;
}

export type TreatmentCaseType = "general" | "implant" | "orthodontics" | "prosthodontics" | "full_mouth" | "other";
export type TreatmentCaseStatus = "active" | "paused" | "completed" | "cancelled";
export type TreatmentCaseMemberRole = "primary_clinician" | "co_clinician" | "consultant" | "assistant" | "coordinator" | "lab_contact";

export interface TreatmentCase {
  id: string;
  tenant_id: string;
  treatment_plan_id: string;
  patient_id: string;
  case_number: string;
  case_type: TreatmentCaseType;
  status: TreatmentCaseStatus;
  primary_branch_id: string;
  primary_branch_name?: string;
  primary_clinician_id: string;
  primary_clinician_name?: string;
  title: string;
  clinical_summary?: string;
  treatment_goal?: string;
  activated_at: string;
  target_completed_at?: string;
  completed_at?: string;
  paused_at?: string;
  paused_reason?: string;
  cancelled_at?: string;
  cancelled_reason?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TreatmentCaseStatusHistory {
  id: string;
  tenant_id: string;
  treatment_case_id: string;
  from_status?: TreatmentCaseStatus;
  to_status: TreatmentCaseStatus;
  reason?: string;
  changed_by: string;
  changed_at: string;
}

export type TreatmentCaseMilestoneStatus = "not_started" | "in_progress" | "completed" | "skipped";

/** A case milestone is created from exactly one approved treatment-plan item. */
export interface TreatmentCaseMilestone {
  id: string;
  tenant_id: string;
  treatment_case_id: string;
  treatment_plan_item_id: string;
  sort_order: number;
  status: TreatmentCaseMilestoneStatus;
  planned_at: string;
  started_at?: string;
  completed_at?: string;
  skipped_at?: string;
  skipped_reason?: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  item: TreatmentPlanItem;
}

/** A schedulable milestone exposed from a patient's active treatment cases. */
export interface PatientOpenTreatmentMilestone {
  treatment_case_id: string;
  treatment_plan_id: string;
  case_number: string;
  case_title: string;
  milestone_id: string;
  sort_order: number;
  status: Extract<TreatmentCaseMilestoneStatus, "not_started" | "in_progress">;
  item: TreatmentPlanItem;
}

export type TreatmentMilestoneAppointmentLinkType = "primary" | "follow_up" | "consultation" | "preparation" | "delivery";
export type TreatmentMilestoneAppointmentExecutionStatus = "planned" | "partially_completed" | "completed" | "not_performed";

export interface TreatmentMilestoneAppointment {
  id: string;
  tenant_id: string;
  treatment_case_milestone_id: string;
  appointment_id: string;
  link_type: TreatmentMilestoneAppointmentLinkType;
  execution_status: TreatmentMilestoneAppointmentExecutionStatus;
  notes?: string;
  linked_by: string;
  created_at: string;
  updated_at: string;
  appointment: Appointment;
}

export interface TreatmentCaseFinancialSummary {
  plan_total: number;
  confirmed_paid: number;
  pending_amount: number;
  failed_amount: number;
  outstanding_amount: number;
  payments: Payment[];
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
  /** Set only for a correcting entry; the original payment is never overwritten. */
  original_payment_id?: string;
  adjustment_reason?: string;
  confirmed_at?: string;
  created_at: string;
}

export interface PaymentItemAllocationInput {
  treatment_plan_item_id: string;
  amount: number;
  discount_amount?: number;
  discount_reason?: string;
}

export interface PaymentableTreatmentPlanItem extends TreatmentPlanItem {
  paid_amount: number;
  pending_amount: number;
  outstanding_amount: number;
}

export type PaymentAttachmentKind = "transfer_receipt" | "receipt" | "invoice" | "other";

export interface PaymentAttachment {
  id: string;
  tenant_id: string;
  payment_id: string;
  file_id: string;
  kind: PaymentAttachmentKind;
  description?: string;
  created_by: string;
  created_at: string;
  file: FileObject;
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

// ───────────────────────── Branch operations dashboard ─────────────────────────

/** The branch dashboard is always scoped from the authenticated user's branch. */
export interface BranchDashboardToday {
  scheduled: number;
  unconfirmed: number;
  arrived: number;
  completed: number;
  in_progress_visits: number;
  confirmed_revenue: number;
  cancellations: number;
  no_shows: number;
}

export interface BranchDashboardKpis {
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

export type BranchDashboardActionKind =
  | "overdue_appointment"
  | "unconfirmed_appointment"
  | "appointment_outcome"
  | "pending_plan";

/** Minimal operational fields for an authorized branch user to open work. */
export interface BranchDashboardActionItem {
  id: string;
  entity_type: "appointment" | "treatment_plan";
  patient_name: string;
  status: string;
  scheduled_at?: string;
  created_at?: string;
  due_at?: string;
  total_cost?: number;
  currency?: string;
}

export interface BranchDashboardActionGroup {
  kind: BranchDashboardActionKind;
  count: number;
  items: BranchDashboardActionItem[];
  remaining_count: number;
}

export interface BranchDashboardSnapshot {
  generated_at: string;
  timezone: "Asia/Ho_Chi_Minh";
  branch: ManagementDashboardBranch;
  today_start: string;
  today_end: string;
  range_start: string;
  range_end: string;
  today: BranchDashboardToday;
  kpis: BranchDashboardKpis;
  daily: ManagementDashboardDailyPoint[];
  actions: BranchDashboardActionGroup[];
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
  category: FindingCategory;
  scope: FindingScope;
  tooth_number: number | null;
  anatomical_site?: AnatomicalSite;
  location_details?: FindingLocationDetails;
  measurements?: FindingMeasurements;
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
  service_code?: string;
  service_name?: string;
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
  | "in_progress" // Appointment is being carried out
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

export type PatientImagePurpose = "clinical_record" | "treatment_before" | "treatment_after";

export const PATIENT_IMAGE_PURPOSE_LABELS: Record<PatientImagePurpose, string> = {
  clinical_record: "Bệnh án / chẩn đoán",
  treatment_before: "Trước điều trị",
  treatment_after: "Sau điều trị",
};

export interface PatientImage {
  id: string;
  tenant_id: string;
  patient_id: string;
  visit_id?: string;
  uploaded_by: string;
  image_type: PatientImageType;
  image_purpose: PatientImagePurpose;
  description?: string;
  file_id: string;
  thumb_key?: string;
  original_name?: string;
  original_size?: number;
  uploader_name?: string;
  created_at: string;
}

export type ImageAnnotationShapeType = "pin" | "rectangle" | "freehand";
export type ImageEvidenceRelation = "supports" | "contradicts" | "incidental";

export type ImageAnnotationGeometry =
  | { x: number; y: number }
  | { x: number; y: number; width: number; height: number }
  | { points: Array<{ x: number; y: number }> };

export interface ImageAnnotationVersion {
  id: string;
  tenant_id: string;
  annotation_id: string;
  version_no: number;
  shape_type: ImageAnnotationShapeType;
  geometry: ImageAnnotationGeometry;
  note: string;
  tooth_number?: number;
  anatomical_site?: AnatomicalSite;
  created_by: string;
  created_at: string;
}

export interface ImageAnnotation {
  id: string;
  tenant_id: string;
  patient_image_id: string;
  current_version_no: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  current_version: ImageAnnotationVersion;
}

export interface ClinicalDiagnosisImageEvidence {
  id: string;
  tenant_id: string;
  diagnosis_id: string;
  patient_image_id: string;
  annotation_version_id?: string;
  relation: ImageEvidenceRelation;
  note?: string;
  linked_by: string;
  linked_at: string;
  image?: PatientImage;
  annotation_version?: ImageAnnotationVersion;
}

export interface ImageAnalysisFinding {
  tooth_number: number | null;
  category: FindingCategory;
  scope: FindingScope;
  anatomical_site?: AnatomicalSite;
  location_details?: FindingLocationDetails;
  measurements?: FindingMeasurements;
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

// ---------------- Platform administration ----------------

export type PlatformRoleKey = "platform_owner" | "platform_operator" | "platform_auditor";
export type PlatformPermission =
  | "platform_dashboard.read"
  | "platform_tenants.read"
  | "platform_tenants.write"
  | "platform_content.read"
  | "platform_content.write"
  | "platform_config.read"
  | "platform_config.write"
  | "platform_admins.read"
  | "platform_admins.write"
  | "platform_procedures.read"
  | "platform_procedures.write"
  | "platform_clinical_terminology.read"
  | "platform_clinical_terminology.write"
  | "platform_ai_config.read"
  | "platform_ai_config.write"
  | "platform_audit.read";

export interface PlatformRole {
  id: string;
  key: PlatformRoleKey;
  name: string;
  permissions: PlatformPermission[];
  created_at: string;
}

/** Deliberately excludes email, password material, and MFA material. */
export interface PlatformUser {
  id: string;
  role_id: string;
  name: string;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformJwtPayload {
  sub: string;
  sid: string;
  scope: "platform";
  role_key: PlatformRoleKey;
  permissions: PlatformPermission[];
  exp: number;
  iat: number;
}

export interface PlatformSession {
  token: string;
  expires_at: string;
  user: PlatformUser;
  role: PlatformRole;
}

export interface PlatformTenantSummary {
  id: string;
  name: string;
  slug?: string;
  is_active: boolean;
  created_at: string;
  branch_count: number;
  user_count: number;
  integration_health: "healthy" | "degraded" | "down" | "unknown";
}

export interface PlatformTenantDetail extends PlatformTenantSummary {
  limits?: { max_users: number; max_branches: number; storage_quota_bytes: number; updated_at: string };
  flags: Array<{ key: string; description: string; default_enabled: boolean; enabled: boolean; overridden: boolean }>;
  integrations: PlatformIntegrationStatus[];
}

export interface PlatformFeatureFlag {
  key: string;
  description: string;
  default_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlatformAiModelConfig {
  application_key: "clinic_web";
  use_case: string;
  name: string;
  modality: "text" | "vision";
  model_id: string;
  default_model_id: string;
  allowed_models: Array<{ id: string; name: string }>;
  is_enabled: boolean;
  is_overridden: boolean;
  updated_at?: string;
}

/** Global clinical procedure maintained by Platform Admins. */
export interface ProcedureCatalogItem {
  code: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformIntegrationStatus {
  provider: string;
  tenant_id?: string;
  enabled: boolean;
  health_status: "healthy" | "degraded" | "down" | "unknown";
  last_checked_at?: string;
  last_success_at?: string;
  last_error_code?: string;
  updated_at: string;
}

export interface PlatformContent {
  id: string;
  kind: "announcement" | "help_article";
  title: string;
  body_markdown: string;
  status: "draft" | "scheduled" | "published" | "archived";
  audience: "global" | "tenant";
  tenant_id?: string | null;
  publish_at?: string | null;
  expire_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformAuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  tenant_id?: string;
  result: "success" | "failure";
  reason?: string;
  created_at: string;
}


export interface PlatformDashboardSnapshot {
  generated_at: string;
  active_tenants: number;
  suspended_tenants: number;
  new_tenants: number;
  active_users: number;
  branches: number;
  unhealthy_integrations: number;
}
