import { describe, expect, it } from "vitest";
import worker from "../src/index";

const env = {
  ENVIRONMENT: "production",
  FRONTEND_ORIGIN: "https://dentalaios-web.pages.dev",
  CORS_ORIGINS: "https://dentalaios-web.pages.dev,https://*.dentalaios-web.pages.dev,https://dentalaios.pages.dev",
} as any;

describe("CORS", () => {
  it("allows the production Pages domain", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/api/health", {
        headers: { Origin: "https://dentalaios-web.pages.dev" },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dentalaios-web.pages.dev",
    );
  });

  it("allows one Cloudflare Pages preview subdomain", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/api/health", {
        headers: { Origin: "https://preview.dentalaios-web.pages.dev" },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://preview.dentalaios-web.pages.dev",
    );
  });

  it("allows the alternate production Pages domain", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/api/health", {
        headers: { Origin: "https://dentalaios.pages.dev" },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dentalaios.pages.dev",
    );
  });

  it("rejects an unlisted origin", async () => {
    const response = await worker.fetch(
      new Request("https://api.example.test/api/health", {
        headers: { Origin: "https://untrusted.example.com" },
      }),
      env,
      {} as ExecutionContext,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
