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
  MANAGEMENT_DASHBOARD: "/management-dashboard",
  CHAIRS: "/chairs",
  CHAIRS_SETTINGS: "/chairs/settings",
  CHAIRS_REPORTS: "/chairs/reports",
  SETTINGS_USERS: "/settings/users",
  SETTINGS_ROLES: "/settings/roles",
  SETTINGS_AUDIT_LOGS: "/settings/audit-logs",
  SETTINGS_CLINIC: "/settings/clinic",
  SETTINGS_TREATMENT_SERVICES: "/settings/treatment-services",
  SETTINGS_REFERRAL_PROGRAMS: "/settings/referral-programs",
  REFERRERS: "/referrers",
  REFERRALS: "/referrals",
  REFERRAL_REPORTS: "/reports/referrals",
  REFERRER_LOGIN: "/referrer/login",
  REFERRER_ACTIVATE: "/referrer/activate",
  REFERRER_PORTAL: "/referrer",
} as const;

/** Role name constants. The actual IDs are stored in D1 (seeded in 0001_roles.sql). */
export const ROLES = {
  ADMIN: "admin",
  DOCTOR: "doctor",
  ASSISTANT: "assistant",
  RECEPTIONIST: "receptionist",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * System role catalog. A role's key and permission set are platform-owned;
 * each clinic may only customize its display name.
 */
export const SYSTEM_ROLES = [
  { key: ROLES.ADMIN, name: "Quản trị viên", permissions: ["all"] },
  { key: ROLES.DOCTOR, name: "Bác sĩ", permissions: ["read_patients", "write_findings", "write_plans", "approve_plans", "review_clinical_drafts", "sign_clinical_records", "manage_consents"] },
  { key: ROLES.ASSISTANT, name: "Phụ tá", permissions: ["read_patients", "write_visits", "write_pre_exam_drafts"] },
  { key: ROLES.RECEPTIONIST, name: "Lễ tân", permissions: ["read_patients", "write_patients", "write_payments", "write_appointments"] },
  { key: "manager", name: "Quản lý", permissions: ["all"] },
  { key: "accountant", name: "Kế toán", permissions: ["read_patients", "write_payments"] },
  { key: "hr", name: "Nhân sự", permissions: ["manage_users", "read_patients"] },
  { key: "marketing", name: "Marketing", permissions: ["read_patients"] },
  { key: "security", name: "Bảo vệ", permissions: [] },
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]["key"];

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

function normalizeRoleName(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Built-in clinical roles may have a localized display name in existing data.
 * Keep role-based scheduling independent from that editable name.
 */
export function isDoctorRole(roleKey?: string, roleId?: string, roleName?: string): boolean {
  return roleKey === ROLES.DOCTOR || roleId === "role-doctor" || ["doctor", "bac si"].includes(normalizeRoleName(roleName ?? ""));
}

export function isAssistantRole(roleKey?: string, roleId?: string, roleName?: string): boolean {
  return roleKey === ROLES.ASSISTANT || roleId === "role-assistant" || ["assistant", "phu ta", "tro ly"].includes(normalizeRoleName(roleName ?? ""));
}

/** Permission strings used in role.permissions JSON array. */
export const PERMISSIONS = {
  ALL: "all",
  READ_PATIENTS: "read_patients",
  WRITE_PATIENTS: "write_patients",
  WRITE_VISITS: "write_visits",
  WRITE_FINDINGS: "write_findings",
  VIEW_CLINICAL_REPORTS: "view_clinical_reports",
  WRITE_PLANS: "write_plans",
  APPROVE_PLANS: "approve_plans",
  WRITE_PAYMENTS: "write_payments",
  WRITE_APPOINTMENTS: "write_appointments",
  MANAGE_USERS: "manage_users",
  MANAGE_ROLES: "manage_roles",
  MANAGE_PATIENTS: "manage_patients",
  MANAGE_SCHEDULE: "manage_schedule",
  VIEW_MANAGEMENT_DASHBOARD: "view_management_dashboard",
  READ_CHAIRS: "read_chairs",
  WRITE_CHAIRS: "write_chairs",
  MANAGE_REFERRAL_PROGRAMS: "manage_referral_programs",
  MANAGE_REFERRERS: "manage_referrers",
  READ_REFERRALS: "read_referrals",
  REVIEW_REFERRAL_REWARDS: "review_referral_rewards",
  PAY_REFERRAL_REWARDS: "pay_referral_rewards",
  VIEW_REFERRAL_REPORTS: "view_referral_reports",
  WRITE_PRE_EXAM_DRAFTS: "write_pre_exam_drafts",
  REVIEW_CLINICAL_DRAFTS: "review_clinical_drafts",
  SIGN_CLINICAL_RECORDS: "sign_clinical_records",
  MANAGE_CONSENTS: "manage_consents",
  WRITE_PATHWAYS: "write_pathways",
  REVIEW_PATHWAYS: "review_pathways",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** API base path — mounted under this in the Worker. */
export const API_PREFIX = "/api";

/** Visit workflow statuses (mirrors VisitStatus in types). */
export const VISIT_STATUSES = ["in_progress", "completed", "cancelled"] as const;

/** Treatment plan statuses (mirrors TreatmentPlanStatus in types). */
export const PLAN_STATUSES = ["draft", "approved", "completed", "cancelled"] as const;

/** Appointment statuses (mirrors AppointmentStatus in types). */
export const APPOINTMENT_STATUSES = ["booked", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"] as const;

/** Vietnamese labels for appointment statuses. */
export const APPOINTMENT_STATUS_LABELS: Record<(typeof APPOINTMENT_STATUSES)[number], string> = {
  booked: "Mới book",
  confirmed: "Đã xác nhận",
  arrived: "Đã đến",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  cancelled: "Hủy lịch",
  no_show: "Không đến",
};

/** Default clinic operating hours when clinic_schedules rows are missing. */
export const DEFAULT_CLINIC_OPEN = "08:00";
export const DEFAULT_CLINIC_CLOSE = "20:00";

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
export const PLATFORM_API_PREFIX = "/api/platform";

export const PLATFORM_ROLES = {
  OWNER: "platform_owner",
  OPERATOR: "platform_operator",
  AUDITOR: "platform_auditor",
} as const;

export type PlatformRoleKey = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

export const PLATFORM_PERMISSIONS = {
  DASHBOARD_READ: "platform_dashboard.read",
  TENANTS_READ: "platform_tenants.read",
  TENANTS_WRITE: "platform_tenants.write",
  CONTENT_READ: "platform_content.read",
  CONTENT_WRITE: "platform_content.write",
  CONFIG_READ: "platform_config.read",
  CONFIG_WRITE: "platform_config.write",
  ADMINS_READ: "platform_admins.read",
  ADMINS_WRITE: "platform_admins.write",
  PROCEDURES_READ: "platform_procedures.read",
  PROCEDURES_WRITE: "platform_procedures.write",
  CLINICAL_TERMINOLOGY_READ: "platform_clinical_terminology.read",
  CLINICAL_TERMINOLOGY_WRITE: "platform_clinical_terminology.write",
  AI_CONFIG_READ: "platform_ai_config.read",
  AI_CONFIG_WRITE: "platform_ai_config.write",
  AI_EVALUATE: "platform_ai_evaluate.write",
  AI_APPROVE: "platform_ai_approve.write",
  AUDIT_READ: "platform_audit.read",
} as const;

export const PLATFORM_AI_APPLICATION = "clinic_web" as const;

export const PLATFORM_AI_MODEL_PRICING = {
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input_microusd_per_million: 270_000, output_microusd_per_million: 850_000 },
  "@cf/openai/gpt-oss-20b": { input_microusd_per_million: 200_000, output_microusd_per_million: 300_000 },
  "@cf/openai/gpt-oss-120b": { input_microusd_per_million: 500_000, output_microusd_per_million: 1_000_000 },
  "@cf/google/gemma-4-26b-a4b-it": { input_microusd_per_million: 100_000, output_microusd_per_million: 300_000 },
  "@cf/moonshotai/kimi-k2.6": { input_microusd_per_million: 950_000, output_microusd_per_million: 4_000_000 },
  "@cf/moonshotai/kimi-k2.7-code": { input_microusd_per_million: 950_000, output_microusd_per_million: 4_000_000 },
  "@cf/nvidia/nemotron-3-120b-a12b": { input_microusd_per_million: 500_000, output_microusd_per_million: 1_500_000 },
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b": { input_microusd_per_million: 500_000, output_microusd_per_million: 4_880_000 },
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it": { input_microusd_per_million: 350_000, output_microusd_per_million: 560_000 },
  "@cf/mistralai/mistral-small-3.1-24b-instruct": { input_microusd_per_million: 350_000, output_microusd_per_million: 560_000 },
} as const;

const PLATFORM_AI_TEXT_MODELS = [
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
  { id: "@cf/openai/gpt-oss-20b", name: "GPT-OSS 20B" },
  { id: "@cf/openai/gpt-oss-120b", name: "GPT-OSS 120B" },
  { id: "@cf/google/gemma-4-26b-a4b-it", name: "Gemma 4 26B" },
  { id: "@cf/moonshotai/kimi-k2.6", name: "Kimi K2.6" },
  { id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" },
  { id: "@cf/zai-org/glm-4.7-flash", name: "GLM 4.7 Flash" },
  { id: "@cf/zai-org/glm-5.2", name: "GLM 5.2" },
  { id: "@cf/nvidia/nemotron-3-120b-a12b", name: "Nemotron 3 120B" },
  { id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", name: "DeepSeek R1 Distill Qwen 32B" },
  { id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it", name: "SEA-LION v4 27B" },
  { id: "@cf/ibm/granite-4.0-h-micro", name: "Granite 4.0 H Micro" },
  { id: "@cf/qwen/qwen3-30b-a3b-fp8", name: "Qwen 3 30B" },
  { id: "@cf/qwen/qwq-32b", name: "QwQ 32B" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B Fast" },
  { id: "@cf/meta/llama-3.2-3b-instruct", name: "Llama 3.2 3B" },
  { id: "@cf/meta/llama-3.2-1b-instruct", name: "Llama 3.2 1B" },
  { id: "@cf/meta/llama-3.1-8b-instruct-fast", name: "Llama 3.1 8B Fast" },
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", name: "Llama 3.1 8B FP8" },
  { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", name: "Mistral Small 3.1 24B" },
  { id: "@cf/qwen/qwen2.5-coder-32b-instruct", name: "Qwen 2.5 Coder 32B" },
] as const;

const PLATFORM_AI_VISION_MODELS = [
  { id: "@cf/meta/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
  { id: "@cf/google/gemma-4-26b-a4b-it", name: "Gemma 4 26B" },
  { id: "@cf/moonshotai/kimi-k2.6", name: "Kimi K2.6" },
  { id: "@cf/moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code" },
  { id: "@cf/meta/llama-3.2-11b-vision-instruct", name: "Llama 3.2 Vision 11B" },
  { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", name: "Mistral Small 3.1 24B" },
] as const;

export const PLATFORM_AI_MODEL_CONFIG_CATALOG = [
  {
    use_case: "visit_summary",
    name: "Tóm tắt lượt khám",
    modality: "text",
    default_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    fallback_model_id: "@cf/openai/gpt-oss-20b",
    recommendation: "Cân bằng chất lượng và chi phí",
    guidance: "Tóm tắt bệnh án tiếng Việt, ưu tiên chất lượng diễn đạt và độ ổn định.",
    review_note: "Bác sĩ kiểm tra trước khi dùng làm nội dung hồ sơ hoặc tư vấn.",
    allowed_models: PLATFORM_AI_TEXT_MODELS,
  },
  {
    use_case: "treatment_plan_draft",
    name: "Gợi ý kế hoạch điều trị",
    modality: "text",
    default_model_id: "@cf/openai/gpt-oss-20b",
    fallback_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    recommendation: "Ưu tiên suy luận có cấu trúc",
    guidance: "Soạn nháp kế hoạch từ findings, chẩn đoán và danh mục dịch vụ có sẵn.",
    review_note: "Bác sĩ xác nhận chỉ định, dịch vụ và chi phí trước khi phê duyệt.",
    allowed_models: PLATFORM_AI_TEXT_MODELS,
  },
  {
    use_case: "clinical_image_analysis",
    name: "Phân tích hình ảnh lâm sàng",
    modality: "vision",
    default_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    fallback_model_id: "@cf/meta/llama-3.2-11b-vision-instruct",
    recommendation: "Đa phương thức, ổn định",
    guidance: "Đọc ảnh JPEG, PNG hoặc WebP và trả về phát hiện có cấu trúc theo hệ FDI.",
    review_note: "Chỉ hỗ trợ sàng lọc, không thay thế đọc X-quang, DICOM/CBCT hoặc chẩn đoán.",
    allowed_models: PLATFORM_AI_VISION_MODELS,
  },
  {
    use_case: "voice_findings_parse",
    name: "Trích xuất phát hiện từ ghi âm",
    modality: "text",
    default_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    fallback_model_id: "@cf/openai/gpt-oss-20b",
    recommendation: "Cân bằng chất lượng và chi phí",
    guidance: "Chuẩn hóa bản ghi đã có thành clinical findings có cấu trúc.",
    review_note: "Đối chiếu bản ghi gốc, răng FDI và thuật ngữ trước khi lưu.",
    allowed_models: PLATFORM_AI_TEXT_MODELS,
  },
  {
    use_case: "appointment_chat_parse",
    name: "Phân tích hội thoại đặt lịch",
    modality: "text",
    default_model_id: "@cf/openai/gpt-oss-20b",
    fallback_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    recommendation: "Phản hồi nhanh cho tác vụ hành chính",
    guidance: "Trích xuất bệnh nhân, bác sĩ, thời gian và thủ thuật từ hội thoại đặt lịch.",
    review_note: "Lễ tân xác nhận bệnh nhân, bác sĩ, múi giờ và lịch trống trước khi tạo lịch.",
    allowed_models: PLATFORM_AI_TEXT_MODELS,
  },
  {
    use_case: "next_appointment_suggestion",
    name: "Gợi ý lịch hẹn tiếp theo",
    modality: "text",
    default_model_id: "@cf/openai/gpt-oss-20b",
    fallback_model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    recommendation: "Ưu tiên suy luận có cấu trúc",
    guidance: "Đề xuất thời điểm tái khám dựa trên findings và hạng mục điều trị còn lại.",
    review_note: "Nhân sự lâm sàng hoặc lễ tân xác nhận chỉ định và lịch trống trước khi gửi hẹn.",
    allowed_models: PLATFORM_AI_TEXT_MODELS,
  },
] as const;

export type PlatformAiUseCase = (typeof PLATFORM_AI_MODEL_CONFIG_CATALOG)[number]["use_case"];

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export const PLATFORM_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const PLATFORM_SESSION_IDLE_SECONDS = 30 * 60;
export const PLATFORM_MFA_STEP_UP_SECONDS = 15 * 60;
