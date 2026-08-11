import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Printer, CalendarDays, Users, Clock, BookOpen, Award, Flower2, UsersRound } from 'lucide-react';
import { useUrlState } from '@/lib/use-url-state';
import { slotHours } from '@/lib/schedule';
import logoTallam from '@/assets/logo-tallam.png';
import logoMaqraa from '@/assets/logo-maqraa.png';
import logoAlwaqar from '@/assets/logo-alwaqar.png';

interface TeacherRow { name: string; students: number; hours: number; }
interface Stats {
  supervisors: number;
  teachers: number;
  weeklyHours: number;
  students: number;
  pages: number;       // أوجه الشهر (تسميع + سرد)
  juz: number;
  khatmahEquiv: number;
  completions: number; // خاتمات الشهر (من عبرت 604 تراكميًا خلاله)
  perTeacher: TeacherRow[];
}

// أرقام عربية مشرقية كما في الإحصائية الرسمية
const ar = (n: number) => n.toLocaleString('ar-EG', { maximumFractionDigits: 1 });

function currentMonth(): string { return new Date().toISOString().slice(0, 7); }

/** اسم الشهر الهجري للشهر الميلادي المختار (منتصف الشهر تقريبًا) */
function hijriLabel(month: string): string {
  const d = new Date(`${month}-15T12:00:00`);
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { month: 'long', year: 'numeric' }).format(d);
  } catch { return month; }
}

