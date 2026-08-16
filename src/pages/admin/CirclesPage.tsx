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
import { Plus, Pencil, Users2, Wand2, Trash2, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { TimeSelect } from '@/components/TimeSelect';
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
interface Teacher { id: string; full_name: string; }
interface Supervisor { id: string; full_name: string; }
interface Proposal { student_id: string; student_name: string; track_name: string; minutes: number;
  circle_id: string; circle_number: number; choice_rank: number | null; start_time: string; }

export default function CirclesPage() {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Circle | null>(null);
  const [form, setForm] = useState({ number: 1, teacher_id: '', supervisor_id: '', weekday: 0, start_time: '16:00', end_time: '17:00' });
  const [addingTo, setAddingTo] = useState<Circle | null>(null);   // إضافة طالبة يدويًا
  const [unassigned, setUnassigned] = useState<{ id: string; full_name: string; track_name: string; minutes: number }[]>([]);
  const [addStudentId, setAddStudentId] = useState('');
  const [distOpen, setDistOpen] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [distSkipped, setDistSkipped] = useState<{ name: string; why: string }[]>([]);
  const [distributing, setDistributing] = useState(false);
  const { toast } = useToast();
  const { config } = useFormSettings('student_register');

  const fetchAll = useCallback(async () => {
    const [{ data: cs, error }, { data: ms }, { data: ts }, { data: svs }] = await Promise.all([
      supabase.from('circles').select('*, teachers(full_name, track_id), supervisors(full_name)').order('number'),
      supabase.from('circle_members').select('*, students(full_name, tracks(name))'),
      supabase.from('teachers').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('supervisors').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
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
  const capacity = (c: Circle) => durationMinutes(c.start_time, c.end_time);

  // ---------- إنشاء / تعديل حلقة ----------
  const openCreate = () => {
    setEditing(null);
    setForm({
      number: (circles.reduce((mx, c) => Math.max(mx, c.number), 0)) + 1,
      teacher_id: '', supervisor_id: '', weekday: 0, start_time: '16:00', end_time: '17:00',
    });
    setDialogOpen(true);
  };
  const openEdit = (c: Circle) => {
    setEditing(c);
    setForm({
      number: c.number, teacher_id: c.teacher_id, supervisor_id: c.supervisor_id ?? '',
      weekday: c.weekday, start_time: c.start_time.slice(0, 5), end_time: c.end_time.slice(0, 5),
    });
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!form.teacher_id) { toast({ title: 'اختاري المسمعة', variant: 'destructive' }); return; }
    if (form.end_time <= form.start_time) { toast({ title: 'نهاية الحلقة قبل بدايتها', variant: 'destructive' }); return; }
    // لا نقلص حلقة دون دقائق طالباتها الحالية
    if (editing && durationMinutes(form.start_time, form.end_time) < usedMinutes(editing.id)) {
      toast({ title: 'المدة الجديدة أقل من مجموع دقائق طالبات الحلقة', variant: 'destructive' }); return;
    }
    const payload = {
      number: form.number, teacher_id: form.teacher_id,
      supervisor_id: form.supervisor_id || null,
      weekday: form.weekday, start_time: form.start_time, end_time: form.end_time,
    };
    const q = editing
      ? supabase.from('circles').update(payload).eq('id', editing.id)
      : supabase.from('circles').insert(payload);
    const { error } = await q;
    if (error) {
      const msg = error.message.includes('no_overlapping_circles')
        ? 'تتداخل مع حلقة أخرى للمسمعة نفسها في اليوم نفسه'
        : error.message.includes('circles_number_key') ? 'رقم الحلقة مستخدم' : error.message;
      toast({ title: 'تعذر الحفظ', description: msg, variant: 'destructive' }); return;
    }
    toast({ title: editing ? 'تم تحديث الحلقة' : 'أُنشئت الحلقة' });
    setDialogOpen(false); fetchAll();
  };
  const toggleActive = async (c: Circle) => {
    const { error } = await supabase.from('circles').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
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
        start_time: addMinutes(target.start_time, usedMinutes(target.id)),
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
      .select('id, full_name, is_active, status, tracks(name, juz_count)')
      .eq('is_active', true).order('full_name').range(0, 1999);
    const inCircle = new Set(members.map(m => m.student_id));
    setUnassigned((data || [])
      .filter((s: any) => !inCircle.has(s.id) && (s.status ?? 'active') === 'active')
      .map((s: any) => ({
        id: s.id, full_name: s.full_name,
        track_name: s.tracks?.name ?? '—', minutes: trackMinutes(s.tracks?.juz_count),
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
      start_time: addMinutes(addingTo.start_time, usedMinutes(addingTo.id)),
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
    // والنصوص المشتقة مباشرة من الحلقات (النموذج يولدها حيًا من v_public_circle_times)
    circles.filter(c => c.is_active).forEach(c => {
      const start = c.start_time.slice(0, 5), end = c.end_time.slice(0, 5);
      const label = genSlotLabel(c.weekday, start, end);
      if (!map[label]) map[label] = { days: [c.weekday], start, end };
    });
    return map;
  }, [config.day_options, config.special_day_options, circles]);

  const buildDistribution = async () => {
    setDistributing(true);
    const [{ data: students }, { data: applicants }] = await Promise.all([
      supabase.from('students')
        .select('id, full_name, national_id, is_active, status, track_id, tracks(name, juz_count)')
        .eq('is_active', true).range(0, 1999),
      supabase.from('applicants')
        .select('national_id, created_at, preferred_slots, preferred_period')
        .range(0, 4999),
    ]);
    const inCircle = new Set(members.map(m => m.student_id));
    const appBy: Record<string, any> = {};
    (applicants || []).forEach((a: any) => { if (!appBy[a.national_id]) appBy[a.national_id] = a; });

    const queue = (students || [])
      .filter((s: any) => !inCircle.has(s.id) && (s.status ?? 'active') === 'active')
      .map((s: any) => ({
        id: s.id, name: s.full_name, track: s.tracks?.name ?? '—', track_id: s.track_id ?? null,
        minutes: trackMinutes(s.tracks?.juz_count),
        app: appBy[s.national_id] ?? null,
      }))
      // أسبقية التسجيل: الأقدم تقديمًا أولًا؛ من بلا استمارة في الآخر
      .sort((a, b) => {
        if (!a.app && !b.app) return 0;
        if (!a.app) return 1;
        if (!b.app) return -1;
        return String(a.app.created_at).localeCompare(String(b.app.created_at));
      });

    // السعة المتبقية لكل حلقة نشطة (تُستهلك أثناء المحاكاة) + الوقت التالي الشاغر
    const remaining: Record<string, number> = {};
    const nextStart: Record<string, string> = {};
    circles.filter(c => c.is_active).forEach(c => {
      remaining[c.id] = capacity(c) - usedMinutes(c.id);
      nextStart[c.id] = addMinutes(c.start_time, usedMinutes(c.id));
    });

    const overlaps = (c: Circle, w: { start: string; end: string }) =>
      c.start_time.slice(0, 5) < w.end && w.start < c.end_time.slice(0, 5);
    const periodOf = (c: Circle) => (c.start_time.slice(0, 5) < '12:00' ? 'morning' : 'evening');
    // مسمعة المسار: طالبة المسار المرتبط بمسمعة → حلقات مسمعته فقط؛
    // وغيرها → حلقات المسمعات غير المعينات على مسار
    const linkedTrackIds = new Set(circles.filter(c => c.is_active && c.teacher_track_id).map(c => c.teacher_track_id));
    const teacherOk = (c: Circle, stTrackId: string | null) =>
      stTrackId && linkedTrackIds.has(stTrackId) ? c.teacher_track_id === stTrackId : !c.teacher_track_id;

    const out: Proposal[] = [];
    const skipped: { name: string; why: string }[] = [];
    const take = (st: (typeof queue)[number], chosen: Circle, rank: number | null) => {
      remaining[chosen.id] -= st.minutes;
      const t = nextStart[chosen.id];
      nextStart[chosen.id] = addMinutes(t, st.minutes);
      out.push({
        student_id: st.id, student_name: st.name, track_name: st.track, minutes: st.minutes,
        circle_id: chosen.id, circle_number: chosen.number, choice_rank: rank, start_time: t,
      });
    };
    const preferPeriod = (candidates: Circle[], period: string | null) =>
      period === 'morning' || period === 'evening'
        ? [...candidates.filter(c => periodOf(c) === period), ...candidates.filter(c => periodOf(c) !== period)]
        : candidates;

    // المرحلة الأولى: صاحبات الأولويات — كل واحدة على أعلى خيار متاح لها
    const leftover: (typeof queue)[number][] = [];
    for (const st of queue) {
      const prefs: string[] = st.app?.preferred_slots ?? [];
      if (!prefs.length) { leftover.push(st); continue; }
      let placed = false;
      for (let rank = 1; rank <= prefs.length && !placed; rank++) {
        const w = optionWindows[prefs[rank - 1]];
        if (!w) continue;   // خيار قديم لم يعد معروضًا
        const candidates = preferPeriod(
          circles.filter(c => c.is_active && teacherOk(c, st.track_id) && w.days.includes(c.weekday) && overlaps(c, w) && remaining[c.id] >= st.minutes),
          st.app?.preferred_period ?? null,
        );
        if (candidates[0]) { take(st, candidates[0], rank); placed = true; }
      }
      if (!placed) leftover.push(st);   // خياراتها ممتلئة → المرحلة الثانية
    }

    // المرحلة الثانية: بلا أولويات (أو امتلأت خياراتها) → الأنسب المتاح:
    // فترتها المفضلة إن عُرفت، ثم الحلقة الأكثر سعة متبقية (موازنة الحلقات)
    for (const st of leftover) {
      const candidates = preferPeriod(
        circles.filter(c => c.is_active && teacherOk(c, st.track_id) && remaining[c.id] >= st.minutes)
          .sort((a, b) => remaining[b.id] - remaining[a.id] || a.number - b.number),
        st.app?.preferred_period ?? null,
      );
      if (candidates[0]) take(st, candidates[0], null);
      else skipped.push({ name: st.name, why: 'لا سعة متبقية في أي حلقة' });
    }
    setProposals(out); setDistSkipped(skipped); setDistOpen(true); setDistributing(false);
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
        <div className="flex gap-2">
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
                  <TableHead>اليوم</TableHead>
                  <TableHead>الوقت</TableHead>
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
                      <TableCell>{WEEKDAYS[c.weekday]}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTime(c.start_time)} – {formatTime(c.end_time)}</TableCell>
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
                        <TableCell colSpan={9} className="bg-muted/30 p-3">
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
                                      {timeOptionsWithin(c.start_time, c.end_time).map(t => (
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
                <Label>اليوم</Label>
                <Select value={String(form.weekday)} onValueChange={v => setForm({ ...form, weekday: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>المسمعة</Label>
              <Select value={form.teacher_id} onValueChange={v => setForm({ ...form, teacher_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختاري المسمعة" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>من</Label>
                <TimeSelect className="w-full" value={form.start_time} onChange={v => setForm({ ...form, start_time: v })} />
              </div>
              <div className="space-y-2">
                <Label>إلى</Label>
                <TimeSelect className="w-full" value={form.end_time} onChange={v => setForm({ ...form, end_time: v })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              سعة الحلقة: {durationMinutes(form.start_time, form.end_time)} دقيقة —
              تُستهلك بحسب مسار كل طالبة (٥أجزاء=10د، ١٠=20د، ٢٠=40د، ختمة=60د)
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>معاينة التوزيع التلقائي</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              بالأسبقية بالتسجيل، ثم أولويات كل طالبة، وسعة الحلقات بالدقائق حسب المسار —
              لن يُحفظ شيء قبل «تأكيد التوزيع».
            </p>
            {proposals.length === 0 ? (
              <p className="text-sm">لا طالبات قابلة للتوزيع (الجميع موزعات أو بلا أولويات مطابقة).</p>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>الطالبة</TableHead><TableHead>المسار</TableHead>
                  <TableHead>الحلقة</TableHead><TableHead>وقتها</TableHead><TableHead>الاختيار</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {proposals.map(p => (
                    <TableRow key={p.student_id}>
                      <TableCell className="font-medium">{p.student_name}</TableCell>
                      <TableCell>{p.track_name} ({p.minutes}د)</TableCell>
                      <TableCell>حلقة {p.circle_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTime(p.start_time)}</TableCell>
                      <TableCell>
                        <Badge variant={p.choice_rank === 1 ? 'default' : 'outline'}>
                          {p.choice_rank ? choiceLabel(p.choice_rank) : 'الأنسب المتاح (بلا أولويات)'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {distSkipped.length > 0 && (
              <div className="border border-warning/50 bg-warning/10 rounded-lg p-3 space-y-1">
                <p className="text-sm font-medium">لم يوزَّعن ({distSkipped.length}):</p>
                {distSkipped.map((s, i) => (
                  <p key={i} className="text-sm text-muted-foreground">• {s.name} — {s.why}</p>
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
