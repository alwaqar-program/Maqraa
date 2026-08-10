import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Label } from '@/components/ui/label';
import { allVerseOptions, globalIndexOfKey } from '@/lib/quran-verses';

interface RangePickerProps {
  fromKey: string;               // "سورة|آية"
  toKey: string;
  onFromChange: (key: string) => void;
  onToChange: (key: string) => void;
  disabled?: boolean;
}

/**
 * منتقي النطاق المصحفي (من سورة/آية → إلى سورة/آية) — مستخلص من نمط RecitationPage في الوقار.
 * عدد الصفحات يُحسب نهائيًا في القاعدة؛ هنا عرض تقريبي فقط.
 */
export default function RangePicker({ fromKey, toKey, onFromChange, onToChange, disabled }: RangePickerProps) {
  const options = useMemo(() => allVerseOptions(), []);
  const fromIdx = fromKey ? globalIndexOfKey(fromKey) : null;
  const toIdx = toKey ? globalIndexOfKey(toKey) : null;
  const invalid = fromIdx !== null && toIdx !== null && toIdx < fromIdx;
  const approxPages = fromIdx !== null && toIdx !== null && !invalid
    ? Math.max(1, Math.round(((toIdx - fromIdx + 1) * 604) / 6236))
    : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>من (سورة، آية)</Label>
          <SearchableSelect options={options} value={fromKey} onValueChange={onFromChange}
            placeholder="اختاري البداية" disabled={disabled} />
        </div>
        <div className="space-y-2">
          <Label>إلى (سورة، آية)</Label>
          <SearchableSelect options={options} value={toKey} onValueChange={onToChange}
            placeholder="اختاري النهاية" disabled={disabled} />
        </div>
      </div>
      {invalid && <p className="text-sm text-destructive">نهاية النطاق قبل بدايته</p>}
      {approxPages !== null && (
        <p className="text-sm text-muted-foreground">≈ {approxPages} صفحة</p>
      )}
    </div>
  );
}
