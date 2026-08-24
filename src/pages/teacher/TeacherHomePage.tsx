import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Home, Mic, Play, Square } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { ATTENDANCE_REASONS } from '@/lib/circles';

interface Member { student_id: string; student_name: string; time: string | null; }
interface CircleToday { id: string; number: number; start_time: string; end_time: string; members: Member[]; }
interface Checkin { id: string; circle_id: string; started_at: string; ended_at: string | null; minutes: number | null; }

const clockOf = (ts: string) =>
  new Date(ts).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });

// حضور أخضر — تعويض برتقالي — غياب أصفر (كصفحة الحضور)
const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'حضور', cls: 'bg-success text-success-foreground' },
  makeup: { label: 'تعويض', cls: 'bg-orange-500 text-white' },
  absent: { label: 'غياب', cls: 'bg-yellow-400 text-yellow-950' },
};

export default function TeacherHomePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [circles, setCircles] = useState<CircleToday[]>([]);
  const [checkins, setCheckins] = useState<Record<string, Checkin>>({});
  const [attState, setAttState] = useState<Record<string, { status: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const today = new Date();
  const weekday = today.getDay(); // 0=الأحد يطابق ترقيمنا
  const todayStr = today.toISOString().slice(0, 10);

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const [{ data: cs, error }, { data: att }, { data: cks }] = await Promise.all([
      supabase.from('circles')
        .select('id, number, start_time, end_time, circle_members(student_id, start_time, students(id, full_name, status))')
        .eq('teacher_id', me.id).eq('is_active', true).eq('weekday', weekday)
        .order('start_time'),
      supabase.from('session_attendance').select('student_id, status, reason')
        .eq('teacher_id', me.id).eq('date', todayStr).eq('is_deleted', false),
      supabase.from('teacher_checkins').select('id, circle_id, started_at, ended_at, minutes')
        .eq('teacher_id', me.id).eq('date', todayStr),
    ]);
    setCheckins(Object.fromEntries((cks || []).map((c: any) => [c.circle_id, c])));
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setCircles((cs || []).map((c: any) => ({
      id: c.id, number: c.number, start_time: c.start_time, end_time: c.end_time,
      members: (c.circle_members || [])
        .filter((m: any) => m.students && m.students.status === 'active')
        .map((m: any) => ({
          student_id: m.students.id,
          student_name: m.students.full_name,
          time: m.start_time,
        }))
        .sort((a: Member, b: Member) => (a.time ?? '').localeCompare(b.time ?? '')),
    })));
    const st: Record<string, { status: string; reason: string }> = {};
    (att || []).forEach((a: any) => { st[a.student_id] = { status: a.status, reason: a.reason ?? '' }; });
    setAttState(st);
    setLoading(false);
  }, [weekday, todayStr, toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async (circleId: string, studentId: string, status: string, reason: string) => {
    if (!teacherId) return;
    const { error } = await supabase.from('session_attendance').upsert({
      student_id: studentId, teacher_id: teacherId, circle_id: circleId,
      date: todayStr, status,
      reason: status === 'present' ? null : (reason || null),
    }, { onConflict: 'student_id,date' });
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    setAttState(prev => ({ ...prev, [studentId]: { status, reason: status === 'present' ? '' : reason } }));
  };

  // تسجيل بدء الحلقة (check-in)
  const startCircle = async (circleId: string) => {
    if (!teacherId) return;
    const { data, error } = await supabase.from('teacher_checkins')
      .insert({ teacher_id: teacherId, circle_id: circleId, date: todayStr })
      .select('id, circle_id, started_at, ended_at, minutes').single();
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    setCheckins(prev => ({ ...prev, [circleId]: data as Checkin }));
    toast({ title: 'سُجّل بدء الحلقة' });
  };

  // تسجيل انتهاء الحلقة (check-out)
  const endCircle = async (circleId: string) => {
    const ck = checkins[circleId];
    if (!ck) return;
    const { data, error } = await supabase.from('teacher_checkins')
      .update({ ended_at: new Date().toISOString() }).eq('id', ck.id)
      .select('id, circle_id, started_at, ended_at, minutes').single();
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    setCheckins(prev => ({ ...prev, [circleId]: data as Checkin }));
    toast({ title: 'سُجّل انتهاء الحلقة' });
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Home className="text-accent" />
        <h1 className="text-2xl font-display">حلقات اليوم — {WEEKDAYS[weekday]}</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : circles.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          لا حلقات لك اليوم.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {circles.map(c => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>حلقة {c.number}</span>
                  <Badge variant="outline">{formatTime(c.start_time)} – {formatTime(c.end_time)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(() => {
                  const ck = checkins[c.id];
                  if (!ck) return (
                    <Button size="sm" className="w-full gap-1.5" onClick={() => startCircle(c.id)}>
                      <Play size={14} /> تسجيل بدء الحلقة
                    </Button>
                  );
                  if (!ck.ended_at) return (
                    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-success/40 bg-success/5 px-3 py-2">
                      <span className="text-sm">بدأتِ الساعة <b>{clockOf(ck.started_at)}</b> — الحلقة جارية</span>
                      <Button size="sm" variant="outline" className="mr-auto gap-1.5" onClick={() => endCircle(c.id)}>
                        <Square size={13} /> تسجيل انتهاء الحلقة
                      </Button>
                    </div>
                  );
                  return (
                    <p className="text-sm text-muted-foreground rounded-lg border px-3 py-2">
                      بدأت {clockOf(ck.started_at)} — انتهت {clockOf(ck.ended_at)} · المدة <b>{ck.minutes} دقيقة</b>
                    </p>
                  );
                })()}
                {c.members.length === 0 && <p className="text-sm text-muted-foreground">لا طالبات في هذه الحلقة.</p>}
                {c.members.map(m => {
                  const st = attState[m.student_id] ?? { status: '', reason: '' };
                  return (
                    <div key={m.student_id} className="flex items-center gap-2 flex-wrap border rounded-lg px-3 py-2">
                      <span className="font-medium text-sm min-w-36">{m.student_name}</span>
                      {m.time && <Badge variant="outline" className="text-muted-foreground">{formatTime(m.time)}</Badge>}
                      <span className="mr-auto flex items-center gap-1.5 flex-wrap">
                        {(['present', 'makeup', 'absent'] as const).map(k => (
                          <button key={k} type="button"
                            onClick={() => save(c.id, m.student_id, k, st.reason)}
                            className={`rounded-full px-3.5 py-1 text-xs font-medium border transition-colors ${
                              st.status === k ? STATUS[k].cls + ' border-transparent'
                              : 'border-border text-muted-foreground hover:border-foreground/40'}`}>
                            {STATUS[k].label}
                          </button>
                        ))}
                        {(st.status === 'absent' || st.status === 'makeup') && (
                          <Select value={st.reason || undefined} onValueChange={v => save(c.id, m.student_id, st.status, v)}>
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue placeholder={st.status === 'absent' ? 'سبب الغياب' : 'سبب التعويض'} />
                            </SelectTrigger>
                            <SelectContent>
                              {ATTENDANCE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </span>
                    </div>
                  );
                })}
                <Button asChild size="sm" className="w-full gap-1 mt-2">
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
