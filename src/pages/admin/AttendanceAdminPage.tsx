import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ClipboardCheck, Search } from 'lucide-react';

interface Row {
  id: string; date: string; status: string; is_excused: boolean;
  student_name: string; teacher_name: string; notes: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'حاضرة', cls: 'bg-success text-success-foreground' },
  late: { label: 'متأخرة', cls: 'bg-warning text-warning-foreground' },
  absent: { label: 'غائبة', cls: 'bg-destructive text-destructive-foreground' },
};

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

export default function AttendanceAdminPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('session_attendance')
      .select('id, date, status, is_excused, notes, students(full_name), teachers(full_name)')
      .gte('date', from).lte('date', to).eq('is_deleted', false)
      .order('date', { ascending: false }).limit(500);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setRows((data || []).map((r: any) => ({
      ...r, student_name: r.students?.full_name ?? '—', teacher_name: r.teachers?.full_name ?? '—',
    })));
    setLoading(false);
  }, [from, to, toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = rows.filter(r => !search || r.student_name.includes(search));
  const absences = filtered.filter(r => r.status === 'absent').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="text-accent" />
        <h1 className="text-2xl font-display">سجل الحضور</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label>من</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>الطالبة</Label>
          <div className="relative">
            <Search size={14} className="absolute right-2.5 top-3 text-muted-foreground" />
            <Input className="pr-8 w-44" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Badge variant="outline" className="mb-1">{filtered.length} سجل — {absences} غياب</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>المسمعة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell>{r.teacher_name}</TableCell>
                    <TableCell>
                      <Badge className={STATUS[r.status]?.cls}>{STATUS[r.status]?.label ?? r.status}</Badge>
                      {r.is_excused && <Badge variant="outline" className="mr-1">بعذر</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.notes ?? '—'}</TableCell>
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
