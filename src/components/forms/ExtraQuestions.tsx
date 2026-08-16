import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FormQuestion } from '@/lib/form-settings';

export type ExtraAnswers = Record<string, string | string[]>;

/** إجابات الحقول المدمجة في النموذج (المسار/الفترة/التعهد/التقييم) — مصدر شرط أيضًا */
export type BaseAnswers = Record<string, string | string[] | undefined>;

const matches = (a: string | string[] | undefined, want: string) =>
  Array.isArray(a) ? a.includes(want) : a === want;

/** هل السؤال ظاهر؟ الشرطي يظهر فقط إذا أُجيب مصدره (حقل مدمج أو سؤال سابق) بالإجابة المحددة */
export function isVisible(q: FormQuestion, answers: ExtraAnswers, base: BaseAnswers = {}): boolean {
  if (!q.depends_value) return true;
  if (q.depends_field) return matches(base[q.depends_field], q.depends_value);
  if (q.depends_on) return matches(answers[q.depends_on], q.depends_value);
  return true;
}

/** الحقل المدمج الذي يتبعه السؤال — مباشرة أو عبر سلسلة شروط (سؤال يعتمد على سؤال).
 *  null = غير مشروط بحقل مدمج، فمكانه الافتراضي في قسم الملاحظات. */
export function anchorField(q: FormQuestion, all: FormQuestion[]): string | null {
  const seen = new Set<string>();
  let cur: FormQuestion | undefined = q;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (!cur.depends_value) return null;
    if (cur.depends_field) return cur.depends_field;
    cur = cur.depends_on ? all.find(x => x.id === cur!.depends_on) : undefined;
  }
  return null;
}

/** يتحقق أن كل الأسئلة الإلزامية الظاهرة مجابة — يعيد نص السؤال الناقص أو null */
export function missingRequired(
  questions: FormQuestion[], answers: ExtraAnswers, base: BaseAnswers = {},
): string | null {
  for (const q of questions) {
    if (!q.required || q.qtype === 'note' || !isVisible(q, answers, base)) continue;
    const a = answers[q.id];
    if (a == null || a === '' || (Array.isArray(a) && a.length === 0)) return q.label;
  }
  return null;
}

/** الأسئلة الإضافية المعرفة من لوحة الإدارة — تُعرض بترتيبها وتُخزن إجاباتها مع الطلب */
export default function ExtraQuestions({ questions, answers, onChange, baseAnswers, anchor = null }: {
  questions: FormQuestion[];
  answers: ExtraAnswers;
  onChange: (a: ExtraAnswers) => void;
  baseAnswers?: BaseAnswers;
  /** يعرض فقط أسئلة هذا الحقل المدمج (تُوضع تحته مباشرة)؛ null = غير المشروطة بحقل مدمج */
  anchor?: string | null;
}) {
  // تغيّر حقل مدمج (كالمسار) قد يُخفي سؤالًا مُجابًا — تُمسح إجابته كي لا تُرسل
  useEffect(() => {
    const stale = questions.filter(q => answers[q.id] !== undefined && !isVisible(q, answers, baseAnswers));
    if (!stale.length) return;
    const next = { ...answers };
    stale.forEach(q => delete next[q.id]);
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(baseAnswers)]);

  if (questions.length === 0) return null;

  // عند تغيير إجابة: تُحذف إجابات الأسئلة الشرطية التي اختفت كي لا تُرسل خطأً
  const set = (id: string, v: string | string[]) => {
    const next = { ...answers, [id]: v };
    questions.forEach(q => { if (!isVisible(q, next, baseAnswers)) delete next[q.id]; });
    onChange(next);
  };

  return (
    <>
      {questions
        .filter(q => anchorField(q, questions) === anchor && isVisible(q, answers, baseAnswers))
        .map(q => q.qtype === 'note' ? (
        // فقرة إرشادية — نص فقط بلا إجابة
        <p key={q.id} className="border border-accent/40 bg-accent/5 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {q.label}
        </p>
      ) : (
        <div key={q.id} className="space-y-2">
          <Label>{q.label} {q.required && <span className="text-destructive">*</span>}</Label>

          {q.qtype === 'text' && (
            <Input value={(answers[q.id] as string) ?? ''} onChange={e => set(q.id, e.target.value)} />
          )}

          {q.qtype === 'select' && (
            <RadioGroup dir="rtl" value={(answers[q.id] as string) ?? ''} onValueChange={v => set(q.id, v)}
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