export default function MonthlyReportPage() {
  const [month, setMonth] = useUrlState('m', currentMonth());
  const [stats, setStats] = useState<Stats | null>(null);
  const { toast } = useToast();

  const run = useCallback(async () => {
    const from = `${month}-01`;
    const to = new Date(new Date(`${month}-01T12:00:00`).getFullYear(),
                        new Date(`${month}-01T12:00:00`).getMonth() + 1, 0)
      .toISOString().slice(0, 10);

    const [sup, teach, sts, slots, tasmee, sard, allTasmee, allSard, bookings] = await Promise.all([
      supabase.from('supervisors').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('id, full_name').eq('is_active', true),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('availability_slots').select('teacher_id, start_time, end_time').eq('is_active', true),
      supabase.from('teacher_recitation_log').select('pages').gte('date', from).lte('date', to).eq('is_deleted', false),
      supabase.from('self_recitation_log').select('pages').gte('date', from).lte('date', to).eq('is_deleted', false),
      supabase.from('teacher_recitation_log').select('student_id, pages, date').lte('date', to).eq('is_deleted', false),
      supabase.from('self_recitation_log').select('student_id, pages, date').lte('date', to).eq('is_deleted', false),
      supabase.from('bookings').select('availability_slots(teacher_id)').eq('status', 'active'),
    ]);
    if (teach.error) { toast({ title: 'خطأ', description: teach.error.message, variant: 'destructive' }); return; }

    const pages = [...(tasmee.data || []), ...(sard.data || [])]
      .reduce((a: number, r: any) => a + Number(r.pages || 0), 0);

    // خاتمات الشهر: من زاد عدد ختماتها التراكمي خلال الشهر
    const cumBefore: Record<string, number> = {};
    const cumAfter: Record<string, number> = {};
    [...(allTasmee.data || []), ...(allSard.data || [])].forEach((r: any) => {
      const p = Number(r.pages || 0);
      cumAfter[r.student_id] = (cumAfter[r.student_id] ?? 0) + p;
      if (r.date < from) cumBefore[r.student_id] = (cumBefore[r.student_id] ?? 0) + p;
    });
    const completions = Object.keys(cumAfter).filter(id =>
      Math.floor((cumAfter[id] ?? 0) / 604) > Math.floor((cumBefore[id] ?? 0) / 604)).length;

    const perTeacher: TeacherRow[] = (teach.data || []).map((t: any) => ({
      name: t.full_name,
      students: (bookings.data || []).filter((b: any) => b.availability_slots?.teacher_id === t.id).length,
      hours: Math.round((slots.data || []).filter((s: any) => s.teacher_id === t.id)
        .reduce((a: number, s: any) => a + slotHours(s.start_time, s.end_time), 0) * 10) / 10,
    })).filter(t => t.students > 0 || t.hours > 0);

    setStats({
      supervisors: sup.count ?? 0,
      teachers: (teach.data || []).length,
      weeklyHours: Math.round(perTeacher.reduce((a, t) => a + t.hours, 0) * 10) / 10,
      students: sts.count ?? 0,
      pages: Math.round(pages * 10) / 10,
      juz: Math.round((pages / 20) * 10) / 10,
      khatmahEquiv: Math.round((pages / 604) * 10) / 10,
      completions,
      perTeacher,
    });
  }, [month, toast]);
  useEffect(() => { run(); }, [run]);

  const Pill = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <div className="flex items-center gap-3">
      <span className="text-primary/70 shrink-0">{icon}</span>
      <div className="flex-1">
        <div className="bg-secondary rounded-full px-4 py-1.5 text-primary font-display text-lg tracking-wide">{label}</div>
        <div className="px-4 pt-1 font-bold text-foreground/90">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="text-accent" />
          <h1 className="text-2xl font-display">الإحصائية الشهرية</h1>
        </div>
        <div className="space-y-1">
          <Label>الشهر</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
        <Button variant="outline" className="gap-1" onClick={() => window.print()}>
          <Printer size={16} /> تصدير PDF
        </Button>
      </div>

      {!stats ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <div className="print-area">
          <div className="max-w-2xl mx-auto bg-background rounded-2xl border p-8 space-y-8">
            {/* الترويسة: الشعارات الثلاثة + العنوان */}
            <div className="flex items-start justify-between">
              <div className="flex gap-2 items-center">
                <img src={logoTallam} alt="تعلم" className="h-10 object-contain" />
                <img src={logoMaqraa} alt="مقرأة الوقار" className="h-12 object-contain" />
                <img src={logoAlwaqar} alt="الوقار" className="h-10 object-contain" />
              </div>
              <div className="text-left">
                <p className="text-info font-display text-xl">إحصائية شهر {hijriLabel(month)}</p>
              </div>
            </div>
            <h2 className="text-center font-display text-5xl text-primary tracking-wide">لمقرأة الوقار</h2>

            {/* الكبسولات */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <Pill icon={<UsersRound size={26} />} label="عــدد المتعاونــات"
                value={`${ar(stats.supervisors)} مشرفات — ${ar(stats.teachers)} مسمعات`} />
              <Pill icon={<Clock size={26} />} label="عــدد الساعات"
                value={`${ar(stats.weeklyHours)} ساعة أسبوعيًا`} />
              <Pill icon={<BookOpen size={26} />} label="حصيلة الإنجــاز"
                value={`${ar(stats.pages)} وجهًا، بما يعادل ${ar(stats.juz)} جزءًا، ${ar(stats.khatmahEquiv)} ختمة`} />
              <Pill icon={<Users size={26} />} label="عدد الطالبات"
                value={`${ar(stats.students)} طالبة`} />
              <Pill icon={<Award size={26} />} label="عدد الخاتمات"
                value={stats.completions > 0 ? `${ar(stats.completions)} خاتمات` : 'لا خاتمات هذا الشهر'} />
            </div>

            {/* الفاصل */}
            <div className="flex items-center gap-3 justify-center">
              <div className="bg-secondary rounded-full px-8 py-1.5 text-primary/70 font-display text-lg">
                وذلك وفـــق الآتـــي
              </div>
              <Flower2 size={28} className="text-primary/50" />
            </div>

            {/* تفصيل المسمعات */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-5">
              {stats.perTeacher.map(t => (
                <div key={t.name} className="flex items-center gap-2">
                  <span className="text-accent text-xl">✦</span>
                  <div className="flex-1">
                    <div className="bg-secondary rounded-full px-4 py-1 font-display text-primary">{t.name}</div>
                    <div className="px-4 pt-1 text-sm font-bold text-foreground/80">
                      {ar(t.students)} {t.students === 1 ? 'طالبة' : t.students === 2 ? 'طالبتان' : 'طالبات'}
                      {' — '}
                      {ar(t.hours)} {t.hours === 1 ? 'ساعة' : t.hours === 2 ? 'ساعتان' : 'ساعات'}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground pt-4 border-t">
              مقرأة الوقار — «كان عمله ديمة»
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
