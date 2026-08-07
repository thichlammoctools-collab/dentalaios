import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Check,
  CircleHelp,
  Clock3,
  Globe2,
  HeartPulse,
  Mail,
  Menu,
  MessagesSquare,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/theme";

type Locale = "vi" | "en";
type Page = "home" | "features" | "pricing" | "guides" | "contact";

const content = {
  vi: {
    language: "Tiếng Việt",
    brandNote: "Phần mềm cho bác sĩ RHM chủ phòng khám",
    nav: { home: "Trang chủ", features: "Tính năng", pricing: "Bảng giá", guides: "Hướng dẫn", contact: "Liên hệ" },
    login: "Đăng nhập",
    start: "Đặt lịch triển khai",
    demo: "Trải nghiệm demo",
    heroEyebrow: "Do bác sĩ RHM làm cho bác sĩ RHM",
    heroTitle: "Đúng công cụ bác sĩ chủ phòng khám cần. Không hơn, không thiếu.",
    heroBody: "DentalAI OS là AI Copilot cho khám, chẩn đoán và lập kế hoạch điều trị. Ghi nhận bằng giọng nói, quản lý ghế và lịch hẹn trong một nhịp làm việc tự nhiên của bác sĩ RHM.",
    trusted: "Thiết kế tối giản, tập trung vào điều trị và điều hành phòng khám",
    metric1: "ghi nhận nhanh bằng giọng nói",
    metric2: "lịch sử điều trị theo từng răng",
    metric3: "dữ liệu trên server riêng",
    workflowEyebrow: "Chỉ giữ lại điều bác sĩ thực sự cần",
    workflowTitle: "Từ ghế điều trị đến kế hoạch rõ ràng.",
    workflowBody: "Không nhồi thêm những tính năng LarkSuite đã làm tốt. DentalAI OS tập trung sâu vào công việc lâm sàng, vận hành ghế và lịch hẹn của phòng khám RHM.",
    workflows: ["Khám và ghi nhận bằng giọng nói", "AI Copilot hỗ trợ chẩn đoán", "Lập kế hoạch và theo dõi theo răng", "Điều phối ghế, lịch hẹn và đội ngũ"],
    featureEyebrow: "Khác biệt dành cho RHM",
    featureTitle: "Một hệ điều hành lâm sàng nhẹ nhàng cho bác sĩ chủ phòng khám.",
    featureBody: "Giao diện tối giản, các quyết định cần thiết luôn ở đúng chỗ và dữ liệu luôn thuộc quyền kiểm soát của phòng khám.",
    featureCards: [
      { title: "AI Copilot lâm sàng", body: "Hỗ trợ khám, chẩn đoán và lập kế hoạch; ghi nhận nhanh bằng giọng nói để bác sĩ không phải gõ." },
      { title: "Ghế và lịch hẹn thông minh", body: "Điều phối ghế, bác sĩ và lịch hẹn trực quan để cả phòng khám luôn chủ động." },
      { title: "Bệnh án theo từng răng", body: "Theo dõi bệnh án điện tử và toàn bộ lịch sử điều trị trên từng răng, không mất ngữ cảnh." },
    ],
    seeFeatures: "Khám phá tính năng",
    ctaTitle: "Triển khai hệ điều hành đúng cho phòng khám RHM của bạn.",
    ctaBody: "Một gói cấu hình và cài đặt riêng trên server của phòng khám, dành cho 5 khách hàng đầu tiên đến 31/12/2026.",
    footerTagline: "AI Copilot và hệ điều hành lâm sàng cho phòng khám RHM.",
    footerProduct: "Sản phẩm",
    footerCompany: "Công ty",
    legal: "Bảo mật & Điều khoản",
    featuresEyebrow: "Khác biệt cốt lõi",
    featuresTitle: "Làm sâu việc lâm sàng. Làm nhẹ việc điều hành.",
    featuresBody: "DentalAI OS được xây dựng bởi bác sĩ RHM cho bác sĩ RHM: đúng những gì cần trong phòng khám, không lặp lại những gì LarkSuite đã đáp ứng.",
    featureDetails: [
      { title: "AI Copilot và ghi nhận giọng nói", body: "AI đồng hành trong khám, chẩn đoán và lên kế hoạch điều trị; bác sĩ nói, hệ thống ghi nhận có cấu trúc.", points: ["Không cần gõ ghi chú lâm sàng", "Gợi ý chẩn đoán và kế hoạch", "Giữ bác sĩ tập trung vào người bệnh"] },
      { title: "Ghế thông minh, lịch hẹn tiện dụng", body: "Một giao diện trực quan để điều phối ghế điều trị, bác sĩ và bệnh nhân theo nhịp làm việc thực tế.", points: ["Nhìn nhanh công suất từng ghế", "Hạn chế trùng lịch và thời gian chờ", "Lịch hẹn rõ ràng cho lễ tân và bác sĩ"] },
      { title: "Bệnh án điện tử theo từng răng", body: "Toàn bộ lần khám, chẩn đoán, hình ảnh và điều trị được kết nối đúng vị trí trên hàm răng.", points: ["Lịch sử điều trị từng răng", "Kế hoạch điều trị dễ theo dõi", "Hồ sơ lâm sàng không mất ngữ cảnh"] },
      { title: "Referral, LarkSuite và bảo mật riêng", body: "Xây dựng chính sách referral cho bác sĩ, nhân viên, khách hàng; đồng bộ công việc với LarkSuite và giữ dữ liệu trên server riêng.", points: ["Chính sách referral linh hoạt", "Phân công, phân quyền rõ ràng", "Phòng khám sở hữu 100% dữ liệu"] },
    ],
    pricingEyebrow: "Gói triển khai giới hạn",
    pricingTitle: "Một gói duy nhất. Cấu hình đúng cho phòng khám của bạn.",
    pricingBody: "Áp dụng đến 31/12/2026 cho 5 khách hàng đầu tiên.",
    monthly: "",
    annually: "",
    save: "",
    perMonth: "",
    popular: "Ưu đãi 5 khách hàng đầu tiên",
    choose: "Đặt lịch triển khai",
    talk: "Đặt lịch trao đổi",
    plans: [
      { name: "Cấu hình & cài đặt DentalAI OS", price: "100.000.000đ", description: "Chi phí một lần cho cấu hình và cài đặt hệ thống trên server riêng của phòng khám.", features: ["AI Copilot, bệnh án điện tử và lịch sử theo răng", "Quản lý ghế, lịch hẹn và chính sách referral", "Phân công, phân quyền và đồng bộ công việc với LarkSuite", "Cài đặt trên server riêng, phòng khám sở hữu dữ liệu"] },
    ],
    pricingNote: "Gói không bao gồm chi phí điều chỉnh theo mong muốn riêng. Áp dụng đến 31/12/2026 cho 5 khách hàng đầu tiên.",
    guidesEyebrow: "Trung tâm hướng dẫn",
    guidesTitle: "Đưa quy trình vào đúng nhịp, từ ngày đầu tiên.",
    guidesBody: "Các hướng dẫn ngắn gọn giúp đội ngũ triển khai DentalAI OS tự tin hơn trong công việc hằng ngày.",
    search: "Tìm trong hướng dẫn",
    readGuide: "Đọc hướng dẫn",
    guideItems: [
      { category: "Bắt đầu", time: "5 phút", title: "Thiết lập phòng khám và vai trò đội ngũ", body: "Tạo cấu trúc cơ sở, mời nhân sự và phân quyền cho từng vị trí." },
      { category: "Lịch hẹn", time: "4 phút", title: "Tạo lịch hẹn và điều phối ghế điều trị", body: "Sắp xếp lịch hiệu quả để cả bệnh nhân và đội ngũ luôn chủ động." },
      { category: "Lâm sàng", time: "8 phút", title: "Ghi nhận lần khám đầu tiên", body: "Lưu triệu chứng, chẩn đoán, hình ảnh và chỉ định trong hồ sơ bệnh nhân." },
      { category: "Điều trị", time: "6 phút", title: "Lập và theo dõi kế hoạch điều trị", body: "Chuyển phát hiện lâm sàng thành lộ trình rõ ràng, có thể theo dõi." },
      { category: "Báo cáo", time: "5 phút", title: "Đọc báo cáo vận hành hàng ngày", body: "Nắm hoạt động tại ghế, doanh thu và các điểm cần xử lý." },
      { category: "Quản trị", time: "3 phút", title: "Quản lý tài khoản và quyền truy cập", body: "Giữ dữ liệu an toàn khi đội ngũ thay đổi hoặc mở rộng." },
    ],
    contactEyebrow: "Liên hệ đội ngũ",
    contactTitle: "Hãy kể chúng tôi nghe về phòng khám của bạn.",
    contactBody: "Chúng tôi sẽ cùng bạn xem xét quy trình hiện tại và đề xuất cách triển khai phù hợp nhất.",
    contactAside: "Một cuộc trao đổi tốt bắt đầu bằng việc hiểu đúng công việc mỗi ngày của đội ngũ.",
    name: "Họ và tên",
    email: "Email công việc",
    phone: "Số điện thoại",
    message: "Phòng khám của bạn cần hỗ trợ gì?",
    send: "Gửi yêu cầu",
    sent: "Cảm ơn bạn. Đội ngũ sẽ phản hồi trong thời gian sớm nhất.",
    contactEmail: "hello@dentalaios.com",
    response: "Phản hồi trong 1 ngày làm việc",
  },
  en: {
    language: "English",
    brandNote: "Built by dentists, for dental clinic owners",
    nav: { home: "Home", features: "Features", pricing: "Pricing", guides: "Guides", contact: "Contact" },
    login: "Log in", start: "Book implementation", demo: "Try the demo",
    heroEyebrow: "Built by dentists, for dentists",
    heroTitle: "The right tools for dental clinic owners. Nothing more, nothing less.",
    heroBody: "DentalAI OS is an AI Copilot for examination, diagnosis, and treatment planning, with voice capture, smart chair management, and scheduling in one natural clinical workflow.",
    trusted: "Purposefully designed around clinical care and clinic operations",
    metric1: "voice-first clinical capture", metric2: "treatment history per tooth", metric3: "data on your own server",
    workflowEyebrow: "Only what a dentist truly needs", workflowTitle: "From the treatment chair to a clear plan.", workflowBody: "We do not duplicate what LarkSuite already does well. DentalAI OS goes deep into clinical work, chair management, and appointment operations.",
    workflows: ["Examination with voice capture", "AI Copilot-assisted diagnosis", "Per-tooth treatment planning", "Chair, appointment, and team coordination"],
    featureEyebrow: "Built differently for dentists", featureTitle: "A focused clinical operating system for clinic owners.", featureBody: "A calm, simple interface keeps essential decisions in reach while the clinic keeps full control of its own data.",
    featureCards: [
      { title: "Clinical AI Copilot", body: "Support examination, diagnosis, and planning with voice-first capture, so dentists do not need to type." },
      { title: "Smart chairs and appointments", body: "Coordinate chairs, clinicians, and appointments in a clear view that keeps the clinic ahead." },
      { title: "Records by tooth", body: "Follow electronic records and complete treatment history for every tooth without losing clinical context." },
    ],
    seeFeatures: "Explore features", ctaTitle: "Implement the right operating system for your dental clinic.", ctaBody: "A private-server configuration and installation package for the first five clinics through December 31, 2026.", footerTagline: "AI Copilot and clinical operating system for dental clinics.", footerProduct: "Product", footerCompany: "Company", legal: "Privacy & terms",
    featuresEyebrow: "Core differences", featuresTitle: "Go deep on clinical care. Keep operations light.", featuresBody: "DentalAI OS is built by dentists for dentists: what the clinic needs, without duplicating the work LarkSuite already covers.",
    featureDetails: [
      { title: "AI Copilot and voice capture", body: "AI supports examination, diagnosis, and treatment planning while dentists speak and the system captures structured records.", points: ["No typing for clinical notes", "Diagnosis and planning suggestions", "Stay focused on the patient"] },
      { title: "Smart chairs and practical appointments", body: "A visual workspace coordinates treatment chairs, clinicians, and patients around the clinic's real operating rhythm.", points: ["See chair capacity at a glance", "Reduce schedule conflicts and waits", "Clear appointments for front desk and clinicians"] },
      { title: "Electronic records by tooth", body: "Every visit, diagnosis, image, and treatment connects to the right position in the dental chart.", points: ["Treatment history for each tooth", "Easy-to-follow treatment plans", "Clinical records that preserve context"] },
      { title: "Referral, LarkSuite, and private security", body: "Create referral policies for dentists, staff, and patients; sync work with LarkSuite while keeping data on your private server.", points: ["Flexible referral policies", "Clear assignments and permissions", "Your clinic owns 100% of its data"] },
    ],
    pricingEyebrow: "Limited implementation package", pricingTitle: "One package. Configured for your clinic.", pricingBody: "Available to the first five customers through December 31, 2026.", monthly: "", annually: "", save: "", perMonth: "", popular: "First five customers offer", choose: "Book implementation", talk: "Book a consultation",
    plans: [
      { name: "DentalAI OS Configuration & Installation", price: "VND 100,000,000", description: "One-time configuration and installation on your clinic's private server.", features: ["AI Copilot, electronic records, and per-tooth history", "Chair management, appointments, and referral policies", "Clear assignments, permissions, and LarkSuite work sync", "Private-server installation with clinic-owned data"] },
    ],
    pricingNote: "The package excludes custom changes requested by the clinic. Available to the first five customers through December 31, 2026.",
    guidesEyebrow: "Guidance center", guidesTitle: "Set your workflow in motion from day one.", guidesBody: "Short, practical guides that help your team use DentalAI OS confidently in daily work.", search: "Search guides", readGuide: "Read guide",
    guideItems: [
      { category: "Getting started", time: "5 min", title: "Set up your clinic and team roles", body: "Create your clinic structure, invite your people, and assign the right access." },
      { category: "Scheduling", time: "4 min", title: "Create appointments and coordinate chairs", body: "Build an efficient schedule that keeps patients and your team ahead." },
      { category: "Clinical", time: "8 min", title: "Document your first patient visit", body: "Capture symptoms, diagnoses, images, and orders in the patient record." },
      { category: "Treatment", time: "6 min", title: "Build and follow a treatment plan", body: "Turn clinical findings into a clear, trackable path forward." },
      { category: "Reporting", time: "5 min", title: "Read your daily operating report", body: "Understand chair activity, revenue, and the items that need attention." },
      { category: "Administration", time: "3 min", title: "Manage accounts and access", body: "Keep clinic data secure as your team changes and grows." },
    ],
    contactEyebrow: "Contact the team", contactTitle: "Tell us about your clinic.", contactBody: "We will review your current workflow and suggest the most suitable path to rollout.", contactAside: "A productive conversation begins with understanding your team's everyday work.", name: "Your name", email: "Work email", phone: "Phone number", message: "How can we support your clinic?", send: "Send request", sent: "Thank you. Our team will respond as soon as possible.", contactEmail: "hello@dentalaios.com", response: "We respond within one business day",
  },
} as const;

