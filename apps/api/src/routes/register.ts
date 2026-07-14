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
import { getFrontendBaseUrl } from "../lib/public-url";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// POST /api/register
router.post(
  "/",
  zValidator("json", registerSchema),
  async (c) => {
    const data = c.req.valid("json");
    const result = await registerService.register(
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getFrontendBaseUrl(c.env.FRONTEND_ORIGIN) },
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
      { db: c.env.DB, jwtSecret: c.env.JWT_SECRET, baseUrl: getFrontendBaseUrl(c.env.FRONTEND_ORIGIN) },
      data,
    );
    return c.json(result, 200);
  },
);

export default router;
