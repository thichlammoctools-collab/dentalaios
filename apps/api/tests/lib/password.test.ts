import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password";

describe("Password hashing (bcryptjs)", () => {
  it("hash produces a verifiable hash", async () => {
    const hash = await hashPassword("password123");
    expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    expect(await verifyPassword("password123", hash)).toBe(true);
  });

  it("verifyPassword rejects wrong password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-horse", hash)).toBe(false);
  });

  it("two hashes of the same password differ (salt)", async () => {
    const a = await hashPassword("same-input");
    const b = await hashPassword("same-input");
    expect(a).not.toBe(b);
    // But both verify
    expect(await verifyPassword("same-input", a)).toBe(true);
    expect(await verifyPassword("same-input", b)).toBe(true);
  });

  it("verifyPassword handles empty inputs safely", async () => {
    const hash = await hashPassword("real");
    expect(await verifyPassword("", hash)).toBe(false);
    expect(await verifyPassword("real", "")).toBe(false);
    expect(await verifyPassword("", "")).toBe(false);
  });

  it("verifyPassword is case-sensitive", async () => {
    const hash = await hashPassword("MixedCase");
    expect(await verifyPassword("mixedcase", hash)).toBe(false);
    expect(await verifyPassword("MIXEDCASE", hash)).toBe(false);
    expect(await verifyPassword("MixedCase", hash)).toBe(true);
  });

  it("handles Vietnamese diacritics correctly", async () => {
    const hash = await hashPassword("mậtKhẩu123");
    expect(await verifyPassword("mậtKhẩu123", hash)).toBe(true);
    expect(await verifyPassword("matKhau123", hash)).toBe(false);
  });
});