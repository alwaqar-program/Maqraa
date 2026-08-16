import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CalendarCheck2, Printer } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { remainingCategory } from '@/lib/circles';

// رموز التقرير: الحضور نخلة، التعويض سعفة، الغياب الشجرة الصفراء (ورق الخريف)
const SYMBOL: Record<string, string> = { present: '🌴', makeup: '🌿', absent: '🍂' };
const arNum = (n: number) => n.toLocaleString('ar-EG');

interface Circle {
  id: string; number: number; weekday: number; start_time: string; end_time: string;
  teacher_id: string; teacher_name: string;
  members: { student_id: string; student_name: string; phone: string | null; start_time: string | null }[];
}
interface AttRow { student_id: string; date: string; status: string; reason: string | null }

/** بداية أسبوع التاريخ (الأحد) بحساب نصي بلا انزياح مناطق زمنية */
function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function CirclesReportPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [weekDate, setWeekDate] = useState(new Date().toISOString().slice(0, 10));
  const [weekAtt, setWeekAtt] = useState<AttRow[]>([]);
  const [termAtt, setTermAtt] = useState<AttRow[]>([]);
  const [termCircle, setTermCircle] = useState('');
  const [pagesBy, setPagesBy] = useState<Record<string, number>>({});
  const [season, setSeason] = useState<{ name: string; start_date: string; end_date: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const weekStart = weekStartOf(weekDate);
  const weekEnd = addDays(weekStart, 6);

  // الحلقات وأعضاؤها + الفصل الحالي (مرة واحدة)
  useEffect(() => {
    (async () => {
      const [{ data: cs, error }, { data: se }] = await Promise.all([
        supabase.from('circles')
          .select('id, number, weekday, start_time, end_time, teacher_id, teachers(full_name), circle_members(student_id, start_time, students(full_name, phone))')
          .eq('is_active', true).order('number'),
        supabase.from('seasons').select('name, start_date, end_date').eq('is_current', true).maybeSingle(),
      ]);
      if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
      setCircles((cs || []).map((c: any) => ({
        id: c.id, number: c.number, weekday: c.weekday,
        start_time: c.start_time, end_time: c.end_time, teacher_id: c.teacher_id,
        teacher_name: c.teachers?.full_name ?? '—',
        members: (c.circle_members || []).map((m: any) => ({
          student_id: m.student_id, student_name: m.students?.full_name ?? '—',
          phone: m.students?.phone ?? null, start_time: m.start_time,
        })),
      })));
      setSeason(se || null);
      // منجز كل طالبة (تسميع + سرد) — لتلوين المتبقي للختمة في شبكة التوزيع
      const [{ data: tas }, { data: sard }] = await Promise.all([
        supabase.from('teacher_recitation_log').select('student_id, pages').eq('is_deleted', false).range(0, 9999),
        supabase.from('self_recitation_log').select('student_id, pages').eq('is_deleted', false).range(0, 9999),
      ]);
      const pb: Record<string, number> = {};
      [...(tas || []), ...(sard || [])].forEach((l: any) => {
        pb[l.student_id] = (pb[l.student_id] ?? 0) + Number(l.pages || 0);
      });
      setPagesBy(pb);
      setLoading(false);
    })();
  }, [toast]);

  // حضور الأسبوع المختار
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('session_attendance')
        .select('student_id, date, status, reason')
        .gte('date', weekStart).lte('date', weekEnd).eq('is_deleted', false).range(0, 4999);
      setWeekAtt(data || []);
    })();
  }, [weekStart, weekEnd]);

  // تراكمي الترم لحلقة مختارة
  const loadTerm = useCallback(async (circleId: string) => {
    setTermCircle(circleId);
    const circle = circles.find(c => c.id === circleId);
    if (!circle) { setTermAtt([]); return; }
    const ids = circle.members.map(m => m.student_id);
    if (!ids.length) { setTermAtt([]); return; }
    let q = supabase.from('session_attendance')
      .select('student_id, date, status, reason')
      .in('student_id', ids).eq('is_deleted', false).order('date').range(0, 4999);
    if (season) q = q.gte('date', season.start_date).lte('date', season.end_date);
    const { data } = await q;
    setTermAtt(data || []);
  }, [circles, season]);

  // تجميع الأسبوعي: مسمعة ← حلقاتها ← سطر اليوم بالرموز
  const teacherGroups = useMemo(() => {
    const attBy: Record<string, AttRow[]> = {};
    weekAtt.forEach(a => { (attBy[a.student_id] ??= []).push(a); });
    const groups: Record<string, { teacher: string; circles: Circle[] }> = {};
    circles.forEach(c => {
      (groups[c.teacher_id] ??= { teacher: c.teacher_name, circles: [] }).circles.push(c);
    });
    return Object.values(groups).map(g => ({
      ...g,
      circles: [...g.circles].sort((a, b) => a.weekday - b.weekday),
      attBy,
    }));
  }, [circles, weekAtt]);

  const termDates = useMemo(() =>
    [...new Set(termAtt.map(a => a.date))].sort(), [termAtt]);
  const termCircleObj = circles.find(c => c.id === termCircle);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="text-accent" />
          <h1 className="text-2xl font-display">تقرير الحلقات</h1>
        </div>
        <Button variant="outline" className="gap-1" onClick={() => window.print()}>
          <Printer size={15} /> طباعة
        </Button>
      </div>

      <p className="text-sm text-muted-foreground print:text-black">
        الرموز: 🌴 حضور — 🌿 تعويض — 🍂 غياب
      </p>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <Tabs defaultValue="weekly" dir="rtl">
          <TabsList className="print:hidden">
            <TabsTrigger value="weekly">الأسبوعي</TabsTrigger>
            <TabsTrigger value="term">تراكمي الترم (متابعة الطالبة)</TabsTrigger>
            <TabsTrigger value="grid">توزيع الطالبات</TabsTrigger>
          </TabsList>

          {/* ---------- التقرير الأسبوعي ---------- */}
          <TabsContent value="weekly" className="space-y-4">
            <div className="flex items-end gap-3 print:hidden">
              <div className="space-y-1">
                <Label>أسبوع التاريخ</Label>
                <Input type="date" value={weekDate} onChange={e => setWeekDate(e.target.value)} />
              </div>
              <Badge variant="outline" className="mb-1">{weekStart} ← {weekEnd}</Badge>
            </div>

            {teacherGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا حلقات نشطة.</p>
            ) : teacherGroups.map(g => (
              <Card key={g.teacher} className="print:shadow-none print:border-black/20">
                <CardContent className="pt-5 space-y-2.5">
                  <p className="font-display text-lg text-primary">
                    حلقة ({g.circles.map(c => arNum(c.number)).join('، ')}) أ.{g.teacher}
                  </p>
                  {g.circles.map(c => {
                    const line = c.members.map(m => {
                      const rec = (g.attBy[m.student_id] || [])[0];
                      const sym = rec ? (SYMBOL[rec.status] ?? '') : '';
                      return { name: m.student_name, sym, reason: rec?.reason };
                    });
                    return (
                      <div key={c.id} className="text-[15px] leading-relaxed">
                        <b>{WEEKDAYS[c.weekday]}</b>
                        <span className="text-muted-foreground text-xs"> ({formatTime(c.start_time)}–{formatTime(c.end_time)} — حلقة {arNum(c.number)})</span>
                        {' : '}
                        {c.members.length === 0 ? <span className="text-muted-foreground">لا طالبات</span> :
                          line.map((s, i) => (
                            <span key={i} className="whitespace-nowrap">
                              {s.sym || '◻️'} {s.name}{s.reason ? ` (${s.reason})` : ''}{i < line.length - 1 ? '، ' : ''}
                            </span>
                          ))}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground print:hidden">◻️ = لم يُسجل لها حضور في هذا الأسبوع بعد.</p>
          </TabsContent>

          {/* ---------- تراكمي الترم ---------- */}
          <TabsContent value="term" className="space-y-4">
            <div className="flex items-end gap-3 flex-wrap print:hidden">
              <div className="space-y-1 min-w-64">
                <Label>الحلقة</Label>
                <Select value={termCircle} onValueChange={loadTerm}>
                  <SelectTrigger><SelectValue placeholder="اختاري الحلقة" /></SelectTrigger>
                  <SelectContent>
                    {circles.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        حلقة {c.number} — {c.teacher_name} ({WEEKDAYS[c.weekday]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {season && <Badge variant="outline" className="mb-1">{season.name}: {season.start_date} ← {season.end_date}</Badge>}
            </div>

            {termCircleObj && (
              <Card className="print:shadow-none print:border-black/20">
                <CardContent className="pt-5 space-y-3 overflow-x-auto">
                  <p className="font-display text-lg text-primary">
                    حلقة ({arNum(termCircleObj.number)}) أ.{termCircleObj.teacher_name} — المتابعة التراكمية
                  </p>
                  {termDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا سجلات حضور بعد.</p>
                  ) : (
                    <table className="text-sm border-collapse">
                      <thead>
                        <tr>
                          <th className="border px-2 py-1 bg-muted/40 text-right">الطالبة</th>
                          {termDates.map(d => (
                            <th key={d} className="border px-1.5 py-1 bg-muted/40 font-normal whitespace-nowrap text-xs">
                              {d.slice(5)}
                            </th>
                          ))}
                          <th className="border px-2 py-1 bg-success/15">🌴</th>
                          <th className="border px-2 py-1 bg-orange-500/15">🌿</th>
                          <th className="border px-2 py-1 bg-yellow-400/20">🍂</th>
                        </tr>
                      </thead>
                      <tbody>
                        {termCircleObj.members.map(m => {
                          const mine = termAtt.filter(a => a.student_id === m.student_id);
                          const by: Record<string, string> = {};
                          mine.forEach(a => { by[a.date] = a.status; });
                          const count = (s: string) => mine.filter(a => a.status === s).length;
                          return (
                            <tr key={m.student_id}>
                              <td className="border px-2 py-1 font-medium whitespace-nowrap">{m.student_name}</td>
                              {termDates.map(d => (
                                <td key={d} className="border px-1.5 py-1 text-center">
                                  {SYMBOL[by[d]] ?? ''}
                                </td>
                              ))}
                              <td className="border px-2 py-1 text-center font-medium">{arNum(count('present'))}</td>
                              <td className="border px-2 py-1 text-center font-medium">{arNum(count('makeup'))}</td>
                              <td className="border px-2 py-1 text-center font-medium">{arNum(count('absent'))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---------- شبكة توزيع الطالبات (كنموذج الترم السابق) ---------- */}
          <TabsContent value="grid" className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs print:text-black">
              {[604, 50, 15, 8].map(r => {
                const cat = remainingCategory(r);
                return <span key={r} className={`${cat.cls} border rounded px-2 py-0.5`}>{cat.label}</span>;
              })}
            </div>
            {circles.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا حلقات نشطة.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-3 items-start min-w-max pb-2">
                  {Object.values(
                    circles.reduce((acc: Record<string, { teacher: string; list: Circle[] }>, c) => {
                      (acc[c.teacher_id] ??= { teacher: c.teacher_name, list: [] }).list.push(c);
                      return acc;
                    }, {})
                  ).map(g => (
                    <div key={g.teacher} className="w-56 shrink-0 border rounded-xl overflow-hidden print:break-inside-avoid">
                      <p className="bg-primary text-primary-foreground text-center font-display py-1.5">
                        أ.{g.teacher}
                      </p>
                      {[...g.list].sort((a, b) => a.weekday - b.weekday).map(c => (
                        <div key={c.id} className="border-t">
                          <p className="bg-muted/60 text-center text-xs py-1">
                            حلقة {arNum(c.number)} — {WEEKDAYS[c.weekday]} {formatTime(c.start_time)}–{formatTime(c.end_time)}
                          </p>
                          {c.members.length === 0 ? (
                            <p className="text-center text-xs text-muted-foreground py-2">—</p>
                          ) : [...c.members]
                            .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
                            .map(m => {
                              const remaining = Math.max(0, 604 - (pagesBy[m.student_id] ?? 0));
                              const cat = remainingCategory(remaining);
                              return (
                                <div key={m.student_id} className={`${cat.cls} border-t px-2 py-1.5 text-xs leading-snug`}
                                  title={`${cat.label} (${remaining} صفحة)`}>
                                  <p className="font-medium">
                                    {m.start_time ? `${formatTime(m.start_time)} — ` : ''}{m.student_name}
                                  </p>
                                  {m.phone && <p dir="ltr" className="text-left text-muted-foreground">{m.phone}</p>}
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
