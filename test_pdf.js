const fs = require("node:fs");
const BASE = "https://dentalaios.thichlammoctools.workers.dev";

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.clinic", password: "password123" }),
  });
  const loginData = await loginRes.json();
  const token = loginData.session?.token || loginData.token;
  if (!token) {
    console.error("Login failed:", JSON.stringify(loginData));
    return;
  }
  console.log("Login OK, token:", token.slice(0, 30) + "...");
  const auth = { Authorization: `Bearer ${token}` };

  const plansRes = await fetch(`${BASE}/api/treatment-plans`, { headers: auth });
  const plansData = await plansRes.json();
  if (!plansData.items || plansData.items.length === 0) {
    console.error("No treatment plans found");
    return;
  }
  const planId = plansData.items[0].id;
  console.log("Plan ID:", planId);

  const pdfRes = await fetch(`${BASE}/api/treatment-plans/${planId}/pdf`, { headers: auth });
  console.log("PDF status:", pdfRes.status);
  console.log("Content-Type:", pdfRes.headers.get("content-type"));
  if (!pdfRes.ok) {
    const errBody = await pdfRes.text();
    console.log("Error body:", errBody.slice(0, 500));
    return;
  }
  const pdfBytes = await pdfRes.arrayBuffer();
  console.log("PDF size:", pdfBytes.byteLength, "bytes");
  const view = new Uint8Array(pdfBytes, 0, 8);
  const hex = Array.from(view).map(b => b.toString(16).padStart(2, "0")).join(" ");
  console.log("First bytes (hex):", hex);
  fs.writeFileSync("test_output.pdf", Buffer.from(pdfBytes));
  console.log("Written to test_output.pdf");
}

main().catch(console.error);
