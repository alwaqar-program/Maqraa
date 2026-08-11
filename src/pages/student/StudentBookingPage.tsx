import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CalendarCheck, ExternalLink } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';

interface OpenSlot {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  teacher: { id: string; full_name: string };
  taken: boolean;
}
interface MyBooking {
  id: string;
  slot: { weekday: number; start_time: string; end_time: string };
  teacher: { full_name: string; meeting_link: string | null };
}

export default function StudentBookingPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [myBooking, setMyBooking] = useState<MyBooking | null>(null);
  const [slots, setSlots] = useState<OpenSlot[]>([]);
  const [confirming, setConfirming] = useState<OpenSlot | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
    if (!me) { setLoading(false); return; }
    setStudentId(me.id);

    // حجزي النشط
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, availability_slots(weekday, start_time, end_time, teachers(full_name, meeting_link))')
      .eq('student_id', me.id).eq('status', 'active').maybeSingle();
    if (booking) {
      const s: any = booking.availability_slots;
      setMyBooking({
        id: booking.id,
        slot: { weekday: s.weekday, start_time: s.start_time, end_time: s.end_time },
        teacher: { full_name: s.teachers?.full_name ?? '—', meeting_link: s.teachers?.meeting_link ?? null },
      });
      setLoading(false);
      return;
    }
    setMyBooking(null);

    // المواعيد الشاغرة فعلًا (عرض يتجاوز حجب حجوزات الأخريات) —
    // الموعد المحجوز يختفي من القائمة، ولا يبقى تعارض إلا لمن حجزتا في اللحظة نفسها
    const { data: slotRows } = await supabase
      .from('v_open_slots')
      .select('id, weekday, start_time, end_time, teacher_id, teacher_name')
      .order('weekday').order('start_time');
    setSlots((slotRows || []).map((s: any) => ({
      id: s.id, weekday: s.weekday, start_time: s.start_time, end_time: s.end_time,
      teacher: { id: s.teacher_id, full_name: s.teacher_name ?? '—' },
      taken: false,
    })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const book = async () => {
    if (!confirming || !studentId) return;
    const { error } = await supabase.from('bookings').insert({ slot_id: confirming.id, student_id: studentId });
    setConfirming(null);
    if (error) {
      const msg = error.message.includes('one_active_booking_per_slot')
        ? 'سبقتك طالبة أخرى لهذا الموعد — اختاري وقتًا آخر'
        : error.message;
      toast({ title: 'تعذر الحجز', description: msg, variant: 'destructive' });
      fetchAll();
      return;
    }
    toast({ title: 'تم حجز موعدك الأسبوعي 🎉' });
    fetchAll();
  };

  if (!loading && !studentId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف طالبة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarCheck className="text-accent" />
        <h1 className="text-2xl font-display">موعدي الأسبوعي</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : myBooking ? (
        <Card className="max-w-xl">
          <CardHeader><CardTitle className="font-display">موعدك الثابت</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg">
              <b>{WEEKDAYS[myBooking.slot.weekday]}</b> — {formatTime(myBooking.slot.start_time)} إلى {formatTime(myBooking.slot.end_time)}
            </p>
            <p>المسمعة: <b>{myBooking.teacher.full_name}</b></p>
            {myBooking.teacher.meeting_link ? (
              <Button asChild className="gap-2">
                <a href={myBooking.teacher.meeting_link} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} /> دخول جلسة التسميع
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">لم تضع المسمعة رابط الاجتماع بعد.</p>
            )}
            <p className="text-xs text-muted-foreground border-t pt-3">
              الموعد ثابت طوال الفصل ولا يمكنك تغييره — للتعديل تواصلي مع مسمعتك أو الإدارة.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground">
            اختاري موعدًا واحدًا يناسبك — <b>يتكرر أسبوعيًا طوال الفصل ولا يمكن تغييره بعد التأكيد.</b>
          </p>
          {slots.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد مواعيد شاغرة حاليًا — راجعي الإدارة.</CardContent></Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map(s => (
                <Card key={s.id} className="hover:border-accent transition-colors">
                  <CardContent className="pt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <b>{WEEKDAYS[s.weekday]}</b>
                      <Badge variant="outline">{formatTime(s.start_time)} – {formatTime(s.end_time)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">المسمعة: {s.teacher.full_name}</p>
                    <Button className="w-full" onClick={() => setConfirming(s)}>احجزي هذا الموعد</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!confirming} onOpenChange={open => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحجز</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && (
                <>ستحجزين <b>{WEEKDAYS[confirming.weekday]} {formatTime(confirming.start_time)}</b> مع
                المسمعة {confirming.teacher.full_name} — موعد ثابت يتكرر أسبوعيًا
                <b> ولا يمكنك تغييره بنفسك بعد التأكيد.</b></>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={book}>تأكيد الحجز</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
