import { ReactNode } from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SortDir } from '@/lib/use-table-sort';

/**
 * A clickable column header that drives useTableSort. Shows a neutral icon when
 * inactive and an up/down arrow for the active sort direction.
 */
export function SortableHead({
  label, sortKey, currentKey, currentDir, onSort, className,
}: {
  label: ReactNode;
  sortKey: string;
  currentKey: string | null;
  currentDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  const Icon = !active ? ChevronsUpDown : currentDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={cn('text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 -mx-1 px-1 rounded hover:text-foreground transition-colors group select-none"
        title="ترتيب"
      >
        <span>{label}</span>
        <Icon
          size={13}
          className={active ? 'text-foreground' : 'text-muted-foreground/40 group-hover:text-muted-foreground'}
        />
      </button>
    </TableHead>
  );
}
