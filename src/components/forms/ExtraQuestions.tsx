import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FormQuestion } from '@/lib/form-settings';

export type ExtraAnswers = Record<string, string | string[]>;

/** يتحقق أن كل الأسئلة الإلزامية مجابة — يعيد نص السؤال الناقص أو null */
export function missingRequired(questions: FormQuestion[], answers: ExtraAnswers): string | null {
  for (const q of questions) {
    if (!q.required) continue;
    const a = answers[q.id];
    if (a == null || a === '' || (Array.isArray(a) && a.length === 0)) return q.label;
  }
  return null;
}

/** الأسئلة الإضافية المعرفة من لوحة الإدارة — تُعرض بترتيبها وتُخزن إجاباتها مع الطلب */
export default function ExtraQuestions({ questions, answers, onChange }: {
  questions: FormQuestion[];
  answers: ExtraAnswers;
  onChange: (a: ExtraAnswers) => void;
}) {
  if (questions.length === 0) return null;

  const set = (id: string, v: string | string[]) => onChange({ ...answers, [id]: v });

  return (
    <>
      {questions.map(q => (
        <div key={q.id} className="space-y-2">
          <Label>{q.label} {q.required && <span className="text-destructive">*</span>}</Label>

          {q.qtype === 'text' && (
            <Input value={(answers[q.id] as string) ?? ''} onChange={e => set(q.id, e.target.value)} />
          )}

          {q.qtype === 'select' && (
            <RadioGroup value={(answers[q.id] as string) ?? ''} onValueChange={v => set(q.id, v)}
              className="flex flex-wrap gap-2">
              {q.options.map(o => (
                <Label key={o} htmlFor={`${q.id}-${o}`}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${answers[q.id] === o ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                  <RadioGroupItem id={`${q.id}-${o}`} value={o} />
                  <span className="text-sm">{o}</span>
                </Label>
              ))}
            </RadioGroup>
          )}

          {q.qtype === 'multiselect' && (
            <div className="flex flex-wrap gap-2">
              {q.options.map(o => {
                const cur = (answers[q.id] as string[]) ?? [];
                const checked = cur.includes(o);
                return (
                  <Label key={o} htmlFor={`${q.id}-${o}`}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer transition-colors ${checked ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                    <Checkbox id={`${q.id}-${o}`} checked={checked}
                      onCheckedChange={() => set(q.id, checked ? cur.filter(x => x !== o) : [...cur, o])} />
                    <span className="text-sm">{o}</span>
                  </Label>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** عرض إجابة سؤال إضافي كنص (للجداول وCSV) */
export function answerText(a: string | string[] | undefined): string {
  if (a == null || a === '') return '—';
  return Array.isArray(a) ? a.join('، ') : a;
}
