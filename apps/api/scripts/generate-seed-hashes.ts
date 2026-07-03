/**
 * One-off helper to generate bcrypt password hashes for seed data.
 *
 * Usage:
 *   cd apps/api
 *   npx tsx scripts/generate-seed-hashes.ts "password123"
 *
 * Output: 4 lines of `$2a$10$...` hashes — one per demo user in seed.
 * Paste them into src/db/seeds/0001_roles.sql (replacing PLACEHOLDER_HASH).
 */

import bcrypt from "bcryptjs";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: tsx scripts/generate-seed-hashes.ts <password>");
    process.exit(1);
  }
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  // Same hash for all 4 demo users — they share the same dev password.
  // Print 4 copies so the seed file can reuse the same value.
  for (let i = 0; i < 4; i++) console.log(hash);
}

main();