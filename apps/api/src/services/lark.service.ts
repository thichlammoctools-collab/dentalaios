/**
 * Lark service — Task + Calendar creation for treatment plan handover.
 *
 * Architecture rule #7: ONLY operational fields (patient name, procedure count,
 * scheduled time). NO diagnosis details, NO clinical notes.
 *
 * If LARK_APP_ID or LARK_APP_SECRET missing → returns mock result so dev
 * can test the full workflow without Lark account.
 */

import type { Patient, TreatmentPlan } from "@shared/types";
import { createLarkTask, createLarkCalendarEvent } from "../lib/lark-client";
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
  async createHandover(
    env: { LARK_APP_ID?: string; LARK_APP_SECRET?: string },
    input: LarkHandoverInput,
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

    const appId = env.LARK_APP_ID;
    const appSecret = env.LARK_APP_SECRET;

    if (!appId || !appSecret) {
      // Mock fallback
      console.warn(
        "[lark] LARK_APP_ID / LARK_APP_SECRET not set — returning mocked result",
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