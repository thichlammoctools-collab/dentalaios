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
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** API base path — mounted under this in the Worker. */
export const API_PREFIX = "/api";

/** Visit workflow statuses (mirrors VisitStatus in types). */
export const VISIT_STATUSES = ["in_progress", "completed", "cancelled"] as const;

/** Treatment plan statuses (mirrors TreatmentPlanStatus in types). */
export const PLAN_STATUSES = ["draft", "approved", "completed", "cancelled"] as const;

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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

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