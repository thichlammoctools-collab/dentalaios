import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

function formatDateValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function formatTypingValue(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseDateValue(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

/** Date input displayed as dd/MM/yyyy while preserving an ISO value for the API. */
export function DateInput({ value, onChange, min, ...props }: DateInputProps) {
  const formattedValue = formatDateValue(value);
  const [displayValue, setDisplayValue] = useState(formattedValue);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayValue(formattedValue);
  }, [formattedValue]);

  const { className, disabled, ...inputProps } = props;

  return <div className="relative">
    <Input
      {...inputProps}
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder="dd/mm/yyyy"
      disabled={disabled}
      className={cn("pr-10", className)}
      value={displayValue}
      onChange={(event) => {
        const nextValue = formatTypingValue(event.target.value);
        setDisplayValue(nextValue);
        const parsedValue = parseDateValue(nextValue);
        if (parsedValue && (!min || parsedValue >= min)) onChange(parsedValue);
      }}
      onBlur={(event) => {
        const parsedValue = parseDateValue(displayValue);
        if (parsedValue && (!min || parsedValue >= min)) {
          event.currentTarget.setCustomValidity("");
          return;
        }
        setDisplayValue(formattedValue);
        event.currentTarget.setCustomValidity(displayValue ? min ? "Ngày không được trước ngày tối thiểu" : "Ngày không hợp lệ" : "");
      }}
    />
    <button
      type="button"
      disabled={disabled}
      aria-label="Chọn ngày từ lịch"
      onClick={() => {
        const picker = pickerRef.current;
        if (!picker) return;
        if (typeof picker.showPicker === "function") picker.showPicker();
        else picker.focus();
      }}
      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    </button>
    <input
      ref={pickerRef}
      type="date"
      tabIndex={-1}
      aria-hidden="true"
      value={value.slice(0, 10)}
      min={min}
      onChange={(event) => onChange(event.target.value)}
      className="pointer-events-none absolute h-px w-px opacity-0"
    />
  </div>;
}
