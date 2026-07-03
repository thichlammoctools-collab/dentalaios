/**
 * Password hashing using bcryptjs (pure JS, Workers-compatible).
 *
 * bcryptjs is slower than native bcrypt but works in Workers without WASM.
 * saltRounds=10 is the standard tradeoff for Workers (each login ~50-80ms).
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!plain || !hash) return false;
  return bcrypt.compare(plain, hash);
}