import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileBarChart, Download } from 'lucide-react';
import { exportToCsv, CsvColumnDef } from '@/lib/csv-utils';

interface ReportRow {
  student_id: string;
  full_name: string;
  track_name: string;
  quota_pages: number;
  self_pages: number;
  teacher_pages: number;
  sessions: number;
  avg_score: number | null;
  quota_pct: number;
  khatmah_equiv: number;
  absences: number;
}

const csvColumns: CsvColumnDef[] = [
  { key: 'full_name', header: 'الطالبة' },
  { key: 'track_name', header: 'المسار' },
  { key: 'quota_pages', header: 'نصاب الفصل' },
  { key: 'teacher_pages', header: 'صفحات التسميع' },
  { key: 'self_pages', header: 'صفحات السرد' },
  { key: 'sessions', header: 'الجلسات' },
  { key: 'avg_score', header: 'متوسط الدرجة' },
  { key: 'quota_pct', header: 'نسبة الإنجاز %' },
  { key: 'khatmah_equiv', header: 'ختمات مكافئة' },
  { key: 'absences', header: 'الغيابات' },
];

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const run = useCallback(async () => {
    setLoading(true);
    // كل التقارير بفلتر فترة من–إلى (مطلب معتمد)
    const [{ data: students, error }, { data: selfLogs }, { data: tasmee }, { data: att }] = await Promise.all([
      supabase.from('students').select('id, full_name, tracks(name, quota_pages_per_season)').eq('is_active', true),
      supabase.from('self_recitation_log').select('student_id, pages').gte('date', from).lte('date', to).eq('is_deleted', false),
      supabase.from('teacher_recitation_log').select('student_id, pages, score').gte('date', from).lte('date', to).eq('is_deleted', false),
      supabase.from('session_attendance').select('student_id, status, is_excused').gte('date', from).lte('date', to).eq('is_deleted', false),
    ]);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); setLoading(false); return; }

    setRows((students || []).map((s: any) => {
      const mySelf = (selfLogs || []).filter((x: any) => x.student_id === s.id);
      const myTasmee = (tasmee || []).filter((x: any) => x.student_id === s.id);
      const myAbs = (att || []).filter((x: any) => x.student_id === s.id && x.status === 'absent' && !x.is_excused).length;
      const selfPages = mySelf.reduce((a: number, x: any) => a + Number(x.pages || 0), 0);
      const teacherPages = myTasmee.reduce((a: number, x: any) => a + Number(x.pages || 0), 0);
      const quota = Number(s.tracks?.quota_pages_per_season ?? 0);
      return {
        student_id: s.id,
        full_name: s.full_name,
        track_name: s.tracks?.name ?? '—',
        quota_pages: quota,
        self_pages: Math.round(selfPages * 100) / 100,
        teacher_pages: Math.round(teacherPages * 100) / 100,
        sessions: myTasmee.length,
        avg_score: myTasmee.length
          ? Math.round((myTasmee.reduce((a: number, x: any) => a + Number(x.score || 0), 0) / myTasmee.length) * 100) / 100
          : null,
        quota_pct: quota ? Math.round((teacherPages / quota) * 1000) / 10 : 0,
        khatmah_equiv: Math.round(((selfPages + teacherPages) / 604) * 100) / 100,
        absences: myAbs,
      };
    }).sort((a, b) => b.quota_pct - a.quota_pct));
    setLoading(false);
  }, [from, to, toast]);
  useEffect(() => { run(); }, [run]);

  const totals = {
    teacherPages: Math.round(rows.reduce((a, r) => a + r.teacher_pages, 0)),
    selfPages: Math.round(rows.reduce((a, r) => a + r.self_pages, 0)),
    khatmah: Math.round(rows.reduce((a, r) => a + r.khatmah_equiv, 0) * 100) / 100,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileBarChart className="text-accent" />
        <h1 className="text-2xl font-display">التقارير</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>من</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>إلى</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <Button variant="outline" className="gap-1"
          onClick={() => exportToCsv(rows, csvColumns, `تقرير-المقرأة-${from}-إلى-${to}.csv`)}>
          <Download size={16} /> تصدير CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        {[
          { label: 'أوجه التسميع', value: totals.teacherPages },
          { label: 'أوجه السرد', value: totals.selfPages },
          { label: 'ختمات مكافئة', value: totals.khatmah },
        ].map(x => (
          <Card key={x.label}><CardContent className="pt-5 text-center">
            <p className="text-3xl font-display text-primary">{x.value}</p>
            <p className="text-sm text-muted-foreground">{x.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead>تسميع</TableHead>
                  <TableHead>سرد</TableHead>
                  <TableHead>جلسات</TableHead>
                  <TableHead>متوسط الدرجة</TableHead>
                  <TableHead>الإنجاز %</TableHead>
                  <TableHead>ختمات</TableHead>
                  <TableHead>غيابات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.student_id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.track_name}</TableCell>
                    <TableCell>{r.teacher_pages}</TableCell>
                    <TableCell>{r.self_pages}</TableCell>
                    <TableCell>{r.sessions}</TableCell>
                    <TableCell>{r.avg_score ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={r.quota_pct >= 100 ? 'default' : 'outline'}
                        className={r.quota_pct >= 100 ? 'bg-success text-success-foreground' : ''}>
                        {r.quota_pct}%
                      </Badge>
                    </TableCell>
                    <TableCell>{r.khatmah_equiv}</TableCell>
                    <TableCell>
                      {r.absences >= 3
                        ? <Badge variant="destructive">{r.absences}</Badge>
                        : r.absences}
                    </TableCell>
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
