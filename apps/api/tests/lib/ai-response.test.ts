import { describe, expect, it } from "vitest";
import { getAiResponseText } from "../../src/lib/ai-response";

describe("getAiResponseText", () => {
  it("reads the native Workers AI response", () => {
    expect(getAiResponseText({ response: "native output" })).toBe("native output");
  });

  it("reads OpenAI-compatible chat completion output", () => {
    expect(getAiResponseText({ choices: [{ message: { content: "chat output" } }] })).toBe("chat output");
  });
});
