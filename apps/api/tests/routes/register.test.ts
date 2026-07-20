/** Integration tests for public registration validation. */

import { describe, expect, it } from "vitest";
import registerRoutes from "../../src/routes/register";
import { mountRoute, publicRequest } from "../helpers/api";

describe("POST /api/register", () => {
  it("returns a useful validation response for a weak password", async () => {
    const app = mountRoute("/api/register", registerRoutes);
    const res = await publicRequest(app, "POST", "/api/register", {
      name: "Nguyen Van A",
      email: "owner@example.com",
      password: "password",
      clinic_name: "Nha khoa ABC",
    });

    expect(res.status).toBe(400);
    expect((await res.json()) as { success: boolean }).toMatchObject({ success: false });
  });
});
