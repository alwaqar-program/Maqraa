import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Users2, Wand2, Trash2, ChevronDown, ChevronUp, UserPlus, CalendarPlus } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { Checkbox } from '@/components/ui/checkbox';
import { trackMinutes, durationMinutes, choiceLabel, addMinutes, timeOptionsWithin } from '@/lib/circles';
import { useFormSettings, DayOption, genSlotLabel, optionDays } from '@/lib/form-settings';

interface Circle {
  id: string; number: number; teacher_id: string; supervisor_id: string | null;
  weekday: number; start_time: string; end_time: string; is_active: boolean;
  teacher_name?: string; supervisor_name?: string; teacher_track_id?: string | null;
}
interface Member {
  id: string; circle_id: string; student_id: string; minutes: number; choice_rank: number | null;
  start_time: string | null; added_by?: string | null;
  student_name?: string; track_name?: string;
}
/** موعد توفر للمسمعة — الحلقة تُبنى باختيار واحد أو أكثر منها */
interface Slot { id: string; teacher_id: string; weekday: number; start_time: string; end_time: string; is_daily?: boolean }
interface Teacher { id: string; full_name: string; }
interface Supervisor { id: string; full_name: string; }
interface Proposal { student_id: string; student_name: string; track_name: string; minutes: number;
  circle_id: string; circle_number: number; choice_rank: number | null; start_time: string; }
