import { describe, expect, it } from "vitest";
import { signPlatformJwt, verifyPlatformJwt } from "../../src/lib/platform-jwt";
import { verifyJwt } from "../../src/lib/jwt";

const SECRET = "platform-test-secret";

describe("platform JWT", () => {
  it("uses the dedicated platform issuer, audience, and scope", async () => {
    const signed = await signPlatformJwt(
      {
        sub: "platform-user-1",
        sid: "platform-session-1",
        role_key: "platform_owner",
        permissions: ["platform_dashboard.read"],
      },
      SECRET,
    );

    await expect(verifyPlatformJwt(signed.token, SECRET)).resolves.toMatchObject({
      sub: "platform-user-1",
      sid: "platform-session-1",
      scope: "platform",
    });
    await expect(verifyJwt(signed.token, SECRET)).rejects.toThrow();
  });
});
