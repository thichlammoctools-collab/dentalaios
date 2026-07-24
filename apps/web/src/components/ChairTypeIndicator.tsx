import type { DentalChairType } from "@shared/types";

const CHAIR_TYPE_META: Record<DentalChairType, { label: string; colorClass: string }> = {
  general: { label: "Tổng quát", colorClass: "text-blue-600 dark:text-blue-400" },
  surgery: { label: "Phẫu thuật", colorClass: "text-rose-600 dark:text-rose-400" },
  orthodontic: { label: "Chỉnh nha", colorClass: "text-violet-600 dark:text-violet-400" },
  pediatric: { label: "Răng trẻ em", colorClass: "text-amber-600 dark:text-amber-400" },
  prosthodontics: { label: "Phục hình", colorClass: "text-emerald-600 dark:text-emerald-400" },
};

export function chairTypeLabel(type: DentalChairType): string {
  return CHAIR_TYPE_META[type].label;
}

export function ChairTypeIndicator({ type, showLabel = true, className = "" }: {
  type: DentalChairType;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = CHAIR_TYPE_META[type];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <ChairTypeIcon type={type} className={`h-6 w-6 shrink-0 ${meta.colorClass}`} />
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

function ChairTypeIcon({ type, className }: { type: DentalChairType; className: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (type) {
    case "surgery":
      return <svg {...common}><path d="M12 3 4.5 6v5.2c0 4.5 3.1 8.6 7.5 9.8 4.4-1.2 7.5-5.3 7.5-9.8V6L12 3Z" /><path d="M12 8v6M9 11h6" /></svg>;
    case "orthodontic":
      return <svg {...common}><path d="M7 5.5c1.2-1 2.9-1.5 5-1.5s3.8.5 5 1.5c1 1 1.5 2.4 1.5 4.2 0 3.2-1.9 6.3-4.7 8.2-.5.4-1.1.6-1.8.6s-1.3-.2-1.8-.6C7.4 16 5.5 12.9 5.5 9.7 5.5 7.9 6 6.5 7 5.5Z" /><path d="M7.5 10.5h9M9 9.3v2.4M12 9.3v2.4M15 9.3v2.4" /></svg>;
    case "pediatric":
      return <svg {...common}><path d="M7 10.5V8.3a2 2 0 0 1 4-1.2 2 2 0 0 1 2 0 2 2 0 0 1 4 1.2v2.2" /><path d="M6 10.5h12v5.2a3.3 3.3 0 0 1-3.3 3.3H9.3A3.3 3.3 0 0 1 6 15.7v-5.2Z" /><path d="M9.5 14h.01M14.5 14h.01M10 16.5c1.2.8 2.8.8 4 0" /></svg>;
    case "prosthodontics":
      return <svg {...common}><path d="m12 3 1.2 4.1L17 8.3l-3.8 1.2L12 14l-1.2-4.5L7 8.3l3.8-1.2L12 3Z" /><path d="m18.5 14 .6 2.1 1.9.6-1.9.6-.6 2.1-.6-2.1-1.9-.6 1.9-.6.6-2.1ZM5.5 15l.6 2.1 1.9.6-1.9.6-.6 2.1-.6-2.1-1.9-.6 1.9-.6.6-2.1Z" /></svg>;
    default:
      return <svg {...common}><path d="M7 5.5c1.2-1 2.9-1.5 5-1.5s3.8.5 5 1.5c1 1 1.5 2.4 1.5 4.2 0 3.2-1.9 6.3-4.7 8.2-.5.4-1.1.6-1.8.6s-1.3-.2-1.8-.6C7.4 16 5.5 12.9 5.5 9.7 5.5 7.9 6 6.5 7 5.5Z" /><path d="M12 7.5v2.5M10.75 8.75h2.5M8.5 13h.01M15.5 13h.01" /></svg>;
  }
}
