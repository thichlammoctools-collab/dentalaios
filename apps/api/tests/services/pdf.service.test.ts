import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildProposalPdf } from "../../src/services/pdf.service";

describe("buildProposalPdf", () => {
  it("creates a valid multi-page PDF for long treatment plans", async () => {
    const bytes = await buildProposalPdf({
      tenant: { name: "Nha khoa ABC" },
      branch: { name: "Chi nhanh chinh", address: "1 Duong Mau" },
      patient: { name: "Nguyen Van A", date_of_birth: "1990-01-01", gender: "M", phone: "0901234567" },
      plan: {
        id: "plan-1",
        status: "draft",
        total_cost: 25_000_000,
        currency: "VND",
        notes: "Ghi chu dieu tri can duoc trao doi ky voi benh nhan truoc khi thuc hien.",
        created_at: "2026-07-20",
      },
      items: Array.from({ length: 40 }, (_, index) => ({
        tooth_number: 11 + (index % 8),
        service_code: "TRAM-COM",
        service_name: "Tram composite",
        procedure: "filling",
        description: "Mo ta dieu tri chi tiet de kiem tra viec xuong dong va phan trang trong file PDF.",
        unit_cost: 625_000,
        price_includes_vat: true,
        status: "planned",
      })),
      approverName: "Bac si Demo",
    });

    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    await expect(PDFDocument.load(bytes)).resolves.toMatchObject({});
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
  });
});
