import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface MultiSearchableSelectOption {
  value: string;
  label: string;
}

interface MultiSearchableSelectProps {
  options: MultiSearchableSelectOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  /** Shown when nothing is selected (i.e. "all"). */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
}

/**
 * Multi-select dropdown with an inline search box. Selecting an option toggles
 * it without closing the list, so several can be picked in one pass. An empty
 * selection means "all" and shows the placeholder; the X clears everything.
 */
export function MultiSearchableSelect({
  options,
  values,
  onValuesChange,
  placeholder = 'الكل',
  searchPlaceholder = 'ابحث...',
  emptyMessage = 'لا توجد نتائج',
  className,
}: MultiSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedSet = useMemo(() => new Set(values), [values]);

  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find(o => o.value === values[0])?.label ?? '١ محدّد'
        : `${values.length} محدّد`;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch('');
    }
  }, [open]);

  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onValuesChange(values.filter(v => v !== value));
    } else {
      onValuesChange([...values, value]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', values.length === 0 && 'text-muted-foreground', className)}
        >
          <span className="truncate">{triggerLabel}</span>
          <div className="flex items-center gap-1 shrink-0">
            {values.length > 0 && (
              <X
                size={14}
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onValuesChange([]);
                }}
              />
            )}
            <ChevronsUpDown size={14} className="text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
          ) : (
            filtered.map(option => {
              const checked = selectedSet.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={cn(
                    'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors text-right',
                    checked ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                    )}
                  >
                    <Check size={12} className={cn(checked ? 'opacity-100' : 'opacity-0')} />
                  </span>
                  <span className="flex-1 text-right">{option.label}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
