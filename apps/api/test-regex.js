// Test CORS regex
const matches = (origin, pattern) => {
  if (origin === pattern) return true;
  if (!pattern.includes("*")) return false;
  // Escape all regex metachars including *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\*]/g, "\\$&");
  console.log("  escaped:", JSON.stringify(escaped));
  // Replace \* with optional single subdomain (NO trailing dot - the dot is in the pattern)
  const final = escaped.replace(/\\\*/g, "([a-z0-9-]+)?");
  console.log("  final:", JSON.stringify(final));
  const regex = new RegExp("^" + final + "$");
  return regex.test(origin);
};

console.log("--- canonical ---");
console.log("match:", matches("https://dentalaios-web.pages.dev", "https://*.dentalaios-web.pages.dev"));

console.log("--- deploy ---");
console.log("match:", matches("https://c7c35014.dentalaios-web.pages.dev", "https://*.dentalaios-web.pages.dev"));

console.log("--- other (should NOT match) ---");
console.log("match:", matches("https://evil.com", "https://*.dentalaios-web.pages.dev"));