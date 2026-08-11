import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Users } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';

interface Row {
  student_id: string;
  full_name: string;
  track_name: string | null;
  quota: number;
  weekday: number;
  start_time: string;
  tasmee_pages: number;
  sessions: number;
  avg_score: number | null;
  absences: number;
  last_date: string | null;
}

export default function TeacherStudentsPage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);

    const [{ data: bookings, error }, { data: logs }, { data: att }] = await Promise.all([
      supabase.from('bookings')
        .select('students(id, full_name, tracks(name, quota_pages_per_season)), availability_slots!inner(teacher_id, weekday, start_time)')
        .eq('status', 'active').eq('availability_slots.teacher_id', me.id),
      supabase.from('teacher_recitation_log')
        .select('student_id, pages, score, date')
        .eq('teacher_id', me.id).eq('is_deleted', false),
      supabase.from('session_attendance')
        .select('student_id, status, is_excused')
        .eq('teacher_id', me.id).eq('is_deleted', false),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });

    setRows((bookings || []).map((b: any) => {
      const st = b.students;
      const myLogs = (logs || []).filter((l: any) => l.student_id === st?.id);
      const pages = myLogs.reduce((a: number, l: any) => a + Number(l.pages || 0), 0);
      const lastDate = myLogs.map((l: any) => l.date).sort().pop() ?? null;
      return {
        student_id: st?.id,
        full_name: st?.full_name ?? '—',
        track_name: st?.tracks?.name ?? null,
        quota: Number(st?.tracks?.quota_pages_per_season ?? 0),
        weekday: b.availability_slots.weekday,
        start_time: b.availability_slots.start_time,
        tasmee_pages: Math.round(pages * 100) / 100,
        sessions: myLogs.length,
        avg_score: myLogs.length
          ? Math.round((myLogs.reduce((a: number, l: any) => a + Number(l.score || 0), 0) / myLogs.length) * 100) / 100
          : null,
        absences: (att || []).filter((a: any) => a.student_id === st?.id && a.status === 'absent' && !a.is_excused).length,
        last_date: lastDate,
      };
    }).filter(r => r.student_id));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="text-accent" />
        <h1 className="text-2xl font-display">طالباتي</h1>
        <Badge variant="outline">{rows.length}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا طالبات محجوزات معك بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead>موعدها</TableHead>
                  <TableHead>إنجاز النصاب</TableHead>
                  <TableHead>جلسات</TableHead>
                  <TableHead>متوسط الدرجة</TableHead>
                  <TableHead>غيابات</TableHead>
                  <TableHead>آخر تسميع</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const pct = r.quota ? Math.min(100, Math.round((r.tasmee_pages / r.quota) * 100)) : null;
                  return (
                    <TableRow key={r.student_id}>
                      <TableCell className="font-medium">{r.full_name}</TableCell>
                      <TableCell>{r.track_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{WEEKDAYS[r.weekday]} {formatTime(r.start_time)}</TableCell>
                      <TableCell className="min-w-36">
                        {pct !== null ? (
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-2 w-24" />
                            <span className="text-xs">{r.tasmee_pages}/{r.quota}</span>
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{r.sessions}</TableCell>
                      <TableCell>{r.avg_score ?? '—'}</TableCell>
                      <TableCell>
                        {r.absences >= 3 ? <Badge variant="destructive">{r.absences}</Badge> : r.absences}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.last_date ?? 'لم تُسمِّع بعد'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
