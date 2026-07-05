/**
 * Registration routes — public (no auth required):
 *   POST /api/register           — self-signup (creates tenant + admin user)
 *   POST /api/register/verify    — verify email and activate account
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { registerSchema, emailVerifySchema } from "@shared/validation";
import type { Env } from "../index";
import type { AuthContext } from "../middleware/auth";
import { registerService } from "../services/register.service";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

function getBaseUrl(c: { env: { FRONTEND_ORIGIN?: string }; req: { header: (n: string) => string | undefined } }): string {
  const origin = c.req.header("origin");
  if (origin) return origin;
  return c.env.FRONTEND_ORIGIN || "https://dentalaios-web.pages.dev";
}

// POST /api/register
router.post(
  "/",
  zValidator("json", registerSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await registerService.register(
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getBaseUrl(c) },
      data,
    );
    return c.json(result, 201);
  },
);

// POST /api/register/verify
router.post(
  "/verify",
  zValidator("json", emailVerifySchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await registerService.verifyEmail(
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getBaseUrl(c) },
      data,
    );
    return c.json(result, 200);
  },
);

export default router;
