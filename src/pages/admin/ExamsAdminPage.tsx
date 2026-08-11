import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, FileCheck } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import ExamForm, { ExamFormValue } from '@/components/exams/ExamForm';
import { EXAM_TYPES, examGradeText, gradeColors, scoreColor } from '@/lib/exams';

interface Exam {
  id: string; date: string; exam_type: string;
  error_count: number; lahn_count: number; segment_changes: number;
  total_score: number; max_score: number; notes: string | null;
  student_id: string; student_name: string; teacher_name: string | null;
}

const emptyForm = (): ExamFormValue => ({
  exam_type: 'weekly_1', date: new Date().toISOString().slice(0, 10),
  error_count: 0, lahn_count: 0, segment_changes: 0, notes: '',
});

export default function ExamsAdminPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [studentId, setStudentId] = useState('');
  const [form, setForm] = useState<ExamFormValue>(emptyForm());
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: sts }] = await Promise.all([
      supabase.from('exams')
        .select('id, date, exam_type, error_count, lahn_count, segment_changes, total_score, max_score, notes, student_id, students(full_name), teachers(full_name)')
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

  // منع التكرار: نفس الطالبة + نفس النوع (القيد الفريد في القاعدة يحسمها نهائيًا)
  const duplicate = !editing && !!studentId &&
    exams.some(x => x.student_id === studentId && x.exam_type === form.exam_type);

  const openCreate = () => { setEditing(null); setStudentId(''); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (x: Exam) => {
    setEditing(x);
    setStudentId(x.student_id);
    setForm({
      exam_type: x.exam_type, date: x.date, error_count: x.error_count,
      lahn_count: x.lahn_count, segment_changes: x.segment_changes, notes: x.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!studentId) { toast({ title: 'اختاري الطالبة', variant: 'destructive' }); return; }
    if (duplicate) { toast({ title: 'هذه الطالبة أدت هذا الاختبار مسبقًا', variant: 'destructive' }); return; }
    const payload = {
      student_id: studentId, exam_type: form.exam_type, date: form.date,
      error_count: form.error_count, lahn_count: form.lahn_count,
      segment_changes: form.segment_changes, notes: form.notes || null,
    };
    const q = editing
      ? supabase.from('exams').update(payload).eq('id', editing.id)
      : supabase.from('exams').insert(payload);
    const { error } = await q;
    if (error) {
      const msg = error.message.includes('one_exam_type_per_student_season')
        ? 'هذه الطالبة أدت هذا الاختبار مسبقًا في هذا الفصل' : error.message;
      toast({ title: 'خطأ', description: msg, variant: 'destructive' }); return;
    }
    toast({ title: editing ? 'تم تحديث الاختبار' : 'سُجّل الاختبار' });
    setDialogOpen(false);
    fetchAll();
  };

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Exam) => unknown; type: SortType }> = {
    date: { get: r => r.date, type: 'date' },
    student: { get: r => r.student_name, type: 'text' },
    type: { get: r => EXAM_TYPES[r.exam_type], type: 'text' },
    errors: { get: r => r.error_count, type: 'number' },
    lahn: { get: r => r.lahn_count, type: 'number' },
    changes: { get: r => r.segment_changes, type: 'number' },
    score: { get: r => r.total_score / r.max_score, type: 'number' },
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
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : exams.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا اختبارات مسجلة بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="التاريخ" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الطالبة" sortKey="student" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="النوع" sortKey="type" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الأخطاء" sortKey="errors" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="اللحون" sortKey="lahn" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="تغيير المقطع" sortKey="changes" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الدرجة" sortKey="score" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>التقدير</TableHead>
                  <TableHead>المسجّلة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(x => {
                  const grade = examGradeText(x.total_score, x.max_score);
                  return (
                    <TableRow key={x.id}>
                      <TableCell>{x.date}</TableCell>
                      <TableCell className="font-medium">{x.student_name}</TableCell>
                      <TableCell>{EXAM_TYPES[x.exam_type] ?? x.exam_type}</TableCell>
                      <TableCell>{x.error_count}</TableCell>
                      <TableCell>{x.lahn_count}</TableCell>
                      <TableCell>{x.segment_changes}</TableCell>
                      <TableCell className={scoreColor(x.total_score, x.max_score)}>
                        <span className="font-bold">{x.total_score}</span>
                        <span className="text-xs text-muted-foreground"> / {x.max_score}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={gradeColors[grade] || ''}>{grade}</Badge></TableCell>
                      <TableCell>{x.teacher_name ?? 'الإدارة'}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(x)}><Pencil size={16} /></Button></TableCell>
                    </TableRow>
                  );
                })}
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
              <SearchableSelect options={students} value={studentId}
                onValueChange={setStudentId} placeholder="اختاري الطالبة" disabled={!!editing} />
            </div>
            <ExamForm value={form} onChange={setForm} duplicate={duplicate} />
            <Button className="w-full" onClick={handleSave} disabled={duplicate}>
              {editing ? 'حفظ التعديل' : 'تسجيل'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
