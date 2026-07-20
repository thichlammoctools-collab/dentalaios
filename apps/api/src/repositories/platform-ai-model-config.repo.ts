import type { D1Database } from "@cloudflare/workers-types";

export interface StoredAiModelConfig {
  application_key: string;
  use_case: string;
  model_id: string;
  is_enabled: boolean;
  updated_at: string;
}

export function createPlatformAiModelConfigRepository(db: D1Database) {
  return {
    async list(): Promise<StoredAiModelConfig[]> {
      const rows = await db.prepare("SELECT application_key, use_case, model_id, is_enabled, updated_at FROM platform_ai_model_configs ORDER BY application_key, use_case").bind().all<StoredAiModelConfig>();
      return rows.results.map((row) => ({ ...row, is_enabled: row.is_enabled === true || Number(row.is_enabled) === 1 }));
    },
    async upsert(data: { application_key: string; use_case: string; model_id: string; is_enabled: boolean; updated_by: string }): Promise<void> {
      await db.prepare("INSERT INTO platform_ai_model_configs (application_key, use_case, model_id, is_enabled, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(application_key, use_case) DO UPDATE SET model_id = excluded.model_id, is_enabled = excluded.is_enabled, updated_by = excluded.updated_by, updated_at = datetime('now')").bind(data.application_key, data.use_case, data.model_id, Number(data.is_enabled), data.updated_by).run();
    },
  };
}
