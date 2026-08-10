import { Button } from '@/components/ui/button';
import { ChevronFirst, ChevronLeft, ChevronRight, ChevronLast } from 'lucide-react';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/**
 * Returns the pages to display, using '...' to truncate long lists.
 * Mirrors the pattern in the user-provided mockup:
 *   1 2 3 [4] 5 … 22
 *   1 … 6 [7] 8 … 22
 *   1 … 18 19 [20] 21 22
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];

  if (current <= 4) {
    for (let i = 2; i <= 5; i++) pages.push(i);
    pages.push('...');
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push('...');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push('...');
    pages.push(current - 1);
    pages.push(current);
    pages.push(current + 1);
    pages.push('...');
    pages.push(total);
  }
  return pages;
}

export function PaginationBar({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 py-2 flex-wrap" dir="ltr">
      {/* Force LTR so the chevron icons render in their natural direction
          regardless of the surrounding page's RTL context. */}
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={page === 1}
        onClick={() => onPageChange(1)}
        aria-label="الصفحة الأولى"
      >
        <ChevronFirst size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="السابق"
      >
        <ChevronLeft size={16} />
      </Button>

      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="px-2 text-muted-foreground select-none tabular-nums">
            …
          </span>
        ) : (
          <Button
            key={`p${p}`}
            variant={p === page ? 'default' : 'ghost'}
            size="icon"
            className="h-9 w-9 tabular-nums"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="التالي"
      >
        <ChevronRight size={16} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        disabled={page === totalPages}
        onClick={() => onPageChange(totalPages)}
        aria-label="الصفحة الأخيرة"
      >
        <ChevronLast size={16} />
      </Button>
    </div>
  );
}
