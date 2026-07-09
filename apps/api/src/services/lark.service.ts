/**
 * Lark service — Task + Calendar creation for treatment plan handover.
 *
 * Architecture rule #7: ONLY operational fields (patient name, procedure count,
 * scheduled time). NO diagnosis details, NO clinical notes.
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
      summary,
      description,
      due: input.scheduledAt,
    });

    let calendarEventId: string | undefined;
    if (input.scheduledAt) {
      const start = new Date(input.scheduledAt);
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min default
      const cal = await createLarkCalendarEvent(appId, appSecret, {
        summary,
        description,
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
  },
};