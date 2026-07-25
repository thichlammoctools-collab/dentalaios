import { describe, expect, it } from "vitest";
import { runAiWithFallback } from "../../src/lib/ai-runtime";
import { createMockD1 } from "../helpers/mock-db";

describe("runAiWithFallback", () => {
  it("uses the configured fallback when the primary output cannot be parsed", async () => {
    const db = createMockD1();
    const calls: string[] = [];
    const result = await runAiWithFallback({
      db: db as never,
      AI: {
        run: async (model: string) => {
          calls.push(model);
          return { response: model.includes("llama-4") ? "not json" : '{"ok":true}' };
        },
      },
      use_case: "visit_summary",
      request: { messages: [] },
      parse: (text) => text === '{"ok":true}' ? text : null,
    });

    expect(result).toEqual({ value: '{"ok":true}', model_id: "@cf/openai/gpt-oss-20b", used_fallback: true });
    expect(calls).toEqual(["@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/openai/gpt-oss-20b"]);
    expect(db.__sqlContaining("INSERT INTO ai_model_metrics")).toHaveLength(2);
  });

  it("continues with the fallback when the primary request times out", async () => {
    const db = createMockD1();
    const result = await runAiWithFallback({
      db: db as never,
      AI: {
        run: async (model: string) => model.includes("llama-4")
          ? new Promise(() => undefined)
          : { response: "fallback response" },
      },
      use_case: "visit_summary",
      request: { messages: [] },
      parse: (text) => text === "fallback response" ? text : null,
      timeout_ms: 1,
    });

    expect(result).toEqual({ value: "fallback response", model_id: "@cf/openai/gpt-oss-20b", used_fallback: true });
  });

  it("tries the known-good default before the configured fallback after an A/B candidate fails", async () => {
    const db = createMockD1({
      rowsByFragment: new Map([["FROM platform_ai_model_rollouts", [{
        use_case: "visit_summary", candidate_model_id: "@cf/openai/gpt-oss-120b", traffic_percent: 100, status: "active", approved_by: "owner",
      }]]]),
    });
    const calls: string[] = [];
    const result = await runAiWithFallback({
      db: db as never,
      AI: { run: async (model: string) => { calls.push(model); return { response: model.includes("llama-4") ? "default response" : "" }; } },
      use_case: "visit_summary",
      request: { messages: [] },
      parse: (text) => text || null,
      routing_key: "visit-1",
    });

    expect(result?.model_id).toBe("@cf/meta/llama-4-scout-17b-16e-instruct");
    expect(calls).toEqual(["@cf/openai/gpt-oss-120b", "@cf/meta/llama-4-scout-17b-16e-instruct"]);
  });
});
