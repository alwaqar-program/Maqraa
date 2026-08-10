import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A compact −/+ number picker. Value is clamped to [min, max] and never NaN.
 * Used for small integer counts (e.g. عدد الأخطاء / عدد اللحون).
 */
export function NumberStepper({
  value, onChange, min = 0, max = 999, step = 1, className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const btn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted/40 ' +
    'text-foreground transition-colors hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className={cn('flex h-10 items-center justify-between gap-2', className)}>
      <button type="button" className={btn} onClick={() => set(value - step)} disabled={value <= min} aria-label="نقص">
        <Minus size={16} />
      </button>
      <span className="w-12 select-none text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => set(value + step)} disabled={value >= max} aria-label="زيادة">
        <Plus size={16} />
      </button>
    </div>
  );
}
