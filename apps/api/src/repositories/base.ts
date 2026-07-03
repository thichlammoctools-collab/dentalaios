/**
 * Base repository helpers and row→entity mappers.
 *
 * Architecture rule #10: Repositories are interfaces over D1.
 * Each entity has a repository that returns plain types from @shared/types.
 * Mappers strip DB-specific shapes (snake_case columns, JSON-as-string).
 */

/** Generic row type for D1 results. */
export type D1Row = Record<string, unknown>;

export interface Pagination {
  limit?: number;
  offset?: number;
}

export function parsePermissions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // ignore malformed JSON
  }
  return [];
}

export function permissionsToJson(perms: string[]): string {
  return JSON.stringify(perms);
}