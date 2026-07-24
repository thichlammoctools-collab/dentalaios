const REFERRER_QR_PREFIX = "DENTALAIOS:REFERRER:";

export function buildReferrerQrPayload(referrerId: string) {
  return `${REFERRER_QR_PREFIX}${referrerId}`;
}

export function parseReferrerQrPayload(rawValue: string) {
  const value = rawValue.trim();
  if (value.startsWith(REFERRER_QR_PREFIX)) return value.slice(REFERRER_QR_PREFIX.length);

  try {
    const url = new URL(value);
    const id = url.searchParams.get("referrer_id") ?? url.searchParams.get("rid");
    return id?.trim() || null;
  } catch {
    return null;
  }
}
