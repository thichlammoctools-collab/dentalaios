import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePlatformAuth } from "@/lib/platform-auth-context";

type Locale = "vi" | "en";
type MarketingPage = "home" | "features" | "pricing" | "guides" | "contact";

const pages: Array<{ id: MarketingPage; label: string; path: string; description: string }> = [
  { id: "home", label: "Trang chủ", path: "/vi", description: "Thông điệp chính, CTA và các khối giới thiệu." },
  { id: "features", label: "Tính năng", path: "/vi/features", description: "Nhóm tính năng và lợi ích vận hành." },
  { id: "pricing", label: "Bảng giá", path: "/vi/pricing", description: "Gói dịch vụ, giá và điều kiện hiển thị." },
  { id: "guides", label: "Hướng dẫn", path: "/vi/guides", description: "Danh mục bài hướng dẫn và nội dung hỗ trợ." },
  { id: "contact", label: "Liên hệ", path: "/vi/contact", description: "Thông tin liên hệ, biểu mẫu và cam kết phản hồi." },
];

const initialCopy = {
  vi: {
    home: { eyebrow: "Do bác sĩ RHM làm cho bác sĩ RHM", title: "Đúng công cụ bác sĩ chủ phòng khám cần. Không hơn, không thiếu.", body: "AI Copilot hỗ trợ khám, chẩn đoán, lập kế hoạch và ghi nhận bằng giọng nói, cùng quản lý ghế và lịch hẹn trong một nhịp làm việc tự nhiên.", cta: "Đặt lịch triển khai" },
    features: { eyebrow: "Khác biệt cốt lõi", title: "Làm sâu việc lâm sàng. Làm nhẹ việc điều hành.", body: "Tập trung bệnh án theo từng răng, AI Copilot, ghế thông minh, referral, LarkSuite và dữ liệu trên server riêng.", cta: "Khám phá tính năng" },
    pricing: { eyebrow: "Gói triển khai giới hạn", title: "Một gói duy nhất. Cấu hình đúng cho phòng khám của bạn.", body: "100.000.000đ một lần cấu hình cài đặt; áp dụng đến 31/12/2026 cho 5 khách hàng đầu tiên.", cta: "Đặt lịch triển khai" },
    guides: { eyebrow: "Trung tâm hướng dẫn", title: "Đưa quy trình vào đúng nhịp, từ ngày đầu tiên.", body: "Các hướng dẫn ngắn gọn giúp đội ngũ triển khai DentalAI OS tự tin hơn.", cta: "Đọc hướng dẫn" },
    contact: { eyebrow: "Liên hệ đội ngũ", title: "Hãy kể chúng tôi nghe về phòng khám của bạn.", body: "Chúng tôi sẽ cùng bạn xem xét quy trình hiện tại và đề xuất cách triển khai phù hợp.", cta: "Gửi yêu cầu" },
  },
  en: {
    home: { eyebrow: "Built by dentists, for dentists", title: "The right tools for dental clinic owners. Nothing more, nothing less.", body: "An AI Copilot for examination, diagnosis, planning, and voice-first capture, with smart chair management and scheduling.", cta: "Book implementation" },
    features: { eyebrow: "Core differences", title: "Go deep on clinical care. Keep operations light.", body: "Focused on per-tooth records, AI Copilot, smart chairs, referral, LarkSuite, and data on a private server.", cta: "Explore features" },
    pricing: { eyebrow: "Limited implementation package", title: "One package. Configured for your clinic.", body: "VND 100,000,000 for one-time configuration and installation; available to the first five customers through December 31, 2026.", cta: "Book implementation" },
    guides: { eyebrow: "Guidance center", title: "Set your workflow in motion from day one.", body: "Short, practical guides help teams use DentalAI OS confidently every day.", cta: "Read guide" },
    contact: { eyebrow: "Contact the team", title: "Tell us about your clinic.", body: "We will review your current workflow and suggest a suitable rollout path.", cta: "Send request" },
  },
} as const;

