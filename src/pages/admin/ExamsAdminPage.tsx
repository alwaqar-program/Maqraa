import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useUrlState } from '@/lib/use-url-state';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, FileCheck } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface Exam {
  id: string; date: string; title: string;
  score: number; max_score: number; notes: string | null;
  student_id: string; student_name: string; teacher_name: string | null;
}

export default function ExamsAdminPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState({
    student_id: '', title: '', date: new Date().toISOString().slice(0, 10),
    score: 0, max_score: 100, notes: '',
  });
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: sts }] = await Promise.all([
      supabase.from('exams')
        .select('id, date, title, score, max_score, notes, student_id, students(full_name), teachers(full_name)')
        .eq('is_deleted', false).order('date', { ascending: false }).limit(300),
      supabase.from('students').select('id, full_name').eq('is_active', true).order('full_name'),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setExams((rows || []).map((r: any) => ({
      ...r, student_name: r.students?.full_name ?? '—', teacher_name: r.teachers?.full_name ?? null,
    })));
    setStudents((sts || []).map((s: any) => ({ value: s.id, label: s.full_name })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ student_id: '', title: '', date: new Date().toISOString().slice(0, 10), score: 0, max_score: 100, notes: '' });
    setDialogOpen(true);
  };
  const openEdit = (x: Exam) => {
    setEditing(x);
    setForm({ student_id: x.student_id, title: x.title, date: x.date, score: x.score, max_score: x.max_score, notes: x.notes ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.student_id || !form.title.trim()) { toast({ title: 'الطالبة وعنوان الاختبار مطلوبان', variant: 'destructive' }); return; }
    if (form.score > form.max_score) { toast({ title: 'الدرجة أكبر من الدرجة العظمى', variant: 'destructive' }); return; }
    const payload = {
      student_id: form.student_id, title: form.title, date: form.date,
      score: form.score, max_score: form.max_score, notes: form.notes || null,
    };
    const q = editing
      ? supabase.from('exams').update(payload).eq('id', editing.id)
      : supabase.from('exams').insert(payload);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث الاختبار' : 'سُجّل الاختبار' });
    setDialogOpen(false);
    fetchAll();
  };

  const pct = (x: Exam) => Math.round((x.score / x.max_score) * 100);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Exam) => unknown; type: SortType }> = {
    date: { get: r => r.date, type: 'date' },
    student: { get: r => r.student_name, type: 'text' },
    title: { get: r => r.title, type: 'text' },
    score: { get: r => r.score / r.max_score, type: 'number' },
  };
  const sorted = sortKey && SORTS[sortKey]
    ? sortRows(exams, SORTS[sortKey].get, sortDir, SORTS[sortKey].type)
    : exams;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="text-accent" />
          <h1 className="text-2xl font-display">الاختبارات</h1>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> اختبار جديد</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : exams.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا اختبارات مسجلة بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="التاريخ" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الطالبة" sortKey="student" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الاختبار" sortKey="title" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الدرجة" sortKey="score" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>النسبة</TableHead>
                  <TableHead>المسجّلة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(x => (
                  <TableRow key={x.id}>
                    <TableCell>{x.date}</TableCell>
                    <TableCell className="font-medium">{x.student_name}</TableCell>
                    <TableCell>{x.title}</TableCell>
                    <TableCell>{x.score} / {x.max_score}</TableCell>
                    <TableCell>
                      <Badge variant={pct(x) >= 90 ? 'default' : 'outline'}
                        className={pct(x) >= 90 ? 'bg-success text-success-foreground' : ''}>
                        {pct(x)}%
                      </Badge>
                    </TableCell>
                    <TableCell>{x.teacher_name ?? 'الإدارة'}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(x)}><Pencil size={16} /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل الاختبار' : 'اختبار جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الطالبة</Label>
              <SearchableSelect options={students} value={form.student_id}
                onValueChange={v => setForm({ ...form, student_id: v })} placeholder="اختاري الطالبة" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عنوان الاختبار</Label>
                <Input placeholder="مثال: اختبار الأجزاء ١–٥" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الدرجة</Label>
                <Input type="number" min={0} value={form.score} onChange={e => setForm({ ...form, score: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>الدرجة العظمى</Label>
                <Input type="number" min={1} value={form.max_score} onChange={e => setForm({ ...form, max_score: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'تسجيل'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
