import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { WEEKDAYS, slotHours } from '@/lib/schedule';
import headerImg from '@/assets/header.png';
import { useFormSettings } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers, missingRequired } from '@/components/forms/ExtraQuestions';

const hijriToday = () => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch { return ''; }
};

/** اتفاقية المسمعات في مقرأة الوقار — الاسم يعد بمثابة توقيع */
export default function RegisterTeacherPage() {
  const { config, questions } = useFormSettings('teacher_agreement');
  const [extra, setExtra] = useState<ExtraAnswers>({});
  const [fullName, setFullName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<{ weekday: number; start_time: string; end_time: string }[]>([
    { weekday: 0, start_time: '16:00', end_time: '17:00' },
  ]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  const totalHours = Math.round(slots.reduce((a, s) =>
    a + Math.max(0, slotHours(s.start_time, s.end_time)), 0) * 10) / 10;
  const hasInvalidRow = slots.some(s => s.end_time <= s.start_time);
  const hasOverlap = slots.some((a, i) => slots.some((b, j) =>
    i < j && a.weekday === b.weekday && a.start_time < b.end_time && b.start_time < a.end_time));
  const hoursError =
    hasInvalidRow ? 'هناك موعد نهايته قبل بدايته' :
    hasOverlap ? 'هناك مواعيد متداخلة في اليوم نفسه' :
    totalHours < config.min_hours ? `المجموع أقل من الحد الأدنى (${config.min_hours} ساعة أسبوعيًا)` :
    totalHours > config.max_hours ? `المجموع يتجاوز الحد الأعلى (${config.max_hours} ساعة أسبوعيًا)` : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hoursError) { toast({ title: hoursError, variant: 'destructive' }); return; }
    const missing = missingRequired(questions, extra);
    if (missing) { toast({ title: `«${missing}» مطلوب`, variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('teacher_agreements').insert({
      full_name: fullName.trim(),
      agreement_date: date,
      agreed_slots: slots,
      notes: notes.trim() || null,
      ...(Object.keys(extra).length ? { extra_answers: extra } : {}),
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر إرسال الاتفاقية', description: error.message, variant: 'destructive' }); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-success" />
            <h1 className="text-2xl font-display">وُقّعت الاتفاقية 🌿</h1>
            <p className="text-muted-foreground">شكرًا لك — ستتواصل معك إدارة المقرأة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <img src={headerImg} alt="مقرأة الوقار — تعاهدوا القرآن"
            className="w-full rounded-2xl shadow-sm" />
          <h1 className="text-2xl font-display">اتفاقية المسمعات في مقرأة الوقار</h1>
        </div>

        {/* بنود الاتفاقية */}
        <Card>
          <CardContent className="pt-6 space-y-4 leading-relaxed text-[15px]">
            <p className="text-center text-2xl font-display">﷽</p>
            <p>
              بعون الله وتوفيقه في يوم {hijriToday()}، تم الاتفاق بين <b>(مقرأة الوقار)</b> و<b>(المسمعات)</b> على ما يلي:
            </p>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">مدة التعاون مع المقرأة</h3>
              <p>{config.duration_text}</p>
            </div>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">تلتزم (مقرأة الوقار) تجاه (المسمعات) بـ:</h3>
              <ul className="space-y-1.5 pr-1">
                {config.maqraa_items.map((x, i) => <li key={i}>✦ {x}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">كما تلتزم (المسمعات) تجاه (مقرأة الوقار) بـ:</h3>
              <ul className="space-y-1.5 pr-1">
                {config.teacher_items.map((x, i) => <li key={i}>✦ {x}</li>)}
              </ul>
            </div>
            <p className="text-center">{config.closing_text}</p>
          </CardContent>
        </Card>

        {/* التوقيع */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم المسمعة <span className="text-destructive">*</span></Label>
                <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
                <p className="text-xs text-muted-foreground">{config.signature_hint}</p>
              </div>
              <div className="space-y-2 max-w-48">
                <Label htmlFor="date">تاريخ الاتفاقية</Label>
                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المواعيد المتفق عليها للتسميع <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">
                  أدخلي أوقاتك المتاحة (يوم ووقت) — بمجموع لا يقل عن {config.min_hours} ولا يزيد على {config.max_hours} ساعة أسبوعيًا.
                </p>
                <div className="space-y-2">
                  {slots.map((sl, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <select
                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                        value={sl.weekday}
                        onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, weekday: Number(e.target.value) } : x))}>
                        {WEEKDAYS.map((d, w) => <option key={w} value={w}>{d}</option>)}
                      </select>
                      <Input type="time" className="w-32" value={sl.start_time}
                        onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, start_time: e.target.value } : x))} />
                      <span className="text-muted-foreground text-sm">إلى</span>
                      <Input type="time" className="w-32" value={sl.end_time}
                        onChange={e => setSlots(slots.map((x, j) => j === i ? { ...x, end_time: e.target.value } : x))} />
                      {slots.length > 1 && (
                        <button type="button" className="text-muted-foreground hover:text-destructive"
                          onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1"
                      onClick={() => setSlots([...slots, { weekday: 0, start_time: '16:00', end_time: '17:00' }])}>
                      <Plus size={14} /> إضافة موعد
                    </Button>
                    <span className={`text-sm font-medium ${hoursError ? 'text-destructive' : 'text-success'}`}>
                      المجموع: {totalHours} ساعة أسبوعيًا {hoursError ? `— ${hoursError}` : '✓'}
                    </span>
                  </div>
                </div>
              </div>
              <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />

              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving || !fullName.trim() || !!hoursError}>
                {saving ? '...' : 'أوافق على البنود وأوقّع'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
