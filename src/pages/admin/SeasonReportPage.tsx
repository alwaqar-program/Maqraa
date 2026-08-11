import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Printer, ScrollText } from 'lucide-react';
import { slotHours } from '@/lib/schedule';
import logoTallam from '@/assets/logo-tallam.png';
import logoMaqraa from '@/assets/logo-maqraa.png';
import logoAlwaqar from '@/assets/logo-alwaqar.png';

interface Season { id: string; name: string; start_date: string; end_date: string; is_current: boolean; }
interface Bucket { label: string; count: number; }
interface Data {
  pages: number;
  beneficiaries: number;
  buckets: Bucket[];
  supervisors: number;
  teachers: number;
  weeklyHours: number;
}

const ar = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 1 });
const hijri = (d: string) => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${d}T12:00:00`));
  } catch { return d; }
};

/** توزيع الطالبات حسب المنجَز: حزب = 10 صفحات، جزء = 20 صفحة */
function bucketLabel(pages: number): string {
  if (pages < 10) return 'أقل من حزب';
  if (pages < 20) return 'حزب';
  if (pages < 40) return 'جزء';
  if (pages < 60) return 'جزءان';
  const juz = Math.floor(pages / 20);
  return `${ar(juz)} أجزاء`;
}
const bucketOrder = (label: string) =>
  label === 'أقل من حزب' ? 0 : label === 'حزب' ? 1 : label === 'جزء' ? 2 : label === 'جزءان' ? 3 : 4 + label.length;

const DEFAULT_DESC =
  'حرصًا على ربط الطالبة بكتاب الله طوال العام، انطلقت «مقرأة الوقار» لتكون رفيقًا ثابتًا في رحلتها مع المراجعة، من خلال تنظيم أوقات أسبوعية لسرد المحفوظ بشكل منتظم وميسّر.';

export default function SeasonReportPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [desc, setDesc] = useState(DEFAULT_DESC);
  const [needs, setNeeds] = useState('اشتراك في برنامج الزوم');
  const [notes, setNotes] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [ready, setReady] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('seasons').select('id, name, start_date, end_date, is_current')
      .order('start_date', { ascending: false })
      .then(({ data: rows }) => {
        setSeasons(rows || []);
        const cur = (rows || []).find((s: any) => s.is_current) ?? (rows || [])[0];
        if (cur) setSeasonId(cur.id);
      });
  }, []);

  const season = seasons.find(s => s.id === seasonId);

  const run = useCallback(async () => {
    if (!season) return;
    const [tasmee, sard, sup, teach, slots] = await Promise.all([
      supabase.from('teacher_recitation_log').select('student_id, pages')
        .gte('date', season.start_date).lte('date', season.end_date).eq('is_deleted', false),
      supabase.from('self_recitation_log').select('student_id, pages')
        .gte('date', season.start_date).lte('date', season.end_date).eq('is_deleted', false),
      supabase.from('supervisors').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('availability_slots').select('start_time, end_time').eq('is_active', true),
    ]);
    if (tasmee.error) { toast({ title: 'خطأ', description: tasmee.error.message, variant: 'destructive' }); return; }

    const byStudent: Record<string, number> = {};
    let total = 0;
    [...(tasmee.data || []), ...(sard.data || [])].forEach((r: any) => {
      const p = Number(r.pages || 0);
      byStudent[r.student_id] = (byStudent[r.student_id] ?? 0) + p;
      total += p;
    });
    const bucketMap: Record<string, number> = {};
    Object.values(byStudent).forEach(p => {
      const l = bucketLabel(p);
      bucketMap[l] = (bucketMap[l] ?? 0) + 1;
    });
    setData({
      pages: Math.round(total * 10) / 10,
      beneficiaries: Object.keys(byStudent).length,
      buckets: Object.entries(bucketMap).map(([label, count]) => ({ label, count }))
        .sort((a, b) => bucketOrder(a.label) - bucketOrder(b.label)),
      supervisors: sup.count ?? 0,
      teachers: teach.count ?? 0,
      weeklyHours: Math.round((slots.data || [])
        .reduce((a: number, s: any) => a + slotHours(s.start_time, s.end_time), 0) * 10) / 10,
    });
  }, [season, toast]);
  useEffect(() => { run(); }, [run]);

  const lines = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean);
  const countWord = (n: number, one: string, two: string, many: string) =>
    n === 1 ? one : n === 2 ? two : `${ar(n)} ${many}`;

  const PageHeader = () => (
    <div className="flex items-center justify-between mb-6">
      <div className="flex gap-2 items-center">
        <img src={logoTallam} alt="تعلم" className="h-9 object-contain" />
        <img src={logoAlwaqar} alt="الوقار" className="h-9 object-contain" />
      </div>
      <img src={logoMaqraa} alt="مقرأة الوقار" className="h-14 object-contain" />
    </div>
  );
  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="font-display text-xl text-primary border-b-2 border-accent/60 pb-1 mb-3 w-fit">{children}</h3>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ScrollText className="text-accent" />
        <h1 className="text-2xl font-display">تقرير نهاية الفصل</h1>
      </div>

      {!ready ? (
        /* الخطوة 1: الملاحظات والمقترحات قبل الإنشاء */
        <Card className="max-w-2xl">
          <CardHeader><CardTitle className="text-base font-body">بيانات التقرير — الأرقام تُجلب من النظام تلقائيًا</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>الفصل</Label>
              <Select value={seasonId} onValueChange={setSeasonId}>
                <SelectTrigger><SelectValue placeholder="اختاري الفصل" /></SelectTrigger>
                <SelectContent>
                  {seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>وصف البرنامج وهدفه</Label>
              <Textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الاحتياجات المادية (سطر لكل بند)</Label>
              <Textarea rows={2} value={needs} onChange={e => setNeeds(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الملاحظات (سطر لكل ملاحظة)</Label>
              <Textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder={'قصر فترة البرنامج.\nعدم التزام بعض الطالبات…'} />
            </div>
            <div className="space-y-2">
              <Label>المقترحات (سطر لكل مقترح)</Label>
              <Textarea rows={4} value={suggestions} onChange={e => setSuggestions(e.target.value)}
                placeholder={'ابتكار طريقة تقلل من غياب الطالبات.\nإلزام الطالبة بحد أدنى لساعات الحضور…'} />
            </div>
            <Button className="w-full" onClick={() => setReady(true)} disabled={!data}>
              إنشاء التقرير
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReady(false)}>تعديل المدخلات</Button>
            <Button className="gap-1" onClick={() => window.print()}><Printer size={16} /> تصدير PDF</Button>
          </div>

          {data && season && (
            <div className="print-area">
              <div className="max-w-2xl mx-auto bg-background border rounded-2xl p-10 space-y-6">
                <PageHeader />
                <div className="text-center space-y-2">
                  <p className="text-muted-foreground">بسم الله الرحمن الرحيم</p>
                  <h2 className="font-display text-4xl text-primary">تقرير مقرأة الوقار</h2>
                  <p className="text-accent-foreground/70 font-display text-2xl">{season.name}</p>
                </div>

                <div>
                  <SectionTitle>وصف البرنامج وهدفه</SectionTitle>
                  <p className="leading-relaxed">{desc}</p>
                </div>

                <div>
                  <SectionTitle>نطاق تطبيق البرنامج</SectionTitle>
                  <ul className="space-y-1.5">
                    <li>✦ منسوبات ومستفيدات مقرأة الوقار — عن بُعد.</li>
                    <li>✦ ابتدأ: {hijri(season.start_date)} — انتهى: {hijri(season.end_date)}.</li>
                    <li>✦ فترات متفرقة في أيام الأسبوع بلغ مجموعها {ar(data.weeklyHours)} ساعة أسبوعيًا.</li>
                  </ul>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <SectionTitle>فريق العمل</SectionTitle>
                    <p>{countWord(data.supervisors, 'مشرفة واحدة', 'مشرفتان', 'مشرفات')}</p>
                  </div>
                  <div>
                    <SectionTitle>عدد المسمعات</SectionTitle>
                    <p>{countWord(data.teachers, 'مسمعة واحدة', 'مسمعتان', 'مسمعات')}</p>
                  </div>
                </div>

                {lines(needs).length > 0 && (
                  <div>
                    <SectionTitle>الاحتياجات المادية للبرنامج</SectionTitle>
                    <ul className="space-y-1.5">{lines(needs).map((l, i) => <li key={i}>✦ {l}</li>)}</ul>
                  </div>
                )}
                <div>
                  <SectionTitle>مخرجات البرنامج</SectionTitle>
                  <ul className="space-y-1.5">
                    <li>✦ عدد الأوجه المنجزة: <b>{ar(data.pages)}</b> وجهًا.</li>
                    <li>✦ <b>{ar(data.beneficiaries)}</b> طالبة مستفيدة، وفق التفصيل الآتي:</li>
                  </ul>
                  <table className="mt-3 w-72 text-center border-collapse">
                    <thead>
                      <tr className="bg-primary text-primary-foreground font-display">
                        <th className="py-1.5 px-4 rounded-tr-lg">المسار المنجَز</th>
                        <th className="py-1.5 px-4 rounded-tl-lg">عدد المستفيدات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.buckets.map((b, i) => (
                        <tr key={b.label} className={i % 2 === 0 ? 'bg-secondary' : 'bg-muted/50'}>
                          <td className="py-1.5 px-4">{b.label}</td>
                          <td className="py-1.5 px-4">{countWord(b.count, 'طالبة واحدة', 'طالبتان', 'طالبات')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {lines(notes).length > 0 && (
                  <div>
                    <SectionTitle>الملاحظات</SectionTitle>
                    <ul className="space-y-1.5">{lines(notes).map((l, i) => <li key={i}>✦ {l}</li>)}</ul>
                  </div>
                )}

                {lines(suggestions).length > 0 && (
                  <div>
                    <SectionTitle>المقترحات</SectionTitle>
                    <ul className="space-y-1.5">{lines(suggestions).map((l, i) => <li key={i}>✦ {l}</li>)}</ul>
                  </div>
                )}

                <p className="text-center font-display text-xl text-primary pt-6">و الحمد لله</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