export function PlatformWebsitePage() {
  const { hasPermission } = usePlatformAuth();
  const canWrite = hasPermission("platform_content.write");
  const [locale, setLocale] = useState<Locale>("vi");
  const [selectedPage, setSelectedPage] = useState<MarketingPage>("home");
  const [copy, setCopy] = useState(initialCopy);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [published, setPublished] = useState(true);
  const selected = pages.find((page) => page.id === selectedPage)!;
  const selectedCopy = copy[locale][selectedPage];

  function update(field: keyof typeof selectedCopy, value: string) {
    setCopy((current) => ({ ...current, [locale]: { ...current[locale], [selectedPage]: { ...current[locale][selectedPage], [field]: value } } }));
    setSavedAt(null);
  }

  function saveDraft() {
    setSavedAt(new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(new Date()));
  }

  function publish() {
    setPublished(true);
    setPublishOpen(false);
    setSavedAt(new Intl.DateTimeFormat("vi-VN", { timeStyle: "short" }).format(new Date()));
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-6 p-4 sm:p-7 lg:px-8 lg:py-8 2xl:px-10">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">Website marketing</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Quản trị nội dung website</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Biên tập nội dung giới thiệu, tính năng, bảng giá, hướng dẫn và liên hệ cho phiên bản Tiếng Việt và English.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={published ? "rounded-full bg-[#10382d] px-2.5 py-1 text-xs font-medium text-[#86efac]" : "rounded-full bg-[#3a2b12] px-2.5 py-1 text-xs font-medium text-[#fbbf24]"}>{published ? "Đang xuất bản" : "Có thay đổi chưa xuất bản"}</span>
          <Link to={locale === "vi" ? selected.path : selected.path.replace("/vi", "/en")} target="_blank" className="rounded-md border border-[#263650] px-3 py-2 text-sm font-medium text-[#c9d5e5] transition hover:bg-[#16233a]">Mở website ↗</Link>
          {canWrite && <Button onClick={() => setPublishOpen(true)}>Xuất bản thay đổi</Button>}
        </div>
      </div>

      <Card className="border-[#2b405e] bg-[#0d1526]">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300">◎</span><div><p className="text-sm font-medium text-foreground">Quy trình xuất bản an toàn</p><p className="text-xs text-muted-foreground">Lưu bản nháp trước, rà soát trên bản xem trước, rồi xuất bản riêng cho mỗi ngôn ngữ.</p></div></div>
          <span className="text-xs text-muted-foreground">Lần xuất bản gần nhất: 07/08/2026, 08:45</span>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)_minmax(19rem,.8fr)]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Nội dung trang</CardTitle><CardDescription>Chọn trang cần cập nhật.</CardDescription></CardHeader>
          <CardContent className="space-y-1">
            {pages.map((page) => <button key={page.id} type="button" onClick={() => { setSelectedPage(page.id); setSavedAt(null); }} className={`w-full rounded-lg p-3 text-left transition ${page.id === selectedPage ? "bg-[#12364a] text-[#f1f5f9] shadow-[inset_3px_0_0_#16c7e5]" : "text-[#c9d5e5] hover:bg-[#16233a]"}`}><span className="block text-sm font-medium">{page.label}</span><span className={`mt-1 block text-xs leading-4 ${page.id === selectedPage ? "text-[#a5ddea]" : "text-[#aabbd0]"}`}>{page.description}</span></button>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div><CardTitle>Biên tập {selected.label}</CardTitle><CardDescription>Thay đổi chỉ áp dụng cho phiên bản ngôn ngữ đang chọn.</CardDescription></div>
            <div className="flex rounded-md border border-[#263650] p-0.5 text-xs"><button type="button" onClick={() => setLocale("vi")} className={`rounded px-3 py-1.5 font-medium ${locale === "vi" ? "bg-[#164e63] text-cyan-100" : "text-[#aabbd0]"}`}>VI</button><button type="button" onClick={() => setLocale("en")} className={`rounded px-3 py-1.5 font-medium ${locale === "en" ? "bg-[#164e63] text-cyan-100" : "text-[#aabbd0]"}`}>EN</button></div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2"><Label htmlFor="eyebrow">Nhãn đầu trang</Label><Input id="eyebrow" value={selectedCopy.eyebrow} disabled={!canWrite} onChange={(event) => update("eyebrow", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="title">Tiêu đề chính</Label><Textarea id="title" rows={3} value={selectedCopy.title} disabled={!canWrite} onChange={(event) => update("title", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="body">Mô tả</Label><Textarea id="body" rows={5} value={selectedCopy.body} disabled={!canWrite} onChange={(event) => update("body", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="cta">Nút kêu gọi hành động</Label><Input id="cta" value={selectedCopy.cta} disabled={!canWrite} onChange={(event) => update("cta", event.target.value)} /></div>
            {canWrite && <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5"><Button onClick={saveDraft}>Lưu bản nháp</Button><button type="button" onClick={() => setCopy(initialCopy)} className="text-sm font-medium text-[#aabbd0] hover:text-[#f1f5f9]">Khôi phục nội dung gốc</button>{savedAt && <span className="text-xs text-[#86efac]">Đã lưu lúc {savedAt}</span>}</div>}
          </CardContent>
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader><CardTitle>Xem trước</CardTitle><CardDescription>Phiên bản {locale === "vi" ? "Tiếng Việt" : "English"} trên website.</CardDescription></CardHeader>
          <CardContent className="p-4 pt-0"><div className="overflow-hidden rounded-lg border border-[#d5e1d7] bg-[#f7f8f5] text-[#13251f]"><div className="flex h-8 items-center gap-1 border-b border-[#dce4de] bg-white px-3"><span className="size-1.5 rounded-full bg-[#e89578]" /><span className="size-1.5 rounded-full bg-[#e7c56d]" /><span className="size-1.5 rounded-full bg-[#76bd9a]" /><span className="ml-2 text-[9px] text-[#789087]">dentalaios.com</span></div><div className="p-6"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#367461]">{selectedCopy.eyebrow}</p><h2 className="mt-3 text-xl font-semibold leading-tight tracking-tight text-[#123c31]">{selectedCopy.title}</h2><p className="mt-3 text-xs leading-5 text-[#5c756b]">{selectedCopy.body}</p><span className="mt-5 inline-block rounded-md bg-[#123c31] px-3 py-2 text-xs font-semibold text-white">{selectedCopy.cta}</span></div></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Bản xem trước thể hiện phần mở đầu của trang. Khối nội dung chi tiết sẽ được quản trị theo từng module trong bước tiếp theo.</p></CardContent>
        </Card>
      </div>

      {publishOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="w-full max-w-lg rounded-xl border border-[#2b405e] bg-[#111b2e] p-6 shadow-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#67e8f9]">Xác nhận xuất bản</p><h2 id="publish-title" className="mt-2 text-xl font-semibold text-[#f1f5f9]">Xuất bản thay đổi cho website?</h2><p className="mt-3 text-sm leading-6 text-[#aabbd0]">Nội dung {locale === "vi" ? "Tiếng Việt" : "English"} trên trang {selected.label.toLowerCase()} sẽ hiển thị công khai ngay sau khi xuất bản.</p><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setPublishOpen(false)}>Hủy</Button><Button onClick={publish}>Xác nhận xuất bản</Button></div></div></div>}
    </div>
  );
}
