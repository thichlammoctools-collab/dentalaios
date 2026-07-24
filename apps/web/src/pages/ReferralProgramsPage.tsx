import { useEffect, useState, type FormEvent } from "react";
import type {
  ReferralProgram,
  ReferralRewardRule,
  ReferrerType,
} from "@shared/types";
import { PERMISSIONS } from "@shared/constants";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { referralProgramsApi } from "@/lib/referral-api";
import { toast } from "@/lib/toast";
import { PageContainer } from "@/components/PageContainer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LoadingReferralPanel,
  ReferralEmpty,
  ReferrerTypeLabel,
} from "@/components/referral/ReferralUi";
import { formatDate } from "@/lib/utils";

type RuleDraft = Pick<
  ReferralRewardRule,
  | "referrer_type"
  | "min_net_revenue"
  | "reward_kind"
  | "calculation_type"
  | "value"
  | "voucher_valid_days"
>;
type ProgramDraft = {
  name: string;
  status: "draft" | "active" | "inactive";
  starts_at: string;
  ends_at: string;
  priority: number;
  conversion_window_days: number;
  review_window_days: number;
  rules: RuleDraft[];
};
type ProgramStatusFilter = "all" | ProgramDraft["status"];
type ProgramSort = "priority" | "newest" | "name";
const newRule = (): RuleDraft => ({
  referrer_type: "patient",
  min_net_revenue: 0,
  reward_kind: "cash",
  calculation_type: "fixed",
  value: 0,
  voucher_valid_days: undefined,
});
const emptyProgram = (): ProgramDraft => ({
  name: "",
  status: "draft",
  starts_at: new Date().toISOString().slice(0, 16),
  ends_at: "",
  priority: 0,
  conversion_window_days: 90,
  review_window_days: 30,
  rules: [newRule()],
});

