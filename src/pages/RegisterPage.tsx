import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2 } from 'lucide-react';
import logoImg from '@/assets/logo-maqraa.png';
import headerImg from '@/assets/header.png';
import { useFormSettings, headerUrl } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers, missingRequired } from '@/components/forms/ExtraQuestions';

interface Track { id: string; name: string; juz_count: number; sort_order: number; }

export default function RegisterPage() {
  const { config, questions } = useFormSettings('student_register');
  const [extra, setExtra] = useState<ExtraAnswers>({});
  const [tracks, setTracks] = useState<Track[]>([]);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [pledge, setPledge] = useState(false);
  const [trackId, setTrackId] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [period, setPeriod] = useState<'morning' | 'evening' | ''>('');
  const [suggestions, setSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('tracks').select('id, name, juz_count, sort_order')
      .eq('is_active', true).order('sort_order')
      .then(({ data }) => setTracks(data || []));
  }, []);

  const toggleDay = (d: number) =>
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pledge) { toast({ title: 'التعهد بالالتزام بنظام الحضور والغياب مطلوب', variant: 'destructive' }); return; }
    if (!trackId) { toast({ title: 'اختاري المسار', variant: 'destructive' }); return; }
    const missing = missingRequired(questions, extra);
    if (missing) { toast({ title: `«${missing}» مطلوب`, variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('applicants').insert({
      full_name: fullName.trim(),
      national_id: nationalId.trim(),
      phone: phone.trim(),
      attendance_pledge: pledge,
      track_id: trackId,
      preferred_days: days,
      preferred_period: period || null,
      suggestions: suggestions.trim() || null,
      ...(Object.keys(extra).length ? { extra_answers: extra } : {}),
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر إرسال التسجيل', description: error.message, variant: 'destructive' }); return; }
    setDone(true);
  };

  if (config.is_open === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <p className="text-4xl">🔒</p>
            <p className="text-lg leading-relaxed">{config.closed_message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-success" />
            <h1 className="text-2xl font-display">وصلنا تسجيلك 🌿</h1>
            <p className="text-muted-foreground">{config.success_body}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // فاصل قسم بعلامة الحزب المصحفية — توقيع النموذج
  const SectionHead = ({ title, hint }: { title: string; hint?: string }) => (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2.5">
        <span className="text-accent text-2xl leading-none select-none" aria-hidden="true">۞</span>
        <h2 className="font-display text-xl text-primary">{title}</h2>
        <span className="flex-1 border-t border-accent/30" aria-hidden="true" />
      </div>
      {hint && <p className="text-xs text-muted-foreground pr-9">{hint}</p>}
    </div>
  );

  const pill = (active: boolean) =>
    `flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
      active ? 'border-accent bg-accent/10 shadow-sm' : 'border-border hover:border-accent/60 hover:bg-accent/5'
    }`;

  return (
    <div className="min-h-screen bg-background py-6 px-4 sm:py-10">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* الترويسة */}
        <div className="text-center space-y-3">
          <img src={headerUrl(config) ?? headerImg} alt="مقرأة الوقار — تعاهدوا القرآن"
            className="w-full rounded-2xl shadow-sm" />
          <h1 className="text-2xl sm:text-3xl font-display">{config.title}</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">{config.welcome}</p>
        </div>

        <form onSubmit={submit}>
          <Card className="overflow-hidden">
            <CardContent className="p-0 divide-y divide-border/70">

              {/* ۞ بياناتك */}
              <section className="px-5 sm:px-8 py-6 space-y-4">
                <SectionHead title="بياناتك" />
                <div className="space-y-1.5">
                  <Label htmlFor="name">الاسم الرباعي <span className="text-destructive">*</span></Label>
                  <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="nid">رقم الهوية <span className="text-destructive">*</span></Label>
                    <Input id="nid" required dir="ltr" inputMode="numeric" maxLength={10}
                      value={nationalId} onChange={e => setNationalId(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">رقم الجوال <span className="text-destructive">*</span></Label>
                    <Input id="phone" required dir="ltr" inputMode="tel" placeholder="05xxxxxxxx"
                      value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* ۞ مسارك */}
              <section className="px-5 sm:px-8 py-6 space-y-4">
                <SectionHead title="مسارك" />
                <RadioGroup dir="rtl" value={trackId} onValueChange={setTrackId}
                  className="grid sm:grid-cols-2 gap-2.5">
                  {tracks.map(t => (
                    <Label key={t.id} htmlFor={`track-${t.id}`} className={pill(trackId === t.id)}>
                      <RadioGroupItem id={`track-${t.id}`} value={t.id} />
                      <span className="text-sm font-medium">{t.name}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </section>

              {/* ۞ مواعيدك */}
              <section className="px-5 sm:px-8 py-6 space-y-4">
                <SectionHead title="مواعيدك" hint={config.times_note} />
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {config.day_options.map(d => (
                    <Label key={d.value} htmlFor={`day-${d.value}`} className={pill(days.includes(d.value))}>
                      <Checkbox id={`day-${d.value}`} checked={days.includes(d.value)}
                        onCheckedChange={() => toggleDay(d.value)} />
                      <span className="text-sm">{d.label}</span>
                    </Label>
                  ))}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Label className="text-sm text-muted-foreground shrink-0">الفترة الأنسب لك:</Label>
                  <RadioGroup dir="rtl" value={period} onValueChange={v => setPeriod(v as any)} className="flex gap-2.5">
                    {[{ v: 'morning', l: '🌤 صباح' }, { v: 'evening', l: '🌙 مساء' }].map(o => (
                      <Label key={o.v} htmlFor={`p-${o.v}`} className={pill(period === o.v)}>
                        <RadioGroupItem id={`p-${o.v}`} value={o.v} className="sr-only" />
                        <span className="text-sm">{o.l}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              </section>

              {/* ۞ عهدك وملاحظاتك */}
              <section className="px-5 sm:px-8 py-6 space-y-4">
                <SectionHead title="عهدك وملاحظاتك" />

                <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />

                {config.absence_policy?.trim() && (
                  <div className="border border-accent/40 bg-accent/5 rounded-xl p-4 space-y-1">
                    <p className="font-display text-primary">نظام الغياب والالتزام</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.absence_policy}</p>
                  </div>
                )}

                <Label htmlFor="pledge" className={pill(pledge) + ' py-3.5'}>
                  <Checkbox id="pledge" checked={pledge} onCheckedChange={v => setPledge(v === true)} />
                  <span className="text-sm font-medium">{config.pledge_text}</span>
                </Label>

                {config.important_notes?.trim() && (
                  <div className="border rounded-xl p-4 space-y-1 bg-muted/40">
                    <p className="font-display text-primary">ملاحظات مهمة</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.important_notes}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="sugg">مقترحاتك وملاحظاتك <span className="text-muted-foreground text-xs font-normal">— {config.suggestions_note}</span></Label>
                  <Textarea id="sugg" rows={2} value={suggestions} onChange={e => setSuggestions(e.target.value)} />
                </div>

                <Button type="submit" size="lg" className="w-full h-12 text-base shadow-sm" disabled={saving}>
                  {saving ? 'جارٍ الإرسال...' : 'إرسال التسجيل'}
                </Button>
              </section>
            </CardContent>
          </Card>
        </form>

        <p className="text-center text-xs text-muted-foreground pb-2">
          مقرأة الوقار — «كان عمله ديمة»
        </p>
      </div>
    </div>
  );
}
