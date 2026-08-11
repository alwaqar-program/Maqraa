import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Home, Mic, Check, X, Clock } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';

interface Session {
  booking_id: string;
  student_id: string;
  student_name: string;
  start_time: string;
  end_time: string;
  attendance_status: string | null;
}

export default function TeacherHomePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const today = new Date();
  const weekday = today.getDay(); // 0=الأحد بتقويم JS الأمريكي؟ لا: 0=Sunday يطابق ترقيمنا 0=الأحد
  const todayStr = today.toISOString().slice(0, 10);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const [{ data: bookings }, { data: att }] = await Promise.all([
      supabase.from('bookings')
        .select('id, students(id, full_name), availability_slots!inner(teacher_id, weekday, start_time, end_time)')
        .eq('status', 'active')
        .eq('availability_slots.teacher_id', me.id)
        .eq('availability_slots.weekday', weekday),
      supabase.from('session_attendance').select('student_id, status')
        .eq('teacher_id', me.id).eq('date', todayStr).eq('is_deleted', false),
    ]);
    setSessions((bookings || []).map((b: any) => ({
      booking_id: b.id,
      student_id: b.students?.id,
      student_name: b.students?.full_name ?? '—',
      start_time: b.availability_slots.start_time,
      end_time: b.availability_slots.end_time,
      attendance_status: (att || []).find((a: any) => a.student_id === b.students?.id)?.status ?? null,
    })).sort((a: Session, b: Session) => a.start_time.localeCompare(b.start_time)));
    setLoading(false);
  }, [weekday, todayStr]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const mark = async (s: Session, status: 'present' | 'absent' | 'late') => {
    if (!teacherId) return;
    const { error } = await supabase.from('session_attendance').upsert({
      booking_id: s.booking_id, student_id: s.student_id, teacher_id: teacherId,
      date: todayStr, status,
    }, { onConflict: 'student_id,date' });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  const ATT_BADGE: Record<string, { label: string; cls: string }> = {
    present: { label: 'حاضرة', cls: 'bg-success text-success-foreground' },
    absent: { label: 'غائبة', cls: 'bg-destructive text-destructive-foreground' },
    late: { label: 'متأخرة', cls: 'bg-warning text-warning-foreground' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Home className="text-accent" />
        <h1 className="text-2xl font-display">جلسات اليوم — {WEEKDAYS[weekday]}</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : sessions.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          لا جلسات لك اليوم. مواعيدك حسب مواعيد توفرك المحجوزة.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map(s => (
            <Card key={s.booking_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{s.student_name}</span>
                  <Badge variant="outline">{formatTime(s.start_time)} – {formatTime(s.end_time)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">الحضور:</span>
                  {s.attendance_status
                    ? <Badge className={ATT_BADGE[s.attendance_status]?.cls}>{ATT_BADGE[s.attendance_status]?.label}</Badge>
                    : <span className="text-sm text-muted-foreground">لم يُسجل</span>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => mark(s, 'present')}><Check size={14} /> حاضرة</Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => mark(s, 'late')}><Clock size={14} /> متأخرة</Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => mark(s, 'absent')}><X size={14} /> غائبة</Button>
                </div>
                <Button asChild size="sm" className="w-full gap-1">
                  <Link to="/teacher/tasmee"><Mic size={14} /> سجّلي التسميع</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
