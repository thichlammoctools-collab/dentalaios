/**
 * Lark service — Task + Calendar creation.
 *
 * Architecture rule #7: ONLY operational fields (patient name, procedure count,
 * scheduled time, branch info). NO diagnosis details, NO clinical notes.
 *
 * Per-tenant: credentials are read from the lark_configs D1 table using
 * the tenant's own app_id + app_secret. If the tenant has not configured
 * Lark, the call is silently mocked so the rest of the workflow still works.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { Patient, TreatmentPlan } from "@shared/types";
import { createLarkTask, createLarkCalendarEvent } from "../lib/lark-client";
import { createLarkConfigRepository } from "../repositories/lark-config.repo";
import { newId } from "../lib/ids";

export interface LarkHandoverInput {
  patient: Pick<Patient, "name" | "phone">;
  plan: Pick<TreatmentPlan, "id" | "status">;
  itemCount: number;
  approverName: string;
  scheduledAt?: string; // ISO
}

export interface LarkBranchNotifyInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  manager_name?: string;
  opening_date?: string; // YYYY-MM-DD
  createdBy: string;
}

export interface LarkHandoverResult {
  mocked: boolean;
  taskId: string;
  taskUrl?: string;
  calendarEventId?: string;
  warning?: string;
}

export const larkService = {
  /**
   * Create a Lark task (+ optional calendar event) for a treatment plan handover.
   *
   * @param db        — D1 database (to look up per-tenant Lark credentials)
   * @param tenantId  — tenant requesting the handover
   * @param input     — operational fields only (rule #7)
   * @param encryptionKey — ENCRYPTION_KEY Worker secret to decrypt stored secret
   */
  async createHandover(
    db: D1Database,
    tenantId: string,
    input: LarkHandoverInput,
    encryptionKey?: string,
  ): Promise<LarkHandoverResult> {
    // Operational summary only — never clinical details (rule #7).
    // No diagnosis, no procedure specifics, no financial data.
    const summary = `Bàn giao điều trị: ${input.patient.name} (${input.itemCount} hạng mục)`;
    const description = [
      `Bệnh nhân: ${input.patient.name}`,
      input.patient.phone ? `SĐT: ${input.patient.phone}` : null,
      `Kế hoạch: ${input.itemCount} hạng mục`,
      `Duyệt bởi: ${input.approverName}`,
      `Mã kế hoạch: ${input.plan.id}`,
    ]
      .filter(Boolean)
      .join("\n");

    const due = input.scheduledAt;

    return executeLarkCall(db, tenantId, encryptionKey, {
      summary,
      description,
      due,
      openingDate: input.scheduledAt,
    });
  },

  /**
   * Create a Lark task + calendar event for a newly-created branch.
   *
   * Task is always created. Calendar event is only created when `opening_date`
   * is provided.
   */
  async createBranchNotify(
    db: D1Database,
    tenantId: string,
    input: LarkBranchNotifyInput,
    encryptionKey?: string,
  ): Promise<LarkHandoverResult> {
    const summary = `Chi nhánh mới: ${input.name}`;
    const description = [
      `Chi nhánh: ${input.name}`,
      input.address ? `Địa chỉ: ${input.address}` : null,
      input.phone ? `SĐT: ${input.phone}` : null,
      input.email ? `Email: ${input.email}` : null,
      input.manager_name ? `Quản lý: ${input.manager_name}` : null,
      input.opening_date ? `Ngày khai trương: ${input.opening_date}` : null,
      `Tạo bởi: ${input.createdBy}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Lark Calendar uses ISO timestamp. For all-day opening dates, set 09:00 local.
    const openingDate = input.opening_date
      ? `${input.opening_date}T09:00:00+07:00`
      : undefined;

    return executeLarkCall(db, tenantId, encryptionKey, {
      summary,
      description,
      due: openingDate,
      openingDate,
    });
  },
};

/**
 * Internal helper: read per-tenant Lark credentials and call Lark API.
 * Returns mocked result if credentials are missing.
 */
async function executeLarkCall(
  db: D1Database,
  tenantId: string,
  encryptionKey: string | undefined,
  params: {
    summary: string;
    description: string;
    due?: string;
    openingDate?: string;
  },
): Promise<LarkHandoverResult> {
  // Read per-tenant Lark credentials from D1
  let appId: string | undefined;
  let appSecret: string | undefined;
  let calendarId: string | undefined;

  if (encryptionKey) {
    try {
      const repo = createLarkConfigRepository(db);
      const config = await repo.getByTenant(tenantId, encryptionKey);
      if (config && config.enabled) {
        appId = config.app_id;
        appSecret = config.app_secret;
        calendarId = config.calendar_id ?? undefined;
      }
    } catch (err) {
      console.error("[lark] failed to read per-tenant config:", err);
    }
  }

  if (!appId || !appSecret) {
    // Mock fallback — tenant hasn't configured Lark or credentials are missing
    console.warn(
      `[lark] No Lark config for tenant ${tenantId} — returning mocked result`,
    );
    return {
      mocked: true,
      taskId: `mock-task-${newId()}`,
      warning: "Lark credentials not configured — task was mocked",
    };
  }

  const taskResult = await createLarkTask(appId, appSecret, {
    summary: params.summary,
    description: params.description,
    due: params.due,
  });

  let calendarEventId: string | undefined;
  if (params.openingDate) {
    const start = new Date(params.openingDate);
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min default
    const cal = await createLarkCalendarEvent(appId, appSecret, {
      summary: params.summary,
      description: params.description,
      start: start.toISOString(),
      end: end.toISOString(),
      calendarId,
    });
    calendarEventId = cal.eventId;
  }

  return {
    mocked: false,
    taskId: taskResult.taskId,
    taskUrl: taskResult.url,
    calendarEventId,
  };
}