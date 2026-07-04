/**
 * Detect D1/SQLite UNIQUE constraint violations.
 *
 * SQLite returns error messages containing "UNIQUE constraint failed"
 * for UNIQUE violations. D1 doesn't yet expose structured error codes
 * (as of mid-2026), so string matching is the practical approach.
 *
 * If D1 later exposes a stable error code, switch to that here.
 */

export function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /UNIQUE/i.test(err.message);
}