// Test login and print full error
const WORKER = "https://dentalaios.thichlammoctools.workers.dev";

async function test() {
  // Health check
  console.log("=== Health check ===");
  const h = await fetch(`${WORKER}/api/health`);
  console.log("  Status:", h.status);
  console.log("  Body:", await h.json());

  // Login
  console.log("\n=== Login test ===");
  const res = await fetch(`${WORKER}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.clinic", password: "password123" }),
  });
  console.log("  Status:", res.status);
  const body = await res.json();
  console.log("  Body:", JSON.stringify(body, null, 2));
}

test().catch(console.error);