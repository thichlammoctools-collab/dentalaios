import { describe, it, expect } from "vitest";
import { isUniqueConstraintError } from "../../src/lib/db-errors";

describe("isUniqueConstraintError", () => {
  it("returns true for SQLite UNIQUE error messages", () => {
    expect(isUniqueConstraintError(new Error("UNIQUE constraint failed: users.email"))).toBe(true);
    expect(
      isUniqueConstraintError(new Error("SqliteError: UNIQUE constraint failed: roles.tenant_id, roles.name")),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isUniqueConstraintError(new Error("unique constraint failed: x"))).toBe(true);
    expect(isUniqueConstraintError(new Error("Unique Constraint Failed"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isUniqueConstraintError(new Error("NOT NULL constraint failed"))).toBe(false);
    expect(isUniqueConstraintError(new Error("no such table"))).toBe(false);
    expect(isUniqueConstraintError(new Error("syntax error"))).toBe(false);
    expect(isUniqueConstraintError(new Error(""))).toBe(false);
  });

  it("returns false for non-Error inputs", () => {
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(undefined)).toBe(false);
    expect(isUniqueConstraintError("UNIQUE")).toBe(false);
    expect(isUniqueConstraintError(42)).toBe(false);
    expect(isUniqueConstraintError({})).toBe(false);
  });
});