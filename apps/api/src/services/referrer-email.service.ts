import type { Env } from "../index";

/** Best-effort transactional mail. Callers retain the one-time link as a fallback. */
export async function sendReferrerPortalLink(env: Env, email: string, link: string, kind: "activate" | "reset_password"): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.REFERRAL_EMAIL_FROM) return false;
  const subject = kind === "activate" ? "Kích hoạt cổng Người giới thiệu" : "Đặt lại mật khẩu cổng Người giới thiệu";
  const action = kind === "activate" ? "Kích hoạt tài khoản" : "Đặt lại mật khẩu";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.REFERRAL_EMAIL_FROM, to: [email], subject, html: `<p>Nhấn vào liên kết bên dưới để ${action.toLowerCase()}.</p><p><a href="${link}">${action}</a></p><p>Liên kết có hiệu lực trong 24 giờ.</p>` }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
