import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { History } from 'lucide-react';
import { surahNameOf } from '@/lib/mushaf';

interface LogRow {
  id: string; date: string;
  from_surah: number; from_verse: number; to_surah: number; to_verse: number;
  pages: number; score?: number; grade?: string; teacher_name?: string;
}

export default function HistoryPage() {
  const [selfRows, setSelfRows] = useState<LogRow[]>([]);
  const [tasmeeRows, setTasmeeRows] = useState<LogRow[]>([]);
  const [attendance, setAttendance] = useState<{ id: string; date: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
      if (!me) { setLoading(false); return; }
      const [{ data: self }, { data: tasmee }, { data: att }] = await Promise.all([
        supabase.from('self_recitation_log')
          .select('id, date, from_surah, from_verse, to_surah, to_verse, pages')
          .eq('student_id', me.id).eq('is_deleted', false).order('date', { ascending: false }).limit(100),
        supabase.from('teacher_recitation_log')
          .select('id, date, from_surah, from_verse, to_surah, to_verse, pages, score, grade, teachers(full_name)')
          .eq('student_id', me.id).eq('is_deleted', false).order('date', { ascending: false }).limit(100),
        supabase.from('session_attendance')
          .select('id, date, status')
          .eq('student_id', me.id).eq('is_deleted', false).order('date', { ascending: false }).limit(100),
      ]);
      setSelfRows((self || []) as LogRow[]);
      setTasmeeRows((tasmee || []).map((r: any) => ({ ...r, teacher_name: r.teachers?.full_name })));
      setAttendance(att || []);
      setLoading(false);
    })();
  }, []);

  const range = (r: LogRow) =>
    `${surahNameOf(r.from_surah)} ${r.from_verse} ← ${surahNameOf(r.to_surah)} ${r.to_verse}`;
  const ATT_LABEL: Record<string, string> = { present: 'حاضرة', absent: 'غائبة', late: 'متأخرة' };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <History className="text-accent" />
        <h1 className="text-2xl font-display">سجلي</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <Tabs defaultValue="tasmee" dir="rtl">
          <TabsList>
            <TabsTrigger value="tasmee">التسميع ({tasmeeRows.length})</TabsTrigger>
            <TabsTrigger value="self">السرد الذاتي ({selfRows.length})</TabsTrigger>
            <TabsTrigger value="attendance">الحضور ({attendance.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="tasmee">
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>النطاق</TableHead>
                  <TableHead>الصفحات</TableHead><TableHead>الدرجة</TableHead>
                  <TableHead>التقدير</TableHead><TableHead>المسمعة</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {tasmeeRows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="whitespace-nowrap">{range(r)}</TableCell>
                      <TableCell>{r.pages}</TableCell>
                      <TableCell>{r.score}</TableCell>
                      <TableCell><Badge variant={r.grade === 'ممتاز' ? 'default' : 'outline'}>{r.grade}</Badge></TableCell>
                      <TableCell>{r.teacher_name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="self">
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>النطاق</TableHead><TableHead>الصفحات</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {selfRows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="whitespace-nowrap">{range(r)}</TableCell>
                      <TableCell>{r.pages}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="attendance">
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {attendance.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'present' ? 'default' : r.status === 'absent' ? 'destructive' : 'outline'}>
                          {ATT_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
