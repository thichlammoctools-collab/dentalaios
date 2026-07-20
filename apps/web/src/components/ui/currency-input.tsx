import { forwardRef, type InputHTMLAttributes, useState, useEffect } from "react";
import { Input } from "./input";
import { formatCurrency, parseCurrency } from "@/lib/currency";

interface CurrencyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  value: number | "";
  onChange: (value: number | "") => void;
}

/**
 * Input component tự động format số tiền với dấu cách phân cách hàng nghìn (100 000).
 *
 * @example
 * const [amount, setAmount] = useState<number | "">("");
 * <CurrencyInput value={amount} onChange={setAmount} placeholder="VD: 500 000" />
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState("");

    // Sync display value khi value prop thay đổi từ bên ngoài
    useEffect(() => {
      if (value === "") {
        setDisplayValue("");
      } else if (typeof value === "number") {
        setDisplayValue(formatCurrency(value));
      }
    }, [value]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const input = e.target.value;

      // Cho phép xoá hết
      if (input === "") {
        setDisplayValue("");
        onChange("");
        return;
      }

      // Chấp nhận số cùng dấu cách hoặc dấu chấm khi dán dữ liệu.
      if (!/^[\d.\s]*$/.test(input)) {
        return;
      }

      // Parse về number
      const numValue = parseCurrency(input);

      // Cập nhật display với format
      setDisplayValue(formatCurrency(numValue));

      // Trả về number cho parent
      onChange(numValue);
    }

    function handleBlur() {
      // Re-format khi blur để đảm bảo format chuẩn
      if (displayValue && value !== "") {
        setDisplayValue(formatCurrency(value));
      }
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
