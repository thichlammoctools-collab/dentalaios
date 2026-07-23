# Phương án thiết kế lại Sidebar Tenant (Dental Empire OS)

> **Phạm vi:** Chỉ áp dụng cho sidebar của ứng dụng quản lý phòng khám (Tenant App trong `AppShell`). Không thay đổi Platform Shell — giữ nguyên cách phân tách hệ thống bảo mật hiện tại.

---

## 1. Tổng quan vấn đề cần cải thiện

| Vấn đề | Hiện trạng | Tác động UX |
|---|---|---|
| Menu phẳng, không nhóm | Tất cả mục nằm ngang hàng, không có phân cấp | Người dùng khó quét nhanh phạm vi chức năng; "Giới thiệu" gom 3 trang vào một link duy nhất |
| Sub-nav chỉ mở khi pathname bắt đầu `/settings` | Điều kiện `pathname.startsWith("/settings")` | Người dùng phải đoán chính xác URL mới thấy menu phụ; khả năng khám phá kém |
| Không có collapsed desktop state | Sidebar hoặc đầy đủ (w-60 / ~256px) hoặc ẩn hoàn toàn trên mobile | Tốn diện tích nội dung chính, đặc biệt khi xem bảng dữ liệu rộng hoặc dashboard |
| Icons SVG inline tự vẽ mỗi component | Hand-drawn paths, stroke-width 1.8, inconsistent proportions | Khó maintain, thiếu đồng nhất về độ dày nét và khoảng cách đường căn chỉnh |
| Active state dùng nền primary solid | Toàn bộ background đổi màu | Tạo độ tương phản quá mạnh ở dark mode, visual noise cao |
| BreadcrumbsgetTitle() hardcoded trong Topbar | Switch-case dài, dễ quên update | Tiêu đề trang không khớp với intent người dùng |

---

## 2. Giải pháp chi tiết

### 2A. Hệ thống Icon — Lucide React outline + active nhấn

**Công nghệ:** Thay toàn bộ SVG hand-drawn trong `Sidebar.tsx`, `Topbar.tsx` bằng thư viện `lucide-react` (đã được khai báo trong `components.json` nhưng chưa sử dụng).

**Quy chuẩn:**

| Yếu tố | Giá trị |
|---|---|
| Thư viện | `lucide-react` v0.x mới nhất |
| Kích thước mặc định | `h-5 w-5` (24px) |
| Stroke width | Lucide mặc định là 2 (đủ rõ cho UI y tế) |
| Phong cách cơ bản | Outline (mặc định lucide): `fill="none" stroke="currentColor"` |
| Trạng thái Active | Icon vẫn outline, nhưng nhận diện bằng **nền nhấn nhẹ** + text color, không chuyển thành filled |
| Màu sắc | Muted (`text-muted-foreground`) → Hover (`text-accent-foreground`) → Active (`text-primary` + nền) |
| Padding horizontal | Giữ gap giữa icon và text = `gap-3` như hiện tại |

**Icon mapping mới:**

| Mục menu | Lucide icon name | Lý do chọn |
|---|---|---|
| Điều hành chi nhánh | `CalendarCheck` | Nhấn mạnh lịch làm việc/chỉ định, khác `Schedule` ở chi tiết hơn |
| Lịch hẹn | `CalendarClock` | Phân biệt rõ với "Điều hành"; biểu tượng thời gian sắp tới |
| Ghế nha | `Armchair` hoặc `Chair` (nếu có) / `Stethoscope` fallback | Icon牙科 trực quan hoặc y tế tổng quát |
| Bệnh nhân | `Users` | Đã dùng, giữ nguyên semantic đúng |
| Giới thiệu (nhóm label) | `UserPlus` | Hành động mời thêm đối tác, khác `Users` danh sách |
| Cài đặt (nhóm label) | `Settings` | Giữ nguyên |

**Lý do UX:** Icon outline tạo độ nặng thị giác đồng đều, giúp mắt quét ngang nhanh mà không bị distract bởi vùng tối lớn. Active state dùng nền thay vì đổi icon style giúp giảm cognitive load — người dùng chỉ cần nhìn màu/nền để biết vị trí hiện tại.

---

### 2B. Cấu trúc và Sắp xếp — Nhóm theo công năng

Tái cấu trúc NAV thành ba nhóm: **Vận hành**, **Giới thiệu**, **Cài đặt**. Mỗi nhóm có thể mở/đóng (expandable accordion).

#### NAV_GROUPS (hiến trạng → đề xuất)

