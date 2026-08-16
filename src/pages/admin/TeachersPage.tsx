import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useUrlState } from '@/lib/use-url-state';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, GraduationCap, FileSignature, Check, X, Trash2 } from 'lucide-react';
import { WEEKDAYS, slotHours } from '@/lib/schedule';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TimeSelect } from '@/components/TimeSelect';

interface Teacher {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  meeting_link: string | null;
  track_id: string | null;
  is_active: boolean;
  user_id: string | null;
  total_hours?: number;
  booked?: number;
}

interface SlotRow { key: string; id?: string; weekday: number; start_time: string; end_time: string; is_daily?: boolean; booked?: boolean; studentName?: string }

const DAILY_DAYS = [1, 2, 3, 4, 5, 6];   // الاثنين → السبت
let slotKeySeq = 0;
const newSlotKey = () => `n${++slotKeySeq}`;

interface Agreement {
  id: string; full_name: string; agreement_date: string;
  agreed_slots: { weekday: number; start_time: string; end_time: string }[];
  notes: string | null;
  extra_answers?: Record<string, any>;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '', track_id: '' });
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [origSlots, setOrigSlots] = useState<SlotRow[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; names: string[] } | null>(null);
  const [deletingTeacher, setDeletingTeacher] = useState<Teacher | null>(null);
  const { toast } = useToast();

  // حذف مسمعة: قاعدة البيانات تمنع الحذف إن كان لها سجلات (حلقات/تسميع/حضور/اختبارات)
  const confirmDeleteTeacher = async () => {
    const t = deletingTeacher;
    if (!t) return;
    const { error } = await supabase.from('teachers').delete().eq('id', t.id);
    setDeletingTeacher(null);
    if (error) {
      const friendly = error.code === '23503' || error.message.includes('foreign key') || error.message.includes('violates')
        ? 'لها سجلات مرتبطة (حلقة أو تسميع أو حضور أو اختبارات) — الحذف ممنوع حفاظًا على السجلات. عطّليها بمفتاح «نشطة» بدلًا من ذلك.'
        : error.message;
      toast({ title: `تعذر حذف ${t.full_name}`, description: friendly, variant: 'destructive' });
    } else {
      toast({ title: `حُذفت ${t.full_name} نهائيًا` });
    }
    fetchAll();
  };

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: hours }, { data: bookings }, { data: agr }] = await Promise.all([
      supabase.from('teachers').select('*').order('full_name'),
      supabase.from('v_teacher_weekly_hours').select('*'),
      supabase.from('bookings').select('slot_id, status, availability_slots(teacher_id)').eq('status', 'active'),
      supabase.from('teacher_agreements').select('*').eq('status', 'pending').order('created_at'),
    ]);
    setAgreements(agr || []);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setTeachers((rows || []).map((t: any) => ({
      ...t,
      total_hours: (hours || []).find((h: any) => h.teacher_id === t.id)?.total_hours ?? 0,
      booked: (bookings || []).filter((b: any) => b.availability_slots?.teacher_id === t.id).length,
    })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Teacher) => unknown; type: SortType }> = {
    name: { get: r => r.full_name, type: 'text' },
    phone: { get: r => r.phone, type: 'text' },
    hours: { get: r => r.total_hours, type: 'number' },
    booked: { get: r => r.booked, type: 'number' },
    account: { get: r => !!r.user_id, type: 'boolean' },
    active: { get: r => r.is_active, type: 'boolean' },
  };
  const sorted = sortKey && SORTS[sortKey]
    ? sortRows(teachers, SORTS[sortKey].get, sortDir, SORTS[sortKey].type)
    : teachers;

  useEffect(() => {
    supabase.from('tracks').select('id, name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setTracks(data || []));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '', track_id: '' });
    setSlots([]); setOrigSlots([]);
    setDialogOpen(true);
  };
  const openEdit = async (t: Teacher) => {
    setEditing(t);
    setForm({
      full_name: t.full_name, national_id: t.national_id ?? '',
      phone: t.phone ?? '', email: t.email ?? '', meeting_link: t.meeting_link ?? '',
      track_id: t.track_id ?? '',
    });
    const { data } = await supabase.from('availability_slots')
      .select('id, weekday, start_time, end_time, is_daily, bookings(id, status, students(full_name))')
      .eq('teacher_id', t.id).order('weekday').order('start_time');
    const rows: SlotRow[] = (data || []).map((s: any) => {
      const active = (s.bookings || []).find((b: any) => b.status === 'active');
      return {
        key: s.id, id: s.id, weekday: s.weekday, is_daily: !!s.is_daily,
        start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
        booked: !!active, studentName: active?.students?.full_name,
      };
    });
    setSlots(rows); setOrigSlots(rows);
    setDialogOpen(true);
  };

  const slotsTotalHours = Math.round(slots.reduce((a, s) =>
    a + Math.max(0, slotHours(s.start_time, s.end_time)), 0) * 10) / 10;

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast({ title: 'الاسم مطلوب', variant: 'destructive' }); return; }
    if (slots.some(s => !s.start_time || !s.end_time || s.end_time <= s.start_time)) {
      toast({ title: 'هناك موعد غير مكتمل أو نهايته قبل بدايته', variant: 'destructive' }); return;
    }
    // لا موعدان متداخلان في اليوم نفسه للمسمعة نفسها
    const clash = slots.find((a, i) => slots.some((b, j) =>
      i < j && a.weekday === b.weekday && a.start_time < b.end_time && b.start_time < a.end_time));
    if (clash) {
      toast({ title: `موعدان متداخلان يوم ${WEEKDAYS[clash.weekday]} — عدّلي الأوقات`, variant: 'destructive' }); return;
    }
    const payload = {
      full_name: form.full_name, national_id: form.national_id || null,
      phone: form.phone || null, email: form.email || null,
      meeting_link: form.meeting_link || null,
      track_id: form.track_id || null,
    };
    let teacherId = editing?.id;
    if (editing) {
      const { error } = await supabase.from('teachers').update(payload).eq('id', editing.id);
      if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { data, error } = await supabase.from('teachers').insert(payload).select('id').single();
      if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
      teacherId = data.id;
    }

    // مزامنة أوقات التوفر: حذف المحذوف أولًا (لتجنب تعارض التراكب) ثم تعديل/إضافة
    const keptIds = slots.filter(s => s.id).map(s => s.id);
    const removed = origSlots.filter(o => o.id && !keptIds.includes(o.id));
    let slotError: string | null = null;
    if (removed.length) {
      const { error } = await supabase.from('availability_slots').delete().in('id', removed.map(r => r.id));
      if (error) slotError = error.message;
    }
    for (const s of slots) {
      if (!s.id) {
        const { error } = await supabase.from('availability_slots')
          .insert({ teacher_id: teacherId, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time, is_daily: s.is_daily ?? false });
        if (error) slotError = slotError ?? error.message;
      } else {
        const o = origSlots.find(x => x.id === s.id);
        if (o && (o.weekday !== s.weekday || o.start_time !== s.start_time || o.end_time !== s.end_time)) {
          const { error } = await supabase.from('availability_slots')
            .update({ weekday: s.weekday, start_time: s.start_time, end_time: s.end_time }).eq('id', s.id);
          if (error) slotError = slotError ?? error.message;
        }
      }
    }
    if (slotError) {
      toast({ title: 'حُفظت البيانات لكن تعذر حفظ بعض المواعيد', description: slotError, variant: 'destructive' });
    } else {
      toast({ title: editing ? 'تم تحديث المسمعة ومواعيدها' : 'تمت إضافة المسمعة' });
      setDialogOpen(false);
    }
    fetchAll();
  };

  // قبول اتفاقية موقعة → إنشاء ملف مسمعة
  const acceptAgreement = async (a: Agreement) => {
    const { data: teacher, error: tErr } = await supabase.from('teachers')
      .insert({ full_name: a.full_name }).select('id').single();
    if (tErr) { toast({ title: 'خطأ', description: tErr.message, variant: 'destructive' }); return; }
    // مواعيد الاتفاقية تصبح مواعيد توفرها مباشرة
    if (a.agreed_slots?.length) {
      const { error: slotErr } = await supabase.from('availability_slots').insert(
        a.agreed_slots.map(s => ({ teacher_id: teacher.id, ...s }))
      );
      if (slotErr) toast({ title: 'أُنشئت المسمعة لكن تعذر إنشاء بعض المواعيد', description: slotErr.message, variant: 'destructive' });
    }
    const { error } = await supabase.from('teacher_agreements')
      .update({ status: 'accepted', teacher_id: teacher.id, reviewed_at: new Date().toISOString() })
      .eq('id', a.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else toast({ title: `قُبلت ${a.full_name} ومواعيدها جاهزة — أنشئي حسابها من صفحة المستخدمين` });
    fetchAll();
  };
  const rejectAgreement = async (a: Agreement) => {
    const { error } = await supabase.from('teacher_agreements')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', a.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const toggleActive = async (t: Teacher) => {
    const { error } = await supabase.from('teachers').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-accent" />
          <h1 className="text-2xl font-display">المسمعات</h1>
          <Badge variant="outline">{teachers.length}</Badge>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> مسمعة جديدة</Button>
      </div>

      {agreements.length > 0 && (
        <Card className="border-accent/50">
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium flex items-center gap-2">
              <FileSignature size={17} className="text-accent" />
              اتفاقيات موقعة بانتظار الاعتماد ({agreements.length})
            </p>
            {agreements.map(a => (
              <div key={a.id} className="flex items-start justify-between gap-3 border-b last:border-0 pb-3 text-sm">
                <div>
                  <b>{a.full_name}</b>
                  <span className="text-muted-foreground"> — وقّعت في {a.agreement_date}</span>
                  {a.agreed_slots?.length > 0 && (
                    <p className="text-muted-foreground mt-0.5">
                      المواعيد: {a.agreed_slots.map(s => `${WEEKDAYS[s.weekday]} ${s.start_time.slice(0,5)}–${s.end_time.slice(0,5)}`).join('، ')}
                    </p>
                  )}
                  {a.notes && <p className="text-muted-foreground mt-0.5">ملاحظات: {a.notes}</p>}
                  {a.extra_answers && Object.keys(a.extra_answers).length > 0 && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      إجابات إضافية: {Object.values(a.extra_answers).map(v => Array.isArray(v) ? v.join('، ') : v).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => acceptAgreement(a)}>
                    <Check size={13} /> قبول
                  </Button>
                  <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => rejectAgreement(a)}>
                    <X size={13} /> رفض
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="الاسم" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الجوال" sortKey="phone" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="ساعات التوفر" sortKey="hours" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="طالباتها" sortKey="booked" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>رابط الاجتماع</TableHead>
                  <SortableHead label="حساب دخول" sortKey="account" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="نشطة" sortKey="active" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell dir="ltr">{t.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={Number(t.total_hours) < 2 ? 'destructive' : 'outline'}>
                        {t.total_hours} ساعة
                      </Badge>
                    </TableCell>
                    <TableCell>{t.booked}</TableCell>
                    <TableCell>{t.meeting_link ? '✓' : '—'}</TableCell>
                    <TableCell>
                      {t.user_id ? <Badge variant="outline" className="text-success border-success">مفعّل</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">بلا حساب</Badge>}
                    </TableCell>
                    <TableCell><Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil size={16} /></Button>
                      <Button variant="ghost" size="icon" title="حذف المسمعة" className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeletingTeacher(t)}>
                        <Trash2 size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'تعديل المسمعة' : 'مسمعة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الجوال</Label>
                <Input dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>البريد</Label>
              <Input dir="ltr" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رابط الاجتماع الثابت</Label>
              <Input dir="ltr" placeholder="https://zoom.us/j/..." value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>مسار المسمعة <span className="text-muted-foreground text-xs">— اختياري: طالبات هذا المسار يرين مواعيد حلقاتها فقط عند التسجيل</span></Label>
              <Select value={form.track_id || 'none'} onValueChange={v => setForm({ ...form, track_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— عامة (كل المسارات) —</SelectItem>
                  {tracks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* أوقات التوفر — تُحفظ في availability_slots مع زر الحفظ */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>أوقات التوفر (مواعيد التسميع)</Label>
                {slots.length > 0 && (
                  <span className="text-xs text-muted-foreground">المجموع: {slotsTotalHours} ساعة أسبوعيًا</span>
                )}
              </div>
              {(() => {
                // الموعد الدوري = صفوف موسومة is_daily بنفس الوقت — يُعرض صفًا واحدًا (من/إلى) ويُخزن صفًا لكل يوم.
                // مواعيد الأيام العادية لا تُجمع أبدًا حتى لو تتابعت أيامها (روان/نورة: الجمعة+السبت موعدا يوم)
                const byTime: Record<string, SlotRow[]> = {};
                slots.filter(s => s.is_daily).forEach(s => { (byTime[`${s.start_time}|${s.end_time}`] ??= []).push(s); });
                const grouped = new Set<string>();
                const groups: { range: boolean; rows: SlotRow[] }[] = [];
                Object.values(byTime).forEach(rows => {
                  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday);
                  let run: SlotRow[] = [];
                  const flush = () => {
                    if (run.length >= 2) { groups.push({ range: true, rows: run }); run.forEach(r => grouped.add(r.key)); }
                    run = [];
                  };
                  sorted.forEach(r => {
                    if (run.length && r.weekday === run[run.length - 1].weekday) { flush(); return; }
                    if (run.length && r.weekday !== run[run.length - 1].weekday + 1) flush();
                    run.push(r);
                  });
                  // صف دوري وحيد (بقية أيامه حُذفت) يبقى معروضًا كمجموعة من/إلى ليوم واحد
                  if (run.length === 1) { groups.push({ range: true, rows: run }); run.forEach(r => grouped.add(r.key)); run = []; }
                  flush();
                });
                slots.forEach(s => { if (!grouped.has(s.key)) groups.push({ range: false, rows: [s] }); });

                const updateRows = (keys: string[], patch: Partial<SlotRow>) =>
                  setSlots(slots.map(x => keys.includes(x.key) ? { ...x, ...patch } : x));
                const removeOrAsk = (rows: SlotRow[]) => {
                  const booked = rows.filter(r => r.booked);
                  if (booked.length) setConfirmDelete({ keys: rows.map(r => r.key), names: booked.map(r => r.studentName ?? 'طالبة') });
                  else setSlots(slots.filter(x => !rows.some(r => r.key === x.key)));
                };
                // تعديل مدى الدوري (من يوم/إلى يوم): تُعاد كتابة صفوف المجموعة
                const setRange = (rows: SlotRow[], fromRaw: number, toRaw: number) => {
                  const from = Math.min(fromRaw, toRaw), to = Math.max(fromRaw, toRaw);
                  const days = Array.from({ length: to - from + 1 }, (_, i) => from + i);
                  const dropped = rows.filter(r => !days.includes(r.weekday));
                  if (dropped.some(r => r.booked)) {
                    toast({ title: 'يوم ضمن المدى محجوز من طالبة', description: 'ألغي الحجز أولًا ثم ضيّقي المدى', variant: 'destructive' });
                    return;
                  }
                  const kept = rows.filter(r => days.includes(r.weekday));
                  const have = new Set(kept.map(r => r.weekday));
                  const added: SlotRow[] = days.filter(d => !have.has(d)).map(d => ({
                    key: newSlotKey(), weekday: d, is_daily: true,
                    start_time: rows[0].start_time, end_time: rows[0].end_time,
                  }));
                  setSlots([...slots.filter(x => !rows.some(r => r.key === x.key)), ...kept, ...added]);
                };

                return groups.map(g => {
                  const keys = g.rows.map(r => r.key);
                  const first = g.rows[0], last = g.rows[g.rows.length - 1];
                  const bookedNames = g.rows.filter(r => r.booked).map(r => r.studentName ?? 'طالبة');
                  return (
                    <div key={first.key} className="flex items-center gap-2 flex-wrap border rounded-lg p-2">
                      {g.range ? (
                        <>
                          <span className="text-xs text-muted-foreground">دوري من</span>
                          <Select value={String(first.weekday)} onValueChange={v => setRange(g.rows, Number(v), last.weekday)}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {WEEKDAYS.map((d, w) => <SelectItem key={w} value={String(w)}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">إلى</span>
                          <Select value={String(last.weekday)} onValueChange={v => setRange(g.rows, first.weekday, Number(v))}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {WEEKDAYS.map((d, w) => <SelectItem key={w} value={String(w)}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </>
                      ) : (
                        <Select value={String(first.weekday)} onValueChange={v => updateRows(keys, { weekday: Number(v) })}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WEEKDAYS.map((d, w) => <SelectItem key={w} value={String(w)}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      <TimeSelect className="w-28" value={first.start_time} onChange={v => updateRows(keys, { start_time: v })} />
                      <span className="text-muted-foreground text-sm">إلى</span>
                      <TimeSelect className="w-28" value={first.end_time} onChange={v => updateRows(keys, { end_time: v })} />
                      <span className="mr-auto flex items-center gap-2">
                        {bookedNames.length > 0 && (
                          <Badge variant="outline" className="text-warning border-warning">
                            محجوز — {bookedNames.join('، ')}
                          </Badge>
                        )}
                        <button type="button" className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeOrAsk(g.rows)}>
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </div>
                  );
                });
              })()}
              <div className="flex gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => setSlots([...slots, { key: newSlotKey(), weekday: 0, start_time: '16:00', end_time: '17:00' }])}>
                  <Plus size={14} /> إضافة موعد يوم
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => setSlots([...slots,
                    ...DAILY_DAYS.map(w => ({ key: newSlotKey(), weekday: w, is_daily: true, start_time: '16:00', end_time: '17:00' }))])}>
                  <Plus size={14} /> إضافة موعد دوري
                </Button>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* تأكيد حذف موعد محجوز */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف موعد محجوز</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الموعد محجوز من {confirmDelete?.names.join('، ') ?? 'طالبة'}.
              حذفه يلغي الحجز وتصبح الطالبة بلا موعد — ستظهر مميزة بـ«بلا موعد» في صفحة الطالبات حتى تحجز من جديد.
              الحذف يُنفذ عند «حفظ التعديل».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmDelete) setSlots(slots.filter(x => !confirmDelete.keys.includes(x.key)));
              setConfirmDelete(null);
            }}>حذف الموعد</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
