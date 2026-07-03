/**
 * UUID generation. Workers has crypto.randomUUID() globally available.
 */
export function newId(): string {
  return crypto.randomUUID();
}