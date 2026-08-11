// منتقي وقت موحّد بقائمة منسدلة عربية — بديل <input type="time"> الأصلي
// الذي لا يعرض منتقيًا في بعض المتصفحات ويعكس الأرقام المكتوبة في سياق RTL.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { arTimeLabel } from '@/lib/form-settings';

const GRID: string[] = [];
for (let h = 0; h < 24; h++) for (const m of ['00', '30']) GRID.push(`${String(h).padStart(2, '0')}:${m}`);

interface Props {
  value?: string;
  onChange: (v: string) => void;
  className?: string;
}

export function TimeSelect({ value, onChange, className }: Props) {
  const v = (value ?? '').slice(0, 5); // قيم القاعدة قد تأتي HH:MM:SS
  const options = !v || GRID.includes(v) ? GRID : [...GRID, v].sort();
  return (
    <Select value={v || undefined} onValueChange={onChange}>
      <SelectTrigger className={className ?? 'w-32'}>
        <SelectValue placeholder="الوقت" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map(t => (
          <SelectItem key={t} value={t}>{arTimeLabel(t)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
