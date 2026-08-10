import { PaginationBar } from '@/components/ui/pagination-bar';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Footer row for paginated tables: "عرض X–Y من Z" caption + PaginationBar.
 * Renders nothing when there are no rows.
 */
export function TablePagination({ page, pageSize, total, onPageChange }: Props) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t">
      <span className="text-xs text-muted-foreground tabular-nums">عرض {from}–{to} من {total}</span>
      <PaginationBar page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </div>
  );
}
