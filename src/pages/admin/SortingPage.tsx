import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ClearFilters } from '@/components/ui/clear-filters';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUrlState } from '@/lib/use-url-state';
import { ListOrdered, Printer, AlertTriangle, Filter, UserX, Undo2 } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { trackMinutes, slotCapacity, durationMinutes, TimeRow, fillTone, teacherColor, textOn, SORT_EXCLUDED } from '@/lib/circles';
import { genSlotLabel, optionDays, DayOption } from '@/lib/form-settings';

interface Row { weekday: number; start_time: string; end_time: string; track_id: string | null; is_daily?: boolean; teacher_id?: string; teacher_name?: string; teacher_color?: string | null }
interface Track { id: string; name: string; juz_count: number; quota_pages_per_season: number; seconds_per_page?: number; }
interface Applicant {
  id: string; full_name: string; phone: string | null; track_id: string | null;
  preferred_slots: string[]; preferred_period: string | null; created_at: string; status: string;
  sort_teacher_id?: string | null; sort_slot_label?: string | null;   // إسناد يدوي محفوظ (سحب وإفلات)
}
interface Seat { applicant: Applicant; track: Track | undefined; minutes: number; overflow: boolean; pinned: boolean; time?: string | null }
/** حلقة فعلية وعضواتها — لعرض «الفعلي في الحلقات» */
interface ActualCircle {
  id: string; number: number; teacher_id: string; weekday: number; start_time: string; end_time: string;
  is_active: boolean; teacher_name: string; teacher_color: string | null; teacher_track_id: string | null;
}
interface ActualMember { circle_id: string; student_id: string; minutes: number; start_time: string | null;
  full_name: string; phone: string | null; track_id: string | null }
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
const COL_MIN = 210;              // أقل عرض مقروء لبلوك واحد — عرض اليوم = عدده × هذا
const toMin = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

