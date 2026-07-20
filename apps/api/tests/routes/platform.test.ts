import { describe, expect, it } from "vitest";
import platformRoutes from "../../src/routes/platform";
import { mountRoute, makeToken, publicRequest } from "../helpers/api";
import { buildEnv, TEST_SECRET } from "../helpers/jwt";
import { createMockD1 } from "../helpers/mock-db";

describe("platform routes", () => {
  it("rejects requests without a platform token", async () => {
    const app = mountRoute("/api/platform", platformRoutes);
    const response = await publicRequest(app, "GET", "/api/platform/dashboard");
    expect(response.status).toBe(401);
  });

  it("rejects a valid tenant JWT even if it uses the same signing key", async () => {
    const app = mountRoute("/api/platform", platformRoutes);
    const tenantToken = await makeToken(["all"]);
    const response = await app.request(
      "/api/platform/dashboard",
      { headers: { Authorization: `Bearer ${tenantToken}` } },
      buildEnv(createMockD1(), {
        JWT_SECRET: TEST_SECRET,
        PLATFORM_JWT_SECRET: TEST_SECRET,
      }),
    );
    expect(response.status).toBe(401);
  });
});
