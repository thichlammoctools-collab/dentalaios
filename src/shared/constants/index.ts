/**
 * Route paths (single source of truth for both client routing and Worker URL design).
 * Use these constants in place of raw path strings.
 */

export const ROUTES = {
  LOGIN: "/login",
  TODAY: "/today",
  CALENDAR: "/calendar",
  PATIENTS: "/patients",
  PATIENT_DETAIL: "/patients/:id",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
  SCHEDULE: "/schedule",
  SCHEDULE_NEW: "/schedule/new",
  SETTINGS_USERS: "/settings/users",
  SETTINGS_MEMBERS: "/settings/members",
  SETTINGS_ROLES: "/settings/roles",
  SETTINGS_AUDIT_LOGS: "/settings/audit-logs",
  SETTINGS_CLINIC: "/settings/clinic",
} as const;

/** Role name constants. The actual IDs are stored in D1 (seeded in 0001_roles.sql). */
export const ROLES = {
  ADMIN: "admin",
  DOCTOR: "doctor",
  ASSISTANT: "assistant",
  RECEPTIONIST: "receptionist",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** Vietnamese labels for built-in role names. Custom roles keep their original name. */
export const ROLE_LABELS: Record<RoleName, string> = {
  [ROLES.ADMIN]: "Quản trị viên",
  [ROLES.DOCTOR]: "Bác sĩ",
  [ROLES.ASSISTANT]: "Phụ tá",
  [ROLES.RECEPTIONIST]: "Lễ tân",
};

export function getRoleLabel(name: string): string {
  return ROLE_LABELS[name as RoleName] ?? name;
}

/** Permission strings used in role.permissions JSON array. */
export const PERMISSIONS = {
  ALL: "all",
  READ_PATIENTS: "read_patients",
  WRITE_PATIENTS: "write_patients",
  WRITE_VISITS: "write_visits",
  WRITE_FINDINGS: "write_findings",
  WRITE_PLANS: "write_plans",
  APPROVE_PLANS: "approve_plans",
  WRITE_PAYMENTS: "write_payments",
  WRITE_APPOINTMENTS: "write_appointments",
  MANAGE_USERS: "manage_users",
  MANAGE_ROLES: "manage_roles",
  MANAGE_PATIENTS: "manage_patients",
  MANAGE_SCHEDULE: "manage_schedule",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** API base path — mounted under this in the Worker. */
export const API_PREFIX = "/api";

/** Visit workflow statuses (mirrors VisitStatus in types). */
export const VISIT_STATUSES = ["in_progress", "completed", "cancelled"] as const;

/** Treatment plan statuses (mirrors TreatmentPlanStatus in types). */
export const PLAN_STATUSES = ["draft", "approved", "completed", "cancelled"] as const;

/** Appointment statuses (mirrors AppointmentStatus in types). */
export const APPOINTMENT_STATUSES = ["booked", "confirmed", "arrived", "completed", "cancelled", "no_show"] as const;

/** Vietnamese labels for appointment statuses. */
export const APPOINTMENT_STATUS_LABELS: Record<(typeof APPOINTMENT_STATUSES)[number], string> = {
  booked: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  arrived: "Đã đến",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};

/** Default clinic operating hours when clinic_schedules row is missing. */
export const DEFAULT_CLINIC_OPEN = "08:00";
export const DEFAULT_CLINIC_CLOSE = "17:00";

/** Default currency for V1 — Vietnam. */
export const DEFAULT_CURRENCY = "VND";

/** Error codes returned in ErrorResponse.code — clients map to UI messages. */
export const ERROR_CODES = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  VALIDATION_ERROR: "validation_error",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  INTERNAL_ERROR: "internal_error",
  INVALID_REFERENCE: "invalid_reference",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Marketing channel options — "Biết phòng khám qua kênh nào?" */
export const MARKETING_SOURCES = [
  "bang_hieu",
  "facebook",
  "youtube",
  "tiktok",
  "zalo",
  "website",
  "google_map",
  "gioi_thieu",
  "khac",
] as const;

export type MarketingSource = (typeof MARKETING_SOURCES)[number];

export const MARKETING_SOURCE_LABELS: Record<MarketingSource, string> = {
  bang_hieu: "Bảng hiệu",
  facebook: "Facebook",
  youtube: "Youtube",
  tiktok: "Tiktok",
  zalo: "Zalo",
  website: "Website",
  google_map: "Google Map",
  gioi_thieu: "Giới thiệu",
  khac: "Khác",
};

/** Valid FDI tooth numbers — permanent (11–48) and primary (51–85). */
export function isValidFdiTooth(n: number): boolean {
  if (!Number.isInteger(n)) return false;
  // Permanent: quadrant 1-4, position 1-8 → 11..18, 21..28, 31..38, 41..48
  const q = Math.floor(n / 10);
  const p = n % 10;
  if (q >= 1 && q <= 4 && p >= 1 && p <= 8) return true;
  // Primary: quadrant 5-8, position 1-5 → 51..55, 61..65, 71..75, 81..85
  if (q >= 5 && q <= 8 && p >= 1 && p <= 5) return true;
  return false;
}
