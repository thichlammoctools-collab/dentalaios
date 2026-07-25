import type { D1Database } from "@cloudflare/workers-types";
import { PLATFORM_AI_MODEL_PRICING, type PlatformAiUseCase } from "@shared/constants";
import { getAiResponseText, getAiUsage } from "./ai-response";
import { createAiGovernanceRepository } from "../repositories/ai-governance.repo";
import { createAiModelMetricsRepository } from "../repositories/ai-model-metrics.repo";
import { aiModelConfigService } from "../services/ai-model-config.service";

type AiBinding = { run(model: string, inputs: object): Promise<unknown> };
const DEFAULT_AI_TIMEOUT_MS = 45_000;

async function runWithTimeout(AI: AiBinding, modelId: string, request: object, timeoutMs: number): Promise<unknown> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      AI.run(modelId, request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("AI request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function stablePercent(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0) % 100;
}

function estimateCostMicrousd(modelId: string, inputTokens: number, outputTokens: number): number {
  const pricing = PLATFORM_AI_MODEL_PRICING[modelId as keyof typeof PLATFORM_AI_MODEL_PRICING];
  if (!pricing) return 0;
  return Math.round((inputTokens * pricing.input_microusd_per_million + outputTokens * pricing.output_microusd_per_million) / 1_000_000);
}

async function recordAttempt(db: D1Database, data: { use_case: string; model_id: string; success: boolean; used_fallback: boolean; latency_ms: number; input_tokens: number; output_tokens: number }) {
  try {
    await Promise.all([
      createAiModelMetricsRepository(db).record({ ...data, cost_microusd: estimateCostMicrousd(data.model_id, data.input_tokens, data.output_tokens) }),
      createAiGovernanceRepository(db).recordCircuit(data.use_case, data.model_id, data.success),
    ]);
  } catch {
    // Telemetry must never prevent patient-care workflows from using the fallback path.
  }
}

export async function runAiWithFallback<T>(input: {
  db: D1Database;
  AI: unknown;
  use_case: PlatformAiUseCase;
  request: object;
  parse: (text: string) => T | null;
  /** Stable, non-PII routing key for approved A/B rollouts. */
  routing_key?: string;
  /** Tests and bounded background jobs may provide a shorter timeout. */
  timeout_ms?: number;
}): Promise<{ value: T; model_id: string; used_fallback: boolean } | null> {
  const config = await aiModelConfigService.resolve(input.db, input.use_case);
  if (!config.is_enabled || !input.AI || typeof (input.AI as { run?: unknown }).run !== "function") return null;

  const governance = createAiGovernanceRepository(input.db);
  let primaryModelId = config.model_id;
  try {
    const rollout = await governance.activeRollout(input.use_case);
    if (rollout && input.routing_key && stablePercent(`${input.use_case}:${input.routing_key}`) < rollout.traffic_percent) primaryModelId = rollout.candidate_model_id;
  } catch {
    // Governance is fail-safe: use the approved default if its tables are unavailable during rollout.
  }
  // A/B candidates never replace the known-good default as the first recovery step.
  const models = [...new Set([primaryModelId, config.model_id, config.fallback_model_id])];
  const timeoutMs = Math.max(1, input.timeout_ms ?? DEFAULT_AI_TIMEOUT_MS);
  for (const [index, modelId] of models.entries()) {
    const startedAt = Date.now();
    try {
      try {
        if (await governance.circuitOpen(input.use_case, modelId)) continue;
      } catch {
        // If governance storage is unavailable, preserve the existing model path.
      }
      const result = await runWithTimeout(input.AI as AiBinding, modelId, input.request, timeoutMs);
      const value = getAiResponseText(result);
      const parsed = value ? input.parse(value) : null;
      const latencyMs = Date.now() - startedAt;
      const usage = getAiUsage(result);
      await recordAttempt(input.db, { use_case: input.use_case, model_id: modelId, success: Boolean(parsed), used_fallback: index > 0, latency_ms: latencyMs, ...usage });
      if (parsed) return { value: parsed, model_id: modelId, used_fallback: index > 0 };
    } catch {
      await recordAttempt(input.db, { use_case: input.use_case, model_id: modelId, success: false, used_fallback: index > 0, latency_ms: Date.now() - startedAt, input_tokens: 0, output_tokens: 0 });
    }
  }

  return null;
}