| Nhóm | Mục con | Route(s) | Ghi chú |
|---|---|---|---|
| --- Management Dashboard (admin-only) --- | | | |
| Quản trị tổng quan | — | `/management-dashboard` | Item cố định đầu tiên cho admin |
| **Vận hành** | Điều hành chi nhánh | `/today` | Exact match |
| | Lịch hẹn | `/schedule`, `/schedule/new` | Prefix match `/schedule` |
| | Ghế nha | `/chairs`, `/chairs/settings`, `/chairs/reports` | Prefix match `/chairs` |
| | Bệnh nhân | `/patients`, `/patients/:id`, `/visits/:id`, `/treatment-plans/:id` | Parent match `/patients` |
| **Giới thiệu** | Tổng quan giới thiệu | `/referrals` | Exact ROUTES.REFERRALS |
| | Người giới thiệu | `/referrers` | Exact ROUTES.REFERRERS |
| | Chương trình giới thiệu | `/settings/referral-programs` | Trong settings nhưng thuộc nhóm referral |
| | Báo cáo giới thiệu | `/reports/referrals` | Exact ROUTES.REFERRAL_REPORTS |
| **Cài đặt** | (sub-menu điều hướng tĩnh) | — | Xem bên dưới |

**Quan trọng:** Các mục "Người giới thiệu", "Chương trình giới thiệu", "Báo cáo giới thiệu" sẽ được dịch từ sub-nav cũ của group "Cài đặt" lên nhóm "Giới thiệu". Mục "Người dùng", "Phòng khám", "Dịch vụ điều trị", "Vai trò", "Audit logs" còn lại trong "Cài đặt".

#### Cài đặt submenu (giữ dạng collapsible sub-group)

| Mục con | Route |
|---|---|
| Người dùng | `/settings/users` |
| Phòng khám | `/settings/clinic` |
| Dịch vụ điều trị | `/settings/treatment-services` |
| Vai trò | `/settings/roles` |
| Audit logs | `/settings/audit-logs` |

**Hiển thị logic:** Không dựa vào pathname condition nữa. Nhóm "Giới thiệu" luôn hiển thị cho tất cả users có permission phù hợp. "Cài đặt" submenu luôn hiển thị nhưng chỉ expand khi đang ở bất kỳ route nào bắt đầu bằng `/settings`. Group "Vận hành" và "Giới thiệu" default expand=false trên desktop, expand=true trên mobile khi lần đầu mở.

#### Dữ liệu model mới

```typescript
interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  expanded?: boolean;    // Mặc định false desktop, true mobile
  items: NavItem[];
}

interface NavItem {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: LucideIcon;
  permissions?: string[];  // Optional per-item gating
}
```

#### Quản lý state mở/đóng nhóm

Lưu trong `localStorage` với key `sidebar:groups` — format `{[groupId]: boolean}`. Default: tất cả false ngoại trừ nhóm chứa pathname hiện tại (auto-open during first render sau reload).

