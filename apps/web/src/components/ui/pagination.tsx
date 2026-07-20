import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
}

export const DEFAULT_PAGE_SIZE = 25;

export function Pagination({ page, pageSize, total, disabled = false, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  if (total <= pageSize) return null;

  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Hiển thị {start}-{end} trong {total} bản ghi
      </p>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Button size="sm" variant="outline" disabled={disabled || currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>
          Trước
        </Button>
        <span className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
          Trang {currentPage}/{pageCount}
        </span>
        <Button size="sm" variant="outline" disabled={disabled || currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}
