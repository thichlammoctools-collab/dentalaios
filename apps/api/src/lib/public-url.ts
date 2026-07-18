/**
 * Returns the configured public frontend URL for links sent to users.
 *
 * Never derive this from the request Origin header: authenticated callers can
 * send an arbitrary Origin and turn an invite link into an open redirect or
 * phishing link. Deployment configuration is the authority for this value.
 */
const DEFAULT_FRONTEND_URL = "https://dentalaios-web.pages.dev";

export function getFrontendBaseUrl(frontendOrigin?: string): string {
  const configured = frontendOrigin?.trim();
  if (!configured || configured === "*") return DEFAULT_FRONTEND_URL;
  return configured.replace(/\/+$/, "");
}
