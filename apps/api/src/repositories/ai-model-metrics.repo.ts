import type { D1Database } from "@cloudflare/workers-types";
import type { PlatformAiModelMetric } from "@shared/types";

type MetricRow = PlatformAiModelMetric & { total_latency_ms: number };

export function createAiModelMetricsRepository(db: D1Database) {
  return {
    async record(data: { use_case: string; model_id: string; success: boolean; used_fallback: boolean; latency_ms: number; input_tokens: number; output_tokens: number; cost_microusd: number }): Promise<void> {
      await db.prepare(
        "INSERT INTO ai_model_metrics (metric_date, use_case, model_id, attempts, successes, failures, fallback_uses, total_latency_ms, input_tokens, output_tokens, cost_microusd) VALUES (date('now'), ?, ?, 1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(metric_date, use_case, model_id) DO UPDATE SET attempts = attempts + 1, successes = successes + excluded.successes, failures = failures + excluded.failures, fallback_uses = fallback_uses + excluded.fallback_uses, total_latency_ms = total_latency_ms + excluded.total_latency_ms, input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens, cost_microusd = cost_microusd + excluded.cost_microusd",
      ).bind(
        data.use_case,
        data.model_id,
        Number(data.success),
        Number(!data.success),
        Number(data.used_fallback),
        Math.max(0, Math.round(data.latency_ms)),
        Math.max(0, Math.round(data.input_tokens)),
        Math.max(0, Math.round(data.output_tokens)),
        Math.max(0, Math.round(data.cost_microusd)),
      ).run();
    },
    async summary(days = 30): Promise<PlatformAiModelMetric[]> {
      let rows: { results: MetricRow[] };
      try {
        rows = await db.prepare(
          "SELECT use_case, model_id, SUM(attempts) AS attempts, SUM(successes) AS successes, SUM(failures) AS failures, SUM(fallback_uses) AS fallback_uses, SUM(total_latency_ms) AS total_latency_ms, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cost_microusd) AS cost_microusd FROM ai_model_metrics WHERE metric_date >= date('now', ?) GROUP BY use_case, model_id ORDER BY use_case, attempts DESC",
        ).bind(`-${days - 1} days`).all<MetricRow>();
      } catch (error) {
        // During a rolling deployment, the Worker can be active before D1 migration 0063.
        if (error instanceof Error && /no such table: ai_model_metrics/i.test(error.message)) return [];
        throw error;
      }

      return rows.results.map((row) => ({
        use_case: row.use_case,
        model_id: row.model_id,
        attempts: Number(row.attempts),
        successes: Number(row.successes),
        failures: Number(row.failures),
        fallback_uses: Number(row.fallback_uses),
        average_latency_ms: Number(row.attempts) ? Math.round(Number(row.total_latency_ms) / Number(row.attempts)) : 0,
        input_tokens: Number(row.input_tokens),
        output_tokens: Number(row.output_tokens),
        cost_microusd: Number(row.cost_microusd),
      }));
    },
  };
}
