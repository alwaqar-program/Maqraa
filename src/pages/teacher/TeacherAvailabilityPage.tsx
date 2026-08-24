import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, CalendarClock, Link2 } from 'lucide-react';
import { WEEKDAYS, formatTime, totalWeeklyHours, Slot } from '@/lib/schedule';
import { TimeSelect } from '@/components/TimeSelect';

interface SlotWithBooking extends Slot {
  circleNumber?: number | null;
}

export default function TeacherAvailabilityPage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [meetingLink, setMeetingLink] = useState('');
  const [slots, setSlots] = useState<SlotWithBooking[]>([]);
  const [limits, setLimits] = useState({ min: 2, max: 12 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ weekday: 0, start_time: '16:00', end_time: '17:00' });
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: teacher } = await supabase.from('teachers').select('id, meeting_link').eq('user_id', user?.id ?? '').maybeSingle();
    if (!teacher) { setLoading(false); return; }
    setTeacherId(teacher.id);
    setMeetingLink(teacher.meeting_link || '');

    const [{ data: slotRows }, { data: settings }] = await Promise.all([
      supabase.from('availability_slots').select('*, circle_slots(circles(number))')
        .eq('teacher_id', teacher.id).order('weekday').order('start_time'),
      supabase.from('app_settings').select('key, value')
        .in('key', ['teacher_min_hours_per_week', 'teacher_max_hours_per_week']),
    ]);
    setLimits({
      min: Number(settings?.find(s => s.key === 'teacher_min_hours_per_week')?.value ?? 2),
      max: Number(settings?.find(s => s.key === 'teacher_max_hours_per_week')?.value ?? 12),
    });
    setSlots((slotRows || []).map((s: any) => (
      { ...s, circleNumber: s.circle_slots?.[0]?.circles?.number ?? null }
    )));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const hours = totalWeeklyHours(slots);
  const belowMin = hours < limits.min;

  const addSlot = async () => {
    if (!teacherId) return;
    // فحص مسبق في الواجهة: تداخل مع موعد قائم في اليوم نفسه
    const overlaps = slots.some(s =>
      s.is_active && s.weekday === form.weekday &&
      form.start_time < s.end_time.slice(0, 5) && s.start_time.slice(0, 5) < form.end_time
    );
    if (overlaps) {
      toast({ title: 'هذا الوقت يتداخل مع موعد آخر لديك في اليوم نفسه', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('availability_slots').insert({
      teacher_id: teacherId, weekday: form.weekday,
      start_time: form.start_time, end_time: form.end_time,
    });
    if (error) {
      const msg = error.message.includes('no_overlapping_slots')
        ? 'هذا الوقت يتداخل مع موعد آخر لديك في اليوم نفسه'
        : error.message;
      toast({ title: 'تعذر إضافة الموعد', description: msg, variant: 'destructive' }); return;
    }
    toast({ title: 'أُضيف موعد التوفر' });
    setDialogOpen(false);
    fetchAll();
  };

  const removeSlot = async (s: SlotWithBooking) => {
    if (s.circleNumber != null) { toast({ title: `الموعد مرتبط بحلقة ${s.circleNumber} — تواصلي مع الإدارة لتعديل الحلقة أولًا`, variant: 'destructive' }); return; }
    const { error } = await supabase.from('availability_slots').delete().eq('id', s.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const saveMeetingLink = async () => {
    if (!teacherId) return;
    const { error } = await supabase.from('teachers').update({ meeting_link: meetingLink || null }).eq('id', teacherId);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else toast({ title: 'حُفظ رابط الاجتماع' });
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="text-accent" />
          <h1 className="text-2xl font-display">أوقات توفري</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus size={16} className="ml-1" /> موعد جديد</Button>
      </div>

      {/* عداد الساعات مقابل الحدين */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span>مجموع ساعاتك الأسبوعية: <b>{hours}</b> ساعة</span>
            <span className="text-muted-foreground">الحد: {limits.min}–{limits.max} ساعة</span>
          </div>
          <Progress value={Math.min(100, (hours / limits.max) * 100)} />
          {belowMin && <p className="text-sm text-warning">⚠ ما زلتِ تحت الحد الأدنى ({limits.min} ساعة أسبوعيًا)</p>}
        </CardContent>
      </Card>

      {/* رابط الاجتماع الثابت */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Link2 size={18} /> رابط الاجتماع الرقمي (يظهر لطالباتك في مواعيدهن)</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input dir="ltr" placeholder="https://zoom.us/j/..." value={meetingLink} onChange={e => setMeetingLink(e.target.value)} />
          <Button onClick={saveMeetingLink}>حفظ</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : slots.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا مواعيد بعد — أضيفي أول وقت متاح لتسميع طالباتك.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اليوم</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {slots.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{WEEKDAYS[s.weekday]}</TableCell>
                    <TableCell>{formatTime(s.start_time)}</TableCell>
                    <TableCell>{formatTime(s.end_time)}</TableCell>
                    <TableCell>
                      {s.circleNumber != null
                        ? <Badge className="bg-accent text-accent-foreground">حلقة {s.circleNumber}</Badge>
                        : <Badge variant="outline">غير مرتبطة بحلقة</Badge>}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeSlot(s)} disabled={s.circleNumber != null}>
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
        <DialogContent>
          <DialogHeader><DialogTitle>موعد توفر جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اليوم</Label>
              <Select value={String(form.weekday)} onValueChange={v => setForm({ ...form, weekday: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
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
            <Button className="w-full" onClick={addSlot}>إضافة</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