/** طالبة لم يجد لها التوزيع مكانًا — تبقى قابلة للإسناد اليدوي من المعاينة */
interface Skipped { student_id: string; name: string; track_name: string; minutes: number; why: string }

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Circle | null>(null);
  const [form, setForm] = useState({ number: 1, teacher_id: '', supervisor_id: '', slot_ids: [] as string[] });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [circleSlots, setCircleSlots] = useState<{ circle_id: string; slot_id: string }[]>([]);
  const [addingTo, setAddingTo] = useState<Circle | null>(null);   // إضافة طالبة يدويًا
  const [unassigned, setUnassigned] = useState<{ id: string; full_name: string; track_name: string; minutes: number }[]>([]);
  const [addStudentId, setAddStudentId] = useState('');
  const [distOpen, setDistOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [distSkipped, setDistSkipped] = useState<Skipped[]>([]);
  const [autoCreating, setAutoCreating] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const { toast } = useToast();
  const { config } = useFormSettings('student_register');

  const fetchAll = useCallback(async () => {
    const [{ data: cs, error }, { data: ms }, { data: ts }, { data: svs }, { data: sl }, { data: csl }] = await Promise.all([
      supabase.from('circles').select('*, teachers(full_name, track_id), supervisors(full_name)').order('number'),
      supabase.from('circle_members').select('*, students(full_name, tracks(name))'),
      supabase.from('teachers').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('supervisors').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('availability_slots').select('id, teacher_id, weekday, start_time, end_time, is_daily'),
      supabase.from('circle_slots').select('circle_id, slot_id'),
    ]);
    setSlots(((sl || []) as any[]).map(s => ({
      ...s, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
    })));
    setCircleSlots((csl || []) as any);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setCircles((cs || []).map((c: any) => ({
      ...c, teacher_name: c.teachers?.full_name, supervisor_name: c.supervisors?.full_name,
      teacher_track_id: c.teachers?.track_id ?? null,
    })));
    setMembers((ms || []).map((m: any) => ({
      ...m, student_name: m.students?.full_name, track_name: m.students?.tracks?.name,
    })));
    setTeachers(ts || []);
    setSupervisors(svs || []);
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const membersOf = useCallback((circleId: string) => members.filter(m => m.circle_id === circleId), [members]);
  const usedMinutes = useCallback((circleId: string) =>
    membersOf(circleId).reduce((a, m) => a + m.minutes, 0), [membersOf]);

  /** مواعيد الحلقة مرتبة (فارغة قبل تنفيذ 32 → نافذة الحلقة نفسها احتياطًا) */
  const slotsOf = useCallback((c: Circle): Slot[] => {
    const ids = circleSlots.filter(cs => cs.circle_id === c.id).map(cs => cs.slot_id);
    const rows = slots.filter(s => ids.includes(s.id));
    if (!rows.length) return [{ id: `virtual-${c.id}`, teacher_id: c.teacher_id, weekday: c.weekday,
      start_time: c.start_time.slice(0, 5), end_time: c.end_time.slice(0, 5) }];
    return [...rows].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  }, [circleSlots, slots]);

  const capacity = useCallback((c: Circle) =>
    slotsOf(c).reduce((a, s) => a + durationMinutes(s.start_time, s.end_time), 0), [slotsOf]);

  /** وقت الطالبة التالية: يتراكم داخل المواعيد بالترتيب، وينتقل للموعد التالي عند امتلاء الأول */
  const allocStart = useCallback((c: Circle, used: number) => {
    const ss = slotsOf(c);
    let rem = used;
    for (const s of ss) {
      const d = durationMinutes(s.start_time, s.end_time);
      if (rem < d) return addMinutes(s.start_time, rem);
      rem -= d;
    }
    return ss[ss.length - 1].end_time;
  }, [slotsOf]);

  /** خيارات وقت الطالبة: كل الأوقات داخل مواعيد الحلقة */
  const timeOptionsOf = useCallback((c: Circle) =>
    slotsOf(c).flatMap(s => timeOptionsWithin(s.start_time, s.end_time)), [slotsOf]);

  /** نص مختصر لمواعيد الحلقة: «الاثنين ٥ص–٧ص · الثلاثاء ٥ص–٧ص» */
  const slotsLabel = useCallback((c: Circle) =>
    slotsOf(c).map(s => `${WEEKDAYS[s.weekday]} ${formatTime(s.start_time)}–${formatTime(s.end_time)}`), [slotsOf]);

  // ---------- إنشاء / تعديل حلقة ----------
  const openCreate = () => {
    setEditing(null);
    setForm({
      number: (circles.reduce((mx, c) => Math.max(mx, c.number), 0)) + 1,
      teacher_id: '', supervisor_id: '', slot_ids: [],
    });
    setDialogOpen(true);
  };
  const openEdit = (c: Circle) => {
    setEditing(c);
    setForm({
      number: c.number, teacher_id: c.teacher_id, supervisor_id: c.supervisor_id ?? '',
      slot_ids: circleSlots.filter(cs => cs.circle_id === c.id).map(cs => cs.slot_id),
    });
    setDialogOpen(true);
  };

  // مواعيد المسمعة المختارة في الحوار، وأيها مشغول بحلقة أخرى
  const formSlots = slots.filter(s => s.teacher_id === form.teacher_id)
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
  const slotTakenBy = (slotId: string) => {
    const cs = circleSlots.find(x => x.slot_id === slotId && x.circle_id !== editing?.id);
    return cs ? circles.find(c => c.id === cs.circle_id) : undefined;
  };
  const formCapacity = formSlots.filter(s => form.slot_ids.includes(s.id))
    .reduce((a, s) => a + durationMinutes(s.start_time, s.end_time), 0);

  const handleSave = async () => {
    if (!form.teacher_id) { toast({ title: 'اختاري المسمعة', variant: 'destructive' }); return; }
    if (!form.slot_ids.length) { toast({ title: 'اختاري موعدًا واحدًا على الأقل من مواعيد المسمعة', variant: 'destructive' }); return; }
    if (editing && formCapacity < usedMinutes(editing.id)) {
      toast({ title: 'المواعيد المختارة أقل من مجموع دقائق طالبات الحلقة', variant: 'destructive' }); return;
    }
    // أعمدة الحلقة = أبكر موعد مختار (تبقى للتوافق مع الحضور والتقارير)
    const chosen = formSlots.filter(s => form.slot_ids.includes(s.id));
    const first = chosen[0];
    const payload = {
      number: form.number, teacher_id: form.teacher_id,
      supervisor_id: form.supervisor_id || null,
      weekday: first.weekday, start_time: first.start_time, end_time: first.end_time,
    };
    const { data, error } = editing
      ? await supabase.from('circles').update(payload).eq('id', editing.id).select('id').single()
      : await supabase.from('circles').insert(payload).select('id').single();
    if (error) {
      const msg = error.message.includes('no_overlapping_circles')
        ? 'تتداخل مع حلقة أخرى للمسمعة نفسها في اليوم نفسه'
        : error.message.includes('circles_number_key') ? 'رقم الحلقة مستخدم' : error.message;
      toast({ title: 'تعذر الحفظ', description: msg, variant: 'destructive' }); return;
    }
    // مزامنة مواعيد الحلقة
    const circleId = data.id;
    const before = circleSlots.filter(cs => cs.circle_id === circleId).map(cs => cs.slot_id);
    const removed = before.filter(id => !form.slot_ids.includes(id));
    const added = form.slot_ids.filter(id => !before.includes(id));
    if (removed.length) await supabase.from('circle_slots').delete().in('slot_id', removed);
    if (added.length) {
      const { error: e2 } = await supabase.from('circle_slots')
        .insert(added.map(slot_id => ({ circle_id: circleId, slot_id })));
      if (e2) {
        toast({ title: 'حُفظت الحلقة لكن تعذر ربط بعض المواعيد',
          description: e2.message.includes('circle_slots_slot_id_key') ? 'أحد المواعيد مرتبط بحلقة أخرى' : e2.message,
          variant: 'destructive' });
        fetchAll(); return;
      }
    }
    toast({ title: editing ? 'تم تحديث الحلقة' : 'أُنشئت الحلقة' });
    setDialogOpen(false); fetchAll();
  };
  const toggleActive = async (c: Circle) => {
    const { error } = await supabase.from('circles').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };
  /** إنشاء حلقة لكل موعد توفر غير مرتبط بحلقة — والمواعيد الدورية (نفس الوقت عدة أيام) حلقة واحدة */
  const createCirclesFromSlots = async () => {
    setAutoCreating(true);
    const linked = new Set(circleSlots.map(cs => cs.slot_id));
    const free = slots.filter(s => !linked.has(s.id) && teachers.some(t => t.id === s.teacher_id));
    if (!free.length) {
      toast({ title: 'كل مواعيد المسمعات مرتبطة بحلقات بالفعل' });
      setAutoCreating(false); return;
    }
    // تجميع: الدوري بمفتاح (مسمعة + وقت) حلقة واحدة، والعادي كل موعد حلقة
    const groups: Record<string, Slot[]> = {};
    free.forEach(s => {
      const k = s.is_daily
        ? `d|${s.teacher_id}|${s.start_time}|${s.end_time}`
        : `s|${s.id}`;
      (groups[k] ??= []).push(s);
    });

    let num = circles.reduce((mx, c) => Math.max(mx, c.number), 0);
    let created = 0;
    const failed: string[] = [];
    for (const group of Object.values(groups)) {
      const ordered = [...group].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
      const first = ordered[0];
      num += 1;
      const { data, error } = await supabase.from('circles').insert({
        number: num, teacher_id: first.teacher_id, supervisor_id: null,
        weekday: first.weekday, start_time: first.start_time, end_time: first.end_time,
      }).select('id').single();
      if (error) {
        num -= 1;
        const who = teachers.find(t => t.id === first.teacher_id)?.full_name ?? '';
        failed.push(`${who} ${WEEKDAYS[first.weekday]} ${formatTime(first.start_time)}`);
        continue;
      }
      const { error: e2 } = await supabase.from('circle_slots')
        .insert(ordered.map(s => ({ circle_id: data.id, slot_id: s.id })));
      if (e2) failed.push(`ربط مواعيد الحلقة ${num}`);
      created += 1;
    }
    setAutoCreating(false);
    toast({
      title: created ? `أُنشئت ${created} حلقة من مواعيد المسمعات` : 'لم تُنشأ حلقات',
      description: failed.length ? `تعذّر: ${failed.join('، ')}` : undefined,
      variant: created ? undefined : 'destructive',
    });
    fetchAll();
  };

  const deleteCircle = async (c: Circle) => {
    if (membersOf(c.id).length) { toast({ title: 'انقلي طالبات الحلقة أولًا', variant: 'destructive' }); return; }
    const { error } = await supabase.from('circles').delete().eq('id', c.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `حُذفت الحلقة ${c.number}` }); fetchAll(); }
  };

  // ---------- أعضاء: نقل / إزالة / إضافة يدوية ----------
  const transferMember = async (m: Member, targetId: string) => {
    const target = circles.find(c => c.id === targetId);
    if (!target) return;
    if (capacity(target) - usedMinutes(target.id) < m.minutes) {
      toast({ title: `لا تتسع الحلقة ${target.number} لدقائقها (${m.minutes}د)`, variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('circle_members')
      .update({
        circle_id: targetId, choice_rank: null, added_by: 'نقل يدوي',
        // وقتها الجديد: بعد آخر دقائق مستهلكة في الحلقة الهدف
        start_time: allocStart(target, usedMinutes(target.id)),
      }).eq('id', m.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `نُقلت ${m.student_name} إلى الحلقة ${target.number}` }); fetchAll(); }
  };
  const updateMemberTime = async (m: Member, time: string) => {
    const { error } = await supabase.from('circle_members').update({ start_time: time }).eq('id', m.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };
  const removeMember = async (m: Member) => {
    const { error } = await supabase.from('circle_members').delete().eq('id', m.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `أُخرجت ${m.student_name} من الحلقة` }); fetchAll(); }
  };
  const fetchUnassigned = useCallback(async () => {
    const { data } = await supabase.from('students')
      .select('id, full_name, is_active, status, tracks(name, juz_count, quota_pages_per_season, seconds_per_page)')
      .eq('is_active', true).order('full_name').range(0, 1999);
    const inCircle = new Set(members.map(m => m.student_id));
    setUnassigned((data || [])
      .filter((s: any) => !inCircle.has(s.id) && (s.status ?? 'active') === 'active')
      .map((s: any) => ({
        id: s.id, full_name: s.full_name,
        track_name: s.tracks?.name ?? '—', minutes: trackMinutes(s.tracks),
      })));
  }, [members]);
  const openAddStudent = async (c: Circle) => { setAddingTo(c); setAddStudentId(''); await fetchUnassigned(); };
  const addStudent = async () => {
    if (!addingTo || !addStudentId) return;
    const st = unassigned.find(s => s.id === addStudentId);
    if (!st) return;
    if (capacity(addingTo) - usedMinutes(addingTo.id) < st.minutes) {
      toast({ title: `لا تتسع الحلقة لدقائقها (${st.minutes}د)`, variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('circle_members').insert({
      circle_id: addingTo.id, student_id: st.id, minutes: st.minutes, choice_rank: null, added_by: 'إضافة يدوية',
      start_time: allocStart(addingTo, usedMinutes(addingTo.id)),
    });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `أُضيفت ${st.full_name}` }); setAddingTo(null); fetchAll(); }
  };

  // ---------- التوزيع التلقائي ----------
  // خريطة نص الخيار (كما خزنته الطالبة في أولوياتها) → يوم ونافذة زمنية
  const optionWindows = useMemo(() => {
    const map: Record<string, { days: number[]; start: string; end: string }> = {};
    // الأساسية + الخاصة بمسارات (ختمة دورية...) — كلها نصوص محتملة في أولويات الطالبات
    // الخيار اليومي (daily) يطابق أي يوم من الاثنين إلى السبت
    [...((config.day_options as DayOption[]) ?? []), ...((config.special_day_options as DayOption[]) ?? [])].forEach(d => {
      if (d.label && d.start && d.end)
        map[d.label] = { days: optionDays(d), start: d.start, end: d.end };
    });
    // والنصوص المشتقة مباشرة من مواعيد المسمعات (النموذج يولدها حيًا من v_public_circle_times)
    slots.forEach(s => {
      const label = genSlotLabel(s.weekday, s.start_time, s.end_time);
      if (!map[label]) map[label] = { days: [s.weekday], start: s.start_time, end: s.end_time };
    });
    return map;
  }, [config.day_options, config.special_day_options, slots]);

  const buildDistribution = async () => {
    setDistributing(true);
    const [{ data: students }, { data: applicants }] = await Promise.all([
      supabase.from('students')
        .select('id, full_name, national_id, is_active, status, track_id, tracks(name, juz_count, quota_pages_per_season, seconds_per_page)')
        .eq('is_active', true).range(0, 1999),
      supabase.from('applicants')
        .select('national_id, created_at, preferred_slots, preferred_period, sort_teacher_id, sort_slot_label')
        .range(0, 4999),
    ]);
    const inCircle = new Set(members.map(m => m.student_id));
    const appBy: Record<string, any> = {};
    (applicants || []).forEach((a: any) => { if (!appBy[a.national_id]) appBy[a.national_id] = a; });

    const queue = (students || [])
      .filter((s: any) => !inCircle.has(s.id) && (s.status ?? 'active') === 'active')
      .map((s: any) => ({
        id: s.id, name: s.full_name, track: s.tracks?.name ?? '—', track_id: s.track_id ?? null,
        minutes: trackMinutes(s.tracks),
        app: appBy[s.national_id] ?? null,
      }))
      // أسبقية التسجيل: الأقدم تقديمًا أولًا؛ من بلا استمارة في الآخر
      .sort((a, b) => {
        if (!a.app && !b.app) return 0;
        if (!a.app) return 1;
        if (!b.app) return -1;
        return String(a.app.created_at).localeCompare(String(b.app.created_at));
      });

    // السعة المتبقية لكل حلقة نشطة (تُستهلك أثناء المحاكاة) + الدقائق المشغولة
    const remaining: Record<string, number> = {};
    const consumed: Record<string, number> = {};
    circles.filter(c => c.is_active).forEach(c => {
      remaining[c.id] = capacity(c) - usedMinutes(c.id);
      consumed[c.id] = usedMinutes(c.id);
    });

    // الحلقة تطابق الخيار إن طابقه أيٌّ من مواعيدها (الحلقة قد تضم عدة مواعيد)
    const matchesWindow = (c: Circle, w: { days: number[]; start: string; end: string }) =>
      slotsOf(c).some(s => w.days.includes(s.weekday) && s.start_time < w.end && w.start < s.end_time);
    const periodOf = (c: Circle) => (slotsOf(c)[0].start_time < '12:00' ? 'morning' : 'evening');
    // مسمعة المسار: طالبة المسار المرتبط بمسمعة → حلقات مسمعته فقط؛
    // وغيرها → حلقات المسمعات غير المعينات على مسار
    const linkedTrackIds = new Set(circles.filter(c => c.is_active && c.teacher_track_id).map(c => c.teacher_track_id));
    const teacherOk = (c: Circle, stTrackId: string | null) =>
      stTrackId && linkedTrackIds.has(stTrackId) ? c.teacher_track_id === stTrackId : !c.teacher_track_id;

    const out: Proposal[] = [];
    const skipped: Skipped[] = [];
    const take = (st: (typeof queue)[number], chosen: Circle, rank: number | null) => {
      remaining[chosen.id] -= st.minutes;
      const t = allocStart(chosen, consumed[chosen.id]);
      consumed[chosen.id] += st.minutes;
      out.push({
        student_id: st.id, student_name: st.name, track_name: st.track, minutes: st.minutes,
        circle_id: chosen.id, circle_number: chosen.number, choice_rank: rank, start_time: t,
      });
    };
    const preferPeriod = (candidates: Circle[], period: string | null) =>
      period === 'morning' || period === 'evening'
        ? [...candidates.filter(c => periodOf(c) === period), ...candidates.filter(c => periodOf(c) !== period)]
        : candidates;

    // المرحلة صفر: الإسناد اليدوي من صفحة «فرز الطالبات» — مقدَّم على كل شيء
    const leftover: (typeof queue)[number][] = [];
    const pinnedFirst = [...queue].sort((a, b) =>
      (b.app?.sort_teacher_id ? 1 : 0) - (a.app?.sort_teacher_id ? 1 : 0));
    for (const st of pinnedFirst) {
      const tId = st.app?.sort_teacher_id;
      const label = st.app?.sort_slot_label;
      if (!tId) { leftover.push(st); continue; }
      const w = label ? optionWindows[label] : null;
      const target = circles.find(c => c.is_active && c.teacher_id === tId
        && (!w || matchesWindow(c, w)) && remaining[c.id] >= st.minutes)
        ?? circles.find(c => c.is_active && c.teacher_id === tId && remaining[c.id] >= st.minutes);
      if (target) take(st, target, null);
      else skipped.push({
        student_id: st.id, name: st.name, track_name: st.track, minutes: st.minutes,
        why: 'أُسندت يدويًا من صفحة الفرز لكن حلقة مسمعتها لا تتسع',
      });
    }

    // المرحلة الأولى: صاحبات الأولويات — كل واحدة على أعلى خيار متاح لها
    const stillLeft: (typeof queue)[number][] = [];
    for (const st of leftover) {
      const prefs: string[] = st.app?.preferred_slots ?? [];
      if (!prefs.length) { stillLeft.push(st); continue; }
      let placed = false;
      for (let rank = 1; rank <= prefs.length && !placed; rank++) {
        const w = optionWindows[prefs[rank - 1]];
        if (!w) continue;   // خيار قديم لم يعد معروضًا
        const candidates = preferPeriod(
          circles.filter(c => c.is_active && teacherOk(c, st.track_id) && matchesWindow(c, w) && remaining[c.id] >= st.minutes),
          st.app?.preferred_period ?? null,
        );
        if (candidates[0]) { take(st, candidates[0], rank); placed = true; }
      }
      if (!placed) stillLeft.push(st);   // خياراتها ممتلئة → المرحلة الثانية
    }

    // المرحلة الثانية: بلا أولويات (أو امتلأت خياراتها) → الأنسب المتاح:
    // فترتها المفضلة إن عُرفت، ثم الحلقة الأكثر سعة متبقية (موازنة الحلقات)
    for (const st of stillLeft) {
      const candidates = preferPeriod(
        circles.filter(c => c.is_active && teacherOk(c, st.track_id) && remaining[c.id] >= st.minutes)
          .sort((a, b) => remaining[b.id] - remaining[a.id] || a.number - b.number),
        st.app?.preferred_period ?? null,
      );
      if (candidates[0]) take(st, candidates[0], null);
      else skipped.push({
        student_id: st.id, name: st.name, track_name: st.track, minutes: st.minutes,
        why: 'لا سعة متبقية في أي حلقة تناسبها',
      });
    }
    setProposals(out); setDistSkipped(skipped); setDistOpen(true); setDistributing(false);
  };

  // ---------- تعديل يدوي على المعاينة قبل الحفظ ----------
  /** يعيد ترتيب أوقات المقترحات داخل كل حلقة بعد أي تعديل (تراكم من دقائقها المشغولة) */
  const resequence = (list: Proposal[]): Proposal[] => {
    const running: Record<string, number> = {};
    return list.map(p => {
      const used = running[p.circle_id] ?? usedMinutes(p.circle_id);
      running[p.circle_id] = used + p.minutes;
      const c = circles.find(x => x.id === p.circle_id);
      return { ...p, start_time: c ? allocStart(c, used) : p.start_time };
    });
  };
  /** الدقائق المحجوزة في حلقة ضمن المعاينة (الحالي + المقترح) مع إمكانية استثناء طالبة */
  const projectedUsed = (circleId: string, list: Proposal[], exceptStudent?: string) =>
    usedMinutes(circleId) + list
      .filter(p => p.circle_id === circleId && p.student_id !== exceptStudent)
      .reduce((a, p) => a + p.minutes, 0);

  const moveProposal = (studentId: string, targetId: string) => {
    const target = circles.find(c => c.id === targetId);
    const p = proposals.find(x => x.student_id === studentId);
    if (!target || !p) return;
    if (capacity(target) - projectedUsed(targetId, proposals, studentId) < p.minutes) {
      toast({ title: `لا تتسع الحلقة ${target.number} لـ${p.minutes} دقيقة`, variant: 'destructive' }); return;
    }
    setProposals(prev => resequence(prev.map(x => x.student_id === studentId
      ? { ...x, circle_id: targetId, circle_number: target.number, choice_rank: null }
      : x)));
  };
  const dropProposal = (p: Proposal) => {
    setProposals(prev => resequence(prev.filter(x => x.student_id !== p.student_id)));
    setDistSkipped(prev => [...prev, {
      student_id: p.student_id, name: p.student_name, track_name: p.track_name,
      minutes: p.minutes, why: 'استُبعدت يدويًا من هذا التوزيع',
    }]);
  };
  const placeSkipped = (s: Skipped, targetId: string) => {
    const target = circles.find(c => c.id === targetId);
    if (!target) return;
    if (capacity(target) - projectedUsed(targetId, proposals) < s.minutes) {
      toast({ title: `لا تتسع الحلقة ${target.number} لـ${s.minutes} دقيقة`, variant: 'destructive' }); return;
    }
    setProposals(prev => resequence([...prev, {
      student_id: s.student_id, student_name: s.name, track_name: s.track_name, minutes: s.minutes,
      circle_id: targetId, circle_number: target.number, choice_rank: null, start_time: target.start_time,
    }]));
    setDistSkipped(prev => prev.filter(x => x.student_id !== s.student_id));
  };

  const applyDistribution = async () => {
    setDistributing(true);
    const rows = proposals.map(p => ({
      circle_id: p.circle_id, student_id: p.student_id,
      minutes: p.minutes, choice_rank: p.choice_rank,
      added_by: p.choice_rank ? 'توزيع تلقائي' : 'توزيع تلقائي — الأنسب المتاح',
      start_time: p.start_time,
    }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await supabase.from('circle_members').insert(rows.slice(i, i + 400));
      if (error) {
        toast({ title: 'تعذر إتمام التوزيع', description: error.message, variant: 'destructive' });
        setDistributing(false); fetchAll(); return;
      }
    }
    toast({ title: `وُزّعت ${rows.length} طالبة` });
    setDistOpen(false); setDistributing(false); fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users2 className="text-accent" />
          <h1 className="text-2xl font-display">الحلقات</h1>
          <Badge variant="outline">{circles.length}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-1" onClick={createCirclesFromSlots} disabled={autoCreating}
            title="حلقة لكل موعد توفر غير مرتبط — والمواعيد الدورية حلقة واحدة">
            <CalendarPlus size={15} /> {autoCreating ? '...' : 'إنشاء حلقات من مواعيد المسمعات'}
          </Button>
          <Button variant="outline" className="gap-1" onClick={buildDistribution} disabled={distributing}>
            <Wand2 size={15} /> {distributing ? '...' : 'توزيع تلقائي'}
          </Button>
          <Button onClick={openCreate}><Plus size={16} className="ml-1" /> حلقة جديدة</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم</TableHead>
                  <TableHead>المسمعة</TableHead>
                  <TableHead>المشرفة</TableHead>
                  <TableHead>المواعيد</TableHead>
                  <TableHead>الإشغال</TableHead>
                  <TableHead>الطالبات</TableHead>
                  <TableHead>نشطة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {circles.map(c => {
                  const used = usedMinutes(c.id);
                  const cap = capacity(c);
                  const list = membersOf(c.id);
                  const open = expanded === c.id;
                  return [
                    <TableRow key={c.id} className={open ? 'bg-accent/5' : undefined}>
                      <TableCell className="font-display text-lg">{c.number}</TableCell>
                      <TableCell className="font-medium">{c.teacher_name}</TableCell>
                      <TableCell>{c.supervisor_name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {slotsLabel(c).map((t, i) => (
                            <span key={i} className="text-xs whitespace-nowrap border rounded-full px-2 py-0.5 bg-muted/40">{t}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={used >= cap ? 'destructive' : 'outline'}>{used}/{cap} د</Badge>
                      </TableCell>
                      <TableCell>
                        <button type="button" className="inline-flex items-center gap-1 hover:text-info"
                          onClick={() => setExpanded(open ? null : c.id)}>
                          {list.length} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </TableCell>
                      <TableCell><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} /></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil size={15} /></Button>
                        <Button variant="ghost" size="icon" title="إضافة طالبة" onClick={() => openAddStudent(c)}><UserPlus size={15} /></Button>
                        {list.length === 0 && (
                          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCircle(c)}><Trash2 size={15} /></Button>
                        )}
                      </TableCell>
                    </TableRow>,
                    open && (
                      <TableRow key={`${c.id}-members`}>
                        <TableCell colSpan={8} className="bg-muted/30 p-3">
                          {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground">لا طالبات في هذه الحلقة بعد.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {list.map(m => (
                                <div key={m.id} className="flex items-center gap-2 flex-wrap bg-background border rounded-lg px-3 py-1.5 text-sm">
                                  {/* وقت الطالبة داخل نافذة الحلقة — تعديله بيد مدير النظام */}
                                  <Select value={m.start_time?.slice(0, 5) ?? ''} onValueChange={v => updateMemberTime(m, v)}>
                                    <SelectTrigger className="h-7 w-24 text-xs shrink-0">
                                      <SelectValue placeholder="الوقت؟" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                      {timeOptionsOf(c).map(t => (
                                        <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="font-medium">{m.student_name}</span>
                                  <span className="text-muted-foreground">{m.track_name} — {m.minutes}د</span>
                                  <Badge variant="outline">{m.choice_rank ? choiceLabel(m.choice_rank) : (m.added_by ?? 'إسناد يدوي')}</Badge>
                                  <span className="mr-auto flex items-center gap-1.5">
                                    <Select value="" onValueChange={v => transferMember(m, v)}>
                                      <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="نقل إلى حلقة..." /></SelectTrigger>
                                      <SelectContent>
                                        {circles.filter(x => x.id !== c.id && x.is_active).map(x => (
                                          <SelectItem key={x.id} value={x.id}>
                                            حلقة {x.number} — {x.teacher_name} ({WEEKDAYS[x.weekday]}) — متبقي {capacity(x) - usedMinutes(x.id)}د
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <button type="button" className="text-muted-foreground hover:text-destructive"
                                      onClick={() => removeMember(m)}><Trash2 size={14} /></button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  ];
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* إنشاء/تعديل حلقة */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? `تعديل الحلقة ${editing.number}` : 'حلقة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الحلقة</Label>
                <Input type="number" min={1} value={form.number}
                  onChange={e => setForm({ ...form, number: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>المسمعة</Label>
                <Select value={form.teacher_id}
                  onValueChange={v => setForm({ ...form, teacher_id: v, slot_ids: [] })}>
                  <SelectTrigger><SelectValue placeholder="اختاري المسمعة" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>المشرفة المتابعة</Label>
              <Select value={form.supervisor_id || 'none'} onValueChange={v => setForm({ ...form, supervisor_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="بلا مشرفة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بلا مشرفة</SelectItem>
                  {supervisors.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* مواعيد الحلقة = مواعيد المسمعة نفسها (واحد أو أكثر) */}
            <div className="space-y-2">
              <Label>مواعيد الحلقة <span className="text-muted-foreground text-xs">— من أوقات توفر المسمعة، ويمكن اختيار أكثر من موعد</span></Label>
              {!form.teacher_id ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-3 py-3 text-center">
                  اختاري المسمعة أولًا لعرض مواعيدها
                </p>
              ) : formSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed rounded-lg px-3 py-3 text-center">
                  لا مواعيد لهذه المسمعة — أضيفيها من صفحة المسمعات
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {formSlots.map(s => {
                    const taken = slotTakenBy(s.id);
                    const on = form.slot_ids.includes(s.id);
                    return (
                      <label key={s.id}
                        className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm transition-colors ${
                          taken ? 'opacity-55 cursor-not-allowed'
                            : on ? 'border-accent bg-accent/10 cursor-pointer'
                            : 'cursor-pointer hover:border-accent/60'}`}>
                        <Checkbox checked={on} disabled={!!taken} onCheckedChange={() => setForm({
                          ...form,
                          slot_ids: on ? form.slot_ids.filter(x => x !== s.id) : [...form.slot_ids, s.id],
                        })} />
                        <span className="font-medium">{WEEKDAYS[s.weekday]}</span>
                        <span>{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                        <span className="text-muted-foreground text-xs">
                          ({durationMinutes(s.start_time, s.end_time)}د)
                        </span>
                        {taken && (
                          <Badge variant="outline" className="mr-auto text-warning border-warning">
                            في الحلقة {taken.number}
                          </Badge>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              سعة الحلقة: {formCapacity} دقيقة —
              تُستهلك بحسب مسار كل طالبة (صفحات جلستها × سرعة الصفحة لمسارها — تُضبط من صفحة المسارات)
            </p>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إنشاء'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* إضافة طالبة يدويًا */}
      <Dialog open={!!addingTo} onOpenChange={open => !open && setAddingTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة طالبة إلى الحلقة {addingTo?.number} — {addingTo?.teacher_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              المتبقي في الحلقة: {addingTo ? capacity(addingTo) - usedMinutes(addingTo.id) : 0} دقيقة
            </p>
            <Select value={addStudentId} onValueChange={setAddStudentId}>
              <SelectTrigger><SelectValue placeholder="اختاري طالبة (غير موزعة)" /></SelectTrigger>
              <SelectContent>
                {unassigned.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.track_name} ({s.minutes}د)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={addStudent} disabled={!addStudentId}>إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* معاينة التوزيع التلقائي */}
      <Dialog open={distOpen} onOpenChange={setDistOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[92vw] max-h-[88vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader><DialogTitle>معاينة التوزيع التلقائي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              بالأسبقية بالتسجيل، ثم أولويات كل طالبة، وسعة الحلقات بالدقائق حسب المسار.
              <b> عدّلي ما تشائين هنا</b> — نقل طالبة لحلقة أخرى أو استبعادها — ولن يُحفظ شيء قبل «تأكيد التوزيع».
            </p>

            {/* إشغال كل حلقة بعد هذا التوزيع */}
            {proposals.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {circles.filter(c => c.is_active).map(c => {
                  const used = projectedUsed(c.id, proposals);
                  const cap = capacity(c);
                  if (!used) return null;
                  return (
                    <Badge key={c.id} variant="outline" className={used > cap ? 'text-destructive border-destructive' : ''}>
                      حلقة {c.number}: {used}/{cap} د
                    </Badge>
                  );
                })}
              </div>
            )}

            {proposals.length === 0 ? (
              <p className="text-sm">لا طالبات قابلة للتوزيع (الجميع موزعات أو بلا أولويات مطابقة).</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>الطالبة</TableHead><TableHead>المسار</TableHead>
                  <TableHead>الحلقة</TableHead><TableHead>وقتها</TableHead><TableHead>الاختيار</TableHead>
                  <TableHead />
                </TableRow></TableHeader>
                <TableBody>
                  {proposals.map(p => (
                    <TableRow key={p.student_id}>
                      <TableCell className="font-medium whitespace-nowrap">{p.student_name}</TableCell>
                      <TableCell className="whitespace-normal">{p.track_name} ({p.minutes}د)</TableCell>
                      <TableCell>
                        {/* تعديل يدوي: نقلها لحلقة أخرى قبل الحفظ */}
                        <Select value={p.circle_id} onValueChange={v => moveProposal(p.student_id, v)}>
                          <SelectTrigger className="h-8 w-full min-w-64 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {circles.filter(c => c.is_active).map(c => {
                              const free = capacity(c) - projectedUsed(c.id, proposals, p.student_id);
                              return (
                                <SelectItem key={c.id} value={c.id} disabled={free < p.minutes && c.id !== p.circle_id}>
                                  حلقة {c.number} — {c.teacher_name} (متبقٍ {free}د)
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatTime(p.start_time)}</TableCell>
                      <TableCell>
                        <Badge variant={p.choice_rank === 1 ? 'default' : 'outline'}>
                          {p.choice_rank ? choiceLabel(p.choice_rank) : 'إسناد يدوي'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button type="button" title="استبعادها من هذا التوزيع"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => dropProposal(p)}>
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {distSkipped.length > 0 && (
              <div className="border border-warning/50 bg-warning/10 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">لم يوزَّعن ({distSkipped.length}) — أسنديهن يدويًا:</p>
                {distSkipped.map(s => (
                  <div key={s.student_id} className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.track_name} ({s.minutes}د) — {s.why}</span>
                    <Select value="" onValueChange={v => placeSkipped(s, v)}>
                      <SelectTrigger className="h-8 w-40 text-xs mr-auto"><SelectValue placeholder="أسنديها لحلقة..." /></SelectTrigger>
                      <SelectContent>
                        {circles.filter(c => c.is_active).map(c => {
                          const free = capacity(c) - projectedUsed(c.id, proposals);
                          return (
                            <SelectItem key={c.id} value={c.id} disabled={free < s.minutes}>
                              حلقة {c.number} — {c.teacher_name} (متبقٍ {free}د)
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
            {proposals.length > 0 && (
              <Button className="w-full" onClick={applyDistribution} disabled={distributing}>
                {distributing ? '...' : `تأكيد التوزيع (${proposals.length} طالبة)`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
