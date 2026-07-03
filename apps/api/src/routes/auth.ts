import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { loginSchema } from "@shared/validation";
import type { Env } from "../index";
import { authService } from "../services/auth.service";
import { getJwt } from "../middleware/auth";
import type { AuthContext } from "../middleware/auth";

const router = new Hono<{ Bindings: Env; Variables: AuthContext }>();

// POST /api/auth/login — public
router.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const session = await authService.login(
    { db: c.env.DB, jwtSecret: c.env.JWT_SECRET },
    email,
    password,
  );
  return c.json({ session }, 200);
});

// GET /api/auth/me — requires auth
router.get("/me", async (c) => {
  const jwt = getJwt(c);
  const me = await authService.getMe(
    { db: c.env.DB, jwtSecret: c.env.JWT_SECRET },
    jwt.sub,
    jwt.tenant_id,
  );
  if (!me) return c.json({ error: "User not found", code: "not_found" }, 404);
  return c.json(me, 200);
});

// POST /api/auth/logout — stateless; client deletes token
router.post("/logout", async (c) => {
  return c.json({ ok: true }, 200);
});

export default router;