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

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center space-y-4">
          <img src={headerUrl(config) ?? headerImg} alt="مقرأة الوقار — تعاهدوا القرآن" className="w-full rounded-2xl shadow-sm" />
          <h1 className="text-2xl font-display">{config.title}</h1>
          <p className="text-muted-foreground text-sm">{config.welcome}</p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">الاســم الربــاعـي <span className="text-destructive">*</span></Label>
                <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nid">رقم الهوية <span className="text-destructive">*</span></Label>
                <Input id="nid" required dir="ltr" inputMode="numeric" maxLength={10}
                  value={nationalId} onChange={e => setNationalId(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">رقم الجوال <span className="text-destructive">*</span></Label>
                <Input id="phone" required dir="ltr" inputMode="tel" placeholder="05xxxxxxxx"
                  value={phone} onChange={e => setPhone(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>المســار <span className="text-destructive">*</span></Label>
                <RadioGroup value={trackId} onValueChange={setTrackId} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {tracks.map(t => (
                    <Label key={t.id} htmlFor={`track-${t.id}`}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${trackId === t.id ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                      <RadioGroupItem id={`track-${t.id}`} value={t.id} />
                      <span className="text-sm">{t.name}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>المواعيد المناسبة</Label>
                <p className="text-xs text-muted-foreground">{config.times_note}</p>
                <div className="grid gap-2">
                  {config.day_options.map(d => (
                    <Label key={d.value} htmlFor={`day-${d.value}`}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${days.includes(d.value) ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                      <Checkbox id={`day-${d.value}`} checked={days.includes(d.value)}
                        onCheckedChange={() => toggleDay(d.value)} />
                      <span className="text-sm">{d.label}</span>
                    </Label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>الـفـتـرة الأنـسـب</Label>
                <RadioGroup value={period} onValueChange={v => setPeriod(v as any)} className="flex gap-3">
                  {[{ v: 'morning', l: 'صباح' }, { v: 'evening', l: 'مساء' }].map(o => (
                    <Label key={o.v} htmlFor={`p-${o.v}`}
                      className={`flex items-center gap-2 border rounded-lg px-4 py-2.5 cursor-pointer transition-colors ${period === o.v ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                      <RadioGroupItem id={`p-${o.v}`} value={o.v} />
                      <span className="text-sm">{o.l}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sugg">مقترحاتك وملاحظاتك</Label>
                <p className="text-xs text-muted-foreground">{config.suggestions_note}</p>
                <Textarea id="sugg" rows={3} value={suggestions} onChange={e => setSuggestions(e.target.value)} />
              </div>

              <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />

              <Label htmlFor="pledge"
                className={`flex items-center gap-2 border rounded-lg px-3 py-3 cursor-pointer transition-colors ${pledge ? 'border-accent bg-accent/10' : 'hover:border-accent/50'}`}>
                <Checkbox id="pledge" checked={pledge} onCheckedChange={v => setPledge(v === true)} />
                <span className="text-sm font-medium">{config.pledge_text}</span>
              </Label>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? '...' : 'إرسال التسجيل'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
