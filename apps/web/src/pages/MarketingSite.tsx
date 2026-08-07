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
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type Locale = "vi" | "en";
type Page = "home" | "features" | "pricing" | "guides" | "contact";

const content = {
  vi: {
    language: "Tiếng Việt",
    brandNote: "Nền tảng vận hành phòng khám hiện đại",
    nav: { home: "Trang chủ", features: "Tính năng", pricing: "Bảng giá", guides: "Hướng dẫn", contact: "Liên hệ" },
    login: "Đăng nhập",
    start: "Bắt đầu miễn phí",
    demo: "Đặt lịch tư vấn",
    heroEyebrow: "Dành riêng cho phòng khám nha khoa",
    heroTitle: "Mọi thao tác lâm sàng. Một nhịp vận hành rõ ràng.",
    heroBody: "DentalAI OS kết nối lịch hẹn, hồ sơ bệnh án, kế hoạch điều trị và tài chính để đội ngũ của bạn có thêm thời gian cho người bệnh.",
    trusted: "Được xây dựng cùng các đội ngũ nha khoa hiện đại",
    metric1: "thời gian thao tác hồ sơ",
    metric2: "góc nhìn về lịch điều trị",
    metric3: "dữ liệu bảo mật theo vai trò",
    workflowEyebrow: "Một nguồn dữ liệu đáng tin cậy",
    workflowTitle: "Từ ghế điều trị đến quyết định quản trị.",
    workflowBody: "Mỗi vai trò nhìn thấy đúng việc cần làm, trong cùng một hồ sơ bệnh nhân luôn được cập nhật.",
    workflows: ["Tiếp nhận & lịch hẹn", "Khám & ghi nhận lâm sàng", "Kế hoạch điều trị", "Thu ngân & báo cáo"],
    featureEyebrow: "Không chỉ là phần mềm quản lý",
    featureTitle: "Thiết kế để đội ngũ tập trung vào việc chăm sóc.",
    featureBody: "Các mô-đun liên thông, nhanh gọn và phù hợp với quy trình thực tế tại phòng khám.",
    featureCards: [
      { title: "Hồ sơ lâm sàng", body: "Ghi nhận khám, hình ảnh, chỉ định và diễn biến điều trị trong một không gian có cấu trúc." },
      { title: "Lịch hẹn thông minh", body: "Điều phối bác sĩ, ghế và thời gian điều trị với chế độ xem trực quan theo ngày." },
      { title: "Trợ lý điều trị", body: "Chuẩn hóa kế hoạch, dịch vụ và hướng dẫn để tư vấn nhanh hơn, rõ ràng hơn." },
    ],
    seeFeatures: "Khám phá tính năng",
    ctaTitle: "Sẵn sàng vận hành phòng khám nhẹ nhàng hơn?",
    ctaBody: "Bắt đầu cùng đội ngũ DentalAI OS và thiết kế quy trình phù hợp cho phòng khám của bạn.",
    footerTagline: "Hệ điều hành cho đội ngũ nha khoa hiện đại.",
    footerProduct: "Sản phẩm",
    footerCompany: "Công ty",
    legal: "Bảo mật & Điều khoản",
    featuresEyebrow: "Tính năng cốt lõi",
    featuresTitle: "Mỗi ngày vận hành, ít điểm nghẽn hơn.",
    featuresBody: "Từ lịch khám đến báo cáo, DentalAI OS đưa những tác vụ rời rạc vào một quy trình thống nhất.",
    featureDetails: [
      { title: "Điều phối lịch hẹn", body: "Theo dõi lịch của bác sĩ, ghế điều trị và bệnh nhân từ một bảng điều khiển trực quan.", points: ["Xem lịch theo ngày, tuần", "Nhắc hẹn và theo dõi trạng thái", "Hạn chế chồng chéo nguồn lực"] },
      { title: "Hồ sơ điều trị có ngữ cảnh", body: "Mỗi lần khám, dịch vụ và ghi chú được kết nối thành một hành trình chăm sóc hoàn chỉnh.", points: ["Lịch sử lâm sàng tập trung", "Ghi nhận nhanh tại ghế", "Phân quyền theo vị trí công việc"] },
      { title: "Kế hoạch rõ ràng, tư vấn tự tin", body: "Chuyển các phát hiện lâm sàng thành kế hoạch điều trị dễ hiểu cho cả đội ngũ và bệnh nhân.", points: ["Mẫu dịch vụ chuẩn hóa", "Theo dõi tiến độ thực hiện", "Hỗ trợ gợi ý bằng AI"] },
      { title: "Kiểm soát doanh thu", body: "Liên kết điều trị, thanh toán và báo cáo để người quản lý luôn nắm được bức tranh thực tế.", points: ["Theo dõi thu chi", "Báo cáo theo ghế và dịch vụ", "Nhật ký thay đổi minh bạch"] },
    ],
    pricingEyebrow: "Bảng giá minh bạch",
    pricingTitle: "Bắt đầu theo nhịp phát triển của phòng khám.",
    pricingBody: "Mỗi gói đều có nền tảng lâm sàng cốt lõi. Nâng cấp khi đội ngũ, quy trình và số ghế của bạn mở rộng.",
    monthly: "Theo tháng",
    annually: "Theo năm",
    save: "Tiết kiệm 20%",
    perMonth: "/ tháng",
    popular: "Được chọn nhiều",
    choose: "Chọn gói này",
    talk: "Trao đổi với chúng tôi",
    plans: [
      { name: "Khởi đầu", price: "0đ", description: "Dành cho phòng khám bắt đầu số hóa.", features: ["Tối đa 3 người dùng", "Lịch hẹn và hồ sơ cơ bản", "Hỗ trợ qua tài liệu"] },
      { name: "Phòng khám", price: "1.490.000đ", description: "Dành cho đội ngũ cần một luồng vận hành thống nhất.", features: ["Tối đa 15 người dùng", "Lâm sàng, lịch hẹn, tài chính", "Báo cáo vận hành", "Hỗ trợ ưu tiên"] },
      { name: "Hệ thống", price: "Liên hệ", description: "Dành cho chuỗi phòng khám và nhu cầu triển khai riêng.", features: ["Người dùng không giới hạn", "Thiết lập đa cơ sở", "Tích hợp và phân quyền nâng cao", "Đồng hành triển khai"] },
    ],
    pricingNote: "Giá chưa bao gồm thuế. Có thể điều chỉnh theo quy mô triển khai và yêu cầu tích hợp.",
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
    brandNote: "The modern clinic operations platform",
    nav: { home: "Home", features: "Features", pricing: "Pricing", guides: "Guides", contact: "Contact" },
    login: "Log in", start: "Start for free", demo: "Book a consultation",
    heroEyebrow: "Built specifically for dental clinics",
    heroTitle: "Every clinical action. One clear operating rhythm.",
    heroBody: "DentalAI OS connects scheduling, patient records, treatment plans, and finance so your team has more time for patients.",
    trusted: "Built with modern dental teams",
    metric1: "less time in patient records", metric2: "view of treatment schedules", metric3: "role-based data security",
    workflowEyebrow: "One reliable source of truth", workflowTitle: "From the chair to better operational decisions.", workflowBody: "Every role sees the next right action in the same, always-current patient record.",
    workflows: ["Intake & scheduling", "Examination & clinical notes", "Treatment planning", "Billing & reporting"],
    featureEyebrow: "More than practice management", featureTitle: "Designed to keep your team focused on care.", featureBody: "Connected modules that are fast, purposeful, and made for real clinic workflows.",
    featureCards: [
      { title: "Clinical records", body: "Capture exams, images, orders, and treatment progress in one structured workspace." },
      { title: "Intelligent scheduling", body: "Coordinate clinicians, chairs, and treatment time in a clear day-by-day view." },
      { title: "Treatment assistant", body: "Standardize plans, services, and guidance for faster, more confident consultations." },
    ],
    seeFeatures: "Explore features", ctaTitle: "Ready for a lighter clinic operating day?", ctaBody: "Start with the DentalAI OS team and shape a workflow around your clinic.", footerTagline: "The operating system for modern dental teams.", footerProduct: "Product", footerCompany: "Company", legal: "Privacy & terms",
    featuresEyebrow: "Core capabilities", featuresTitle: "Fewer bottlenecks in every operating day.", featuresBody: "From appointments to reporting, DentalAI OS brings fragmented tasks into one cohesive workflow.",
    featureDetails: [
      { title: "Appointment orchestration", body: "Follow clinicians, treatment chairs, and patients from a visual control point.", points: ["Day and week schedule views", "Reminders and status tracking", "Avoid resource conflicts"] },
      { title: "Context-rich treatment records", body: "Each visit, service, and note connects into a complete care journey.", points: ["Central clinical history", "Fast chairside capture", "Role-aware permissions"] },
      { title: "Clear plans, confident conversations", body: "Turn clinical findings into treatment plans that make sense to both teams and patients.", points: ["Standardized service templates", "Progress tracking", "AI-assisted suggestions"] },
      { title: "Revenue visibility", body: "Connect treatment, payments, and reporting so leaders always see the real picture.", points: ["Income and expense tracking", "Chair and service reports", "Transparent audit history"] },
    ],
    pricingEyebrow: "Transparent pricing", pricingTitle: "Start at the pace your clinic is growing.", pricingBody: "Every plan includes the clinical foundation. Upgrade when your people, processes, and chairs expand.", monthly: "Monthly", annually: "Annual", save: "Save 20%", perMonth: "/ month", popular: "Most popular", choose: "Choose plan", talk: "Talk to us",
    plans: [
      { name: "Starter", price: "$0", description: "For clinics taking their first digital steps.", features: ["Up to 3 users", "Core scheduling and records", "Documentation support"] },
      { name: "Clinic", price: "$59", description: "For teams that need one connected operating flow.", features: ["Up to 15 users", "Clinical, scheduling, and finance", "Operational reporting", "Priority support"] },
      { name: "Network", price: "Let's talk", description: "For clinic groups with tailored rollout needs.", features: ["Unlimited users", "Multi-location setup", "Advanced integrations and access", "Dedicated rollout support"] },
    ],
    pricingNote: "Excludes applicable taxes. Pricing can be tailored to your rollout scale and integration requirements.",
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
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#245044]">{t.login}</Link>
            <Link to={href("contact")} className="rounded-lg bg-[#123c31] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c3026]">{t.start}</Link>
          </div>
          <button aria-label="Toggle menu" className="grid size-10 place-items-center rounded-lg text-[#123c31] lg:hidden" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
        {menuOpen && <div className="border-t border-[#dce4de] bg-[#f7f8f5] px-5 pb-5 lg:hidden"><nav className="grid gap-1 pt-3">{(Object.keys(t.nav) as Page[]).map((item) => <Link key={item} onClick={() => setMenuOpen(false)} to={href(item)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#245044]">{t.nav[item]}</Link>)}<Link to={switchLocale} className="mt-2 rounded-lg border border-[#d4dfd6] px-3 py-3 text-sm font-semibold">{locale === "vi" ? "English" : "Tiếng Việt"}</Link></nav></div>}
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
function Pricing({ t, href }: { t: SiteContent; href: Href }) { const [annual, setAnnual] = useState(true); return <><PageIntro eyebrow={t.pricingEyebrow} title={t.pricingTitle} body={t.pricingBody} /><section className="mx-auto max-w-7xl px-5 pb-8 lg:px-8"><div className="mx-auto flex w-fit rounded-xl border border-[#d4e0d6] bg-white p-1"><button onClick={() => setAnnual(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${!annual ? "bg-[#e6f0e8] text-[#174936]" : "text-[#6d8178]"}`}>{t.monthly}</button><button onClick={() => setAnnual(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${annual ? "bg-[#123c31] text-white" : "text-[#6d8178]"}`}>{t.annually} <span className="ml-1 text-xs text-[#9dd3b1]">{t.save}</span></button></div><div className="mt-10 grid gap-5 lg:grid-cols-3">{t.plans.map((plan, index) => <article key={plan.name} className={`relative rounded-3xl border p-7 ${index === 1 ? "border-[#2e7c5d] bg-[#123c31] text-white shadow-xl shadow-[#123c31]/15" : "border-[#dce6de] bg-white"}`}>{index === 1 && <span className="absolute -top-3 left-7 rounded-full bg-[#8ed6aa] px-3 py-1 text-xs font-bold text-[#123c31]">{t.popular}</span>}<h2 className={`text-xl font-semibold ${index === 1 ? "" : "text-[#173e32]"}`}>{plan.name}</h2><p className={`mt-3 min-h-12 text-sm leading-6 ${index === 1 ? "text-[#c4dfcf]" : "text-[#60776e]"}`}>{plan.description}</p><p className={`mt-8 text-3xl font-semibold tracking-[-0.04em] ${index === 1 ? "" : "text-[#123c31]"}`}>{plan.price}{plan.price !== "Liên hệ" && plan.price !== "Let's talk" && <span className={`ml-1 text-sm font-medium tracking-normal ${index === 1 ? "text-[#c4dfcf]" : "text-[#6d8178]"}`}>{t.perMonth}</span>}</p><Link to={href("contact")} className={`mt-8 block rounded-xl px-4 py-3 text-center text-sm font-semibold ${index === 1 ? "bg-white text-[#123c31]" : "bg-[#e5f0e7] text-[#194b3a]"}`}>{index === 2 ? t.talk : t.choose}</Link><ul className="mt-8 space-y-3">{plan.features.map((item) => <li key={item} className={`flex gap-2.5 text-sm ${index === 1 ? "text-[#e0f0e5]" : "text-[#426357]"}`}><Check size={17} className="shrink-0 text-[#60b88a]" />{item}</li>)}</ul></article>)}</div><p className="mt-7 text-center text-sm text-[#71877e]">{t.pricingNote}</p></section></>; }
function Guides({ t }: { t: SiteContent }) { const [query, setQuery] = useState(""); const guides = t.guideItems.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())); return <><PageIntro eyebrow={t.guidesEyebrow} title={t.guidesTitle} body={t.guidesBody} /><section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><label className="mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-[#d5e1d7] bg-white px-4 py-3 shadow-sm"><CircleHelp size={18} className="text-[#6d897d]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="w-full bg-transparent text-sm outline-none placeholder:text-[#8a9c94]" /></label><div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{guides.map((guide) => <article key={guide.title} className="flex min-h-66 flex-col rounded-2xl border border-[#dce6de] bg-white p-6"><div className="flex items-center justify-between"><span className="rounded-full bg-[#e7f2e9] px-3 py-1 text-xs font-bold text-[#337257]">{guide.category}</span><span className="flex items-center gap-1 text-xs text-[#748b81]"><Clock3 size={13} />{guide.time}</span></div><h2 className="mt-6 text-lg font-semibold leading-6 text-[#173e32]">{guide.title}</h2><p className="mt-3 text-sm leading-6 text-[#61786e]">{guide.body}</p><button className="mt-auto flex items-center gap-2 pt-6 text-sm font-bold text-[#24664d]">{t.readGuide}<ArrowRight size={16} /></button></article>)}</div></section></>; }
function Contact({ t, sent, onSend }: { t: SiteContent; sent: boolean; onSend: () => void }) { return <><PageIntro eyebrow={t.contactEyebrow} title={t.contactTitle} body={t.contactBody} /><section className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 lg:grid-cols-[.8fr_1.2fr] lg:px-8 lg:pb-28"><aside className="rounded-3xl bg-[#123c31] p-8 text-white"><MessagesSquare className="text-[#93d3aa]" size={28} /><p className="mt-8 text-2xl font-semibold leading-8 tracking-[-0.03em]">{t.contactAside}</p><div className="mt-12 space-y-5 border-t border-white/15 pt-6"><a href={`mailto:${t.contactEmail}`} className="flex items-center gap-3 text-sm text-[#d2e6d9]"><Mail size={17} />{t.contactEmail}</a><p className="flex items-center gap-3 text-sm text-[#d2e6d9]"><Clock3 size={17} />{t.response}</p></div></aside><form onSubmit={(event) => { event.preventDefault(); onSend(); }} className="rounded-3xl border border-[#dce6de] bg-white p-6 sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><Field label={t.name} /><Field label={t.email} type="email" /><Field label={t.phone} type="tel" /></div><label className="mt-5 block text-sm font-semibold text-[#315748]">{t.message}<textarea required rows={5} className="mt-2 w-full resize-none rounded-xl border border-[#d1ded4] bg-[#fbfdfb] px-3 py-3 text-sm outline-none transition focus:border-[#4c9874] focus:ring-2 focus:ring-[#cfe8d7]" /></label>{sent && <p className="mt-5 rounded-xl bg-[#e7f4eb] p-3 text-sm font-medium text-[#267052]">{t.sent}</p>}<button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#123c31] px-5 py-3 text-sm font-semibold text-white">{t.send}<ArrowRight size={16} /></button></form></section></>; }
function Field({ label, type = "text" }: { label: string; type?: string }) { return <label className="block text-sm font-semibold text-[#315748]">{label}<input required type={type} className="mt-2 w-full rounded-xl border border-[#d1ded4] bg-[#fbfdfb] px-3 py-3 text-sm outline-none transition focus:border-[#4c9874] focus:ring-2 focus:ring-[#cfe8d7]" /></label>; }
function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) { return <section className="mx-auto max-w-4xl px-5 pb-14 pt-18 text-center lg:px-8 lg:pb-18 lg:pt-24"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#367461]">{eyebrow}</p><h1 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.045em] text-[#123c31] sm:text-5xl">{title}</h1><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#5c756b]">{body}</p></section>; }
function Cta({ t, href }: { t: SiteContent; href: Href }) { return <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8 lg:pb-28"><div className="rounded-3xl bg-[#dceee0] px-7 py-12 text-center sm:px-12"><h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#123c31] sm:text-4xl">{t.ctaTitle}</h2><p className="mx-auto mt-4 max-w-xl leading-7 text-[#547268]">{t.ctaBody}</p><Link to={href("contact")} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#123c31] px-5 py-3.5 text-sm font-semibold text-white">{t.demo}<ArrowRight size={16} /></Link></div></section>; }
function Footer({ t, href }: { t: SiteContent; href: Href }) { return <footer className="border-t border-[#dce4de] bg-white/55"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8"><div className="sm:col-span-2"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-[#123c31] text-white"><HeartPulse size={17} /></span><strong>DentalAI OS</strong></div><p className="mt-4 max-w-xs text-sm leading-6 text-[#627a70]">{t.footerTagline}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#719084]">{t.footerProduct}</p><div className="mt-4 grid gap-2 text-sm text-[#426357]"><Link to={href("features")}>{t.nav.features}</Link><Link to={href("pricing")}>{t.nav.pricing}</Link><Link to={href("guides")}>{t.nav.guides}</Link></div></div><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-[#719084]">{t.footerCompany}</p><div className="mt-4 grid gap-2 text-sm text-[#426357]"><Link to={href("contact")}>{t.nav.contact}</Link><a href="mailto:hello@dentalaios.com">hello@dentalaios.com</a><span>{t.legal}</span></div></div></div></footer>; }
