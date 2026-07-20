/**
 * Currency formatting utilities for Vietnamese Dong (VND).
 * Format: 100.000 (dấu chấm phân cách hàng nghìn)
 */

/**
 * Format number thành chuỗi có dấu chấm phân cách hàng nghìn.
 * @example formatCurrency(500000) // "500.000"
 * @example formatCurrency(1234567) // "1.234.567"
 */
export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("vi-VN");
}

/**
 * Parse chuỗi có dấu chấm phân cách về number.
 * @example parseCurrency("500.000") // 500000
 * @example parseCurrency("1.234.567") // 1234567
 */
export function parseCurrency(value: string): number {
  // Loại bỏ tất cả dấu chấm
  const cleaned = value.replace(/\./g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
