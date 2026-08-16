import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ListOrdered, Printer, AlertTriangle } from 'lucide-react';
import { WEEKDAYS } from '@/lib/schedule';
import { trackMinutes, slotCapacity, durationMinutes, TimeRow } from '@/lib/circles';
import { genSlotLabel, optionDays, DayOption } from '@/lib/form-settings';

interface Row { weekday: number; start_time: string; end_time: string; track_id: string | null; is_daily?: boolean; teacher_name?: string }
interface Track { id: string; name: string; juz_count: number; quota_pages_per_season: number }
interface Applicant {
  id: string; full_name: string; phone: string | null; track_id: string | null;
  preferred_slots: string[]; preferred_period: string | null; created_at: string; status: string;
}
interface Cell { applicant: Applicant; track: Track | undefined; minutes: number; overflow: boolean }

const arNum = (n: number) => n.toLocaleString('ar-EG');
const TRACK_TINT = [
  'bg-green-100 dark:bg-green-950/40',
  'bg-sky-100 dark:bg-sky-950/40',
  'bg-pink-100 dark:bg-pink-950/40',
  'bg-orange-100 dark:bg-orange-950/40',
];

/** فرز الطالبات — توزيع مبدئي بالأولوية الأولى قبل إنشاء الحلقات، بشكل جدول التوزيع المعتمد */
export default function SortingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: slots, error }, { data: tks }, { data: apps }] = await Promise.all([
        supabase.from('availability_slots')
          .select('weekday, start_time, end_time, is_daily, teachers(full_name, track_id, is_active)')
          .range(0, 1999),
        supabase.from('tracks').select('id, name, juz_count, quota_pages_per_season')
          .eq('is_active', true).order('sort_order'),
        supabase.from('applicants')
          .select('id, full_name, phone, track_id, preferred_slots, preferred_period, created_at, status')
          .neq('status', 'rejected').order('created_at').range(0, 4999),
      ]);
      if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
      setRows(((slots || []) as any[])
        .filter(s => s.teachers?.is_active)
        .map(s => ({
          weekday: s.weekday, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
          is_daily: s.is_daily, track_id: s.teachers?.track_id ?? null, teacher_name: s.teachers?.full_name,
        })));
      setTracks((tks || []) as Track[]);
      setApplicants((apps || []) as Applicant[]);
      setLoading(false);
    })();
  }, [toast]);

  /** كل المواعيد المعروضة (بنفس اشتقاق نموذج التسجيل) مع سعتها ومسمعاتها */
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const out: (DayOption & { teachers: string[]; capacity: number; pool: string | null })[] = [];
    const push = (d: DayOption, pool: string | null) => {
      const k = `${pool ?? 'g'}|${d.label}`;
      if (seen.has(k)) return;
      seen.add(k);
      const days = optionDays(d);
      const poolRows = rows.filter(r => (pool ? r.track_id === pool : !r.track_id));
      out.push({
        ...d, pool,
        capacity: slotCapacity(poolRows as TimeRow[], { days, start: d.start, end: d.end }),
        teachers: [...new Set(poolRows
          .filter(r => days.includes(r.weekday) && r.start_time === d.start && r.end_time === d.end)
          .map(r => r.teacher_name ?? '—'))],
      });
    };
    // مجموعة عامة + مجموعة لكل مسار مرتبط بمسمعة
    const pools: (string | null)[] = [null, ...new Set(rows.map(r => r.track_id).filter(Boolean) as string[])];
    pools.forEach(pool => {
      const poolRows = rows.filter(r => (pool ? r.track_id === pool : !r.track_id));
      // العادية
      poolRows.filter(r => !r.is_daily)
        .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time))
        .forEach(r => push({ value: r.weekday, start: r.start_time, end: r.end_time,
          label: genSlotLabel(r.weekday, r.start_time, r.end_time) }, pool));
      // الدورية: تُطوى خيارًا واحدًا بمدى أيام
      const byTime: Record<string, number[]> = {};
      poolRows.filter(r => r.is_daily).forEach(r => {
        (byTime[`${r.start_time}|${r.end_time}`] ??= []).push(r.weekday);
      });
      Object.entries(byTime).forEach(([k, days]) => {
        const [start, end] = k.split('|');
        const from = Math.min(...days), to = Math.max(...days);
        push(from === to
          ? { value: from, start, end, label: genSlotLabel(from, start, end) }
          : { value: from, to, start, end, label: genSlotLabel(from, start, end, to) }, pool);
      });
    });
    return out.sort((a, b) => a.value - b.value || (a.start ?? '').localeCompare(b.start ?? ''));
  }, [rows]);

  const trackOf = (id: string | null) => tracks.find(t => t.id === id);
  const tintOf = (id: string | null) => TRACK_TINT[Math.max(0, tracks.findIndex(t => t.id === id)) % TRACK_TINT.length];

  /** توزيع المتقدمات على الأعمدة بالأولوية الأولى وبأسبقية التسجيل، وتعليم الفائضات */
  const { cells, noChoice, unknownLabel } = useMemo(() => {
    const cells: Record<string, Cell[]> = {};
    const noChoice: Applicant[] = [];
    const unknownLabel: Applicant[] = [];
    const fill: Record<string, number> = {};
    const linkedTrackIds = new Set(rows.map(r => r.track_id).filter(Boolean) as string[]);

    for (const a of applicants) {
      const first = (a.preferred_slots ?? [])[0];
      if (!first) { noChoice.push(a); continue; }
      // العمود = نفس المجموعة التي رأتها الطالبة (مسارها المرتبط، وإلا العامة)
      const pool = a.track_id && linkedTrackIds.has(a.track_id) ? a.track_id : null;
      const col = columns.find(c => c.label === first && c.pool === pool)
        ?? columns.find(c => c.label === first);
      if (!col) { unknownLabel.push(a); continue; }
      const key = `${col.pool ?? 'g'}|${col.label}`;
      const track = trackOf(a.track_id);
      const minutes = trackMinutes(track);
      const used = fill[key] ?? 0;
      const overflow = used + minutes > col.capacity;
      fill[key] = used + minutes;
      (cells[key] ??= []).push({ applicant: a, track, minutes, overflow });
    }
    return { cells, noChoice, unknownLabel };
  }, [applicants, columns, tracks, rows]);

  const keyOf = (c: (typeof columns)[number]) => `${c.pool ?? 'g'}|${c.label}`;
  const totalCapacity = columns.reduce((a, c) => a + c.capacity, 0);
  const totalNeeded = applicants.reduce((a, x) => a + trackMinutes(trackOf(x.track_id)), 0);
  const fullCols = columns.filter(c => (cells[keyOf(c)] ?? []).some(x => x.overflow)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <ListOrdered className="text-accent" />
          <h1 className="text-2xl font-display">فرز الطالبات</h1>
          <Badge variant="outline">{applicants.length} متقدمة</Badge>
        </div>
        <Button variant="outline" className="gap-1" onClick={() => window.print()}>
          <Printer size={15} /> طباعة
        </Button>
      </div>

      <p className="text-sm text-muted-foreground print:text-black">
        فرز مبدئي بالأولوية الأولى لكل متقدمة وبأسبقية التسجيل — السعة بالدقائق (صفحة = دقيقتان).
        الاعتماد النهائي يتم من صفحة «الحلقات».
      </p>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl print:hidden">
            {[
              { label: 'الدقائق المطلوبة', value: `${arNum(totalNeeded)} د` },
              { label: 'الدقائق المتاحة', value: `${arNum(totalCapacity)} د` },
              { label: 'مواعيد متجاوزة', value: arNum(fullCols) },
              { label: 'بلا أولوية', value: arNum(noChoice.length + unknownLabel.length) },
            ].map(x => (
              <Card key={x.label}><CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-display ${x.label === 'مواعيد متجاوزة' && fullCols > 0 ? 'text-destructive' : 'text-primary'}`}>{x.value}</p>
                <p className="text-xs text-muted-foreground">{x.label}</p>
              </CardContent></Card>
            ))}
          </div>

          {columns.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا مواعيد توفر مسجلة للمسمعات بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="flex gap-3 items-start min-w-max pb-2">
                {columns.map(c => {
                  const list = cells[keyOf(c)] ?? [];
                  const used = list.reduce((a, x) => a + x.minutes, 0);
                  const over = used > c.capacity;
                  return (
                    <div key={keyOf(c)} className="w-60 shrink-0 border rounded-xl overflow-hidden print:break-inside-avoid">
                      <div className={`px-2 py-1.5 text-center ${over ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}>
                        <p className="font-display text-sm leading-tight">{c.label}</p>
                        <p className="text-[11px] opacity-90">
                          {c.teachers.join('، ') || 'بلا مسمعة'}
                          {c.pool && <> — {trackOf(c.pool)?.name}</>}
                        </p>
                      </div>
                      <div className={`px-2 py-1 text-center text-xs border-b ${over ? 'bg-destructive/10 text-destructive font-medium' : 'bg-muted/60'}`}>
                        {arNum(used)}/{arNum(c.capacity)} دقيقة — {arNum(list.length)} طالبة
                      </div>
                      {list.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-3">—</p>
                      ) : list.map(x => (
                        <div key={x.applicant.id}
                          className={`border-t px-2 py-1.5 text-xs leading-snug ${x.overflow ? 'bg-destructive/10' : tintOf(x.applicant.track_id)}`}
                          title={x.overflow ? 'فوق السعة — تحتاج نقلًا لموعد آخر' : x.track?.name}>
                          <p className="font-medium flex items-center gap-1">
                            {x.overflow && <AlertTriangle size={11} className="text-destructive shrink-0" />}
                            {x.applicant.full_name}
                          </p>
                          <p className="text-muted-foreground">{x.track?.name ?? 'بلا مسار'} — {arNum(x.minutes)}د</p>
                          {x.applicant.phone && <p dir="ltr" className="text-left text-muted-foreground">{x.applicant.phone}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(noChoice.length > 0 || unknownLabel.length > 0) && (
            <Card className="border-warning/50">
              <CardContent className="pt-5 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warning" />
                  يحتجن إسنادًا يدويًا ({noChoice.length + unknownLabel.length})
                </p>
                {noChoice.map(a => (
                  <p key={a.id} className="text-sm">
                    • {a.full_name} — {trackOf(a.track_id)?.name ?? 'بلا مسار'} — <span className="text-muted-foreground">لم تختر أي موعد</span>
                  </p>
                ))}
                {unknownLabel.map(a => (
                  <p key={a.id} className="text-sm">
                    • {a.full_name} — {trackOf(a.track_id)?.name ?? 'بلا مسار'} — <span className="text-muted-foreground">أولويتها الأولى «{a.preferred_slots[0]}» لم تعد معروضة</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
