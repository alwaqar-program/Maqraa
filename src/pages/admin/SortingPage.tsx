import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ListOrdered, Printer, AlertTriangle } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { trackMinutes, slotCapacity, durationMinutes, TimeRow, fillTone, teacherColor, textOn } from '@/lib/circles';
import { genSlotLabel, optionDays, DayOption } from '@/lib/form-settings';

interface Row { weekday: number; start_time: string; end_time: string; track_id: string | null; is_daily?: boolean; teacher_id?: string; teacher_name?: string; teacher_color?: string | null }
interface Track { id: string; name: string; juz_count: number; quota_pages_per_season: number; seconds_per_page?: number; }
interface Applicant {
  id: string; full_name: string; phone: string | null; track_id: string | null;
  preferred_slots: string[]; preferred_period: string | null; created_at: string; status: string;
  sort_teacher_id?: string | null; sort_slot_label?: string | null;   // إسناد يدوي محفوظ (سحب وإفلات)
}
interface Seat { applicant: Applicant; track: Track | undefined; minutes: number; overflow: boolean; pinned: boolean }
/** حلقة مسمعة واحدة في يوم واحد — وحدة العرض في التقويم */
interface Event {
  key: string; day: number; start: string; end: string;
  teacherId: string; teacher: string; color: string | null; label: string; pool: string | null;
  capacity: number; seats: Seat[];
  lane: number; lanes: number;
}

const arNum = (n: number) => n.toLocaleString('ar-EG');
/** تدرّج هادئ لتمييز المسارات داخل البلوكات */
const TRACK_TINT = [
  'bg-emerald-500/12 text-emerald-950 dark:text-emerald-100',
  'bg-sky-500/12 text-sky-950 dark:text-sky-100',
  'bg-fuchsia-500/12 text-fuchsia-950 dark:text-fuchsia-100',
  'bg-amber-500/14 text-amber-950 dark:text-amber-100',
  'bg-violet-500/12 text-violet-950 dark:text-violet-100',
];

const PX_PER_MIN = 1.6;           // ارتفاع البلوك = مدته الحقيقية
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

