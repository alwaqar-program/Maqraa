import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

// Lenient matching: Arabic-Indic digits = Latin digits, hamza/taa-marbuta
// variants collapse (الانعام ≡ الأنعام), diacritics/tatweel ignored.
const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[٠-٩۰-۹]/g, d => ARABIC_DIGITS[d] ?? d)
    .replace(/[ً-ْٰـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
}

/** Every whitespace/|-separated token of the query must appear in the label. */
function matches(label: string, search: string): boolean {
  const norm = normalizeText(label);
  return normalizeText(search)
    .split(/[\s|،,]+/)
    .filter(Boolean)
    .every(token => norm.includes(token));
}

/** Lower = better. An exact match — whole label OR the name segment before «|»
 *  (the surah name in «السورة|الآية» options) — sorts first, then prefix, then
 *  substring. So «الحج» surfaces سورة الحج above سورة الحجر, and «ق» surfaces
 *  سورة ق above البقرة/الطلاق/الفلق, instead of being buried by the cap. */
function matchRank(label: string, search: string): number {
  const norm = normalizeText(label);
  const q = normalizeText(search).replace(/[\s|،,]+/g, ' ').trim();
  const namePart = norm.split('|')[0].trim();
  if (norm === q || namePart === q) return 0;
  if (norm.startsWith(q)) return 1;
  return 2;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
  /** Cap rendered rows (for very large lists); the rest is reachable by typing. */
  maxVisible?: number;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'اختر...',
  searchPlaceholder = 'ابحث...',
  emptyMessage = 'لا توجد نتائج',
  className,
  allowClear = false,
  disabled = false,
  maxVisible,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allFiltered = search.trim()
    ? options
        .filter(o => matches(o.label, search))
        .map((o, i) => ({ o, i, r: matchRank(o.label, search) }))
        .sort((a, b) => a.r - b.r || a.i - b.i) // rank first, stable within rank
        .map(x => x.o)
    : options;
  const truncated = maxVisible != null && allFiltered.length > maxVisible;
  const filtered = truncated ? allFiltered.slice(0, maxVisible) : allFiltered;

  const selectedLabel = options.find(o => o.value === value)?.label;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearch('');
    }
  }, [open]);

  // When this popover opens inside a Radix Dialog, the Dialog's scroll-lock
  // (react-remove-scroll) swallows wheel/touch events on the portaled popover,
  // so the list won't scroll (works fine outside a dialog). Drive the scroll
  // ourselves with a non-passive wheel listener — consistent in both contexts.
  useEffect(() => {
    const el = listRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      const atTop = el.scrollTop <= 0 && e.deltaY < 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight && e.deltaY > 0;
      if (!atTop && !atBottom) {
        el.scrollTop += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <div className="flex items-center gap-1 shrink-0">
            {allowClear && value && (
              <X
                size={14}
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onValueChange('');
                }}
              />
            )}
            <ChevronsUpDown size={14} className="text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
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
        <div ref={listRef} className="max-h-[min(20rem,60vh)] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
          ) : (
            <>
            {filtered.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onValueChange(option.value === value ? '' : option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors text-right',
                  value === option.value
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
              >
                <Check size={14} className={cn('shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 text-right">{option.label}</span>
              </button>
            ))}
            {truncated && (
              <p className="text-xs text-muted-foreground text-center py-2">
                يُعرض {filtered.length} من {allFiltered.length} — اكتبي للبحث عن المزيد
              </p>
            )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
