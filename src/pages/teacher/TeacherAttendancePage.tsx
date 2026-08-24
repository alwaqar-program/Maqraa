import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ClipboardCheck, Save } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { ATTENDANCE_REASONS } from '@/lib/circles';

// تحضير المسمعة — نفس آلية «تسجيل حضور حلقة» في صفحة الإدارة لكن لحلقاتها فقط:
// اختيار الحلقة والتاريخ (بأثر رجعي)، تعبئة الحالات الموجودة مسبقًا للتعديل، وحفظ دفعة واحدة.
interface Circle { id: string; number: number; weekday: number; start_time: string; end_time: string; }
interface MemberRow { student_id: string; student_name: string; }
interface LogRow { id: string; date: string; status: string; reason: string | null; student_name: string; }

// حضور أخضر — تعويض برتقالي — غياب أصفر
const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'حضور', cls: 'bg-success text-success-foreground' },
  makeup: { label: 'تعويض', cls: 'bg-orange-500 text-white' },
  absent: { label: 'غياب', cls: 'bg-yellow-400 text-yellow-950' },
  late: { label: 'متأخرة (قديم)', cls: 'bg-muted text-muted-foreground' },
};

export default function TeacherAttendancePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [circleId, setCircleId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [recState, setRecState] = useState<Record<string, { status: string; reason: string }>>({});
  const [absCount, setAbsCount] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const [{ data: cs }, { data: allAbs }, { data: logRows }] = await Promise.all([
      supabase.from('circles').select('id, number, weekday, start_time, end_time')
        .eq('teacher_id', me.id).eq('is_active', true).order('number'),
      supabase.from('session_attendance').select('student_id')
        .eq('teacher_id', me.id).eq('status', 'absent').eq('is_deleted', false).range(0, 9999),
      supabase.from('session_attendance')
        .select('id, date, status, reason, students(full_name)')
        .eq('teacher_id', me.id).eq('is_deleted', false)
        .order('date', { ascending: false }).limit(200),
    ]);
    setCircles(cs || []);
    if ((cs || []).length === 1) setCircleId(cs![0].id);
    const counts: Record<string, number> = {};
    (allAbs || []).forEach((a: any) => { counts[a.student_id] = (counts[a.student_id] ?? 0) + 1; });
    setAbsCount(counts);
    setLogs((logRows || []).map((r: any) => ({ ...r, student_name: r.students?.full_name ?? '—' })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // تحميل كشف الحلقة لتاريخ معيّن — الحالات المسجلة مسبقًا تُعبَّأ للتعديل
  const loadSheet = useCallback(async (cId: string, d: string) => {
    if (!cId || !d) return;
    const [{ data: ms }, { data: existing }] = await Promise.all([
      supabase.from('circle_members')
        .select('student_id, students(full_name, status)')
        .eq('circle_id', cId),
      supabase.from('session_attendance').select('student_id, status, reason')
        .eq('date', d).eq('is_deleted', false),
    ]);
    const list = (ms || [])
      .filter((m: any) => m.students && m.students.status === 'active')
      .map((m: any) => ({ student_id: m.student_id, student_name: m.students?.full_name ?? '—' }));
    setMembers(list);
    const st: Record<string, { status: string; reason: string }> = {};
    list.forEach(m => {
      const ex = (existing || []).find((e: any) => e.student_id === m.student_id);
      st[m.student_id] = { status: ex?.status ?? '', reason: ex?.reason ?? '' };
    });
    setRecState(st);
  }, []);
  useEffect(() => { loadSheet(circleId, date); }, [circleId, date, loadSheet]);

  const saveSheet = async () => {
    if (!teacherId || !circleId) return;
    const entries = members
      .filter(m => recState[m.student_id]?.status)
      .map(m => ({
        student_id: m.student_id,
        teacher_id: teacherId,
        circle_id: circleId,
        date,
        status: recState[m.student_id].status,
        reason: recState[m.student_id].status === 'present' ? null : (recState[m.student_id].reason || null),
      }));
    if (!entries.length) { toast({ title: 'لم تحددي حالة لأي طالبة', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('session_attendance')
      .upsert(entries, { onConflict: 'student_id,date' });
    setSaving(false);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    const circle = circles.find(c => c.id === circleId);
    toast({ title: `حُفظ تحضير الحلقة ${circle?.number ?? ''} ليوم ${date} — ${entries.length} طالبة` });
    fetchAll();
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="text-accent" />
        <h1 className="text-2xl font-display">التحضير</h1>
      </div>

      <p className="text-sm text-muted-foreground">
        اختاري الحلقة والتاريخ — يمكنك التحضير بأثر رجعي لأي يوم سابق، وتعديل أي حالة مسجلة بإعادة اختيارها ثم الحفظ.
      </p>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">تحضير حلقة</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 min-w-56">
              <Label>الحلقة</Label>
              <Select value={circleId} onValueChange={setCircleId}>
                <SelectTrigger><SelectValue placeholder="اختاري الحلقة" /></SelectTrigger>
                <SelectContent>
                  {circles.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      حلقة {c.number} ({WEEKDAYS[c.weekday]} {formatTime(c.start_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {circleId && (
            members.length === 0
              ? <p className="text-sm text-muted-foreground">لا طالبات في هذه الحلقة.</p>
              : (
                <div className="space-y-2">
                  {members.map(m => {
                    const st = recState[m.student_id] ?? { status: '', reason: '' };
                    const set = (patch: Partial<{ status: string; reason: string }>) =>
                      setRecState({ ...recState, [m.student_id]: { ...st, ...patch } });
                    const n = absCount[m.student_id] ?? 0;
                    return (
                      <div key={m.student_id} className="flex items-center gap-2 flex-wrap border rounded-lg px-3 py-2">
                        <span className="font-medium text-sm min-w-40">{m.student_name}</span>
                        {n > 0 && <Badge variant="outline" className="text-yellow-600 border-yellow-400">غياب {n}</Badge>}
                        <span className="mr-auto flex items-center gap-1.5 flex-wrap">
                          {(['present', 'makeup', 'absent'] as const).map(k => (
                            <button key={k} type="button"
                              onClick={() => set({ status: k, ...(k === 'present' ? { reason: '' } : {}) })}
                              className={`rounded-full px-3.5 py-1 text-xs font-medium border transition-colors ${
                                st.status === k ? STATUS[k].cls + ' border-transparent'
                                : 'border-border text-muted-foreground hover:border-foreground/40'}`}>
                              {STATUS[k].label}
                            </button>
                          ))}
                          {(st.status === 'absent' || st.status === 'makeup') && (
                            <Select value={st.reason || undefined} onValueChange={v => set({ reason: v })}>
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
                  <Button className="gap-1" onClick={saveSheet} disabled={saving}>
                    <Save size={15} /> {saving ? '...' : 'حفظ التحضير'}
                  </Button>
                </div>
              )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">سجل تحضيراتك الأخيرة</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">لا تحضيرات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>السبب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell><Badge className={STATUS[r.status]?.cls}>{STATUS[r.status]?.label ?? r.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
