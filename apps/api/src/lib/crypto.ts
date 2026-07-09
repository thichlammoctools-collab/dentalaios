/**
 * AES-256-GCM encryption/decryption utilities for Cloudflare Workers.
 *
 * Used to encrypt sensitive integration secrets (e.g. Lark app_secret)
 * at rest in D1. The master key is the ENCRYPTION_KEY Worker secret —
 * a 64-character hex string (32 bytes).
 *
 * Web Crypto API is Workers-compatible (no Node.js deps).
 */

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    hexToBytes(hexKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @returns { ciphertext, iv } — both base64-encoded, ready for DB storage.
 */
export async function encryptSecret(
  plaintext: string,
  encryptionKey: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypt a ciphertext string previously encrypted with encryptSecret.
 * @param ciphertext — base64-encoded ciphertext
 * @param iv — base64-encoded initialization vector
 * @param encryptionKey — hex-encoded 32-byte key (same as used for encryption)
 */
export async function decryptSecret(
  ciphertext: string,
  iv: string,
  encryptionKey: string,
): Promise<string> {
  const key = await importKey(encryptionKey);
  const ivBytes = base64ToBytes(iv);
  const cipherBytes = base64ToBytes(ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    cipherBytes,
  );

  return new TextDecoder().decode(decrypted);
}