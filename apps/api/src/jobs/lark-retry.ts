/**
 * Lark retry queue consumer.
 *
 * Reads messages from `dentalaios-jobs` queue.
 * Each message references a `lark_sync_logs` row that previously failed.
 * Worker retries the Lark call and updates the log status.
 *
 * Max 3 retries (configured in wrangler.jsonc).
 * After 3 failures → DLQ (Cloudflare Queues auto-routes).
 */

import type { MessageBatch } from "@cloudflare/workers-types";
import type { Env } from "../index";
import { larkService } from "../services/lark.service";

export interface LarkRetryMessage {
  type: "lark_retry";
  lark_sync_log_id: string;
  tenant_id: string;
  entity_id: string;
  attempt: number;
}

export async function larkRetryConsumer(
  batch: MessageBatch<LarkRetryMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      await processOne(msg.body, env);
      msg.ack();
    } catch (err) {
      console.error(
        `[lark-retry] failed attempt=${msg.body.attempt} entity=${msg.body.entity_id}:`,
        err instanceof Error ? err.message : String(err),
      );
      msg.retry();
    }
  }
}

async function processOne(msg: LarkRetryMessage, env: Env): Promise<void> {
  // Look up original log entry to reconstruct the payload
  const logRow = await env.DB.prepare(
    "SELECT * FROM lark_sync_logs WHERE id = ? AND tenant_id = ? LIMIT 1",
  )
    .bind(msg.lark_sync_log_id, msg.tenant_id)
    .first<{
      id: string;
      tenant_id: string;
      entity_id: string;
      status: string;
    } | null>();

  if (!logRow) {
    console.warn(`[lark-retry] log not found: ${msg.lark_sync_log_id}`);
    return;
  }
  if (logRow.status === "synced") {
    return; // Already done
  }

  // Look up treatment plan + patient to rebuild summary
  const planRow = await env.DB.prepare(
    `SELECT tp.id AS id, tp.status AS status,
            p.name AS patient_name, p.phone AS patient_phone
     FROM treatment_plans tp
     JOIN patients p ON p.id = tp.patient_id
     WHERE tp.id = ? AND tp.tenant_id = ?
     LIMIT 1`,
  )
    .bind(msg.entity_id, msg.tenant_id)
    .first<{
      id: string;
      status: string;
      patient_name: string;
      patient_phone: string;
    } | null>();

  if (!planRow) {
    console.warn(`[lark-retry] plan not found: ${msg.entity_id}`);
    return;
  }

  // Count items
  const itemsRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM treatment_plan_items WHERE tenant_id = ? AND treatment_plan_id = ?",
  )
    .bind(msg.tenant_id, msg.entity_id)
    .first<{ n: number } | null>();
  const itemCount = Number(itemsRow?.n ?? 0);

  // Retry
  const result = await larkService.createHandover(env, {
    patient: { name: planRow.patient_name, phone: planRow.patient_phone },
    plan: {
      id: planRow.id,
      status: "approved",
    },
    itemCount,
    approverName: "System Retry",
  });

  // Update log (scoped by tenant_id to prevent cross-tenant writes)
  await env.DB.prepare(
    `UPDATE lark_sync_logs
     SET lark_event_id = ?, status = ?, error = ?
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(result.taskId, result.mocked ? "failed" : "synced", result.warning ?? null, msg.lark_sync_log_id, msg.tenant_id)
    .run();
}