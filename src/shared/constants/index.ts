/**
 * Route paths (single source of truth for both client routing and Worker URL design).
 * Use these constants in place of raw path strings.
 */

export const ROUTES = {
  LOGIN: "/login",
  TODAY: "/today",
  PATIENTS: "/patients",
  PATIENT_DETAIL: "/patients/:id",
  VISIT_DETAIL: "/visits/:id",
  TREATMENT_PLAN: "/treatment-plans/:id",
  SETTINGS_USERS: "/settings/users",
  SETTINGS_ROLES: "/settings/roles",
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