type AiResponse = {
  response?: unknown;
  output_text?: unknown;
  choices?: Array<{
    message?: { content?: unknown };
  }>;
  usage?: { input_tokens?: unknown; prompt_tokens?: unknown; output_tokens?: unknown; completion_tokens?: unknown };
};

function contentToText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("") || undefined;
}

export function getAiUsage(result: unknown): { input_tokens: number; output_tokens: number } {
  if (typeof result !== "object" || result === null) return { input_tokens: 0, output_tokens: 0 };
  const usage = (result as AiResponse).usage;
  const numberOrZero = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
  return {
    input_tokens: numberOrZero(usage?.input_tokens ?? usage?.prompt_tokens),
    output_tokens: numberOrZero(usage?.output_tokens ?? usage?.completion_tokens),
  };
}

/** Supports both the native Workers AI and OpenAI-compatible response shapes. */
export function getAiResponseText(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;

  const response = result as AiResponse;
  if (typeof response.response === "string") return response.response;
  if (typeof response.output_text === "string") return response.output_text;
  return contentToText(response.choices?.[0]?.message?.content);
}
