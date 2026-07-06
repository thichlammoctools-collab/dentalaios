/**
 * Treatment plan proposal PDF generator — clean A4 layout.
 *
 * Uses pdf-lib with built-in Helvetica (no external font fetching needed).
 * Vietnamese diacritics will render as best-effort ASCII fallback.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(amount) + " VND";
}

const C = {
  blue: rgb(0.11, 0.36, 0.65),
  blueLight: rgb(0.93, 0.96, 1.0),
  teal: rgb(0.16, 0.67, 0.57),
  tealLight: rgb(0.94, 0.98, 0.97),
  amber: rgb(0.84, 0.55, 0.1),
  amberLight: rgb(1.0, 0.97, 0.91),
  green: rgb(0.13, 0.59, 0.33),
  greenLight: rgb(0.93, 0.98, 0.94),
  red: rgb(0.74, 0.12, 0.12),
  redLight: rgb(1.0, 0.94, 0.94),
  gray: rgb(0.45, 0.49, 0.55),
  grayLight: rgb(0.96, 0.96, 0.97),
  dark: rgb(0.13, 0.14, 0.16),
  border: rgb(0.86, 0.87, 0.89),
  white: rgb(1, 1, 1),
  headerBg: rgb(0.97, 0.98, 0.99),
};

const STATUS_STYLE: Record<string, { color: ReturnType<typeof rgb>; bg: ReturnType<typeof rgb>; label: string }> = {
  proposed: { color: C.gray, bg: C.grayLight, label: "De xuat" },
  approved: { color: C.green, bg: C.greenLight, label: "Da duyet" },
  completed: { color: C.teal, bg: C.tealLight, label: "Hoan thanh" },
  cancelled: { color: C.red, bg: C.redLight, label: "Da huy" },
  in_progress: { color: C.amber, bg: C.amberLight, label: "Dang thuc hien" },
};

const PROC_LABELS: Record<string, string> = {
  examination: "Kham chan doan",
  filling: "Tram rang",
  root_canal: "Dieu tri tuy",
  extraction: "Nho rang",
  crown: "Boc mao rang",
  scaling: "Cao voi rang",
  implant: "Cay ghep implant",
  bridge: "Cau rang su",
  veneer: "Dan su veneer",
  fluoride: "Tray trang fluoride",
  other: "Dieu tri khac",
};

export async function buildProposalPdf(input: {
  tenant: { name: string; email?: string };
  branch: { name: string; address: string };
  patient: { name: string; date_of_birth: string; gender: string; phone: string };
  plan: {
    id: string;
    status: string;
    total_cost: number;
    currency: string;
    notes?: string;
    approved_at?: string | null;
    created_at: string;
  };
  items: { tooth_number: number; procedure: string; description: string; unit_cost: number; status: string }[];
  approverName: string;
}): Promise<Uint8Array> {
  const { tenant, branch, patient, plan, items, approverName } = input;
  const pdf = await PDFDocument.create();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595.28, 841.89]);
  const PAGE_W = 595.28;
  const L = 45;
  const R = PAGE_W - 45;
  const CW = R - L;

  let y = 800;
  const lh = 14;

  function txt(f: typeof font, s: string, x: number, sy: number, size: number, color = C.dark, align: "left" | "right" = "left") {
    let dx = x;
    if (align === "right") {
      dx = x - f.widthOfTextAtSize(s, size);
    }
    page.drawText(s, { x: dx, y: sy, size, font: f, color });
  }

  function line(x1: number, y1: number, x2: number, y2: number, thick = 0.5, color = C.border) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: thick, color });
  }

  function rect(x: number, y: number, w: number, h: number, fill = C.white, stroke?: ReturnType<typeof rgb>, thick = 0.5) {
    page.drawRectangle({ x, y: y - h, height: h, width: w, color: fill, borderColor: stroke, borderWidth: thick });
  }

  function checkPage(need: number) {
    if (y - need < 70) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
      return true;
    }
    return false;
  }

  // ── Top bar ──────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 815, width: PAGE_W, height: 26, color: C.blue });
  txt(bold, tenant.name.toUpperCase(), L, 822, 13, C.white);

  // ── Clinic info ───────────────────────────────────────────────
  y = 790;
  txt(bold, "PHIEU DE XUAT DIEU TRI / TREATMENT PLAN", L, y, 15, C.blue);
  y -= lh * 0.8;
  txt(font, `${branch.name}  |  ${branch.address}`, L, y, 9, C.gray);
  y -= lh * 0.8;
  if (tenant.email) txt(font, `Email: ${tenant.email}`, L, y, 9, C.gray);
  y -= lh;

  line(L, y, R, y, 1.5, C.blue);
  y -= lh * 1.2;

  // ── Plan meta ────────────────────────────────────────────────
  const statusStyle = STATUS_STYLE[plan.status] || STATUS_STYLE.proposed;
  const statusLabel = `${statusStyle.label}  |  ${plan.id}`;
  const badgeW = bold.widthOfTextAtSize(statusLabel, 9) + 16;
  page.drawRectangle({ x: L, y: y - 16, width: badgeW, height: 20, color: statusStyle.bg, borderColor: statusStyle.color, borderWidth: 1 });
  txt(bold, statusLabel, L + 8, y - 5, 9, statusStyle.color);
  const dateLabel = `Ngay tao: ${new Date(plan.created_at).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  txt(font, dateLabel, R, y - 5, 9, C.gray, "right");
  y -= lh * 2;

  // ── Patient info card ────────────────────────────────────────
  page.drawRectangle({ x: L, y: y - 80, width: CW, height: 72, color: C.headerBg, borderColor: C.border, borderWidth: 1 });
  page.drawRectangle({ x: L, y: y - 22, width: CW, height: 22, color: C.blue });
  txt(bold, "THONG TIN BENH NHAN", L + 10, y - 15, 10, C.white);

  const py = y - 36;
  const mid = L + CW / 2;
  const row = lh + 3;

  txt(bold, "Ho va ten:", L + 10, py, 9, C.gray);
  txt(bold, patient.name, L + 75, py, 10, C.dark);

  txt(bold, "Ngay sinh:", mid, py, 9, C.gray);
  txt(font, patient.date_of_birth, mid + 70, py, 10, C.dark);

  txt(bold, "Gioi tinh:", L + 10, py - row, 9, C.gray);
  txt(font, patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nu" : "Khac", L + 75, py - row, 10, C.dark);

  txt(bold, "Dien thoai:", mid, py - row, 9, C.gray);
  txt(font, patient.phone, mid + 70, py - row, 10, C.dark);

  y -= 80 + lh;

  // ── Treatment table ──────────────────────────────────────────
  txt(bold, "CHI TIET DIEU TRI", L, y, 11, C.dark);
  y -= lh * 1.4;

  const COL_TOOTH = L;
  const COL_PROC = L + 45;
  const COL_DESC = L + 140;
  const COL_UNIT = R - 100;
  const COL_TOTAL = R;

  const TH = 22;
  page.drawRectangle({ x: L, y: y - TH, width: CW, height: TH, color: C.blue });
  txt(bold, "#", COL_TOOTH + 4, y - 15, 9, C.white);
  txt(bold, "Thu thuat", COL_PROC, y - 15, 9, C.white);
  txt(bold, "Mo ta", COL_DESC, y - 15, 9, C.white);
  txt(bold, "Don gia", COL_UNIT, y - 15, 8, C.white, "right");
  txt(bold, "Thanh tien", COL_TOTAL, y - 15, 8, C.white, "right");

  y -= TH;
  const ROW_H = 28;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    checkPage(ROW_H);

    const even = i % 2 === 0;
    page.drawRectangle({ x: L, y: y - ROW_H, width: CW, height: ROW_H, color: even ? C.white : C.headerBg });
    line(L, y - ROW_H, R, y - ROW_H, 0.5, C.border);

    const cy = y - ROW_H / 2 + 4;
    const toothStr = `#${item.tooth_number}`;
    const toothW = bold.widthOfTextAtSize(toothStr, 9) + 8;
    page.drawRectangle({ x: COL_TOOTH + 2, y: cy - 8, width: toothW, height: 16, color: C.blueLight });
    txt(bold, toothStr, COL_TOOTH + 5, cy - 2, 9, C.blue);

    const procLabel = PROC_LABELS[item.procedure] || item.procedure;
    txt(font, procLabel, COL_PROC, cy - 2, 9, C.dark);
    txt(font, item.description, COL_DESC, cy + 3, 8, C.gray);

    txt(font, formatVnd(item.unit_cost), COL_UNIT, cy - 2, 9, C.dark, "right");
    txt(bold, formatVnd(item.unit_cost), COL_TOTAL, cy - 2, 9, C.dark, "right");

    y -= ROW_H;
  }

  line(L, y, R, y, 1, C.border);
  y -= lh * 0.6;

  // ── Total ───────────────────────────────────────────────────
  checkPage(60);
  page.drawRectangle({ x: L, y: y - 44, width: CW, height: 44, color: C.blueLight });
  txt(bold, "TONG CONG (VAT CHUA) / SUBTOTAL", L + 12, y - 16, 10, C.blue);
  txt(bold, formatVnd(plan.total_cost), R, y - 16, 14, C.blue, "right");
  const count = items.length;
  const uniqProc = new Set(items.map((i) => i.procedure)).size;
  txt(font, `${count} hang muc  |  ${uniqProc} thu thuat`, L + 12, y - 32, 9, C.gray);
  y -= 44 + lh;

  // ── Notes ────────────────────────────────────────────────────
  if (plan.notes) {
    checkPage(56);
    page.drawRectangle({ x: L, y: y - 48, width: CW, height: 48, color: C.tealLight, borderColor: C.teal, borderWidth: 1 });
    txt(bold, "Ghi chu / Notes", L + 10, y - 14, 9, C.teal);
    txt(font, plan.notes, L + 10, y - 28, 9, C.dark);
    y -= 48 + lh;
  }

  // ── Signature ────────────────────────────────────────────────
  checkPage(100);
  y -= 10;
  const sigW = (CW - 20) / 2;

  page.drawRectangle({ x: L, y: y - 80, width: sigW, height: 80, color: C.white, borderColor: C.border, borderWidth: 1 });
  line(L, y - 30, L + sigW, y - 30, 0.5, C.border);
  txt(bold, "XAC NHAN CUA PHONG KHAM", L + 10, y - 20, 8, C.gray);
  txt(font, `Nguoi duyet: ${approverName}`, L + 10, y - 42, 9, C.dark);
  if (plan.approved_at) {
    txt(font, `Ngay: ${new Date(plan.approved_at).toLocaleDateString("vi-VN")}`, L + 10, y - 56, 9, C.gray);
  }
  txt(font, "(Ky va dong dau)", L + 10, y - 72, 8, C.gray);

  page.drawRectangle({ x: L + sigW + 20, y: y - 80, width: sigW, height: 80, color: C.white, borderColor: C.border, borderWidth: 1 });
  line(L + sigW + 20, y - 30, L + sigW + 20 + sigW, y - 30, 0.5, C.border);
  txt(bold, "XAC NHAN CUA KHACH HANG", L + sigW + 30, y - 20, 8, C.gray);
  txt(font, "Ten: __________________________", L + sigW + 30, y - 42, 9, C.dark);
  txt(font, "Ngay: _________________________", L + sigW + 30, y - 56, 9, C.dark);
  txt(font, "(Ky xac nhan dong y)", L + sigW + 30, y - 72, 8, C.gray);

  // ── Footer ───────────────────────────────────────────────────
  const footerY = 30;
  line(L, footerY + 12, R, footerY + 12, 0.5, C.border);
  txt(font, `${tenant.name}  |  Ma: ${plan.id}`, L, footerY, 8, C.gray);
  txt(font, "Trang " + pdf.getPageCount(), R, footerY, 8, C.gray, "right");
  txt(font, "Tai lieu chi co tinh thong tin — Khong thanh lap quan he phap ly.", L, footerY - 10, 7, C.gray);
  txt(font, "This document is for informational purposes only.", L, footerY - 18, 7, C.gray);

  return pdf.save();
}
