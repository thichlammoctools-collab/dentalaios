import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";

interface Invite {
  id: string;
  token: string;
  email: string;
  role_id: string;
  role_name: string;
  branch_id: string;
  expires_at: string;
  created_at: string;
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function MembersSettingsPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [creatingAll, setCreatingAll] = useState(false);

  useEffect(() => {
    loadInvites();
  }, []);

  async function loadInvites() {
    setLoading(true);
    try {
      const data = await apiGet<Invite[]>("/api/invites");
      setInvites(data);
    } catch {
      toast.error("Không tải được danh sách lời mời");
    } finally {
      setLoading(false);
    }
  }

  async function createInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setCreating(true);
    try {
      const result = await apiPost<{ invite_link: string }>("/api/invites", {
        email: fd.get("email"),
        role_name: fd.get("role_name"),
      });
      setLastLink(result.invite_link);
      await navigator.clipboard.writeText(result.invite_link).catch(() => {});
      setCopied("last");
      setTimeout(() => setCopied(null), 3000);
      await loadInvites();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lời mời");
    } finally {
      setCreating(false);
    }
  }

  async function createBulkInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const emailList = fd.get("emails") as string;
    const role = fd.get("role_name") as string;
    if (!emailList.trim()) return;
    setCreatingAll(true);
    try {
      const emails = emailList.split("\n").map((e) => e.trim()).filter(Boolean);
      for (const email of emails) {
        await apiPost("/api/invites", { email, role_name: role });
      }
      toast.success(`Đã tạo ${emails.length} lời mời`);
      await loadInvites();
      setCreatingAll(false);
      const modal = document.getElementById("bulk-modal") as HTMLDialogElement | null;
      modal?.close();
      form.reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Lỗi tạo lời mời");
      setCreatingAll(false);
    }
  }

  async function revokeInvite(id: string) {
    try {
      await apiDelete(`/api/invites/${id}`);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast.success("Đã thu hồi lời mời");
    } catch {
      toast.error("Lỗi thu hồi lời mời");
    }
  }

  function copyLink(link: string, id: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(id);
      setLastLink(link);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function daysLeft(expiresAt: string) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function inviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  const pending = invites;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Thành viên</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Quản lý lời mời tham gia phòng khám</p>
        </div>
        <button
          onClick={() => {
            const modal = document.getElementById("bulk-modal") as HTMLDialogElement | null;
            modal?.showModal();
          }}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <MailIcon />
          Gửi nhiều
        </button>
      </div>

      {/* Invite form */}
      <form
        onSubmit={createInvite}
        className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row gap-3"
      >
        <div className="flex-1">
          <input
            name="email"
            type="email"
            placeholder="Email thành viên mới"
            required
            className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
        <select
          name="role_name"
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        >
          <option value="doctor">Bác sĩ</option>
          <option value="assistant">Phụ tá</option>
          <option value="admin">Quản trị</option>
        </select>
        <button
          type="submit"
          disabled={creating}
          className="h-10 rounded-lg bg-primary text-primary-foreground px-5 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Đang tạo…" : "Gửi lời mời"}
        </button>
      </form>

      {/* Last created link */}
      {lastLink && (
        <div className="rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Link mời vừa tạo:</p>
            <p className="text-xs text-green-600 dark:text-green-500 break-all font-mono">{lastLink}</p>
            <p className="text-xs text-muted-foreground mt-1">Link có hiệu lực trong 7 ngày</p>
          </div>
          <button
            onClick={() => copyLink(lastLink, "last")}
            className="flex items-center gap-1.5 shrink-0 h-8 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-3 text-xs font-medium transition-colors hover:bg-green-200 dark:hover:bg-green-800"
          >
            <CopyIcon />
            {copied === "last" ? "Đã copy!" : "Copy"}
          </button>
        </div>
      )}

      {/* Pending invites table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-accent animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center">
          <div className="flex justify-center mb-3">
            <div className="rounded-full bg-muted p-3">
              <MailIcon />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Chưa có lời mời nào đang chờ</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Vai trò</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trạng thái</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Còn lại</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pending.map((invite) => {
                const days = daysLeft(invite.expires_at);
                const link = inviteLink(invite.token);
                return (
                  <tr key={invite.id} className="group hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{invite.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {invite.role_name === "doctor" ? "Bác sĩ" : invite.role_name === "assistant" ? "Phụ tá" : "Quản trị"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Chờ chấp nhận
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">{days} ngày</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyLink(link, invite.id)}
                          className="flex items-center gap-1.5 h-8 rounded-lg text-muted-foreground hover:text-foreground px-2 text-xs transition-colors"
                        >
                          <CopyIcon />
                          {copied === invite.id ? "Đã copy!" : "Copy"}
                        </button>
                        <button
                          onClick={() => revokeInvite(invite.id)}
                          className="flex items-center gap-1.5 h-8 rounded-lg text-muted-foreground hover:text-destructive px-2 text-xs transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Thu hồi
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk invite modal */}
      <dialog
        id="bulk-modal"
        className="fixed inset-0 z-50 w-full max-w-lg rounded-2xl border border-border bg-background p-0 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-in open:fade-in-0 open:zoom-in-95"
        onClick={(e) => {
          if (e.target === e.currentTarget) (e.currentTarget as HTMLDialogElement).close();
        }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-foreground">Gửi lời mời hàng loạt</h2>
            <button
              onClick={() => {
                const modal = document.getElementById("bulk-modal") as HTMLDialogElement | null;
                modal?.close();
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={createBulkInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email (mỗi dòng 1 email)</label>
              <textarea
                name="emails"
                rows={8}
                required
                placeholder={`lam@example.com\nminh@example.com\nhung@example.com`}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Vai trò</label>
              <select
                name="role_name"
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="doctor">Bác sĩ</option>
                <option value="assistant">Phụ tá</option>
                <option value="admin">Quản trị</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const modal = document.getElementById("bulk-modal") as HTMLDialogElement | null;
                  modal?.close();
                }}
                className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={creatingAll}
                className="h-10 rounded-lg bg-primary text-primary-foreground px-5 text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {creatingAll ? "Đang tạo…" : "Gửi tất cả"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
