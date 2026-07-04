/**
 * Test helper: build a Hono app with the same onError + CORS as production.
 *
 * Without this, thrown AppError becomes 500 (caught by Hono's default error
 * handler) instead of the intended status (e.g. 401, 403, 422).
 */

import { Hono } from "hono";
import type { Env } from "../../src/index";
import { AppError } from "../../src/lib/errors";

export function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        {
          error: err.message,
          code: err.code,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
        err.status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500,
      );
    }
    return c.json({ error: "Internal server error", code: "internal_error" }, 500);
  });

  return app;
}