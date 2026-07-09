/**
 * Lark config repository — per-tenant Lark app credentials.
 *
 * The app_secret is stored encrypted (AES-256-GCM); the encryption key
 * comes from the ENCRYPTION_KEY Worker secret. The repo handles the
 * decrypt-on-read / encrypt-on-write boundary so callers receive a
 * ready-to-use plain secret (when present) without re-doing crypto.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { D1Row } from "./base";
import { newId } from "../lib/ids";
import { encryptSecret, decryptSecret } from "../lib/crypto";

export interface LarkConfig {
  id: string;
  tenant_id: string;
  app_id: string;
  /** Plain secret. NEVER returned by listing methods — only by internal callers. */
  app_secret: string;
  calendar_id: string | null;
  enabled: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export interface LarkConfigPublicShape {
  id: string;
  tenant_id: string;
  app_id: string;
  app_secret: string | null; // null when not loaded
  app_secret_iv: string | null;
  calendar_id: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface LarkConfigRepository {
  /** Decrypts the secret. Returns null if no config exists for tenant. */
  getByTenant(tenantId: string, encryptionKey: string): Promise<LarkConfig | null>;
  /** Returns public shape (with secret + iv) for inspection — used by test endpoint. */
  getRawByTenant(tenantId: string): Promise<LarkConfigPublicShape | null>;
  /** Insert or update config. Encrypts the secret before storing. */
  upsert(
    tenantId: string,
    data: { app_id: string; app_secret: string; calendar_id?: string | null; enabled?: boolean },
    encryptionKey: string,
  ): Promise<LarkConfig>;
  /** Soft-disable (enabled = 0). Preserves audit history. */
  disable(tenantId: string): Promise<boolean>;
  /** Hard delete — used when admin removes integration completely. */
  deleteByTenant(tenantId: string): Promise<boolean>;
}

function mapRow(row: D1Row): LarkConfigPublicShape {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    app_id: row.app_id as string,
    app_secret: (row.app_secret as string | null) ?? null,
    app_secret_iv: (row.app_secret_iv as string | null) ?? null,
    calendar_id: (row.calendar_id as string | null) ?? null,
    enabled: (row.enabled as number) ?? 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export function createLarkConfigRepository(db: D1Database): LarkConfigRepository {
  return {
    async getByTenant(tenantId, encryptionKey) {
      const row = await db
        .prepare("SELECT * FROM lark_configs WHERE tenant_id = ? LIMIT 1")
        .bind(tenantId)
        .first() as D1Row | null;
      if (!row) return null;

      const mapped = mapRow(row);
      if (!mapped.app_secret || !mapped.app_secret_iv) {
        throw new Error("lark_configs row missing encrypted secret");
      }

      const plain = await decryptSecret(mapped.app_secret, mapped.app_secret_iv, encryptionKey);
      return {
        id: mapped.id,
        tenant_id: mapped.tenant_id,
        app_id: mapped.app_id,
        app_secret: plain,
        calendar_id: mapped.calendar_id,
        enabled: mapped.enabled,
        created_at: mapped.created_at,
        updated_at: mapped.updated_at,
      };
    },

    async getRawByTenant(tenantId) {
      const row = await db
        .prepare("SELECT * FROM lark_configs WHERE tenant_id = ? LIMIT 1")
        .bind(tenantId)
        .first() as D1Row | null;
      return row ? mapRow(row) : null;
    },

    async upsert(tenantId, data, encryptionKey) {
      const { ciphertext, iv } = await encryptSecret(data.app_secret, encryptionKey);
      const calendarId = data.calendar_id ?? null;
      const enabled = data.enabled === false ? 0 : 1;

      const existing = await db
        .prepare("SELECT id FROM lark_configs WHERE tenant_id = ? LIMIT 1")
        .bind(tenantId)
        .first<{ id: string } | null>();

      if (existing) {
        await db
          .prepare(
            `UPDATE lark_configs
             SET app_id = ?, app_secret = ?, app_secret_iv = ?,
                 calendar_id = ?, enabled = ?,
                 updated_at = datetime('now')
             WHERE tenant_id = ?`,
          )
          .bind(data.app_id, ciphertext, iv, calendarId, enabled, tenantId)
          .run();
      } else {
        await db
          .prepare(
            `INSERT INTO lark_configs
              (id, tenant_id, app_id, app_secret, app_secret_iv, calendar_id, enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(newId(), tenantId, data.app_id, ciphertext, iv, calendarId, enabled)
          .run();
      }

      // Read back (decrypted)
      const result = await this.getByTenant(tenantId, encryptionKey);
      if (!result) throw new Error("upsert succeeded but row not found");
      return result;
    },

    async disable(tenantId) {
      const res = await db
        .prepare(
          `UPDATE lark_configs
           SET enabled = 0, updated_at = datetime('now')
           WHERE tenant_id = ?`,
        )
        .bind(tenantId)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },

    async deleteByTenant(tenantId) {
      const res = await db
        .prepare("DELETE FROM lark_configs WHERE tenant_id = ?")
        .bind(tenantId)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
  };
}