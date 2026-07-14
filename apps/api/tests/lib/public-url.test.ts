import { describe, expect, it } from "vitest";
import { getFrontendBaseUrl } from "../../src/lib/public-url";

describe("getFrontendBaseUrl", () => {
  it("uses the configured frontend origin and normalizes trailing slashes", () => {
    expect(getFrontendBaseUrl("https://app.example.com///")).toBe("https://app.example.com");
  });

  it("uses the safe deployment fallback for empty or wildcard configuration", () => {
    expect(getFrontendBaseUrl()).toBe("https://dentalaios-web.pages.dev");
    expect(getFrontendBaseUrl("*")).toBe("https://dentalaios-web.pages.dev");
  });
});
