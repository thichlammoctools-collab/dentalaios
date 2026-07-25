import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/lib/errors";
import { aiModelConfigService } from "../../src/services/ai-model-config.service";
import { createMockD1 } from "../helpers/mock-db";

describe("aiModelConfigService", () => {
  it("uses the catalog default when no override exists", async () => {
    const config = await aiModelConfigService.resolve(
      createMockD1() as never,
      "visit_summary",
    );

    expect(config).toEqual({
      model_id: "@cf/meta/llama-4-scout-17b-16e-instruct",
      fallback_model_id: "@cf/openai/gpt-oss-20b",
      is_enabled: true,
    });
  });

  it("returns the recommended default and guidance for every configured use case", async () => {
    const configs = await aiModelConfigService.list(createMockD1() as never);

    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        use_case: "treatment_plan_draft",
        model_id: "@cf/openai/gpt-oss-20b",
        recommendation: "Ưu tiên suy luận có cấu trúc",
      }),
      expect.objectContaining({
        use_case: "appointment_chat_parse",
        model_id: "@cf/openai/gpt-oss-20b",
        guidance: expect.any(String),
        review_note: expect.any(String),
      }),
    ]));
  });

  it("rejects a model that is incompatible with the selected use case", async () => {
    await expect(
      aiModelConfigService.update(
        createMockD1() as never,
        {
          application_key: "clinic_web",
          use_case: "clinical_image_analysis",
          model_id: "@cf/openai/gpt-oss-20b",
          is_enabled: true,
        },
        "platform-owner",
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("offers all supported chat models for text and only vision-capable models for images", async () => {
    const configs = await aiModelConfigService.list(createMockD1() as never);
    const text = configs.find((config) => config.use_case === "visit_summary");
    const vision = configs.find((config) => config.use_case === "clinical_image_analysis");

    expect(text?.allowed_models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "@cf/openai/gpt-oss-20b" }),
      expect.objectContaining({ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }),
    ]));
    expect(vision?.allowed_models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "@cf/google/gemma-4-26b-a4b-it" }),
      expect.objectContaining({ id: "@cf/meta/llama-3.2-11b-vision-instruct" }),
    ]));
    expect(vision?.allowed_models).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "@cf/openai/gpt-oss-20b" }),
    ]));
  });
});
