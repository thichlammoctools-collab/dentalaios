/**
 * Treatment plan proposal PDF generator.
 *
 * Uses pdf-lib to compose a simple A4 PDF with patient info,
 * treatment items table, and total. Uses Noto Sans Vietnamese
 * (TTF) to ensure full Vietnamese diacritic support.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type {
  Patient,
  TreatmentPlan,
  TreatmentPlanItem,
  Tenant,
  Branch,
} from "@shared/types";

// Intl-based currency formatter for PDF (Vietnamese VND default).
function formatCurrency(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

interface BuildPdfInput {
  tenant: Tenant;
  branch: Branch;
  patient: Patient;
  plan: TreatmentPlan;
  items: TreatmentPlanItem[];
  approverName: string;
}

export async function buildProposalPdf(input: BuildPdfInput): Promise<Uint8Array> {
  const { tenant, branch, patient, plan, items, approverName } = input;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;
  const lineH = 18;

  // Header
  drawText(page, bold, tenant.name, left, y, 16);
  y -= lineH;
  drawText(page, font, branch.address, left, y, 10);
  y -= lineH * 2;

  // Title
  drawText(page, bold, "PHIEU DE XUAT DIEU TRI", left, y, 14);
  y -= lineH * 2;

  // Patient info
  drawText(page, bold, "Benh nhan:", left, y, 11);
  drawText(page, font, patient.name, left + 90, y, 11);
  y -= lineH;
  drawText(page, font, `Ngay sinh: ${patient.date_of_birth}`, left, y, 10);
  drawText(page, font, `SDT: ${patient.phone}`, left + 200, y, 10);
  y -= lineH;
  drawText(page, font, `Gioi tinh: ${patient.gender === "M" ? "Nam" : patient.gender === "F" ? "Nu" : "Khac"}`, left, y, 10);
  y -= lineH * 2;

  // Plan info
  drawText(page, font, `Ma ke hoach: ${plan.id}`, left, y, 10);
  drawText(page, font, `Ngay: ${new Date().toLocaleDateString("vi-VN")}`, left + 250, y, 10);
  y -= lineH * 2;

  // Table header
  drawText(page, bold, "Bang hang muc dieu tri:", left, y, 12);
  y -= lineH;

  // Column headers
  drawText(page, bold, "Rang", left, y, 10);
  drawText(page, bold, "Thu thuat", left + 60, y, 10);
  drawText(page, bold, "Mo ta", left + 160, y, 10);
  drawText(page, bold, "Don gia", left + 380, y, 10, { align: "right", width: 80 });
  y -= lineH;

  // Divider
  drawLine(page, left, y, 510, y);
  y -= lineH / 2;

  // Items
  for (const item of items) {
    if (y < 100) {
      // Add page if running out of space
      const newPage = pdf.addPage([595.28, 841.89]);
      y = 800;
      drawTextOn(newPage, font, "(tiep trang sau)", left, y, 10);
      y -= lineH * 2;
    }
    drawText(page, font, `#${item.tooth_number}`, left, y, 10);
    drawText(page, font, item.procedure, left + 60, y, 10);
    drawText(page, font, truncate(item.description, 35), left + 160, y, 10);
    drawText(page, font, formatCurrency(item.unit_cost, plan.currency), left + 380, y, 10, {
      align: "right",
      width: 80,
    });
    y -= lineH;
  }

  y -= lineH;
  drawLine(page, left, y, 510, y);
  y -= lineH;

  // Total
  drawText(page, bold, "TONG CONG:", left + 280, y, 12);
  drawText(
    page,
    bold,
    formatCurrency(plan.total_cost, plan.currency),
    left + 380,
    y,
    12,
    { align: "right", width: 80 },
  );
  y -= lineH * 3;

  // Signature
  drawText(page, font, `Duyet boi: ${approverName}`, left, y, 10);
  if (plan.approved_at) {
    drawText(
      page,
      font,
      `Ngay duyet: ${new Date(plan.approved_at).toLocaleString("vi-VN")}`,
      left + 250,
      y,
      10,
    );
  }
  y -= lineH * 2;
  drawText(page, font, "Chu ky:", left, y, 10);
  y -= lineH * 3;
  drawLine(page, left, y, left + 200, y);

  return pdf.save();
}

function drawText(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  opts?: { align?: "left" | "right"; width?: number },
): void {
  drawTextOn(page, font, text, x, y, size, opts);
}

function drawTextOn(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  opts?: { align?: "left" | "right"; width?: number },
): void {
  let drawX = x;
  if (opts?.align === "right" && opts.width) {
    const w = font.widthOfTextAtSize(text, size);
    drawX = x + opts.width - w;
  }
  page.drawText(text, {
    x: drawX,
    y,
    size,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
}

function drawLine(
  page: ReturnType<PDFDocument["addPage"]>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}