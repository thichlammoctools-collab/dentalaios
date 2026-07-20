/**
 * Treatment plan proposal PDF generator — clean A4 layout.
 *
 * Uses pdf-lib StandardFonts (Helvetica) with diacritics stripped from
 * Vietnamese text so WinAnsi encoding always succeeds.
 */

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Strip Vietnamese diacritics → ASCII base form. */
function strip(s: string): string {
  return s
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a")
    .replace(/[ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ]/g, "A")
    .replace(/[èéẹẻẽêềếệểễ]/g, "e")
    .replace(/[ÈÉẸẺẼÊỀẾỆỂỄ]/g, "E")
    .replace(/[ìíịỉĩ]/g, "i")
    .replace(/[ÌÍỊỈĨ]/g, "I")
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o")
    .replace(/[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]/g, "O")
    .replace(/[ùúụủũưừứựửữ]/g, "u")
    .replace(/[ÙÚỤỦŨƯỪỨỰỬỮ]/g, "U")
    .replace(/[ỳýỵỷỹ]/g, "y")
    .replace(/[ỲÝỴỶỸ]/g, "Y")
    .replace(/[đĐ]/g, "d");
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
  draft: { color: C.gray, bg: C.grayLight, label: "Ban nhap" },
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
  items: { tooth_number?: number; procedure: string; description: string; unit_cost: number; status: string }[];
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
    const safe = strip(s);
    const dx = align === "right" ? x - f.widthOfTextAtSize(safe, size) : x;
    page.drawText(safe, { x: dx, y: sy, size, font: f, color });
  }

  function line(x1: number, y1: number, x2: number, y2: number, thick = 0.5, color = C.border) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: thick, color });
  }

  function wrapText(text: string, maxWidth: number, textFont = font, size = 9): string[] {
    const words = strip(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (textFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else if (current) {
        lines.push(current);
        current = word;
      } else {
        lines.push(word.slice(0, Math.max(1, Math.floor(maxWidth / (size * 0.55)) - 1)) + "...");
        current = "";
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawTableHeader() {
    const TH = 22;
    page.drawRectangle({ x: L, y: y - TH, width: CW, height: TH, color: C.blue });
    txt(bold, "#", COL_TOOTH + 4, y - 15, 9, C.white);
    txt(bold, "Thu thuat", COL_PROC, y - 15, 9, C.white);
    txt(bold, "Mo ta", COL_DESC, y - 15, 9, C.white);
    txt(bold, "Don gia", COL_UNIT, y - 15, 8, C.white, "right");
    txt(bold, "Thanh tien", COL_TOTAL, y - 15, 8, C.white, "right");
    y -= TH;
  }

  function checkPage(need: number) {
    if (y - need < 70) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
    }
  }

  // ── Top bar ──────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 815, width: PAGE_W, height: 26, color: C.blue });
  txt(bold, strip(tenant.name).toUpperCase(), L, 822, 13, C.white);

  // ── Clinic info ───────────────────────────────────────────────
  y = 790;
  txt(bold, "PHIEU DE XUAT DIEU TRI / TREATMENT PLAN", L, y, 15, C.blue);
  y -= lh * 0.8;
  txt(font, `${strip(branch.name)}  |  ${strip(branch.address)}`, L, y, 9, C.gray);
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
  const dateLabel = `Ngay tao: ${formatDate(plan.created_at)}`;
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
  txt(bold, strip(patient.name), L + 75, py, 10, C.dark);

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

  drawTableHeader();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const descriptionLines = wrapText(item.description, COL_UNIT - COL_DESC - 12, font, 8).slice(0, 3);
    const rowHeight = Math.max(28, 12 + descriptionLines.length * 10);
    if (y - rowHeight < 70) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
      drawTableHeader();
    }

    const even = i % 2 === 0;
    page.drawRectangle({ x: L, y: y - rowHeight, width: CW, height: rowHeight, color: even ? C.white : C.headerBg });
    line(L, y - rowHeight, R, y - rowHeight, 0.5, C.border);

    const cy = y - rowHeight / 2 + 4;
    const toothStr = item.tooth_number != null ? `#${item.tooth_number}` : "—";
    const toothW = bold.widthOfTextAtSize(toothStr, 9) + 8;
    page.drawRectangle({ x: COL_TOOTH + 2, y: cy - 8, width: toothW, height: 16, color: C.blueLight });
    txt(bold, toothStr, COL_TOOTH + 5, cy - 2, 9, C.blue);

    const procLabel = PROC_LABELS[item.procedure] || item.procedure;
    txt(font, strip(procLabel), COL_PROC, cy - 2, 9, C.dark);
    descriptionLines.forEach((descriptionLine, index) => {
      txt(font, descriptionLine, COL_DESC, y - 12 - index * 10, 8, C.gray);
    });

    txt(font, formatAmount(item.unit_cost, plan.currency), COL_UNIT, cy - 2, 9, C.dark, "right");
    txt(bold, formatAmount(item.unit_cost, plan.currency), COL_TOTAL, cy - 2, 9, C.dark, "right");

    y -= rowHeight;
  }

  line(L, y, R, y, 1, C.border);
  y -= lh * 0.6;

  // ── Total ───────────────────────────────────────────────────
  checkPage(60);
  page.drawRectangle({ x: L, y: y - 44, width: CW, height: 44, color: C.blueLight });
  txt(bold, "TONG CONG (VAT CHUA) / SUBTOTAL", L + 12, y - 16, 10, C.blue);
  txt(bold, formatAmount(plan.total_cost, plan.currency), R, y - 16, 14, C.blue, "right");
  const count = items.length;
  const uniqProc = new Set(items.map((i) => i.procedure)).size;
  txt(font, `${count} hang muc  |  ${uniqProc} thu thuat`, L + 12, y - 32, 9, C.gray);
  y -= 44 + lh;

  // ── Notes ────────────────────────────────────────────────────
  if (plan.notes) {
    const noteLines = wrapText(plan.notes, CW - 20, font, 9).slice(0, 4);
    const notesHeight = 28 + noteLines.length * 11;
    checkPage(notesHeight + 8);
    page.drawRectangle({ x: L, y: y - notesHeight, width: CW, height: notesHeight, color: C.tealLight, borderColor: C.teal, borderWidth: 1 });
    txt(bold, "Ghi chu / Notes", L + 10, y - 14, 9, C.teal);
    noteLines.forEach((noteLine, index) => {
      txt(font, noteLine, L + 10, y - 28 - index * 11, 9, C.dark);
    });
    y -= notesHeight + lh;
  }

  // ── Signature ────────────────────────────────────────────────
  checkPage(100);
  y -= 10;
  const sigW = (CW - 20) / 2;

  page.drawRectangle({ x: L, y: y - 80, width: sigW, height: 80, color: C.white, borderColor: C.border, borderWidth: 1 });
  line(L, y - 30, L + sigW, y - 30, 0.5, C.border);
  txt(bold, "XAC NHAN CUA PHONG KHAM", L + 10, y - 20, 8, C.gray);
  txt(font, `Nguoi duyet: ${strip(approverName)}`, L + 10, y - 42, 9, C.dark);
  if (plan.approved_at) {
    txt(font, `Ngay: ${formatDate(plan.approved_at)}`, L + 10, y - 56, 9, C.gray);
  }
  txt(font, "(Ky va dong dau)", L + 10, y - 72, 8, C.gray);

  page.drawRectangle({ x: L + sigW + 20, y: y - 80, width: sigW, height: 80, color: C.white, borderColor: C.border, borderWidth: 1 });
  line(L + sigW + 20, y - 30, L + sigW + 20 + sigW, y - 30, 0.5, C.border);
  txt(bold, "XAC NHAN CUA KHACH HANG", L + sigW + 30, y - 20, 8, C.gray);
  txt(font, "Ten: __________________________", L + sigW + 30, y - 42, 9, C.dark);
  txt(font, "Ngay: _________________________", L + sigW + 30, y - 56, 9, C.dark);
  txt(font, "(Ky xac nhan dong y)", L + sigW + 30, y - 72, 8, C.gray);

  // ── Footer ───────────────────────────────────────────────────
  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    page = pdfPage;
    const pageNumber = index + 1;
    const footerY = 30;
    line(L, footerY + 12, R, footerY + 12, 0.5, C.border);
    txt(font, `${strip(tenant.name)}  |  Ma: ${plan.id}`, L, footerY, 8, C.gray);
    txt(font, `Trang ${pageNumber}/${pages.length}`, R, footerY, 8, C.gray, "right");
    txt(font, "Tai lieu chi co tinh thong tin — Khong thanh lap quan he phap ly.", L, footerY - 10, 7, C.gray);
    txt(font, "This document is for informational purposes only.", L, footerY - 18, 7, C.gray);
  });

  return pdf.save();
}
