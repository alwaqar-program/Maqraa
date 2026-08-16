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
import { CheckCircle2, X, LayoutGrid, CalendarDays, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { WEEKDAYS } from '@/lib/schedule';
import logoImg from '@/assets/logo-maqraa.png';
import headerImg from '@/assets/header.png';
import { useFormSettings, headerUrl, FormQuestion, DayOption, genSlotLabel, optionDays } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers, missingRequired } from '@/components/forms/ExtraQuestions';

interface Track { id: string; name: string; juz_count: number; sort_order: number; }

/** preview: يُمرَّر من صفحة «النماذج» لعرض المسودة بنفس الصفحة الحقيقية (الإرسال معطل) */
export default function RegisterPage({ preview }: { preview?: { config: any; questions: FormQuestion[] } }) {
  const live = useFormSettings('student_register');
  const config = preview?.config ?? live.config;
  const questions = preview?.questions ?? live.questions;
  const [extra, setExtra] = useState<ExtraAnswers>({});
  const [tracks, setTracks] = useState<Track[]>([]);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [pledge, setPledge] = useState(false);
  const [trackId, setTrackId] = useState('');
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);   // "weekday|label"
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [period, setPeriod] = useState<'morning' | 'evening' | 'both' | ''>('');
  const [suggestions, setSuggestions] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  // أوقات توفر المسمعات النشطات (عرض عام آمن) — مصدر المواعيد الحي بدل الإدخال اليدوي المكرر
  const [circleTimes, setCircleTimes] = useState<{ weekday: number; start_time: string; end_time: string; track_id: string | null; is_daily?: boolean }[]>([]);

  useEffect(() => {
    supabase.from('tracks').select('id, name, juz_count, sort_order')
      .eq('is_active', true).order('sort_order')
      .then(({ data }) => setTracks(data || []));
    supabase.from('v_public_circle_times' as any).select('*')
      .then(({ data }) => setCircleTimes((data as any) || []));
  }, []);

  /** مواعيد المسمعات → خيارات فريدة بنص عربي مولد:
   *  العادية خيار لكل يوم+وقت، والموسومة دورية تُطوى خيارًا واحدًا (من يوم إلى يوم) */
  const deriveOptions = (rows: typeof circleTimes): DayOption[] => {
    const seen = new Set<string>();
    const out: DayOption[] = [];
    // العادية
    rows.filter(r => !r.is_daily)
      .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
      .forEach(r => {
        const start = r.start_time.slice(0, 5), end = r.end_time.slice(0, 5);
        const k = `${r.weekday}|${start}|${end}`;
        if (seen.has(k)) return;   // مسمعتان بنفس اليوم والوقت = خيار واحد
        seen.add(k);
        out.push({ value: r.weekday, start, end, label: genSlotLabel(r.weekday, start, end) });
      });
    // الدورية: كل وقت يُطوى مدى من أصغر يوم إلى أكبره
    const byTime: Record<string, number[]> = {};
    rows.filter(r => r.is_daily).forEach(r => {
      (byTime[`${r.start_time.slice(0, 5)}|${r.end_time.slice(0, 5)}`] ??= []).push(r.weekday);
    });
    Object.entries(byTime).forEach(([k, days]) => {
      const [start, end] = k.split('|');
      const from = Math.min(...days), to = Math.max(...days);
      out.push(from === to
        ? { value: from, start, end, label: genSlotLabel(from, start, end) }
        : { value: from, to, start, end, label: genSlotLabel(from, start, end, to) });
    });
    return out;
  };

  const slotKey = (d: { value: number; label: string }) => `${d.value}|${d.label}`;
  const moveSlot = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selectedSlots.length) return;
    const next = [...selectedSlots];
    [next[i], next[j]] = [next[j], next[i]];
    setSelectedSlots(next);
  };
  const toggleSlot = (d: { value: number; label: string }) =>
    setSelectedSlots(prev => prev.includes(slotKey(d))
      ? prev.filter(x => x !== slotKey(d))
      : [...prev, slotKey(d)]);

  // مصدر المواعيد حسب المسار المختار — يُقرأ حيًا من أوقات المسمعات:
  // مسار مرتبط بمسمعة → مواعيدها فقط؛ وغير ذلك → مواعيد المسمعات غير المعينات على مسار.
  // القائمة اليدوية المحفوظة احتياط صامت فقط إن لم توجد مواعيد بعد
  const linkedRows = circleTimes.filter(r => r.track_id && r.track_id === trackId);
  const generalRows = circleTimes.filter(r => !r.track_id);
  const liveOptions = deriveOptions(trackId && linkedRows.length > 0 ? linkedRows : generalRows);
  const activeOptions: DayOption[] = liveOptions.length > 0 ? liveOptions : config.day_options;

  // عند تبديل المسار: أزيلي المواعيد المختارة التي لم تعد معروضة
  useEffect(() => {
    const valid = new Set(activeOptions.map(slotKey));
    setSelectedSlots(prev => prev.filter(k => valid.has(k)));
    setActiveDay(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // الخيارات الدورية (نفس الوقت عدة أيام) تظهر دائمًا؛ والباقي بأزرار الأيام
  const dailyOptions = activeOptions.filter(d => optionDays(d).length > 1);
  const dayOnlyOptions = activeOptions.filter(d => optionDays(d).length === 1);
  // الأيام التي لها مواعيد معروضة (فريدة وبترتيب الأسبوع)
  const availableDays = [...new Set(dayOnlyOptions.map(d => d.value))].sort((a, b) => a - b);
  const visibleOptions = [
    ...dailyOptions,
    ...(showAll ? dayOnlyOptions
      : activeDay !== null ? dayOnlyOptions.filter(d => d.value === activeDay)
      : []),
  ];
  // إن لم يوجد سوى خيارات يومية: لا داعي لأزرار الأيام ولا لرسالة «اختاري يومًا»
  const showDayButtons = availableDays.length > 0;
  const showGrid = visibleOptions.length > 0 || showAll || activeDay !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) return;
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
      preferred_days: [...new Set(selectedSlots.map(k => Number(k.split('|')[0])))].sort(),
      preferred_slots: selectedSlots.map(k => k.split('|').slice(1).join('|')),
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
      <div className={`${preview ? '' : 'min-h-screen'} flex items-center justify-center p-4`}>
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
      <div className="min-h-screen flex items-center justify-center p-4">
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
    <div className={preview ? '' : 'min-h-screen py-6 px-4 sm:py-10'}>
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
                <SectionHead title={config.section_data_title} />
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
                <SectionHead title={config.section_track_title} />
                <RadioGroup dir="rtl" value={trackId} onValueChange={setTrackId}
                  className="grid sm:grid-cols-2 gap-2.5">
                  {tracks.map(t => {
                    // «خمسة أجزاء (٧ص في الأسبوع)» → الاسم بارز والتفصيل أصغر وأفتح
                    const [main, detail] = t.name.split(/\s*(?=\()/);
                    return (
                      <Label key={t.id} htmlFor={`track-${t.id}`} className={pill(trackId === t.id)}>
                        <RadioGroupItem id={`track-${t.id}`} value={t.id} />
                        <span className="text-sm font-medium">
                          {main}
                          {detail && <span className="text-xs font-normal text-muted-foreground mr-1">{detail}</span>}
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </section>

              {/* ۞ مواعيدك */}
              <section className="px-5 sm:px-8 py-6 space-y-4">
                <SectionHead title={config.section_times_title} hint={config.times_note} />

                {/* اختيار اليوم أولا (يُخفى إن كانت كل الخيارات يومية) */}
                {showDayButtons && (
                <div className="flex items-center gap-2 flex-wrap">
                  {availableDays.map(w => {
                    const count = selectedSlots.filter(k => k.startsWith(`${w}|`)).length;
                    const active = !showAll && activeDay === w;
                    return (
                      <button key={w} type="button"
                        onClick={() => { setActiveDay(w); setShowAll(false); }}
                        className={`relative rounded-full px-4 py-1.5 text-sm border transition-colors ${
                          active ? 'bg-primary text-primary-foreground border-primary'
                                 : 'border-border hover:border-accent/60 hover:bg-accent/5'}`}>
                        {WEEKDAYS[w]}
                        {count > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 bg-accent text-accent-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => { setShowAll(!showAll); if (!showAll) setActiveDay(null); }}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs border transition-colors ${
                      showAll ? 'bg-primary text-primary-foreground border-primary' : 'border-dashed border-border text-muted-foreground hover:border-accent/60'}`}>
                    {showAll ? <CalendarDays size={13} /> : <LayoutGrid size={13} />}
                    {showAll ? 'عرض حسب اليوم' : 'عرض كل المواعيد'}
                  </button>
                </div>
                )}

                {/* أوقات اليوم المختار (أو الكل) + اليومية دائمًا */}
                {showGrid ? (
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {visibleOptions.map((d, i) => (
                      <Label key={`${d.value}-${i}`} htmlFor={`slot-${d.value}-${i}`}
                        className={pill(selectedSlots.includes(slotKey(d)))}>
                        <Checkbox id={`slot-${d.value}-${i}`} checked={selectedSlots.includes(slotKey(d))}
                          onCheckedChange={() => toggleSlot(d)} />
                        <span className="text-sm">{d.label}</span>
                      </Label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground border border-dashed rounded-xl px-4 py-3 text-center">
                    اختاري يومًا لعرض مواعيده المتاحة — أو «عرض كل المواعيد»
                  </p>
                )}

                {/* مواعيدك بترتيب الأولوية */}
                {selectedSlots.length > 0 && (
                  <div className="border border-accent/30 bg-accent/5 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      مواعيدك بترتيب الأولوية — <b>الأول هو الأنسب لك</b>، ورتبيها بالأسهم:
                    </p>
                    {selectedSlots.map((k, i) => (
                      <div key={k} draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          if (dragIndex === null || dragIndex === i) return;
                          const next = [...selectedSlots];
                          const [moved] = next.splice(dragIndex, 1);
                          next.splice(i, 0, moved);
                          setSelectedSlots(next);
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={`flex items-center gap-2 bg-background border rounded-lg px-2.5 py-1.5 cursor-grab active:cursor-grabbing transition-opacity ${dragIndex === i ? 'opacity-40' : ''}`}>
                        <GripVertical size={14} className="text-muted-foreground/50 shrink-0" aria-hidden="true" />
                        <span className="w-6 h-6 shrink-0 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">
                          {(i + 1).toLocaleString('ar-EG')}
                        </span>
                        <span className="text-sm flex-1">{k.split('|').slice(1).join('|')}</span>
                        <button type="button" onClick={() => moveSlot(i, -1)} disabled={i === 0}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ChevronUp size={16} /></button>
                        <button type="button" onClick={() => moveSlot(i, 1)} disabled={i === selectedSlots.length - 1}
                          className="text-muted-foreground hover:text-foreground disabled:opacity-25"><ChevronDown size={16} /></button>
                        <button type="button" onClick={() => setSelectedSlots(selectedSlots.filter(x => x !== k))}
                          className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {/* سؤال عام مستقل عن اختيار المواعيد أعلاه */}
                <div className="border-t border-dashed pt-4 space-y-2">
                  <Label>بشكل عام، أي الفترات أنسب لك؟</Label>
                  <RadioGroup dir="rtl" value={period} onValueChange={v => setPeriod(v as any)} className="flex gap-2.5 flex-wrap">
                    {[{ v: 'morning', l: '🌤 الصباح' }, { v: 'evening', l: '🌙 المساء' }, { v: 'both', l: '✨ كلاهما يناسبني' }].map(o => (
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
                <SectionHead title={config.section_pledge_title} />

                <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />

                {config.absence_policy?.trim() && (
                  <div className="border border-accent/40 bg-accent/5 rounded-xl p-4 space-y-1">
                    <p className="font-display text-primary">{config.absence_policy_title}</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.absence_policy}</p>
                  </div>
                )}

                {config.important_notes?.trim() && (
                  <div className="border rounded-xl p-4 space-y-1 bg-muted/40">
                    <p className="font-display text-primary">{config.important_notes_title}</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.important_notes}</p>
                  </div>
                )}

                <Label htmlFor="pledge" className={pill(pledge) + ' py-3.5'}>
                  <Checkbox id="pledge" checked={pledge} onCheckedChange={v => setPledge(v === true)} />
                  <span className="text-sm font-medium">{config.pledge_text}</span>
                </Label>

                <div className="space-y-1.5">
                  <Label htmlFor="sugg">{config.suggestions_title}</Label>
                  {config.suggestions_note?.trim() && (
                    <p className="text-xs text-muted-foreground">{config.suggestions_note}</p>
                  )}
                  <Textarea id="sugg" rows={2} value={suggestions} onChange={e => setSuggestions(e.target.value)} />
                </div>

                <Button type="submit" size="lg" className="w-full h-12 text-base shadow-sm" disabled={saving || !!preview}>
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
