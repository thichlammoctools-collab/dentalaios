type AiResponse = {
  response?: unknown;
  output_text?: unknown;
  choices?: Array<{
    message?: { content?: unknown };
  }>;
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

/** Supports both the native Workers AI and OpenAI-compatible response shapes. */
export function getAiResponseText(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;

  const response = result as AiResponse;
  if (typeof response.response === "string") return response.response;
  if (typeof response.output_text === "string") return response.output_text;
  return contentToText(response.choices?.[0]?.message?.content);
}
