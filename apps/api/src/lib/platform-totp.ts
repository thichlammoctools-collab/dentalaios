const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string): Uint8Array {
  const clean = value.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let buffer = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) { out.push((buffer >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += BASE32[(buffer >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += BASE32[(buffer << (5 - bits)) & 31];
  return output;
}

function counterBytes(counter: number): Uint8Array {
  const out = new Uint8Array(8);
  let value = counter;
  for (let index = 7; index >= 0; index -= 1) { out[index] = value & 0xff; value = Math.floor(value / 256); }
  return out;
}

async function code(secret: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export async function verifyTotp(secret: string, input: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(input)) return false;
  const current = Math.floor(now / 1000 / 30);
  for (const offset of [-1, 0, 1]) if (equal(await code(secret, current + offset), input)) return true;
  return false;
}
