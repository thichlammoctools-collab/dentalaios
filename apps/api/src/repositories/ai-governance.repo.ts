import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformAiBenchmarkCase, PlatformAiBenchmarkEvaluation, PlatformAiRollout } from "@shared/types";

export function createAiGovernanceRepository(db: D1Database) {
  return {
    async activeRollout(useCase: string): Promise<PlatformAiRollout | null> {
      return db.prepare("SELECT use_case, candidate_model_id, traffic_percent, status, requested_by, approved_by, updated_at FROM platform_ai_model_rollouts WHERE use_case = ? AND status = 'active' AND approved_by IS NOT NULL LIMIT 1").bind(useCase).first<PlatformAiRollout>();
    },
    async listRollouts(): Promise<PlatformAiRollout[]> {
      const rows = await db.prepare("SELECT use_case, candidate_model_id, traffic_percent, status, requested_by, approved_by, updated_at FROM platform_ai_model_rollouts ORDER BY use_case").bind().all<PlatformAiRollout>();
      return rows.results;
    },
    async upsertRollout(data: PlatformAiRollout): Promise<void> {
      await db.prepare("INSERT INTO platform_ai_model_rollouts (use_case, candidate_model_id, traffic_percent, status, requested_by, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(use_case) DO UPDATE SET candidate_model_id = excluded.candidate_model_id, traffic_percent = excluded.traffic_percent, status = excluded.status, requested_by = excluded.requested_by, approved_by = NULL, updated_at = datetime('now')").bind(data.use_case, data.candidate_model_id, data.traffic_percent, data.status, data.requested_by ?? null).run();
    },
    async approveRollout(useCase: string, status: "approved" | "active" | "paused", userId: string): Promise<void> {
      await db.prepare("UPDATE platform_ai_model_rollouts SET status = ?, approved_by = ?, updated_at = datetime('now') WHERE use_case = ?").bind(status, userId, useCase).run();
    },
    async circuitOpen(useCase: string, modelId: string): Promise<boolean> {
      const row = await db.prepare("SELECT opened_until FROM ai_model_circuits WHERE use_case = ? AND model_id = ? LIMIT 1").bind(useCase, modelId).first<{ opened_until?: string }>();
      return Boolean(row?.opened_until && Date.parse(row.opened_until) > Date.now());
    },
    async recordCircuit(useCase: string, modelId: string, success: boolean): Promise<void> {
      if (success) {
        await db.prepare("INSERT INTO ai_model_circuits (use_case, model_id, consecutive_failures, opened_until, updated_at) VALUES (?, ?, 0, NULL, datetime('now')) ON CONFLICT(use_case, model_id) DO UPDATE SET consecutive_failures = 0, opened_until = NULL, updated_at = datetime('now')").bind(useCase, modelId).run();
        return;
      }
      await db.prepare("INSERT INTO ai_model_circuits (use_case, model_id, consecutive_failures, updated_at) VALUES (?, ?, 1, datetime('now')) ON CONFLICT(use_case, model_id) DO UPDATE SET consecutive_failures = consecutive_failures + 1, opened_until = CASE WHEN consecutive_failures + 1 >= 3 THEN datetime('now', '+5 minutes') ELSE opened_until END, updated_at = datetime('now')").bind(useCase, modelId).run();
    },
    async listBenchmarkCases(): Promise<PlatformAiBenchmarkCase[]> { const rows = await db.prepare("SELECT id, use_case, label, prompt, expected_output, is_deidentified, created_at FROM platform_ai_benchmark_cases ORDER BY created_at DESC").bind().all<PlatformAiBenchmarkCase>(); return rows.results; },
    async createBenchmarkCase(data: PlatformAiBenchmarkCase & { created_by: string }): Promise<void> { await db.prepare("INSERT INTO platform_ai_benchmark_cases (id, use_case, label, prompt, expected_output, is_deidentified, created_by) VALUES (?, ?, ?, ?, ?, 1, ?)").bind(data.id, data.use_case, data.label, data.prompt, data.expected_output, data.created_by).run(); },
    async createEvaluation(data: PlatformAiBenchmarkEvaluation): Promise<void> { await db.prepare("INSERT INTO platform_ai_benchmark_evaluations (id, case_id, model_id, output, json_valid) VALUES (?, ?, ?, ?, ?)").bind(data.id, data.case_id, data.model_id, data.output, Number(data.json_valid)).run(); },
    async reviewEvaluation(id: string, score: number, note: string | undefined, userId: string): Promise<void> { await db.prepare("UPDATE platform_ai_benchmark_evaluations SET reviewer_score = ?, reviewer_note = ?, reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?").bind(score, note ?? null, userId, id).run(); },
  };
}