function getPage(pathname: string): Page {
  if (pathname.includes("/features")) return "features";
  if (pathname.includes("/pricing")) return "pricing";
  if (pathname.includes("/guides")) return "guides";
  if (pathname.includes("/contact")) return "contact";
  return "home";
}

function getLocale(pathname: string): Locale {
  return pathname.startsWith("/en") ? "en" : "vi";
}

export function MarketingSite() {
  const location = useLocation();
  const locale = getLocale(location.pathname);
  const page = getPage(location.pathname);
  const t = content[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const { theme, toggle } = useTheme();

  const href = (target: Page) => `/${locale}${target === "home" ? "" : `/${target}`}`;
  const switchLocale = `/${locale === "vi" ? "en" : "vi"}${page === "home" ? "" : `/${page}`}`;

  return (
    <main className="marketing-site min-h-svh bg-[#f7f8f5] text-[#13251f]">
      <header className="sticky top-0 z-30 border-b border-[#dce4de]/80 bg-[#f7f8f5]/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link className="flex items-center gap-3" to={href("home")}>
            <span className="grid size-9 place-items-center rounded-xl bg-[#123c31] text-white"><HeartPulse size={19} strokeWidth={2.4} /></span>
            <span><strong className="block text-[15px] tracking-tight">DentalAI OS</strong><small className="hidden text-[10px] font-medium uppercase tracking-[0.11em] text-[#6f8079] sm:block">{t.brandNote}</small></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {(Object.keys(t.nav) as Page[]).map((item) => <Link key={item} to={href(item)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${page === item ? "bg-[#e7eee8] text-[#123c31]" : "text-[#587068] hover:bg-[#edf2ed]"}`}>{t.nav[item]}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link to={switchLocale} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#406258] hover:bg-[#edf2ed]"><Globe2 size={15} />{locale === "vi" ? "EN" : "VI"}</Link>
            <button type="button" onClick={toggle} aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"} className="marketing-theme-toggle grid size-9 place-items-center rounded-lg text-[#406258] transition hover:bg-[#edf2ed]">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#245044]">{t.login}</Link>
            <Link to={href("contact")} className="rounded-lg bg-[#123c31] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c3026]">{t.start}</Link>
          </div>
          <button aria-label="Toggle menu" className="grid size-10 place-items-center rounded-lg text-[#123c31] lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
        {menuOpen && <div className="border-t border-[#dce4de] bg-[#f7f8f5] px-5 pb-5 lg:hidden"><nav className="grid gap-1 pt-3">{(Object.keys(t.nav) as Page[]).map((item) => <Link key={item} onClick={() => setMenuOpen(false)} to={href(item)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#245044]">{t.nav[item]}</Link>)}<Link to={switchLocale} className="mt-2 rounded-lg border border-[#d4dfd6] px-3 py-3 text-sm font-semibold">{locale === "vi" ? "English" : "Tiếng Việt"}</Link><button type="button" onClick={toggle} className="marketing-theme-toggle mt-2 flex items-center justify-center gap-2 rounded-lg border border-[#d4dfd6] px-3 py-3 text-sm font-semibold">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}{theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}</button></nav></div>}
      </header>

      {page === "home" && <Home t={t} href={href} />}
      {page === "features" && <Features t={t} href={href} />}
      {page === "pricing" && <Pricing t={t} href={href} />}
      {page === "guides" && <Guides t={t} />}
      {page === "contact" && <Contact t={t} sent={sent} onSend={() => setSent(true)} />}

      <Footer t={t} href={href} />
    </main>
  );
}

type SiteContent = typeof content.vi;
type Href = (page: Page) => string;

function Home({ t, href }: { t: SiteContent; href: Href }) {
  return <>
    <section className="relative overflow-hidden"><div className="absolute left-1/2 top-0 -z-0 size-[760px] -translate-x-1/2 rounded-full bg-[#dcecdf] blur-3xl" /><div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-18 lg:px-8 lg:pb-28 lg:pt-28"><div className="grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]"><div><p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#367461]"><Sparkles size={15} />{t.heroEyebrow}</p><h1 className="max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#123c31] sm:text-5xl lg:text-6xl">{t.heroTitle}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#587068]">{t.heroBody}</p><div className="mt-9 flex flex-wrap gap-3"><Link to={href("contact")} className="inline-flex items-center gap-2 rounded-xl bg-[#123c31] px-5 py-3.5 font-semibold text-white shadow-lg shadow-[#123c31]/15">{t.start}<ArrowRight size={17} /></Link><Link to={href("features")} className="inline-flex items-center gap-2 rounded-xl border border-[#cfddd2] bg-white/70 px-5 py-3.5 font-semibold text-[#245044]">{t.seeFeatures}</Link></div></div><ClinicPreview t={t} /></div></div></section>
    <section className="border-y border-[#dce4de] bg-white/60"><div className="mx-auto max-w-7xl px-5 py-8 lg:px-8"><p className="mb-5 text-center text-xs font-bold uppercase tracking-[0.14em] text-[#789087]">{t.trusted}</p><div className="grid grid-cols-3 divide-x divide-[#dce4de]"><Metric value="40%" text={t.metric1} /><Metric value="360°" text={t.metric2} /><Metric value="100%" text={t.metric3} /></div></div></section>
    <section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:py-28"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#367461]">{t.workflowEyebrow}</p><h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#123c31] sm:text-4xl">{t.workflowTitle}</h2><p className="mt-5 max-w-md leading-7 text-[#587068]">{t.workflowBody}</p></div><div className="grid gap-3">{t.workflows.map((item, index) => <div key={item} className="flex items-center gap-5 rounded-2xl border border-[#dce6de] bg-white p-5 shadow-sm"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e5f0e7] text-sm font-bold text-[#196149]">0{index + 1}</span><span className="font-semibold text-[#20473b]">{item}</span><ArrowRight className="ml-auto text-[#80a192]" size={19} /></div>)}</div></section>
    <section className="bg-[#123c31] py-20 text-white"><div className="mx-auto max-w-7xl px-5 lg:px-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9fd2b7]">{t.featureEyebrow}</p><div className="mt-4 flex flex-col justify-between gap-5 md:flex-row"><h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{t.featureTitle}</h2><p className="max-w-md leading-7 text-[#c5ded1]">{t.featureBody}</p></div><div className="mt-12 grid gap-4 md:grid-cols-3">{t.featureCards.map((feature, index) => <div key={feature.title} className="rounded-2xl border border-white/15 bg-white/5 p-6"><span className="mb-12 grid size-10 place-items-center rounded-xl bg-[#75c4a0] text-[#123c31]">{index === 0 ? <BookOpen size={20} /> : index === 1 ? <CalendarCheck size={20} /> : <Sparkles size={20} />}</span><h3 className="text-lg font-semibold">{feature.title}</h3><p className="mt-3 leading-7 text-[#c5ded1]">{feature.body}</p></div>)}</div></div></section>
    <Cta t={t} href={href} />
  </>;
}

function ClinicPreview({ t }: { t: SiteContent }) { return <div className="relative mx-auto w-full max-w-lg"><div className="absolute -inset-4 rounded-[2rem] bg-[#87c5a0]/25 blur-2xl" /><div className="relative overflow-hidden rounded-[1.5rem] border border-white/80 bg-[#fdfefd] p-4 shadow-2xl shadow-[#123c31]/15"><div className="flex items-center justify-between border-b border-[#e4ece5] pb-4"><div className="flex gap-2"><i className="size-2.5 rounded-full bg-[#e89578]" /><i className="size-2.5 rounded-full bg-[#e7c56d]" /><i className="size-2.5 rounded-full bg-[#76bd9a]" /></div><span className="text-xs font-semibold text-[#779087]">DentalAI OS</span></div><div className="mt-4 grid grid-cols-[88px_1fr] gap-4"><aside className="rounded-xl bg-[#eff5ef] p-3"><HeartPulse size={18} className="text-[#2d7258]" /><div className="mt-5 space-y-3">{[1, 2, 3, 4].map((x) => <span key={x} className={`block h-2 rounded-full ${x === 1 ? "bg-[#378367]" : "bg-[#cadbcd]"}`} />)}</div></aside><div><div className="flex items-center justify-between"><div><p className="text-xs text-[#6c877c]">{t.workflows[0]}</p><p className="text-lg font-bold text-[#173e32]">09:30</p></div><span className="rounded-full bg-[#e3f2e6] px-2.5 py-1 text-[10px] font-bold text-[#287154]">TODAY</span></div><div className="mt-4 rounded-xl bg-[#123c31] p-4 text-white"><p className="text-xs text-[#b7d5c1]">Nguyen Minh Anh</p><p className="mt-1 text-sm font-semibold">Treatment consultation</p><div className="mt-4 h-1.5 rounded-full bg-white/15"><div className="h-full w-2/3 rounded-full bg-[#87d0a7]" /></div></div><div className="mt-3 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[#dbe7dd] p-3"><p className="text-[10px] text-[#799287]">Chair 02</p><p className="mt-1 text-sm font-bold text-[#21483c]">Available</p></div><div className="rounded-xl border border-[#dbe7dd] p-3"><p className="text-[10px] text-[#799287]">Patients</p><p className="mt-1 text-sm font-bold text-[#21483c]">12 today</p></div></div></div></div></div></div> }
function Metric({ value, text }: { value: string; text: string }) { return <div className="px-3 text-center sm:px-8"><strong className="block text-2xl tracking-tight text-[#1c4d3e] sm:text-3xl">{value}</strong><span className="mt-1 block text-xs leading-4 text-[#6b8379] sm:text-sm">{text}</span></div>; }

function Features({ t, href }: { t: SiteContent; href: Href }) { return <><PageIntro eyebrow={t.featuresEyebrow} title={t.featuresTitle} body={t.featuresBody} /><section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><div className="grid gap-5 md:grid-cols-2">{t.featureDetails.map((feature, index) => <article key={feature.title} className="rounded-3xl border border-[#dce6de] bg-white p-7 sm:p-9"><span className="grid size-11 place-items-center rounded-xl bg-[#e6f1e8] text-[#277057]">{index === 0 ? <CalendarCheck /> : index === 1 ? <HeartPulse /> : index === 2 ? <Sparkles /> : <ShieldCheck />}</span><h2 className="mt-7 text-2xl font-semibold tracking-[-0.03em] text-[#163e32]">{feature.title}</h2><p className="mt-3 max-w-md leading-7 text-[#5d756c]">{feature.body}</p><ul className="mt-7 space-y-3">{feature.points.map((point) => <li key={point} className="flex gap-3 text-sm font-medium text-[#315748]"><Check size={17} className="shrink-0 text-[#3d956e]" />{point}</li>)}</ul></article>)}</div></section><Cta t={t} href={href} /></>; }
function Pricing({ t, href }: { t: SiteContent; href: Href }) { const plan = t.plans[0]; return <><PageIntro eyebrow={t.pricingEyebrow} title={t.pricingTitle} body={t.pricingBody} /><section className="mx-auto max-w-5xl px-5 pb-20 lg:px-8 lg:pb-28"><article className="relative overflow-hidden rounded-[2rem] border border-[#b9d6c4] bg-white shadow-xl shadow-[#123c31]/10"><div className="absolute right-0 top-0 h-48 w-48 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#dceee0]" /><div className="relative grid lg:grid-cols-[.9fr_1.1fr]"><div className="bg-[#123c31] p-7 text-white sm:p-10"><span className="inline-flex rounded-full bg-[#8ed6aa] px-3 py-1 text-xs font-bold text-[#123c31]">{t.popular}</span><p className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-[#a8d8ba]">{plan.name}</p><p className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{plan.price}</p><p className="mt-3 max-w-sm text-sm leading-6 text-[#c4dfcf]">{plan.description}</p><div className="mt-8 border-t border-white/15 pt-6"><p className="text-sm font-medium text-[#dcefe2]">Thanh toán một lần cho triển khai ban đầu</p><p className="mt-2 text-xs leading-5 text-[#a9cdb5]">Cấu hình riêng theo quy trình vận hành cốt lõi của phòng khám.</p></div></div><div className="p-7 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#367461]">Phạm vi triển khai</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-[#173e32]">Sẵn sàng cho bác sĩ và đội ngũ sử dụng.</h2><ul className="mt-7 space-y-4">{plan.features.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#426357]"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#e4f2e8] text-[#287154]"><Check size={13} strokeWidth={3} /></span>{item}</li>)}</ul><Link to={href("contact")} className="mt-9 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#123c31] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0c3026]">{t.choose}<ArrowRight size={16} /></Link></div></div></article><p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-6 text-[#71877e]">{t.pricingNote}</p></section></>; }
function Guides({ t }: { t: SiteContent }) { const [query, setQuery] = useState(""); const guides = t.guideItems.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())); return <><PageIntro eyebrow={t.guidesEyebrow} title={t.guidesTitle} body={t.guidesBody} /><section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><label className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-[#d5e1d7] bg-white px-4 py-3 shadow-sm"><CircleHelp size={18} className="text-[#6d897d]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a9c94]" /></label><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{guides.map((guide) => <article key={guide.title} className="flex min-h-66 flex-col rounded-2xl border border-[#dce6de] bg-white p-6"><div className="flex items-center justify-between"><span className="rounded-full bg-[#e7f2e9] px-3 py-1 text-xs font-bold text-[#337257]">{guide.category}</span><span className="flex items-center gap-1 text-xs text-[#748b81]"><Clock3 size={13} />{guide.time}</span></div><h2 className="mt-6 text-lg font-semibold leading-6 text-[#173e32]">{guide.title}</h2><p className="mt-3 text-sm leading-6 text-[#61786e]">{guide.body}</p><button className="mt-auto flex items-center gap-2 pt-6 text-sm font-bold text-[#24664d]">{t.readGuide}<ArrowRight size={16} /></button></article>)}</div></section></>; }
function Contact({ t, sent, onSend }: { t: SiteContent; sent: boolean; onSend: () => void }) { return <><PageIntro eyebrow={t.contactEyebrow} title={t.contactTitle} body={t.contactBody} /><section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:pb-28"><aside className="rounded-3xl bg-[#123c31] p-8 text-white"><MessagesSquare className="text-[#93d3aa]" size={28} /><p className="mt-8 text-2xl font-semibold leading-8 tracking-[-0.03em]">{t.contactAside}</p><div className="mt-12 space-y-5 border-t border-white/15 pt-6"><a href={`mailto:${t.contactEmail}`} className="flex items-center gap-3 text-sm text-[#d2e6d9]"><Mail size={17} />{t.contactEmail}</a><p className="flex items-center gap-3 text-sm text-[#d2e6d9]"><Clock3 size={17} />{t.response}</p></div></aside><form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="rounded-3xl border border-[#dce6de] bg-white p-6 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><Field label={t.name} /><Field label={t.email} type="email" /><Field label={t.phone} type="tel" /></div><label className="mt-5 block text-sm font-semibold text-[#315748]">{t.message}<textarea required rows={5} className="mt-2 w-full resize-none rounded-xl border border-[#d1ded4] bg-[#fbfdfb] px-3 py-3 text-sm outline-none transition focus:border-[#4c9874] focus:ring-2 focus:ring-[#cfe8d7]" /></label>{sent && <p className="mt-5 rounded-xl bg-[#e7f4eb] p-3 text-sm font-medium text-[#267052]">{t.sent}</p>}<button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#123c31] px-5 py-3 text-sm font-semibold text-white">{t.send}<ArrowRight size={16} /></button></form></section></>; }
function Field({ label, type = "text" }: { label: string; type?: string }) { return <label className="block text-sm font-semibold text-[#315748]">{label}<input required type={type} className="mt-2 w-full rounded-xl border border-[#d1ded4] bg-[#fbfdfb] px-3 py-3 text-sm outline-none transition focus:border-[#4c9874] focus:ring-2 focus:ring-[#cfe8d7]" /></label>; }
function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) { return <section className="mx-auto max-w-4xl px-5 pb-14 pt-18 text-center lg:px-8 lg:pb-18 lg:pt-24"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#367461]">{eyebrow}</p><h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#123c31] sm:text-5xl">{title}</h1><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#5c756b]">{body}</p></section>; }
function Cta({ t, href }: { t: SiteContent; href: Href }) { return <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><div className="rounded-3xl bg-[#dceee0] px-7 py-12 text-center sm:px-12"><h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#123c31] sm:text-4xl">{t.ctaTitle}</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-[#547268]">{t.ctaBody}</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link to="/login?demo=doctor" className="inline-flex items-center gap-2 rounded-xl bg-[#123c31] px-5 py-3.5 text-sm font-semibold text-white">{t.demo}<ArrowRight size={16} /></Link><Link to={href("contact")} className="inline-flex items-center gap-2 rounded-xl border border-[#7da58c] px-5 py-3.5 text-sm font-semibold text-[#123c31]">{t.demo === "Trải nghiệm demo" ? "Đặt lịch tư vấn" : "Book a consultation"}</Link></div></div></section>; }
function Footer({ t, href }: { t: SiteContent; href: Href }) { return <footer className="border-t border-[#dce4de] bg-white/55"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8"><div className="sm:col-span-2"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#123c31] text-white"><HeartPulse size={17} /></span><strong>DentalAI OS</strong></div><p className="mt-4 max-w-xs text-sm leading-6 text-[#627a70]">{t.footerTagline}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#719084]">{t.footerProduct}</p><div className="mt-4 grid gap-2 text-sm text-[#426357]"><Link to={href("features")}>{t.nav.features}</Link><Link to={href("pricing")}>{t.nav.pricing}</Link><Link to={href("guides")}>{t.nav.guides}</Link></div></div><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#719084]">{t.footerCompany}</p><div className="mt-4 grid gap-2 text-sm text-[#426357]"><Link to={href("contact")}>{t.nav.contact}</Link><a href="mailto:hello@dentalaios.com">hello@dentalaios.com</a><span>{t.legal}</span></div></div></div></footer>; }
