import { useEffect, useState, type InputHTMLAttributes } from "react";
import { Input } from "./input";

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
export function DateInput({ value, onChange, ...props }: DateInputProps) {
  const formattedValue = formatDateValue(value);
  const [displayValue, setDisplayValue] = useState(formattedValue);

  useEffect(() => {
    setDisplayValue(formattedValue);
  }, [formattedValue]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder="dd/mm/yyyy"
      value={displayValue}
      onChange={(event) => {
        const nextValue = formatTypingValue(event.target.value);
        setDisplayValue(nextValue);
        const parsedValue = parseDateValue(nextValue);
        if (parsedValue) onChange(parsedValue);
      }}
      onBlur={(event) => {
        if (parseDateValue(displayValue)) {
          event.currentTarget.setCustomValidity("");
          return;
        }
        setDisplayValue(formattedValue);
        event.currentTarget.setCustomValidity(displayValue ? "Ngày không hợp lệ" : "");
      }}
    />
  );
}