**Lý do UX:** Phân nhóm giảm cognitive load theo nguyên tắc Chunking (Miller's Law — 7±2 items tối đa trước khi não bộ mệt mỏi). "Giới thiệu" tách rời khỏi "Cài đặt" giải quyết vấn đề discoverability gốc: người dùng giờ thấy rõ 4 trang con thay vì một link đen.

---

### 2C. Tính năng Thu gọn — Toggle ghim cục bộ

**Cơ chế:** Thêm nút toggle hình mũi tên góc dưới sidebar, ngay trên version bar.

| Trạng thái | Width | Nội dung hiển thị | Tương tác |
|---|---|---|---|
| Expanded (mở) | `w-60` (~256px) | Icon + Label text + Group labels | Normal nav |
| Collapsed (thu gọn) | `w-[72px]` | Chỉ icon, group label ẩn, item label ẩn | Tooltip khi hover (delayed 300ms) |

**Component layout mới (collapsed mode):**

```
+--------------------+
| [icon logo]        |  ← Logo nhỏ trung tâm
|                    |
| [📅]               |  ← Icon vertical center
| 🕐                 |  ← Tooltip "Lịch hẹn" khi hover
| 💺                 |
| 👥                 |
| ➕                 |  ← Group header "Giới thiệu" icon nhỏ
| ⚙️                 |
|                    |
| <                  |  ← Nút toggle mũi tên
| v0.1.0 · MVP       |  ← Version co thành 1 line icon + dot
+--------------------+
```

**Tooltip behavior:** Sử dụng `tooltip` pattern với `delayMs={300}`, xuất hiện bên phải sidebar. Khi sidebar collapsed, click vào icon thực hiện navigation bình thường như expanded.

**Mobile:** Không áp dụng collapsed state. Mobile chỉ dùng drawer overlay hoặc close. Toggle button không hiển thị trên mobile.

**Implementation notes:**

- State lưu `localStorage` với key `sidebar:collapsed` → boolean
- Transition width từ `256px` → `72px` mượt mà qua CSS `transition: width 250ms ease`
- Content area (`main`) nhận padding-left dynamic: `ml-0` khi collapsed, `ml-60` khi expanded
- AppShell wrapper class đổi theo state để trigger transition mượt

**Lý do UX:** Người dùng dữ liệu-heavy (bảng bệnh nhân, chair board wide view) có nhu cầu mở rộng content zone. Collapse toggle cho phép họ linh hoạt — không phải chấp nhận fixed layout. 72px vừa đủ chứa icon 24px với padding 24px hai bên.

---

### 2D. Hiệu ứng và Trạng thái

#### Bảng trạng thái đầy đủ

| Trạng thái | Background | Text Color | Border | Icon |
|---|---|---|---|---|
| Default (idle) | transparent | `text-muted-foreground` | none | `text-muted-foreground` |
| Hover | `bg-accent/50` | `text-accent-foreground` | none | `text-accent-foreground` |
| Active | `bg-accent` (light: 95% white-ish) | `text-primary` | left border `border-l-2 border-primary` | `text-primary` |
| Disabled (no permission) | transparent | `opacity-30 pointer-events-none` | none | `opacity-30` |
| Sub-item default | plain `pl-10` indentation | `text-muted-foreground` | none | `text-muted-foreground` |
| Sub-item hover | `bg-accent/50` | `text-accent-foreground` | none | `text-accent-foreground` |
| Sub-item active | `bg-accent` | `text-primary` | left border `border-l-2 border-primary` | `text-primary` |

**Trạng thái Active (khác biệt so với hiện tại):**

| Thông số | Hiện tại | Đề xuất |
|---|---|---|
| Background | `bg-primary` (solid dark/light) | `bg-accent` (nền nhẹ) + `border-l-2 border-primary` (indicator bar trái) |
| Text | `text-primary-foreground` (trắng trên dark) | `text-primary` (màu accent xanh) |
| Icon | Đổi màu | Giữ nguyên, thừa hưởng từ text parent |
| Visual impact | Cao — tạo vùng tối đậm | Thấp — indicator bar 2px bên trái + màu chữ nhẹ nhàng |

**Lý do:** Solid `bg-primary` trong dark mode tạo vùng sáng chói (light foreground), gây mất cân bằng visual. Ac-cetn-background + left-border indicator giữ giao diện yên dịu hơn, phù hợp app y tế.

#### Transition timings

| Animation | Duration | Easing | Áp dụng |
|---|---|---|---|
| Hover background | 150ms | ease-out | Item link `transition-colors duration-150` |
| Active indicator bar | 200ms | ease-in-out | Left border width/opacity |
| Sidebar collapse width | 250ms | ease-in-out | Main div width transform |
| Group expand/collapse | 200ms | ease-out | Sub-items height animation |
| Mobile drawer | 300ms | ease-out | TranslateX transition |
| Overlay dimming | 300ms | ease-out | bg-black/opacity fade |

#### Group expand/collapse animation

Mỗi NavGroup khi click label/icon sẽ toggle expanded state:

```tsx
const group = navGroups.find(g => g.id === groupId);
// Khi expand: items slide xuống với height animation
// Khi collapse: items slide lên, opacity fade-out
```

Implement bằng Tailwind + `overflow-hidden`:
- Wrapper div `overflow-hidden transition-all duration-200`
- Chiều cao toggle từ `max-h-0` đến `max-h-[500px]` (hoặc giá trị thực tế đủ chứa items)
- Opacity các items từ `opacity-0` → `opacity-100` staggered (item thứ n có delay = n * 30ms)

#### Hover tooltip (collapsed mode)

Khi sidebar collapsed, mỗi icon trở thành button có `title` attribute và optional `<span>` tooltip absolute positioned bên phải:

```tsx
<div className="relative group">
  <Button variant="ghost" size="icon" asChild>
    <Link to={item.href}>{icon}</Link>
  </Button>
  <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow md:block group-hover:block opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150">
    {item.label}
  </span>
</div>
```

---

## 3. Ảnh hưởng đến các thành phần liên quan

### AppShell.tsx
- Nhận thêm prop `collapsed: boolean` hoặc kiểm tra context
- Dynamic marginLeft: `ml-0` vs `ml-60` cho content area
- Responsive overrides: collapsed chỉ生效 ở breakpoint `md:` trở lên

### Topbar.tsx
- BreadcrumbsTitle map nên được refactor sang centralized constant trong `constants/index.ts`
- Title lookup function đơn giản hóa thành O(1) object lookup thay vì switch-case

### Sidebar.tsx
- Refactor hoàn toàn theo NavGroup model
- Import `lucide-react`
- Thêm `useState` cho collapsed state + groups state
- Thêm `useEffect` đọc localStorage
- Component: `GroupHeader` (clickable accordion), `NavItem`, `SubItem`, `CollapsedTooltipWrapper`

### index.css (tokens)
- Cần thêm token `--color-accent` đã tồn tại OKLCH — đảm bảo dark mode contrast ratio đạt WCAG AA cho text-on-accent (>= 4.5:1)
- Có thể cần điều chỉnh `accent-foreground` nếu insufficient trong dark

---

## 4. Rollout plan — Từng bước thực hiện

### Bước 1: Chuẩn bị dependency & tokens
- Install `lucide-react` nếu chưa
- Verify OKLCH accent colors meet contrast requirements trong light và dark
- Add `font-sans` font family stack (system-ui) cho typography nhất quán

### Bước 2: Refactor data model
- Tách `NavGroup` / `NavItem` interfaces ra `src/components/Sidebar.types.ts`
- Chuyển NAV + SUB_NAV constants sang mảng `NAV_GROUPS` trong cùng file
- Xử lý quyền: move permission checks từ runtime JSX sang build-time filter trên mảng constants

### Bước 3: Implement new Sidebar component
- Group accordion with expand/collapse
- Lucide icons replacing inline SVGs
- Active state redesign (accent bg + left border indicator)
- Hover/transition effects
- Collapsed state với icon-only mode + tooltips
- Toggle button + localStorage persistence

### Bước 4: Update AppShell layout
- Dynamic margin-left cho main content
- Ensure transition smoothness between expanded ↔ collapsed
- Test mobile overlay still works unchanged

### Bước 5: Cleanup
- Remove inline SVG icons từ Sidebar.tsx (có thể còn trong Topbar.tsx — giữ nguyên topbar icons cho phase sau)
- Remove dead code: pathname-based conditional rendering logic
- Remove version bar text overflow — compact layout trong collapsed mode

### Bước 6: Validation
- Manual test: each group expand/collapse
- Manual test: collapsed tooltip display
- Manual test: active state across all routes
- Manual test: mobile overlay no regression
- Manual test: dark mode contrast compliance
- Manual test: permission-gated items hide correctly

---

## 5. Rủi ro & Mitigation

| Rủi ro | Mức độ | Mitigation |
|---|---|---|
| Breaking change: routing match logic thay đổi | Trung bình | Keep exact same `match()` functions; unit test từng item |
| Accents màu không đủ tương phản trong dark mode | Thấp | Pre-check OKLCH values, adjust if WCAG fail |
| Lucide icon naming changes trong major releases | Thấp | Lock package version trong `package.json`; pin exact semver |
| Performance: nhiều re-renders từ localStorage sync | Thấp | Debounce localStorage writes, use `useMemo` cho filtered groups |
| Regression: mobile drawer overlaps content | Thấp | Regress test mobile viewport at 320px–768px |

---

## 6. Những gì KHÔNG thuộc phạm vi (out of scope)

- Platform Shell sidebar redesign — giữ nguyên hiện tại
- Mobile collapsed state — chỉ drawer open/close như hiện tại
- Icon change trong Topbar, Dialog, Cards — giữ inline SVG cho phase sau
- Dark mode theme overhaul ngoài kiểm tra contrast accent tokens
- Frontend test suite setup — không có unit/E2E tests hiện tại, thuộc sprint sau
- Breadcrumb component standardization — out of scope cho phase này (chỉ note trong cleanup)

---

## 7. File thay đổi dự kiến

| File | Loại thay đổi | Mô tả |
|---|---|---|
| `apps/web/src/components/Sidebar.tsx` | Rewrite | Core redesign: NavGroup model, lucide icons, collapsible, states |
| `apps/web/src/components/AppShell.tsx` | Edit | Dynamic margin-left for main content based on collapsed state |
| `apps/web/package.json` | Edit | Add `lucide-react` if not present |
| `apps/web/src/index.css` | Minor edit | Verify/add accent token contrast if needed |
| `apps/web/src/components/Topbar.tsx` | Minor edit | Centralized title map (optional, post-phase) |

---

*Plan generated: 2026-07-23*
*Author: Kilo Code — UX/UI Design Review Agent*