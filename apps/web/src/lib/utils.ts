import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "VND"): string {
  const formatted = new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(amount);
  return `${formatted} vnđ`;
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "08:30" from ISO datetime */
export function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Vietnamese weekday label. weekday: 1=Mon..7=Sun */
export function weekdayLabel(weekday: number): string {
  const labels: Record<number, string> = {
    1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5",
    5: "Thứ 6", 6: "Thứ 7", 7: "Chủ nhật",
  };
  return labels[weekday] ?? `Thứ ${weekday}`;
}

/** Get the weekday (1=Mon..7=Sun) of an ISO date in local timezone */
export function getWeekday(iso: string | Date): number {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  return jsDay === 0 ? 7 : jsDay;
}

/** Get Monday of the week containing the given date */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 7 dates from Monday */
export function getWeekDays(reference: Date): Date[] {
  const monday = startOfWeek(reference);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** "2026-07-15" */
export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Combine date (YYYY-MM-DD) + time (HH:MM) → ISO datetime (local timezone) */
export function combineDateTime(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`);
  return d.toISOString();
}

/** ISO datetime → "YYYY-MM-DD" */
export function isoToYmd(iso: string): string {
  return ymd(new Date(iso));
}

/** ISO datetime → "HH:MM" (local) */
export function isoToTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}