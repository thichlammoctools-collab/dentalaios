import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";

interface Invite {
  id: string;
  token: string;
  email: string;
  role_id: string;
  branch_id: string;
  expires_at: string;
  created_at: string;
}

interface Role {
  id: string;
  name: string;
}

interface Branch {
  id: string;
  name: string;
}

export function MembersSettingsPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: "",
    role_id: "",
    branch_id: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invitesRes, rolesRes] = await Promise.all([
        apiGet<{ items: Invite[] }>("/api/invite"),
        apiGet<{ items: Role[] }>("/api/roles"),
      ]);
      setInvites(invitesRes.items || []);
      setRoles(rolesRes.items || []);
      // For branches, we can get it from the session
      const session = JSON.parse(localStorage.getItem("dental-session") || "{}");
      if (session?.branch?.id) {
        setBranches([{ id: session.branch.id, name: session.branch.name }]);
      }
    } catch (err) {
      console.error("Failed to load members data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    try {
      const res = await apiPost<{ invite_link: string }>("/api/invite", {
        email: inviteForm.email.trim().toLowerCase(),
        role_id: inviteForm.role_id,
        branch_id: inviteForm.branch_id,
      });
      setInviteSuccess(res.invite_link);
      setInviteDialogOpen(false);
      setInviteForm({ email: "", role_id: "", branch_id: "" });
      loadData();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Tạo lời mời thất bại");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRevokeInvite(id: string) {
    if (!confirm("Thu hồi lời mời này?")) return;
    try {
      await apiDelete(`/api/invite/${id}`);
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Failed to revoke invite:", err);
    }
  }

  function copyLink(link: string, id: string) {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function daysLeft(expiresAt: string): number {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mời thành viên</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gửi link mời để thêm thành viên mới vào phòng khám
          </p>
        </div>
        <button
          onClick={() => setInviteDialogOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + Tạo lời mời
        </button>
      </div>

      {/* Invite success */}
      {inviteSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-green-800">Link mời đã được tạo!</p>
            <button onClick={() => setInviteSuccess(null)} className="text-green-600 hover:text-green-800 text-sm">✕</button>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteSuccess}
              className="flex-1 rounded border border-green-300 bg-white px-3 py-1.5 text-sm"
            />
            <button
              onClick={() => copyLink(inviteSuccess, "success")}
              className="rounded border border-green-300 bg-white px-3 py-1.5 text-sm hover:bg-green-100"
            >
              {copiedId === "success" ? "✓ Đã copy!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-green-600">
            Gửi link này cho người bạn muốn mời. Link có hiệu lực trong 7 ngày.
          </p>
        </div>
      )}

      {/* Invite dialog */}
      {inviteDialogOpen && (
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tạo lời mời mới</h2>
            <button onClick={() => setInviteDialogOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <form onSubmit={handleCreateInvite} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email thành viên</label>
              <input
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                placeholder="colleague@clinic.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Vai trò</label>
                <select
                  required
                  value={inviteForm.role_id}
                  onChange={(e) => setInviteForm((f) => ({ ...f, role_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                >
                  <option value="">Chọn vai trò</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Chi nhánh</label>
                <select
                  required
                  value={inviteForm.branch_id}
                  onChange={(e) => setInviteForm((f) => ({ ...f, branch_id: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                >
                  <option value="">Chọn chi nhánh</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {inviteError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{inviteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteDialogOpen(false)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={inviteLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {inviteLoading ? "Đang tạo..." : "Tạo link mời"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending invites list */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Trạng thái</th>
              <th className="px-4 py-3 text-left font-medium">Còn lại</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {invites.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Chưa có lời mời nào đang chờ
                </td>
              </tr>
            ) : (
              invites.map((invite) => {
                const days = daysLeft(invite.expires_at);
                return (
                  <tr key={invite.id}>
                    <td className="px-4 py-3 font-mono text-sm">{invite.email}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        Chờ chấp nhận
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{days} ngày</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        Thu hồi
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
