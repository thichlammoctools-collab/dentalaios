import type { D1Database } from "@cloudflare/workers-types";
import { PLATFORM_AI_APPLICATION, PLATFORM_AI_MODEL_CONFIG_CATALOG, type PlatformAiUseCase } from "@shared/constants";
import type { PlatformAiModelConfig } from "@shared/types";
import { ValidationError } from "../lib/errors";
import { createPlatformAiModelConfigRepository } from "../repositories/platform-ai-model-config.repo";

type ResolvedAiModel = { model_id: string; is_enabled: boolean };

function catalogEntry(useCase: PlatformAiUseCase) {
  const entry = PLATFORM_AI_MODEL_CONFIG_CATALOG.find((item) => item.use_case === useCase);
  if (!entry) throw new ValidationError("AI use case không hợp lệ");
  return entry;
}

export const aiModelConfigService = {
  async list(db: D1Database): Promise<PlatformAiModelConfig[]> {
    const stored = await createPlatformAiModelConfigRepository(db).list();
    return PLATFORM_AI_MODEL_CONFIG_CATALOG.map((entry) => {
      const override = stored.find((item) => item.application_key === PLATFORM_AI_APPLICATION && item.use_case === entry.use_case);
      const validOverride = override && entry.allowed_models.some((model) => model.id === override.model_id) ? override : undefined;
      return {
        application_key: PLATFORM_AI_APPLICATION,
        use_case: entry.use_case,
        name: entry.name,
        modality: entry.modality,
        model_id: validOverride?.model_id ?? entry.default_model_id,
        default_model_id: entry.default_model_id,
        allowed_models: entry.allowed_models.map((model) => ({ ...model })),
        is_enabled: validOverride?.is_enabled ?? true,
        is_overridden: Boolean(validOverride),
        updated_at: validOverride?.updated_at,
      };
    });
  },
  async resolve(db: D1Database, useCase: PlatformAiUseCase): Promise<ResolvedAiModel> {
    const config = (await this.list(db)).find((item) => item.use_case === useCase);
    if (!config) throw new ValidationError("AI use case không hợp lệ");
    return { model_id: config.model_id, is_enabled: config.is_enabled };
  },
  async update(db: D1Database, data: { application_key: string; use_case: string; model_id: string; is_enabled: boolean }, userId: string): Promise<PlatformAiModelConfig> {
    const entry = catalogEntry(data.use_case as PlatformAiUseCase);
    if (data.application_key !== PLATFORM_AI_APPLICATION || !entry.allowed_models.some((model) => model.id === data.model_id)) {
      throw new ValidationError("Model không tương thích với tác vụ AI này");
    }
    await createPlatformAiModelConfigRepository(db).upsert({ ...data, updated_by: userId });
    const config = (await this.list(db)).find((item) => item.use_case === data.use_case);
    if (!config) throw new ValidationError("Không thể lưu cấu hình AI");
    return config;
  },
};
