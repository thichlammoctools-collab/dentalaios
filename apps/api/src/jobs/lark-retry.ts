/**
 * Lark queue consumer.
 *
 * Reads messages from `dentalaios-jobs` queue and dispatches by message type:
 *
 *   - "lark_retry"        → retry a previously-failed treatment-plan handover
 *   - "branch_lark_sync"  → notify Lark about a newly-created branch
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

export interface BranchLarkSyncMessage {
  type: "branch_lark_sync";
  branch_id: string;
  tenant_id: string;
  created_by: string;
}

export type LarkQueueMessage = LarkRetryMessage | BranchLarkSyncMessage;

export async function larkRetryConsumer(
  batch: MessageBatch<LarkQueueMessage>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      if (msg.body.type === "lark_retry") {
        await processLarkRetry(msg.body, env);
      } else if (msg.body.type === "branch_lark_sync") {
        await processBranchSync(msg.body, env);
      }
      msg.ack();
    } catch (err) {
      console.error(
        `[lark-queue] failed type=${msg.body.type}:`,
        err instanceof Error ? err.message : String(err),
      );
      msg.retry();
    }
  }
}

async function processLarkRetry(msg: LarkRetryMessage, env: Env): Promise<void> {
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
  const result = await larkService.createHandover(
    env.DB,
    msg.tenant_id,
    {
      patient: { name: planRow.patient_name, phone: planRow.patient_phone },
      plan: {
        id: planRow.id,
        status: "approved",
      },
      itemCount,
      approverName: "System Retry",
    },
    env.ENCRYPTION_KEY,
  );

  // Update log (scoped by tenant_id to prevent cross-tenant writes)
  await env.DB.prepare(
    `UPDATE lark_sync_logs
     SET lark_event_id = ?, status = ?, error = ?
     WHERE id = ? AND tenant_id = ?`,
  )
    .bind(
      result.taskId,
      result.mocked ? "failed" : "synced",
      result.warning ?? null,
      msg.lark_sync_log_id,
      msg.tenant_id,
    )
    .run();
}

/**
 * Process a branch creation Lark notification.
 * Reads branch from D1, calls larkService.createBranchNotify,
 * and writes a lark_sync_logs row for auditability.
 */
async function processBranchSync(msg: BranchLarkSyncMessage, env: Env): Promise<void> {
  // Read branch row from D1
  const branchRow = await env.DB.prepare(
    "SELECT * FROM branches WHERE id = ? AND tenant_id = ? LIMIT 1",
  )
    .bind(msg.branch_id, msg.tenant_id)
    .first<{
      id: string;
      tenant_id: string;
      name: string;
      address: string;
      phone: string;
      email: string;
      manager_name: string;
      opening_date: string | null;
    } | null>();

  if (!branchRow) {
    console.warn(`[branch-sync] branch not found: ${msg.branch_id}`);
    return;
  }

  const result = await larkService.createBranchNotify(
    env.DB,
    msg.tenant_id,
    {
      name: branchRow.name,
      address: branchRow.address || undefined,
      phone: branchRow.phone || undefined,
      email: branchRow.email || undefined,
      manager_name: branchRow.manager_name || undefined,
      opening_date: branchRow.opening_date || undefined,
      createdBy: msg.created_by,
    },
    env.ENCRYPTION_KEY,
  );

  // Write sync log row
  await env.DB.prepare(
    `INSERT INTO lark_sync_logs
       (id, tenant_id, entity_type, entity_id, lark_event_id, status, error)
     VALUES (?, ?, 'branch', ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      msg.tenant_id,
      branchRow.id,
      result.taskId,
      result.mocked ? "failed" : "synced",
      result.warning ?? null,
    )
    .run();
}