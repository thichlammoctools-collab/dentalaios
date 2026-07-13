/**
 * Payment code allocator.
 *
 * Generates an immutable, human-readable code per payment: `{PREFIX}-{YYYYMMDD}-{0001}`.
 * Sequence is per-tenant per-day. Prefix is configurable per tenant via
 * tenant_settings(key="payment_code_prefix").
 *
 * Atomicity:
 *   The counter row uses INSERT … ON CONFLICT DO UPDATE SET last_seq = last_seq + 1
 *   RETURNING last_seq. This is a SINGLE SQL statement, which D1 guarantees is
 *   atomic per-statement — no race condition under concurrent inserts.
 *
 *   After incrementing, we verify uniqueness against the payments table. This
 *   handles the rare case where an admin changed the prefix mid-day and a stale
 *   prefix produced a duplicate. On clash we retry up to MAX_ATTEMPTS times.
 *
 *   Note: D1 transactions via db.batch() exist but are not needed here — the
 *   single-statement upsert is sufficient and cheaper.
 *
 * Future: when we add a tenant timezone setting, swap todayDateKey() to use
 * Intl.DateTimeFormat with the tenant's tz. MVP uses UTC.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { createTenantSettingsRepository } from "../repositories/tenant-settings.repo";

const MAX_ATTEMPTS = 5;
const DEFAULT_PREFIX = "TT";
const PREFIX_RE = /^[A-Z0-9]+$/;

function todayDateKey(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatCode(prefix: string, dateKey: string, seq: number): string {
  return `${prefix}-${dateKey}-${String(seq).padStart(4, "0")}`;
}

export const paymentCodeService = {
  /**
   * Atomically allocate the next payment code for a tenant today.
   * Returns { code, seq } on success. Throws if MAX_ATTEMPTS exhausted.
   */
  async allocate(
    db: D1Database,
    tenantId: string,
  ): Promise<{ code: string; seq: number }> {
    const settings = createTenantSettingsRepository(db);
    const rawPrefix = await settings.get(tenantId, "payment_code_prefix");
    const prefix =
      rawPrefix && PREFIX_RE.test(rawPrefix) ? rawPrefix : DEFAULT_PREFIX;
    const dateKey = todayDateKey();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // 1) Atomic single-statement counter upsert.
      const result = (await db
        .prepare(
          `INSERT INTO payment_code_counters (tenant_id, date_key, last_seq)
           VALUES (?, ?, 1)
           ON CONFLICT(tenant_id, date_key)
           DO UPDATE SET last_seq = last_seq + 1
           RETURNING last_seq`,
        )
        .bind(tenantId, dateKey)
        .first()) as { last_seq: number } | null;

      if (!result) throw new Error("Counter upsert returned no row");
      const seq = result.last_seq;
      const code = formatCode(prefix, dateKey, seq);

      // 2) Verify uniqueness (rare race: prefix changed mid-day produced a collision).
      const clash = await db
        .prepare("SELECT 1 AS x FROM payments WHERE code = ? LIMIT 1")
        .bind(code)
        .first();
      if (!clash) return { code, seq };
      // Loop and try next seq — typically only 1 retry needed in practice.
    }
    throw new Error("Failed to allocate unique payment code after retries");
  },
};