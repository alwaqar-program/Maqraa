import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  is_active: boolean;
  user_id: string | null;
  total_hours?: number;
  booked?: number;
}

interface SlotRow { id?: string; weekday: number; start_time: string; end_time: string; booked?: boolean }

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
  const [form, setForm] = useState({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '' });
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [origSlots, setOrigSlots] = useState<SlotRow[]>([]);
  const { toast } = useToast();

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

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '' });
    setSlots([]); setOrigSlots([]);
    setDialogOpen(true);
  };
  const openEdit = async (t: Teacher) => {
    setEditing(t);
    setForm({
      full_name: t.full_name, national_id: t.national_id ?? '',
      phone: t.phone ?? '', email: t.email ?? '', meeting_link: t.meeting_link ?? '',
    });
    const { data } = await supabase.from('availability_slots')
      .select('id, weekday, start_time, end_time, bookings(id, status)')
      .eq('teacher_id', t.id).order('weekday').order('start_time');
    const rows: SlotRow[] = (data || []).map((s: any) => ({
      id: s.id, weekday: s.weekday,
      start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5),
      booked: (s.bookings || []).some((b: any) => b.status === 'active'),
    }));
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
    const payload = {
      full_name: form.full_name, national_id: form.national_id || null,
      phone: form.phone || null, email: form.email || null,
      meeting_link: form.meeting_link || null,
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
          .insert({ teacher_id: teacherId, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time });
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
                    <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil size={16} /></Button></TableCell>
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

            {/* أوقات التوفر — تُحفظ في availability_slots مع زر الحفظ */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label>أوقات التوفر (مواعيد التسميع)</Label>
                {slots.length > 0 && (
                  <span className="text-xs text-muted-foreground">المجموع: {slotsTotalHours} ساعة أسبوعيًا</span>
                )}
              </div>
              {slots.map((s, i) => {
                const update = (patch: Partial<SlotRow>) =>
                  setSlots(slots.map((x, j) => j === i ? { ...x, ...patch } : x));
                return (
                  <div key={s.id ?? `new-${i}`} className="flex items-center gap-2 flex-wrap border rounded-lg p-2">
                    <Select value={String(s.weekday)} onValueChange={v => update({ weekday: Number(v) })}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((d, w) => <SelectItem key={w} value={String(w)}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <TimeSelect className="w-28" value={s.start_time} onChange={v => update({ start_time: v })} />
                    <span className="text-muted-foreground text-sm">إلى</span>
                    <TimeSelect className="w-28" value={s.end_time} onChange={v => update({ end_time: v })} />
                    {s.booked ? (
                      <Badge variant="outline" className="mr-auto text-warning border-warning">محجوز — لا يُحذف</Badge>
                    ) : (
                      <button type="button" className="text-muted-foreground hover:text-destructive mr-auto"
                        onClick={() => setSlots(slots.filter((_, j) => j !== i))}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" className="gap-1"
                onClick={() => setSlots([...slots, { weekday: 0, start_time: '16:00', end_time: '17:00' }])}>
                <Plus size={14} /> إضافة موعد
              </Button>
            </div>

            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