/** فرز الطالبات — تقويم أسبوعي: كل مسمعة حلقة مستقلة، والمتزامنات جنبًا إلى جنب */
export default function SortingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  // فلاتر العرض — تُحفظ في الرابط كبقية الصفحات
  const [fTeacher, setFTeacher] = useUrlState('teacher');
  const [fTrack, setFTrack] = useUrlState('track');
  const [fCircle, setFCircle] = useUrlState('circle');   // قيمته: معرف المسمعة|نص الموعد
  // العرض: الفرز المخطط (افتراضي) أو التوزيع الفعلي المحفوظ في الحلقات
  const [view, setView] = useUrlState('view');
  const actual = view === 'actual';
  // بيانات العرض الفعلي
  const [circles, setCircles] = useState<ActualCircle[]>([]);
  const [circleSlots, setCircleSlots] = useState<{ circle_id: string; slot_id: string }[]>([]);
  const [cMembers, setCMembers] = useState<ActualMember[]>([]);
  const [slotRows, setSlotRows] = useState<{ id: string; weekday: number; start_time: string; end_time: string }[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [{ data: slots, error }, { data: tks }, { data: apps }, { data: cs }, { data: csl }, { data: ms }] = await Promise.all([
        supabase.from('availability_slots')
          .select('id, teacher_id, weekday, start_time, end_time, is_daily, teachers(full_name, track_id, is_active, color)')
          .range(0, 1999),
        supabase.from('tracks').select('id, name, juz_count, quota_pages_per_season, seconds_per_page')
          .eq('is_active', true).order('sort_order'),
        supabase.from('applicants')
          .select('id, full_name, phone, track_id, preferred_slots, preferred_period, created_at, status, sort_teacher_id, sort_slot_label, students:student_id(full_name, phone, track_id, status)')
          .neq('status', 'rejected').order('created_at').range(0, 4999),
        supabase.from('circles')
          .select('id, number, teacher_id, weekday, start_time, end_time, is_active, teachers(full_name, track_id, color)')
          .order('number'),
        supabase.from('circle_slots').select('circle_id, slot_id'),
        supabase.from('circle_members')
          .select('circle_id, student_id, minutes, start_time, students(full_name, phone, track_id)')
          .range(0, 4999),
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
      // المقبولة تُعرض ببياناتها الحالية كطالبة (المسار المعدَّل والاسم والجوال)،
      // ومن انسحبت أو استُبعدت طالبتُها تخرج من الفرز
      setApplicants(((apps || []) as any[])
        .filter(a => !a.students || (a.students.status ?? 'active') === 'active')
        .map(a => ({
          ...a,
          full_name: a.students?.full_name ?? a.full_name,
          phone: a.students?.phone ?? a.phone,
          track_id: a.students?.track_id ?? a.track_id,
        })) as Applicant[]);
      setCircles(((cs || []) as any[]).map(c => ({
        id: c.id, number: c.number, teacher_id: c.teacher_id, weekday: c.weekday,
        start_time: c.start_time.slice(0, 5), end_time: c.end_time.slice(0, 5), is_active: c.is_active,
        teacher_name: c.teachers?.full_name ?? '—', teacher_color: c.teachers?.color ?? null,
        teacher_track_id: c.teachers?.track_id ?? null,
      })));
      setCircleSlots((csl || []) as any);
      setSlotRows(((slots || []) as any[]).map(s => ({
        id: s.id, weekday: s.weekday, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
      })));
      setCMembers(((ms || []) as any[]).map(m => ({
        circle_id: m.circle_id, student_id: m.student_id, minutes: m.minutes,
        start_time: m.start_time ? m.start_time.slice(0, 5) : null,
        full_name: m.students?.full_name ?? '—', phone: m.students?.phone ?? null,
        track_id: m.students?.track_id ?? null,
      })));
      setLoading(false);
    })();
  }, [toast]);

  const trackOf = (id: string | null) => tracks.find(t => t.id === id);
  const tintOf = (id: string | null) => TRACK_TINT[Math.max(0, tracks.findIndex(t => t.id === id)) % TRACK_TINT.length];
  /** ترتيب ثابت للمسمعة — لاختيار لون احتياطي من اللوحة إن لم تُحدَّد لها لون */
  const teacherOrder = [...new Set(rows.map(r => r.teacher_id).filter(Boolean) as string[])].sort();
  const teacherIndex = (id: string) => Math.max(0, teacherOrder.indexOf(id));

  // ---------- السحب والإفلات: نقل الطالبة إلى مسمعة أخرى، ويُحفظ فورًا ----------
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [moving, setMoving] = useState<Applicant | null>(null);   // النقل بالنقر (جوال/لوحة مفاتيح)

  const assign = async (applicantId: string, teacherId: string | null, label: string | null) => {
    const a = applicants.find(x => x.id === applicantId);
    if (!a) return;
    const { error } = await supabase.from('applicants')
      .update({ sort_teacher_id: teacherId, sort_slot_label: label }).eq('id', applicantId);
    if (error) { toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' }); return; }
    setApplicants(prev => prev.map(x => x.id === applicantId
      ? { ...x, sort_teacher_id: teacherId, sort_slot_label: label } : x));
    toast({
      title: teacherId ? `نُقلت ${a.full_name}`
        : label === SORT_EXCLUDED ? `أُخرجت ${a.full_name} من الفرز — لن يشملها التوزيع التلقائي`
        : `أُعيدت ${a.full_name} إلى اختيارها الأول`,
    });
  };

  const onDropTo = (e: React.DragEvent, ev: Event) => {
    e.preventDefault();
    setDropKey(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    if (!id || actual) return;   // العرض الفعلي للاستعراض فقط — النقل من صفحة الحلقات
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
  const { events, allEvents, noChoice, unknownLabel, excluded, totalCapacity, overCount } = useMemo(() => {
    const noChoice: Applicant[] = [];
    const unknownLabel: Applicant[] = [];
    const excluded: Applicant[] = [];
    const linkedTrackIds = new Set(rows.map(r => r.track_id).filter(Boolean) as string[]);

    const evs: Event[] = [];
    let totalCapacity = 0;
    let actualOver = 0;

    if (actual) {
      // ---- التوزيع الفعلي: كل حلقة نشطة ببلوك في كل موعد من مواعيدها، وطالباتها من عضويتها ----
      circles.filter(c => c.is_active).forEach(c => {
        // مواعيد الحلقة من circle_slots — وإن خلت (قبل ربطها) فنافذة الحلقة نفسها
        const ids = circleSlots.filter(cs => cs.circle_id === c.id).map(cs => cs.slot_id);
        const ss = slotRows.filter(s => ids.includes(s.id));
        const windows = ss.length ? ss : [{ id: `v-${c.id}`, weekday: c.weekday, start_time: c.start_time, end_time: c.end_time }];
        const cap = windows.reduce((a, s) => a + durationMinutes(s.start_time, s.end_time), 0);
        totalCapacity += cap;
        const seats: Seat[] = cMembers
          .filter(m => m.circle_id === c.id)
          .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.full_name.localeCompare(b.full_name, 'ar'))
          .map(m => ({
            applicant: {
              id: m.student_id, full_name: m.full_name, phone: m.phone, track_id: m.track_id,
              preferred_slots: [], preferred_period: null, created_at: '', status: 'accepted',
            },
            track: trackOf(m.track_id), minutes: m.minutes, overflow: false, pinned: false, time: m.start_time,
          }));
        const used = seats.reduce((a, s) => a + s.minutes, 0);
        if (used > cap) actualOver += 1;
        const label = `حلقة ${arNum(c.number)}`;
        windows.forEach(s => evs.push({
          key: `c|${c.id}|${s.weekday}|${s.start_time}`, day: s.weekday, start: s.start_time, end: s.end_time,
          teacherId: c.teacher_id, teacher: c.teacher_name, color: c.teacher_color,
          label, pool: c.teacher_track_id, capacity: cap, seats, lane: 0, lanes: 1,
        }));
      });
    } else {

    // من اختارت كل موعد أولوية أولى، بترتيب أسبقية التسجيل — والمسحوبات يدويًا مثبَّتات على مسمعتهن
    const chooserOf: Record<string, Applicant[]> = {};
    const pinnedOf: Record<string, Applicant[]> = {};   // مفتاحه: موعد|معرّف المسمعة
    for (const a of applicants) {
      // المستبعدات من الفرز: خارج الشبكة والتوزيع حتى تُعدن
      if (!a.sort_teacher_id && a.sort_slot_label === SORT_EXCLUDED) { excluded.push(a); continue; }
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
    }

    // تطبيق الفلاتر: مسمعة/حلقة تُظهر بلوكاتها فقط، والمسار يُظهر الحلقات التي فيها طالباته
    const shown = evs.filter(e =>
      (!fTeacher || e.teacherId === fTeacher)
      && (!fCircle || `${e.teacherId}|${e.label}` === fCircle)
      && (!fTrack || e.seats.some(s => s.applicant.track_id === fTrack)));

    // مسارات التجاور داخل كل يوم (كتقويم Teams): المتزامنات تتقاسم العرض
    const byDay: Record<number, Event[]> = {};
    shown.forEach(e => { (byDay[e.day] ??= []).push(e); });
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

    const overCount = actual ? actualOver : evs.filter(e => e.seats.some(s => s.overflow)).length;
    return { events: shown, allEvents: evs, noChoice, unknownLabel, excluded, totalCapacity, overCount };
  }, [applicants, options, rows, tracks, fTeacher, fTrack, fCircle, actual, circles, circleSlots, slotRows, cMembers]);

  const days = [...new Set(events.map(e => e.day))].sort((a, b) => a - b);
  /** أكبر عدد حلقات متزامنة في اليوم — يحدد عرض عموده */
  const lanesOf = (d: number) => Math.max(1, ...events.filter(e => e.day === d).map(e => e.lanes));
  const dayStart = events.length ? Math.min(...events.map(e => toMin(e.start))) : 0;
  const dayEnd = events.length ? Math.max(...events.map(e => toMin(e.end))) : 0;
  const railFrom = Math.floor(dayStart / 60) * 60;
  const railTo = Math.ceil(dayEnd / 60) * 60;
  const gridHeight = (railTo - railFrom) * PX_PER_MIN;
  const hours = Array.from({ length: Math.max(0, (railTo - railFrom) / 60 + 1) }, (_, i) => railFrom + i * 60);
  // المستبعدات من الفرز لا يدخلن في الدقائق المطلوبة
  const totalNeeded = applicants
    .filter(a => a.sort_teacher_id || a.sort_slot_label !== SORT_EXCLUDED)
    .reduce((a, x) => a + trackMinutes(trackOf(x.track_id)), 0);
  // إحصاءات العرض الفعلي: كل عضوة تُحصى مرة واحدة (بلوكات الحلقة الواحدة تتشارك المقاعد)
  const placedMinutes = cMembers.reduce((a, m) => a + m.minutes, 0);
  const placedCount = new Set(cMembers.map(m => m.student_id)).size;

  /** الحلقات المتاحة للنقل إليها (مسمعة × موعد) — للجوال ولوحة المفاتيح بديلًا عن السحب */
  const circleOptions = useMemo(() => {
    const m = new Map<string, { teacherId: string; teacher: string; label: string; capacity: number; used: number; color: string | null }>();
    allEvents.forEach(e => {
      const k = `${e.teacherId}|${e.label}`;
      if (m.has(k)) return;
      m.set(k, {
        teacherId: e.teacherId, teacher: e.teacher, label: e.label, color: e.color,
        capacity: e.capacity, used: e.seats.filter(s => !s.overflow).reduce((a, s) => a + s.minutes, 0),
      });
    });
    return [...m.values()].sort((a, b) => a.teacher.localeCompare(b.teacher, 'ar'));
  }, [allEvents]);

  /** قوائم الفلاتر */
  const teacherList = useMemo(() =>
    [...new Map(rows.filter(r => r.teacher_id).map(r => [r.teacher_id!, r.teacher_name ?? '—'])).entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar')), [rows]);
  const circleFilterList = circleOptions.filter(c => !fTeacher || c.teacherId === fTeacher);
  const anyFilter = !!(fTeacher || fTrack || fCircle);
  /** عدد الطالبات الظاهرات بعد الفلاتر (المسار يُحصي طالباته فقط، وبلا تكرار عبر الأيام) */
  const shownSeats = new Set(events.flatMap(e =>
    e.seats.filter(s => !fTrack || s.applicant.track_id === fTrack).map(s => s.applicant.id))).size;
  /** فلتر المسار يسري أيضًا على من يحتجن إسنادًا يدويًا */
  const unassigned = [...noChoice, ...unknownLabel].filter(a => !fTrack || a.track_id === fTrack);

  /** اسم الطالبة قابل للسحب (شاشة كبيرة) وللنقر (نقل من نافذة) — نفس المكوّن في العرضين.
   *  في العرض الفعلي تصير للاستعراض فقط مع وقتها الفردي. */
  const SeatChip = ({ s }: { s: Seat }) => (
    <button type="button" draggable={!actual}
      onDragStart={ev => { if (actual) return; ev.dataTransfer.setData('text/plain', s.applicant.id); setDragId(s.applicant.id); }}
      onDragEnd={() => { setDragId(null); setDropKey(null); }}
      onClick={() => { if (!actual) setMoving(s.applicant); }}
      title={`${s.track?.name ?? ''} — ${s.minutes}د${s.applicant.phone ? ' — ' + s.applicant.phone : ''}${
        actual ? (s.time ? ` — وقتها ${formatTime(s.time)}` : '') : ' — اضغطي للنقل'}`}
      className={`w-full text-right text-[11px] leading-tight rounded px-1 py-0.5 ${
        actual ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${
        dragId === s.applicant.id ? 'opacity-40' : ''} ${
        fTrack && s.applicant.track_id !== fTrack ? 'opacity-30 ' : ''}${
        s.pinned ? 'ring-1 ring-accent/60 ' : ''}${
        s.overflow ? 'bg-destructive/15 text-destructive' : tintOf(s.applicant.track_id)}`}>
      {s.overflow && <AlertTriangle size={9} className="inline ms-0.5" />}
      {s.applicant.full_name} <span className="opacity-60">
        {actual && s.time ? `${formatTime(s.time)} · ` : ''}{arNum(s.minutes)}د</span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <ListOrdered className="text-accent" />
          <h1 className="text-2xl font-display">فرز الطالبات</h1>
          <Badge variant="outline">{applicants.length} متقدمة</Badge>
          <ClearFilters />
        </div>
        <Button variant="outline" className="gap-1" onClick={() => window.print()}>
          <Printer size={15} /> طباعة
        </Button>
      </div>

      <p className="text-sm text-muted-foreground print:text-black">
        {actual ? (
          <>هذا هو <b>التوزيع الفعلي المحفوظ في الحلقات</b> بعد تأكيده — للاستعراض فقط،
          والوقت بجانب كل طالبة وقتُها الفردي. النقل والتعديل من صفحة «الحلقات».</>
        ) : (
          <>كل مسمعة حلقة مستقلة، وارتفاع البلوك يساوي مدة الموعد. الطالبات هنا من اختارت هذا الموعد
          <b> أولوية أولى</b>، مرتبات بأسبقية التسجيل.
          <b> اسحبي أي طالبة</b> إلى حلقة أخرى لنقلها (يُحفظ فورًا ويحترمه التوزيع التلقائي)، ونقرتان على المنقولة تعيدانها لاختيارها.</>
        )}
      </p>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <>
          {/* فلاتر العرض: مسمعة / مسار / حلقة */}
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* مفتاح العرض: الفرز المخطط ↔ الفعلي المحفوظ في الحلقات */}
            <div className="inline-flex rounded-lg border overflow-hidden">
              <Button variant={actual ? 'ghost' : 'default'} size="sm" className="h-9 rounded-none"
                onClick={() => setView('')}>
                الفرز المخطط
              </Button>
              <Button variant={actual ? 'default' : 'ghost'} size="sm" className="h-9 rounded-none"
                onClick={() => setView('actual')}>
                الفعلي في الحلقات
              </Button>
            </div>
            <Filter size={15} className="text-muted-foreground" />
            <Select value={fTeacher || 'all'} onValueChange={v => {
              const t = v === 'all' ? '' : v;
              setFTeacher(t);
              // حلقة مختارة لمسمعة أخرى تُصفَّر
              if (t && fCircle && !fCircle.startsWith(`${t}|`)) setFCircle('');
            }}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="كل المسمعات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المسمعات</SelectItem>
                {teacherList.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fTrack || 'all'} onValueChange={v => setFTrack(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="كل المسارات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المسارات</SelectItem>
                {tracks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fCircle || 'all'} onValueChange={v => setFCircle(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-64 h-9"><SelectValue placeholder="كل الحلقات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحلقات</SelectItem>
                {circleFilterList.map(c => (
                  <SelectItem key={`${c.teacherId}|${c.label}`} value={`${c.teacherId}|${c.label}`}>
                    {c.teacher} — {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {anyFilter && (
              <>
                <Badge variant="outline">{arNum(shownSeats)} طالبة ظاهرة</Badge>
                <Button variant="ghost" size="sm" className="h-9"
                  onClick={() => { setFTeacher(''); setFTrack(''); setFCircle(''); }}>
                  مسح الفلاتر
                </Button>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl print:hidden">
            {(actual ? [
              { label: 'طالبات موزعات', value: arNum(placedCount), warn: false },
              { label: 'الدقائق الموزعة', value: `${arNum(placedMinutes)} د`, warn: false },
              { label: 'سعة الحلقات', value: `${arNum(totalCapacity)} د`, warn: false },
              { label: 'حلقات متجاوزة', value: arNum(overCount), warn: overCount > 0 },
            ] : [
              { label: 'الدقائق المطلوبة', value: `${arNum(totalNeeded)} د`, warn: totalNeeded > totalCapacity },
              { label: 'الدقائق المتاحة', value: `${arNum(totalCapacity)} د`, warn: false },
              { label: 'حلقات متجاوزة', value: arNum(overCount), warn: overCount > 0 },
              { label: 'بلا أولوية', value: arNum(noChoice.length + unknownLabel.length), warn: false },
            ]).map(x => (
              <Card key={x.label}><CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-display ${x.warn ? 'text-destructive' : 'text-primary'}`}>{x.value}</p>
                <p className="text-xs text-muted-foreground">{x.label}</p>
              </CardContent></Card>
            ))}
          </div>

          {/* مفتاح ألوان السعة */}
          {events.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">الامتلاء:</span>
              {[
                fillTone(0, 100), fillTone(30, 100), fillTone(70, 100), fillTone(95, 100), fillTone(120, 100, true),
              ].map(t => (
                <span key={t.key} className={`inline-flex items-center gap-1.5 border rounded-full ps-1.5 pe-2.5 py-0.5 ${t.block}`}>
                  <span className={`w-2 h-2 rounded-full ${t.gauge}`} />
                  {t.label}
                </span>
              ))}
            </div>
          )}

          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {allEvents.length > 0 ? 'لا حلقات تطابق الفلاتر المختارة.'
                : actual ? 'لا حلقات نشطة بعد — أنشئيها ووزعي الطالبات من صفحة «الحلقات»، ثم استعرضي التوزيع هنا.'
                : 'لا مواعيد توفر مسجلة للمسمعات بعد.'}
            </p>
          ) : (
            <div className="hidden lg:block overflow-x-auto pb-2 print:block">
              <div className="min-w-max">
                {/* ترويسة الأيام */}
                <div className="flex gap-2 mb-2">
                  <div className="w-14 shrink-0" />
                  {days.map(d => (
                    <div key={d} className="text-center font-display bg-primary text-primary-foreground rounded-lg py-1.5"
                      style={{ flex: lanesOf(d), minWidth: lanesOf(d) * COL_MIN }}>
                      {WEEKDAYS[d]}
                      {lanesOf(d) > 1 && (
                        <span className="text-xs opacity-75"> — {arNum(lanesOf(d))} حلقات متزامنة</span>
                      )}
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

                  {/* أعمدة الأيام — عرض اليوم يتناسب مع عدد حلقاته المتزامنة ليبقى كل بلوك مقروءًا */}
                  {days.map(d => (
                    <div key={d} className="relative rounded-lg border bg-card/40"
                      style={{ height: gridHeight, flex: lanesOf(d), minWidth: lanesOf(d) * COL_MIN }}>
                      {hours.map(h => (
                        <div key={h} className="absolute inset-x-0 border-t border-border/50"
                          style={{ top: (h - railFrom) * PX_PER_MIN }} />
                      ))}
                      {events.filter(e => e.day === d).map(e => {
                        const used = e.seats.filter(s => !s.overflow).reduce((a, s) => a + s.minutes, 0);
                        const over = e.seats.some(s => s.overflow);
                        const fill = Math.min(100, Math.round((used / e.capacity) * 100));
                        const tone = fillTone(used, e.capacity, over);      // الحالة: لون السعة
                        const tcolor = teacherColor(e.color, teacherIndex(e.teacherId));  // الهوية: لون المسمعة
                        return (
                          <div key={e.key}
                            onDragOver={ev => { ev.preventDefault(); setDropKey(e.key); }}
                            onDragLeave={() => setDropKey(k => (k === e.key ? null : k))}
                            onDrop={ev => onDropTo(ev, e)}
                            title={`${e.teacher} — ${tone.label} (${used}/${e.capacity} د)`}
                            className={`absolute rounded-lg border overflow-hidden print:break-inside-avoid transition-shadow ${
                              dropKey === e.key ? 'ring-2 ring-accent shadow-lg' : ''} ${tone.block}`}
                            style={{
                              top: (toMin(e.start) - railFrom) * PX_PER_MIN + 2,
                              height: durationMinutes(e.start, e.end) * PX_PER_MIN - 4,
                              insetInlineStart: `calc(${(e.lane * 100) / e.lanes}% + 2px)`,
                              inlineSize: `calc(${100 / e.lanes}% - 4px)`,
                            }}>
                            {/* مؤشر الامتلاء على حافة البلوك */}
                            <div className="absolute inset-y-0 w-1.5 bg-muted" style={{ insetInlineStart: 0 }}>
                              <div className={`absolute bottom-0 inset-x-0 ${tone.gauge}`}
                                style={{ height: `${fill}%` }} />
                            </div>
                            <div className="ps-2.5 pe-1 pb-1 h-full flex flex-col min-h-0">
                              {/* ترويسة بلون المسمعة */}
                              <p className="-mx-1 -ms-2.5 px-2 py-0.5 font-medium text-[13px] leading-tight shrink-0"
                                style={{ background: tcolor, color: textOn(tcolor) }}>
                                {e.teacher}
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 shrink-0">
                                {formatTime(e.start)}–{formatTime(e.end)} · <span className={tone.text}>{arNum(used)}/{arNum(e.capacity)} د</span>
                                {e.seats.length > 0 && <> · {arNum(e.seats.length)} طالبة</>}
                                {e.pool && <> · {trackOf(e.pool)?.name}</>}
                              </p>
                              <div className="mt-1 space-y-0.5 flex-1 min-h-0 overflow-y-auto print:overflow-visible">
                                {e.seats.length === 0 && <p className="text-[11px] text-muted-foreground">لا طالبات</p>}
                                {e.seats.map(s => <SeatChip key={s.applicant.id} s={s} />)}
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

          {/* الجوال واللوحي: قائمة يومية — بطاقة لكل حلقة بعرض كامل، والنقل بالنقر */}
          {events.length > 0 && (
            <div className="lg:hidden print:hidden space-y-5">
              {days.map(d => (
                <div key={d} className="space-y-2">
                  <p className="font-display bg-primary text-primary-foreground rounded-lg py-1.5 px-3">
                    {WEEKDAYS[d]}
                  </p>
                  {events.filter(e => e.day === d)
                    .sort((a, b) => toMin(a.start) - toMin(b.start) || a.teacher.localeCompare(b.teacher, 'ar'))
                    .map(e => {
                      const used = e.seats.filter(s => !s.overflow).reduce((a, s) => a + s.minutes, 0);
                      const over = e.seats.some(s => s.overflow);
                      const tone = fillTone(used, e.capacity, over);
                      const tcolor = teacherColor(e.color, teacherIndex(e.teacherId));
                      const fill = Math.min(100, Math.round((used / e.capacity) * 100));
                      return (
                        <div key={e.key} className={`rounded-xl border overflow-hidden ${tone.block}`}>
                          <div className="flex items-center justify-between gap-2 px-3 py-1.5"
                            style={{ background: tcolor, color: textOn(tcolor) }}>
                            <span className="font-medium">{e.teacher}</span>
                            <span className="text-xs opacity-90">{formatTime(e.start)}–{formatTime(e.end)}</span>
                          </div>
                          {/* شريط الامتلاء أفقيًا في العرض الضيق */}
                          <div className="h-1.5 bg-muted">
                            <div className={`h-full ${tone.gauge}`} style={{ width: `${fill}%` }} />
                          </div>
                          <div className="px-3 py-2 space-y-1.5">
                            <p className="text-xs text-muted-foreground">
                              <span className={tone.text}>{arNum(used)}/{arNum(e.capacity)} د</span>
                              {e.seats.length > 0 && <> · {arNum(e.seats.length)} طالبة</>}
                              {e.pool && <> · {trackOf(e.pool)?.name}</>}
                            </p>
                            {e.seats.length === 0
                              ? <p className="text-xs text-muted-foreground">لا طالبات</p>
                              : (
                                <div className="grid sm:grid-cols-2 gap-1">
                                  {e.seats.map(s => <SeatChip key={s.applicant.id} s={s} />)}
                                </div>
                              )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          )}

          {!actual && unassigned.length > 0 && (
            <Card className="border-warning/50">
              <CardContent className="pt-5 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle size={16} className="text-warning" />
                  يحتجن إسنادًا يدويًا ({unassigned.length})
                  <span className="text-xs font-normal text-muted-foreground">— اسحبي الاسم إلى حلقة، أو اضغطي عليه لاختيارها</span>
                </p>
                {unassigned.map(a => (
                  <button key={a.id} type="button" draggable
                    onDragStart={ev => { ev.dataTransfer.setData('text/plain', a.id); setDragId(a.id); }}
                    onDragEnd={() => { setDragId(null); setDropKey(null); }}
                    onClick={() => setMoving(a)}
                    className={`block w-full text-right text-sm border rounded-lg px-2 py-1 bg-background cursor-grab active:cursor-grabbing hover:border-accent ${
                      dragId === a.id ? 'opacity-40' : ''}`}>
                    {a.full_name} — {trackOf(a.track_id)?.name ?? 'بلا مسار'} ({arNum(trackMinutes(trackOf(a.track_id)))}د) —{' '}
                    <span className="text-muted-foreground">
                      {(a.preferred_slots ?? []).length
                        ? `أولويتها الأولى «${a.preferred_slots[0]}» لم تعد معروضة`
                        : 'لم تختر أي موعد'}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* المستبعدات من الفرز — خارج الشبكة والتوزيع التلقائي حتى يُعدن */}
          {!actual && excluded.length > 0 && (
            <Card className="border-muted">
              <CardContent className="pt-5 space-y-2">
                <p className="font-medium flex items-center gap-2">
                  <UserX size={16} className="text-muted-foreground" />
                  مستبعدات من الفرز ({arNum(excluded.length)})
                  <span className="text-xs font-normal text-muted-foreground">— لن يشملهن التوزيع التلقائي</span>
                </p>
                {excluded.map(a => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg px-2 py-1 bg-background text-sm">
                    <span>
                      {a.full_name} — {trackOf(a.track_id)?.name ?? 'بلا مسار'} ({arNum(trackMinutes(trackOf(a.track_id)))}د)
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 shrink-0"
                      onClick={() => assign(a.id, null, null)}>
                      <Undo2 size={13} /> إعادتها للفرز
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* نقل الطالبة بالنقر — بديل السحب على الجوال ولوحة المفاتيح */}
          <Dialog open={!!moving} onOpenChange={open => !open && setMoving(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>نقل {moving?.full_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {trackOf(moving?.track_id ?? null)?.name} — تحتاج {arNum(trackMinutes(trackOf(moving?.track_id ?? null)))} دقيقة
                </p>
                {moving?.sort_teacher_id && (
                  <Button variant="outline" className="w-full"
                    onClick={() => { assign(moving.id, null, null); setMoving(null); }}>
                    إعادتها إلى اختيارها الأول
                  </Button>
                )}
                <Button variant="outline" className="w-full gap-1 text-destructive hover:text-destructive"
                  onClick={() => { if (moving) { assign(moving.id, null, SORT_EXCLUDED); setMoving(null); } }}>
                  <UserX size={14} /> إخراجها من الفرز (لن يوزعها التوزيع التلقائي)
                </Button>
                {circleOptions.map(c => {
                  const free = c.capacity - c.used;
                  const mine = trackMinutes(trackOf(moving?.track_id ?? null));
                  const current = moving?.sort_teacher_id === c.teacherId && moving?.sort_slot_label === c.label;
                  return (
                    <button key={`${c.teacherId}|${c.label}`} type="button"
                      onClick={() => { if (moving) { assign(moving.id, c.teacherId, c.label); setMoving(null); } }}
                      className={`w-full text-right border rounded-lg p-2 hover:border-accent transition-colors ${
                        current ? 'border-accent bg-accent/10' : ''}`}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: teacherColor(c.color, teacherIndex(c.teacherId)) }} />
                        <span className="font-medium text-sm">{c.teacher}</span>
                        <span className={`text-xs mr-auto ${free < mine ? 'text-destructive' : 'text-muted-foreground'}`}>
                          متبقٍ {arNum(free)} د
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