/** فرز الطالبات — تقويم أسبوعي: كل مسمعة حلقة مستقلة، والمتزامنات جنبًا إلى جنب */
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
          .select('teacher_id, weekday, start_time, end_time, is_daily, teachers(full_name, track_id, is_active, color)')
          .range(0, 1999),
        supabase.from('tracks').select('id, name, juz_count, quota_pages_per_season, seconds_per_page')
          .eq('is_active', true).order('sort_order'),
        supabase.from('applicants')
          .select('id, full_name, phone, track_id, preferred_slots, preferred_period, created_at, status, sort_teacher_id, sort_slot_label')
          .neq('status', 'rejected').order('created_at').range(0, 4999),
      ]);
      if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
      setRows(((slots || []) as any[])
        .filter(s => s.teachers?.is_active)
        .map(s => ({
          weekday: s.weekday, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
          is_daily: s.is_daily, track_id: s.teachers?.track_id ?? null,
          teacher_id: s.teacher_id, teacher_name: s.teachers?.full_name ?? '—',
          teacher_color: s.teachers?.color ?? null,
        })));
      setTracks((tks || []) as Track[]);
      setApplicants((apps || []) as Applicant[]);
      setLoading(false);
    })();
  }, [toast]);

  const trackOf = (id: string | null) => tracks.find(t => t.id === id);
  const tintOf = (id: string | null) => TRACK_TINT[Math.max(0, tracks.findIndex(t => t.id === id)) % TRACK_TINT.length];

  // ---------- السحب والإفلات: نقل الطالبة إلى مسمعة أخرى، ويُحفظ فورًا ----------
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const assign = async (applicantId: string, teacherId: string | null, label: string | null) => {
    const a = applicants.find(x => x.id === applicantId);
    if (!a) return;
    const { error } = await supabase.from('applicants')
      .update({ sort_teacher_id: teacherId, sort_slot_label: label }).eq('id', applicantId);
    if (error) { toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' }); return; }
    setApplicants(prev => prev.map(x => x.id === applicantId
      ? { ...x, sort_teacher_id: teacherId, sort_slot_label: label } : x));
    toast({ title: teacherId ? `نُقلت ${a.full_name}` : `أُعيدت ${a.full_name} إلى اختيارها الأول` });
  };

  const onDropTo = (e: React.DragEvent, ev: Event) => {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    if (!id) return;
    const used = ev.seats.filter(s => !s.overflow).reduce((a, s) => a + s.minutes, 0);
    const mine = trackMinutes(trackOf(applicants.find(x => x.id === id)?.track_id ?? null));
    if (used + mine > ev.capacity) {
      toast({ title: `تنبيه: ${ev.teacher} ستتجاوز سعتها (${used + mine}/${ev.capacity} د)` });
    }
    assign(id, ev.teacherId, ev.label);
  };

  /** المواعيد المعروضة في نموذج التسجيل (نفس الاشتقاق) مع سعتها لكل جلسة */
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: (DayOption & { pool: string | null; capacity: number })[] = [];
    const push = (d: DayOption, pool: string | null, poolRows: Row[]) => {
      const k = `${pool ?? 'g'}|${d.label}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ ...d, pool, capacity: slotCapacity(poolRows as TimeRow[], { days: optionDays(d), start: d.start, end: d.end }) });
    };
    const pools: (string | null)[] = [null, ...new Set(rows.map(r => r.track_id).filter(Boolean) as string[])];
    pools.forEach(pool => {
      const poolRows = rows.filter(r => (pool ? r.track_id === pool : !r.track_id));
      poolRows.filter(r => !r.is_daily).forEach(r =>
        push({ value: r.weekday, start: r.start_time, end: r.end_time,
          label: genSlotLabel(r.weekday, r.start_time, r.end_time) }, pool, poolRows));
      const byTime: Record<string, number[]> = {};
      poolRows.filter(r => r.is_daily).forEach(r => {
        (byTime[`${r.start_time}|${r.end_time}`] ??= []).push(r.weekday);
      });
      Object.entries(byTime).forEach(([k, days]) => {
        const [start, end] = k.split('|');
        const from = Math.min(...days), to = Math.max(...days);
        push(from === to
          ? { value: from, start, end, label: genSlotLabel(from, start, end) }
          : { value: from, to, start, end, label: genSlotLabel(from, start, end, to) }, pool, poolRows);
      });
    });
    return out;
  }, [rows]);

  /** الأحداث: حلقة لكل (مسمعة × يوم)، وطالبات الأولوية الأولى موزَّعات على المسمعات بأسبقية التسجيل */
  const { events, noChoice, unknownLabel, totalCapacity, overCount } = useMemo(() => {
    const noChoice: Applicant[] = [];
    const unknownLabel: Applicant[] = [];
    const linkedTrackIds = new Set(rows.map(r => r.track_id).filter(Boolean) as string[]);

    // من اختارت كل موعد أولوية أولى، بترتيب أسبقية التسجيل — والمسحوبات يدويًا مثبَّتات على مسمعتهن
    const chooserOf: Record<string, Applicant[]> = {};
    const pinnedOf: Record<string, Applicant[]> = {};   // مفتاحه: موعد|معرّف المسمعة
    for (const a of applicants) {
      if (a.sort_teacher_id && a.sort_slot_label) {
        const opt = options.find(o => o.label === a.sort_slot_label);
        if (opt) { (pinnedOf[`${opt.pool ?? 'g'}|${opt.label}|${a.sort_teacher_id}`] ??= []).push(a); continue; }
      }
      const first = (a.preferred_slots ?? [])[0];
      if (!first) { noChoice.push(a); continue; }
      const pool = a.track_id && linkedTrackIds.has(a.track_id) ? a.track_id : null;
      const opt = options.find(o => o.label === first && o.pool === pool) ?? options.find(o => o.label === first);
      if (!opt) { unknownLabel.push(a); continue; }
      (chooserOf[`${opt.pool ?? 'g'}|${opt.label}`] ??= []).push(a);
    }

    const evs: Event[] = [];
    let totalCapacity = 0;
    options.forEach(opt => {
      const key = `${opt.pool ?? 'g'}|${opt.label}`;
      const days = optionDays(opt);
      const poolRows = rows.filter(r => (opt.pool ? r.track_id === opt.pool : !r.track_id));
      // مسمعات هذا الموعد (كل واحدة حلقة مستقلة) وأيامها
      const teacherRows = poolRows.filter(r => days.includes(r.weekday)
        && r.start_time === opt.start && r.end_time === opt.end);
      const teachers = [...new Map(teacherRows.map(r => [r.teacher_id!, r])).values()]
        .map(r => ({ id: r.teacher_id!, name: r.teacher_name!, color: r.teacher_color ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      if (!teachers.length) return;
      const perTeacher = durationMinutes(opt.start!, opt.end!);
      totalCapacity += perTeacher * teachers.length;

      // المثبَّتات يدويًا أولًا (يحجزن مقاعدهن)، ثم الباقيات يملأن المسمعات بالترتيب
      const buckets: Seat[][] = teachers.map(() => []);
      const usedOf: number[] = teachers.map(() => 0);
      teachers.forEach((t, i) => {
        (pinnedOf[`${key}|${t.id}`] ?? []).forEach(a => {
          const track = trackOf(a.track_id);
          const minutes = trackMinutes(track);
          buckets[i].push({ applicant: a, track, minutes, overflow: usedOf[i] + minutes > perTeacher, pinned: true });
          usedOf[i] += minutes;
        });
      });
      (chooserOf[key] ?? []).forEach(a => {
        const track = trackOf(a.track_id);
        const minutes = trackMinutes(track);
        const i = teachers.findIndex((_, j) => usedOf[j] + minutes <= perTeacher);
        const target = i >= 0 ? i : teachers.length - 1;
        buckets[target].push({ applicant: a, track, minutes, overflow: i < 0, pinned: false });
        if (i >= 0) usedOf[i] += minutes;
      });

      teachers.forEach((t, i) => {
        const daysOfTeacher = teacherRows.filter(r => r.teacher_id === t.id).map(r => r.weekday);
        [...new Set(daysOfTeacher)].forEach(day => {
          evs.push({
            key: `${key}|${t.id}|${day}`, day, start: opt.start!, end: opt.end!,
            teacherId: t.id, teacher: t.name, color: t.color, label: opt.label, pool: opt.pool,
            capacity: perTeacher, seats: buckets[i], lane: 0, lanes: 1,
          });
        });
      });
    });

    // مسارات التجاور داخل كل يوم (كتقويم Teams): المتزامنات تتقاسم العرض
    const byDay: Record<number, Event[]> = {};
    evs.forEach(e => { (byDay[e.day] ??= []).push(e); });
    Object.values(byDay).forEach(list => {
      list.sort((a, b) => toMin(a.start) - toMin(b.start) || a.teacher.localeCompare(b.teacher, 'ar'));
      let cluster: Event[] = [];
      let clusterEnd = -1;
      const closeCluster = () => {
        const lanes = cluster.reduce((mx, e) => Math.max(mx, e.lane + 1), 0);
        cluster.forEach(e => { e.lanes = lanes; });
        cluster = []; clusterEnd = -1;
      };
      list.forEach(e => {
        if (cluster.length && toMin(e.start) >= clusterEnd) closeCluster();
        const laneEnds: number[] = [];
        cluster.forEach(x => { laneEnds[x.lane] = Math.max(laneEnds[x.lane] ?? -1, toMin(x.end)); });
        let lane = 0;
        while (laneEnds[lane] !== undefined && laneEnds[lane] > toMin(e.start)) lane += 1;
        e.lane = lane;
        cluster.push(e);
        clusterEnd = Math.max(clusterEnd, toMin(e.end));
      });
      if (cluster.length) closeCluster();
    });

    const overCount = evs.filter(e => e.seats.some(s => s.overflow)).length;
    return { events: evs, noChoice, unknownLabel, totalCapacity, overCount };
  }, [applicants, options, rows, tracks]);

  const days = [...new Set(events.map(e => e.day))].sort((a, b) => a - b);
  const dayStart = events.length ? Math.min(...events.map(e => toMin(e.start))) : 0;
  const dayEnd = events.length ? Math.max(...events.map(e => toMin(e.end))) : 0;
  const railFrom = Math.floor(dayStart / 60) * 60;
  const railTo = Math.ceil(dayEnd / 60) * 60;
  const gridHeight = (railTo - railFrom) * PX_PER_MIN;
  const hours = Array.from({ length: Math.max(0, (railTo - railFrom) / 60 + 1) }, (_, i) => railFrom + i * 60);
  const totalNeeded = applicants.reduce((a, x) => a + trackMinutes(trackOf(x.track_id)), 0);

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
        كل مسمعة حلقة مستقلة، وارتفاع البلوك يساوي مدة الموعد. الطالبات هنا من اختارت هذا الموعد
        <b> أولوية أولى</b>، مرتبات بأسبقية التسجيل.
        <b> اسحبي أي طالبة</b> إلى حلقة أخرى لنقلها (يُحفظ فورًا ويحترمه التوزيع التلقائي)، ونقرتان على المنقولة تعيدانها لاختيارها.
      </p>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl print:hidden">
            {[
              { label: 'الدقائق المطلوبة', value: `${arNum(totalNeeded)} د`, warn: totalNeeded > totalCapacity },
              { label: 'الدقائق المتاحة', value: `${arNum(totalCapacity)} د`, warn: false },
              { label: 'حلقات متجاوزة', value: arNum(overCount), warn: overCount > 0 },
              { label: 'بلا أولوية', value: arNum(noChoice.length + unknownLabel.length), warn: false },
            ].map(x => (
              <Card key={x.label}><CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-display ${x.warn ? 'text-destructive' : 'text-primary'}`}>{x.value}</p>
                <p className="text-xs text-muted-foreground">{x.label}</p>
              </CardContent></Card>
            ))}
          </div>

          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">لا مواعيد توفر مسجلة للمسمعات بعد.</p>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="min-w-max">
                {/* ترويسة الأيام */}
                <div className="flex gap-2 mb-2">
                  <div className="w-14 shrink-0" />
                  {days.map(d => (
                    <div key={d} className="flex-1 min-w-[190px] text-center font-display bg-primary text-primary-foreground rounded-lg py-1.5">
                      {WEEKDAYS[d]}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  {/* محور الوقت */}
                  <div className="w-14 shrink-0 relative" style={{ height: gridHeight }}>
                    {hours.map(h => (
                      <div key={h} className="absolute -translate-y-1/2 text-[11px] text-muted-foreground whitespace-nowrap"
                        style={{ insetInlineEnd: 0, top: (h - railFrom) * PX_PER_MIN }}>
                        {formatTime(`${String(Math.floor(h / 60)).padStart(2, '0')}:${String(h % 60).padStart(2, '0')}`)}
                      </div>
                    ))}
                  </div>

                  {/* أعمدة الأيام */}
                  {days.map(d => (
                    <div key={d} className="flex-1 min-w-[190px] relative rounded-lg border bg-card/40"
                      style={{ height: gridHeight }}>
                      {hours.map(h => (
                        <div key={h} className="absolute inset-x-0 border-t border-border/50"
                          style={{ top: (h - railFrom) * PX_PER_MIN }} />
                      ))}
                      {events.filter(e => e.day === d).map(e => {
                        const used = e.seats.filter(s => !s.overflow).reduce((a, s) => a + s.minutes, 0);
                        const over = e.seats.some(s => s.overflow);
                        const fill = Math.min(100, Math.round((used / e.capacity) * 100));
                        return (
                          <div key={e.key}
                            onDragOver={ev => { ev.preventDefault(); setDropKey(e.key); }}
                            onDragLeave={() => setDropKey(k => (k === e.key ? null : k))}
                            onDrop={ev => onDropTo(ev, e)}
                            className={`absolute rounded-lg border overflow-hidden print:break-inside-avoid transition-shadow ${
                              dropKey === e.key ? 'ring-2 ring-accent shadow-lg' : ''} ${
                              over ? 'border-destructive/60 bg-destructive/5' : 'border-accent/40 bg-card'}`}
                            style={{
                              top: (toMin(e.start) - railFrom) * PX_PER_MIN + 2,
                              height: durationMinutes(e.start, e.end) * PX_PER_MIN - 4,
                              insetInlineStart: `calc(${(e.lane * 100) / e.lanes}% + 2px)`,
                              inlineSize: `calc(${100 / e.lanes}% - 4px)`,
                            }}>
                            {/* مؤشر الامتلاء على حافة البلوك */}
                            <div className="absolute inset-y-0 w-1.5 bg-muted" style={{ insetInlineStart: 0 }}>
                              <div className={`absolute bottom-0 inset-x-0 ${over ? 'bg-destructive' : 'bg-accent'}`}
                                style={{ height: `${fill}%` }} />
                            </div>
                            <div className="ps-3 pe-1.5 py-1 h-full flex flex-col">
                              <p className="font-medium text-[13px] leading-tight truncate">{e.teacher}</p>
                              <p className="text-[10px] text-muted-foreground leading-tight">
                                {formatTime(e.start)}–{formatTime(e.end)} · {arNum(used)}/{arNum(e.capacity)} د
                                {e.pool && <> · {trackOf(e.pool)?.name}</>}
                              </p>
                              <div className="mt-1 space-y-0.5 overflow-y-auto print:overflow-visible">
                                {e.seats.length === 0 && <p className="text-[11px] text-muted-foreground">لا طالبات</p>}
                                {e.seats.map(s => (
                                  <p key={s.applicant.id} draggable
                                    onDragStart={ev => { ev.dataTransfer.setData('text/plain', s.applicant.id); setDragId(s.applicant.id); }}
                                    onDragEnd={() => { setDragId(null); setDropKey(null); }}
                                    onDoubleClick={() => s.pinned && assign(s.applicant.id, null, null)}
                                    title={`${s.track?.name ?? ''} — ${s.minutes}د${s.applicant.phone ? ' — ' + s.applicant.phone : ''}${s.pinned ? ' — منقولة يدويًا (نقرتان للتراجع)' : ''}`}
                                    className={`text-[11px] leading-tight rounded px-1 py-0.5 truncate cursor-grab active:cursor-grabbing ${
                                      dragId === s.applicant.id ? 'opacity-40' : ''} ${
                                      s.pinned ? 'ring-1 ring-accent/60 ' : ''}${
                                      s.overflow ? 'bg-destructive/15 text-destructive' : tintOf(s.applicant.track_id)}`}>
                                    {s.overflow && <AlertTriangle size={9} className="inline ms-0.5" />}
                                    {s.applicant.full_name} <span className="opacity-60">{arNum(s.minutes)}د</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(noChoice.length > 0 || unknownLabel.length > 0) && (
            <Card className="border-warning/50">
              <CardContent className="pt-5 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warning" />
                  يحتجن إسنادًا يدويًا ({noChoice.length + unknownLabel.length})
                  <span className="text-xs font-normal text-muted-foreground">— اسحبي الاسم إلى حلقة في التقويم</span>
                </p>
                {[...noChoice, ...unknownLabel].map(a => (
                  <p key={a.id} draggable
                    onDragStart={ev => { ev.dataTransfer.setData('text/plain', a.id); setDragId(a.id); }}
                    onDragEnd={() => { setDragId(null); setDropKey(null); }}
                    className={`text-sm border rounded-lg px-2 py-1 bg-background cursor-grab active:cursor-grabbing ${
                      dragId === a.id ? 'opacity-40' : ''}`}>
                    {a.full_name} — {trackOf(a.track_id)?.name ?? 'بلا مسار'} ({arNum(trackMinutes(trackOf(a.track_id)))}د) —{' '}
                    <span className="text-muted-foreground">
                      {(a.preferred_slots ?? []).length
                        ? `أولويتها الأولى «${a.preferred_slots[0]}» لم تعد معروضة`
                        : 'لم تختر أي موعد'}
                    </span>
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