export function ReferralProgramsPage() {
  const { session } = useAuth();
  const [programs, setPrograms] = useState<
    (ReferralProgram & { rules?: ReferralRewardRule[] })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProgramDraft>(emptyProgram());
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProgramStatusFilter>("all");
  const [referrerTypeFilter, setReferrerTypeFilter] = useState<
    "all" | ReferrerType
  >("all");
  const [sort, setSort] = useState<ProgramSort>("priority");
  const canManage = Boolean(
    session?.role.permissions.includes(PERMISSIONS.ALL) ||
    session?.role.permissions.includes(PERMISSIONS.MANAGE_REFERRAL_PROGRAMS),
  );
  useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    try {
      const response = await referralProgramsApi.list<
        | { items?: (ReferralProgram & { rules?: ReferralRewardRule[] })[] }
        | (ReferralProgram & { rules?: ReferralRewardRule[] })[]
      >();
      setPrograms(Array.isArray(response) ? response : (response.items ?? []));
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : "Không thể tải chương trình giới thiệu",
      );
    } finally {
      setLoading(false);
    }
  }
  function addRule() {
    setForm((current) => ({
      ...current,
      rules: [...current.rules, newRule()],
    }));
  }
  function updateRule(index: number, patch: Partial<RuleDraft>) {
    setForm((current) => ({
      ...current,
      rules: current.rules.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule,
      ),
    }));
  }
  const duplicateTierIndexes = new Set<number>();
  const tierKeys = new Map<string, number>();
  form.rules.forEach((rule, index) => {
    const key = `${rule.referrer_type}:${rule.min_net_revenue}`;
    const firstIndex = tierKeys.get(key);
    if (firstIndex === undefined) {
      tierKeys.set(key, index);
      return;
    }
    duplicateTierIndexes.add(firstIndex);
    duplicateTierIndexes.add(index);
  });
  const hasInvalidDateRange = Boolean(
    form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.rules.length) {
      toast.error("Nhập tên và ít nhất một bậc thưởng");
      return;
    }
    if (hasInvalidDateRange) {
      toast.error("Ngày kết thúc phải sau ngày bắt đầu");
      return;
    }
    if (
      !Number.isInteger(form.priority) || form.priority < 0 || form.priority > 10_000 ||
      !Number.isInteger(form.conversion_window_days) || form.conversion_window_days < 1 || form.conversion_window_days > 3650 ||
      !Number.isInteger(form.review_window_days) || form.review_window_days < 1 || form.review_window_days > 365
    ) {
      toast.error("Kiểm tra ưu tiên, cửa sổ chuyển đổi và thời gian xét duyệt");
      return;
    }
    if (duplicateTierIndexes.size > 0) {
      toast.error("Mỗi loại người giới thiệu chỉ có một bậc cho cùng ngưỡng doanh thu");
      return;
    }
    if (
      form.rules.some(
        (rule) =>
          rule.min_net_revenue < 0 ||
          rule.value <= 0 ||
          (rule.reward_kind === "voucher" && !rule.voucher_valid_days) ||
          (rule.calculation_type === "percentage" && rule.value > 100),
      )
    ) {
      toast.error("Kiểm tra ngưỡng, giá trị thưởng và hạn dùng voucher");
      return;
    }
    setSaving(true);
    try {
      const saved = await referralProgramsApi.create<ReferralProgram>({
        ...form,
        name: form.name.trim(),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at
          ? new Date(form.ends_at).toISOString()
          : undefined,
        branch_ids: [],
      });
      setPrograms((current) => [saved, ...current]);
      setOpen(false);
      toast.success("Đã tạo chương trình ở phiên bản 1");
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : "Không thể lưu chương trình",
      );
    } finally {
      setSaving(false);
    }
  }
  async function setStatus(
    program: ReferralProgram,
    status: "draft" | "active" | "inactive",
  ) {
    try {
      const saved = await referralProgramsApi.updateStatus<ReferralProgram>(
        program.id,
        status,
      );
      setPrograms((current) =>
        current.map((item) =>
          item.id === saved.id ? { ...item, ...saved } : item,
        ),
      );
      toast.success("Đã cập nhật trạng thái chương trình");
    } catch (cause) {
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : "Không thể cập nhật trạng thái",
      );
    }
  }
  const visiblePrograms = programs
    .filter(
      (program) =>
        statusFilter === "all" || program.status === statusFilter,
    )
    .filter(
      (program) =>
        referrerTypeFilter === "all" ||
        program.rules?.some(
          (rule) => rule.referrer_type === referrerTypeFilter,
        ),
    )
    .sort((first, second) => {
      if (sort === "name") return first.name.localeCompare(second.name, "vi");
      if (sort === "newest") {
        return (
          new Date(second.starts_at).getTime() -
          new Date(first.starts_at).getTime()
        );
      }
      return second.priority - first.priority;
    });
  if (loading)
    return (
      <PageContainer>
        <LoadingReferralPanel />
      </PageContainer>
    );
  return (
    <PageContainer size="data">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Chương trình giới thiệu
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mỗi chính sách được version hóa; case đã ghi nhận giữ nguyên phiên
            bản áp dụng.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setForm(emptyProgram());
              setOpen(true);
            }}
          >
            Tạo chương trình
          </Button>
        )}
      </div>
      {programs.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Trạng thái
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as ProgramStatusFilter)
                }
                className="rounded-md border border-input bg-background px-3 py-2 font-normal"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="active">Đang áp dụng</option>
                <option value="draft">Nháp</option>
                <option value="inactive">Ngừng</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Loại người giới thiệu
              <select
                value={referrerTypeFilter}
                onChange={(event) =>
                  setReferrerTypeFilter(event.target.value as "all" | ReferrerType)
                }
                className="rounded-md border border-input bg-background px-3 py-2 font-normal"
              >
                <option value="all">Tất cả đối tượng</option>
                <option value="patient">Bệnh nhân</option>
                <option value="doctor">Bác sĩ</option>
                <option value="assistant">Phụ tá</option>
                <option value="partner">Đối tác</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Phân loại theo
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ProgramSort)}
                className="rounded-md border border-input bg-background px-3 py-2 font-normal"
              >
                <option value="priority">Ưu tiên cao nhất</option>
                <option value="newest">Hiệu lực mới nhất</option>
                <option value="name">Tên chương trình</option>
              </select>
            </label>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">
            Hiển thị {visiblePrograms.length}/{programs.length} chương trình
          </p>
        </div>
      )}
      <div className="grid gap-4">
        {!programs.length ? (
          <div className="rounded-xl border border-border bg-card">
            <ReferralEmpty>Chưa có chương trình giới thiệu.</ReferralEmpty>
          </div>
        ) : !visiblePrograms.length ? (
          <div className="rounded-xl border border-border bg-card">
            <ReferralEmpty>Không tìm thấy chương trình phù hợp bộ lọc.</ReferralEmpty>
          </div>
        ) : (
          visiblePrograms.map((program) => (
            <article
              key={program.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{program.name}</h2>
                    <span className="rounded bg-muted px-2 py-0.5 text-xs">
                      v{program.current_version}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${program.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}
                    >
                      {program.status === "active"
                        ? "Đang áp dụng"
                        : program.status === "draft"
                          ? "Nháp"
                          : "Ngừng"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ưu tiên {program.priority} ·{" "}
                    {program.conversion_window_days} ngày chuyển đổi ·{" "}
                    {program.review_window_days} ngày xét duyệt
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Hiệu lực {formatDate(program.starts_at)}
                    {program.ends_at
                      ? ` đến ${formatDate(program.ends_at)}`
                      : " trở đi"}{" "}
                    ·{" "}
                    {program.branch_ids.length
                      ? `${program.branch_ids.length} chi nhánh`
                      : "Tất cả chi nhánh"}
                  </p>
                </div>
                {canManage && (
                  <select
                    value={program.status}
                    onChange={(event) =>
                      void setStatus(
                        program,
                        event.target.value as "draft" | "active" | "inactive",
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="draft">Nháp</option>
                    <option value="active">Kích hoạt</option>
                    <option value="inactive">Ngừng</option>
                  </select>
                )}
              </div>
              {program.rules?.length ? (
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="p-2.5">Loại</th>
                        <th className="p-2.5 text-right">Ngưỡng doanh thu</th>
                        <th className="p-2.5">Thưởng</th>
                        <th className="p-2.5 text-right">Giá trị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {program.rules.map((rule) => (
                        <tr key={rule.id}>
                          <td className="p-2.5">
                            <ReferrerTypeLabel type={rule.referrer_type} />
                          </td>
                          <td className="p-2.5 text-right tabular-nums">
                            {rule.min_net_revenue.toLocaleString("vi-VN")} vnđ
                          </td>
                          <td className="p-2.5">
                            {rule.reward_kind === "cash"
                              ? "Tiền mặt"
                              : "Voucher"}{" "}
                            ·{" "}
                            {rule.calculation_type === "fixed"
                              ? "Cố định"
                              : "Phần trăm"}
                          </td>
                          <td className="p-2.5 text-right tabular-nums">
                            {rule.value.toLocaleString("vi-VN")}
                            {rule.calculation_type === "percentage"
                              ? "%"
                              : " vnđ"}
                            {rule.voucher_valid_days
                              ? ` · ${rule.voucher_valid_days} ngày`
                              : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Bậc thưởng được tải khi API trả chi tiết chương trình.
                </p>
              )}
            </article>
          ))
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>Tạo chương trình giới thiệu</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Tên chương trình
                <input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Bắt đầu
                <input
                  type="datetime-local"
                  required
                  value={form.starts_at}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      starts_at: event.target.value,
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Kết thúc
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ends_at: event.target.value,
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Ưu tiên
                <input
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: Number(event.target.value),
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Cửa sổ chuyển đổi (ngày)
                <input
                  type="number"
                  min={1}
                  value={form.conversion_window_days}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      conversion_window_days: Number(event.target.value),
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium">Bậc thưởng</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addRule}
                >
                  Thêm bậc
                </Button>
              </div>
              <div className="space-y-3">
                {form.rules.map((rule, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-12"
                  >
                    <select
                      value={rule.referrer_type}
                      onChange={(event) =>
                        updateRule(index, {
                          referrer_type: event.target.value as ReferrerType,
                        })
                      }
                      className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
                    >
                      <option value="patient">Bệnh nhân</option>
                      <option value="doctor">Bác sĩ</option>

                      <option value="assistant">Phụ tá</option>
                      <option value="partner">Đối tác</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="Ngưỡng doanh thu"
                      value={rule.min_net_revenue}
                      onChange={(event) =>
                        updateRule(index, {
                          min_net_revenue: Number(event.target.value),
                        })
                      }
                      className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-4"
                    />
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(7.5rem,0.9fr)_6rem_minmax(11rem,1.6fr)] md:col-span-6">
                      <select
                        value={rule.reward_kind}
                        onChange={(event) =>
                          updateRule(index, {
                            reward_kind: event.target
                              .value as RuleDraft["reward_kind"],
                          })
                        }
                        className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="cash">Tiền mặt</option>
                        <option value="voucher">Voucher</option>
                      </select>
                      <select
                        value={rule.calculation_type}
                        onChange={(event) =>
                          updateRule(index, {
                            calculation_type: event.target
                              .value as RuleDraft["calculation_type"],
                          })
                        }
                        className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="fixed">Cố định</option>
                        <option value="percentage">%</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        placeholder="Giá trị"
                        value={rule.value || ""}
                        onChange={(event) =>
                          updateRule(index, {
                            value: Number(event.target.value),
                          })
                        }
                        className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    {rule.reward_kind === "voucher" && (

                      <input
                        type="number"
                        min={1}
                        placeholder="Hạn voucher (ngày)"
                        value={rule.voucher_valid_days ?? ""}
                        onChange={(event) =>
                          updateRule(index, {
                            voucher_valid_days: Number(event.target.value),
                          })
                        }
                        className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-12"
                      />
                    )}
                    {form.rules.length > 1 && (
                      <button

                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            rules: current.rules.filter(
                              (_, position) => position !== index,
                            ),
                          }))
                        }
                        className="text-left text-xs text-destructive md:col-span-12"
                      >
                        Xóa bậc này
                      </button>

                    )}
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Đang lưu..." : "Tạo chương trình"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </PageContainer>
  );
}
