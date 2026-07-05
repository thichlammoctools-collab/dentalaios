/**
 * Treatment plan proposal PDF generator — professional A4 layout.
 *
 * Uses pdf-lib with Noto Sans Vietnamese (fetched from CDN) for
 * full Vietnamese diacritic support. Falls back to Helvetica if
 * font fetch fails.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

function formatCurrency(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface BuildPdfInput {
  tenant: { name: string; phone?: string; email?: string };
  branch: { name: string; address: string; phone?: string };
  patient: {
    name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
    address?: string;
  };
  plan: {
    id: string;
    status: string;
    total_cost: number;
    currency: string;
    notes?: string;
    approved_at?: string | null;
    created_at: string;
  };
  items: {
    tooth_number?: number;
    procedure: string;
    description: string;
    unit_cost: number;
    status: string;
  }[];
  approverName: string;
}

// Color palette
const COLORS = {
  primary: rgb(0.11, 0.36, 0.65),     // #1C5CA6 — professional blue
  primaryLight: rgb(0.93, 0.96, 1),    // light blue bg
  accent: rgb(0.16, 0.67, 0.57),       // #29AA91 — teal accent
  accentLight: rgb(0.94, 0.98, 0.97),  // teal bg
  warning: rgb(0.84, 0.55, 0.1),        // #D68C1A — amber
  warningLight: rgb(1, 0.97, 0.91),
  success: rgb(0.13, 0.59, 0.33),       // #219754
  successLight: rgb(0.93, 0.98, 0.94),
  destructive: rgb(0.74, 0.12, 0.12),   // #BD1E1E
  destructiveLight: rgb(1, 0.94, 0.94),
  proposed: rgb(0.35, 0.38, 0.42),
  proposedLight: rgb(0.96, 0.96, 0.97),
  text: rgb(0.13, 0.14, 0.16),         // dark text
  textLight: rgb(0.45, 0.49, 0.55),    // muted text
  border: rgb(0.86, 0.87, 0.89),        // light gray border
  headerBg: rgb(0.97, 0.98, 0.99),
  white: rgb(1, 1, 1),
};

const STATUS_COLORS: Record<string, { fg: ReturnType<typeof rgb>; bg: ReturnType<typeof rgb>; label: string }> = {
  proposed: { fg: COLORS.proposed, bg: COLORS.proposedLight, label: "De xuat" },
  approved: { fg: COLORS.success, bg: COLORS.successLight, label: "Da duyet" },
  completed: { fg: COLORS.accent, bg: COLORS.accentLight, label: "Hoan thanh" },
  cancelled: { fg: COLORS.destructive, bg: COLORS.destructiveLight, label: "Da huy" },
  in_progress: { fg: COLORS.warning, bg: COLORS.warningLight, label: "Dang thuc hien" },
};

const PROCEDURE_LABELS: Record<string, string> = {
  examination: "Kham va chan doan",
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

async function loadVietnameseFont(pdf: PDFDocument): Promise<{ font: PDFFont; bold: PDFFont }> {
  try {
    // Try to fetch Noto Sans Vietnamese from jsDelivr CDN
    const fontUrl = "https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-sans-vietnamese@latest/files/noto-sans-vietnamese-wght-normal.woff2";
    const res = await fetch(fontUrl);
    if (res.ok) {
      const fontBytes = await res.arrayBuffer();
      const font = await pdf.embedFont(fontBytes);
      return { font, bold: font };
    }
  } catch {
    // fall through to fallback
  }
  // Fallback: Helvetica (won't render Vietnamese diacritics, but layout works)
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { font, bold };
}

export async function buildProposalPdf(input: BuildPdfInput): Promise<Uint8Array> {
  const { tenant, branch, patient, plan, items, approverName } = input;
  const pdf = await PDFDocument.create();

  const { font, bold } = await loadVietnameseFont(pdf);

  let page = pdf.addPage([595.28, 841.89]); // A4
  const pageW = 595.28;
  const left = 40;
  const right = pageW - 40;
  const contentW = right - left;

  let y = 810;
  const lineH = 16;
  const smallLineH = 13;

  // ── Page 1: Cover layout ──────────────────────────────────────

  // Top accent bar
  page.drawRectangle({
    x: 0, y: y - 4, width: pageW, height: 6,
    color: COLORS.primary,
  });

  // Clinic name + address
  y -= lineH * 2.5;
  drawText(page, bold, tenant.name.toUpperCase(), left, y, 18, { color: COLORS.primary });
  y -= lineH;
  drawText(page, font, `${branch.name} | ${branch.address}`, left, y, 10, { color: COLORS.textLight });
  if (tenant.email) {
    drawText(page, font, `Email: ${tenant.email}`, left, y - smallLineH, 9, { color: COLORS.textLight });
  }

  // Horizontal divider
  y -= lineH * 2.2;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.5, color: COLORS.primary });
  y -= lineH * 0.8;

  // Document title
  drawText(page, bold, "PHIEU DE XUAT DIEU TRI", left, y, 20, { color: COLORS.text });
  y -= lineH * 0.6;
  drawText(page, font, "Treatment Plan Proposal", left, y, 9, { color: COLORS.textLight });
  y -= lineH * 1.5;

  // Status badge
  const status = STATUS_COLORS[plan.status] || STATUS_COLORS.proposed;
  const badgeLabel = `${status.label} | ${plan.id}`;
  const badgeW = bold.widthOfTextAtSize(badgeLabel, 9) + 16;
  page.drawRectangle({ x: left, y: y - 10, width: badgeW, height: 20, color: status.bg, borderColor: status.fg, borderWidth: 1 });
  drawText(page, bold, badgeLabel, left + 8, y - 1, 9, { color: status.fg });

  // Plan date on right
  const dateLabel = `Ngay: ${new Date(plan.created_at).toLocaleDateString("vi-VN")}`;
  drawText(page, font, dateLabel, right, y - 1, 10, { color: COLORS.textLight, align: "right" });
  y -= lineH * 2;

  // ── Patient info card ─────────────────────────────────────────
  const cardR = right;
  const cardLeft = left;
  page.drawRectangle({
    x: cardLeft, y: y - 108, width: contentW, height: 100,
    color: COLORS.headerBg, borderColor: COLORS.border, borderWidth: 1,
  });

  page.drawRectangle({
    x: cardLeft, y: y - 24, width: contentW, height: 24,
    color: COLORS.primary,
  });
  drawText(page, bold, "THONG TIN BENH NHAN", cardLeft + 10, y - 18, 10, { color: COLORS.white });

  const infoY = y - 38;
  const col1 = cardLeft + 12;
  const col2 = cardLeft + contentW / 2 + 8;
  const rowH = smallLineH + 2;

  drawText(page, bold, "Ho va ten:", col1, infoY, 9, { color: COLORS.textLight });
  drawText(page, bold, patient.name, col1 + 80, infoY, 10, { color: COLORS.text });

  drawText(page, bold, "Ngay sinh:", col2, infoY, 9, { color: COLORS.textLight });
  drawText(page, font, patient.date_of_birth, col2 + 70, infoY, 10, { color: COLORS.text });

  drawText(page, bold, "Gioi tinh:", col1, infoY - rowH, 9, { color: COLORS.textLight });
  drawText(page, font, patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nu" : "Khac", col1 + 70, infoY - rowH, 10, { color: COLORS.text });

  drawText(page, bold, "Dien thoai:", col2, infoY - rowH, 9, { color: COLORS.textLight });
  drawText(page, font, patient.phone, col2 + 70, infoY - rowH, 10, { color: COLORS.text });

  y = y - 108 - lineH * 2;

  // ── Treatment items table ─────────────────────────────────────
  drawText(page, bold, "CHI TIET DIEU TRI", left, y, 11, { color: COLORS.text });
  y -= lineH * 1.5;

  // Table header
  const colTooth = left;
  const colProc = left + 44;
  const colDesc = left + 140;
  const colUnit = right - 100;
  const colTotal = right;

  page.drawRectangle({ x: left, y: y - 22, width: contentW, height: 22, color: COLORS.primary });
  drawText(page, bold, "Rang", colTooth + 4, y - 15, 9, { color: COLORS.white });
  drawText(page, bold, "Thu thuat", colProc, y - 15, 9, { color: COLORS.white });
  drawText(page, bold, "Mo ta", colDesc, y - 15, 9, { color: COLORS.white });
  drawText(page, bold, "Don gia", colUnit, y - 15, 9, { color: COLORS.white, align: "right", width: 90 });
  drawText(page, bold, "Thanh tien", colTotal, y - 15, 9, { color: COLORS.white, align: "right", width: 90 });

  y -= 22;

  const rowH_t = 28;
  let pageNum = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isEven = i % 2 === 0;

    if (y - rowH_t < 80) {
      // Add new page
      page = pdf.addPage([595.28, 841.89]);
      y = 810;
      pageNum++;
      drawFooter(page, pdf, bold, font, pageNum, tenant.name, plan.id, pageW, right);
      y -= lineH * 2;
    }

    const rowY = y - rowH_t;
    page.drawRectangle({ x: left, y: rowY, width: contentW, height: rowH_t, color: isEven ? COLORS.white : COLORS.headerBg });
    page.drawLine({ start: { x: left, y: rowY }, end: { x: right, y: rowY }, thickness: 0.5, color: COLORS.border });
    page.drawLine({ start: { x: right, y: rowY }, end: { x: right, y: rowY + rowH_t }, thickness: 0.5, color: COLORS.border });

    const cellY = rowY + rowH_t / 2 + 3;

    // Tooth number badge
    const toothStr = item.tooth_number != null ? `#${item.tooth_number}` : "Toàn hàm";
    const toothW = bold.widthOfTextAtSize(toothStr, 9) + 8;
    page.drawRectangle({ x: colTooth + 2, y: cellY - 8, width: toothW, height: 16, color: COLORS.primaryLight });
    drawText(page, bold, toothStr, colTooth + 5, cellY - 2, 9, { color: COLORS.primary });

    // Procedure
    const procLabel = PROCEDURE_LABELS[item.procedure] || item.procedure;
    drawText(page, font, procLabel, colProc, cellY - 2, 9, { color: COLORS.text });

    // Description
    drawText(page, font, item.description, colDesc, cellY + 2, 8, { color: COLORS.textLight });

    // Unit cost
    drawText(page, font, formatCurrency(item.unit_cost, plan.currency), colUnit, cellY - 2, 9, { color: COLORS.text, align: "right", width: 90 });

    // Total (same as unit cost for single item)
    drawText(page, bold, formatCurrency(item.unit_cost, plan.currency), colTotal, cellY - 2, 9, { color: COLORS.text, align: "right", width: 90 });

    y -= rowH_t;
  }

  // Bottom table border
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: COLORS.border });

  y -= lineH * 0.5;

  // ── Total section ──────────────────────────────────────────────
  const totalY = y;

  page.drawRectangle({ x: left, y: totalY - 48, width: contentW, height: 48, color: COLORS.primaryLight });

  const totalLabel = "TONG CONG (VAT CHUA) / SUBTOTAL";
  drawText(page, bold, totalLabel, left + 12, totalY - 18, 10, { color: COLORS.primary });
  drawText(page, bold, formatCurrency(plan.total_cost, plan.currency), right, totalY - 18, 14, { color: COLORS.primary, align: "right", width: 120 });

  const itemCount = items.length;
  const treatmentCount = new Set(items.map((i) => i.procedure)).size;
  drawText(page, font, `${itemCount} hang muc | ${treatmentCount} thu thuat`, left + 12, totalY - 36, 9, { color: COLORS.textLight });

  y -= 48 + lineH;

  // ── Notes ──────────────────────────────────────────────────────
  if (plan.notes) {
    page.drawRectangle({ x: left, y: y - 52, width: contentW, height: 52, color: COLORS.accentLight, borderColor: COLORS.accent, borderWidth: 1 });
    drawText(page, bold, "Ghi chu / Notes", left + 10, y - 14, 9, { color: COLORS.accent });
    drawText(page, font, plan.notes, left + 10, y - 28, 9, { color: COLORS.text });
    y -= 52 + lineH;
  }

  y -= lineH;

  // ── Signature section ──────────────────────────────────────────
  const sigY = y - 10;
  const sigW = (contentW - 20) / 2;

  // Left: Approver
  page.drawRectangle({ x: left, y: sigY - 80, width: sigW, height: 80, color: COLORS.white, borderColor: COLORS.border, borderWidth: 1 });
  page.drawLine({ start: { x: left, y: sigY - 30 }, end: { x: left + sigW, y: sigY - 30 }, thickness: 0.5, color: COLORS.border });
  drawText(page, bold, "XAC NHAN CUA PHONG KHAM", left + 10, sigY - 20, 8, { color: COLORS.textLight });
  drawText(page, font, `Nguoi duyet: ${approverName}`, left + 10, sigY - 42, 9, { color: COLORS.text });
  if (plan.approved_at) {
    drawText(page, font, `Ngay: ${new Date(plan.approved_at).toLocaleDateString("vi-VN")}`, left + 10, sigY - 56, 9, { color: COLORS.textLight });
  }
  drawText(page, font, "(Ky va dong dau)", left + 10, sigY - 72, 8, { color: COLORS.textLight });

  // Right: Terms
  page.drawRectangle({ x: left + sigW + 20, y: sigY - 80, width: sigW, height: 80, color: COLORS.white, borderColor: COLORS.border, borderWidth: 1 });
  page.drawLine({ start: { x: left + sigW + 20, y: sigY - 30 }, end: { x: left + sigW + 20 + sigW, y: sigY - 30 }, thickness: 0.5, color: COLORS.border });
  drawText(page, bold, "XAC NHAN CUA KHACH HANG", left + sigW + 30, sigY - 20, 8, { color: COLORS.textLight });
  drawText(page, font, "Ten: __________________________", left + sigW + 30, sigY - 42, 9, { color: COLORS.text });
  drawText(page, font, "Ngay: _________________________", left + sigW + 30, sigY - 56, 9, { color: COLORS.text });
  drawText(page, font, "(Ky xac nhan dong y)", left + sigW + 30, sigY - 72, 8, { color: COLORS.textLight });

  // ── Footer ─────────────────────────────────────────────────────
  drawFooter(page, pdf, bold, font, pageNum, tenant.name, plan.id, pageW, right);

  return pdf.save();
}

function drawFooter(
  page: ReturnType<PDFDocument["addPage"]>,
  pdf: PDFDocument,
  bold: PDFFont,
  font: PDFFont,
  pageNum: number,
  clinicName: string,
  planId: string,
  pageW: number,
  right: number,
) {
  const footerY = 30;
  page.drawLine({ start: { x: 40, y: footerY + 10 }, end: { x: pageW - 40, y: footerY + 10 }, thickness: 0.5, color: COLORS.border });
  drawText(page, font, `${clinicName} | Ma: ${planId}`, 40, footerY, 8, { color: COLORS.textLight });
  drawText(page, font, `Trang ${pageNum}`, right, footerY, 8, { color: COLORS.textLight, align: "right" });
  drawText(page, font, "Tai lieu chi co tinh thong tin — Khong thanh lap quan he phap ly.", 40, footerY - 10, 7, { color: COLORS.textLight });
  drawText(page, font, "This document is for informational purposes only — does not constitute a legal contract.", 40, footerY - 18, 7, { color: COLORS.textLight });
}

function drawText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  opts?: { color?: ReturnType<typeof rgb>; align?: "left" | "right"; width?: number },
) {
  let drawX = x;
  if (opts?.align === "right" && opts.width !== undefined) {
    const w = font.widthOfTextAtSize(text, size);
    drawX = x + opts.width - w;
  }
  page.drawText(text, {
    x: drawX,
    y,
    size,
    font,
    color: opts?.color ?? COLORS.text,
  });
}
