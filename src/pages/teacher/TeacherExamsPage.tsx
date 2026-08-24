import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileCheck } from 'lucide-react';
import ExamForm, { ExamFormValue } from '@/components/exams/ExamForm';
import { EXAM_TYPES, examGradeText, gradeColors, scoreColor } from '@/lib/exams';

interface Exam {
  id: string; date: string; exam_type: string;
  error_count: number; lahn_count: number; segment_changes: number;
  total_score: number; max_score: number;
  student_id: string; student_name: string;
}

const emptyForm = (): ExamFormValue => ({
  exam_type: 'weekly_1', date: new Date().toISOString().slice(0, 10),
  error_count: 0, lahn_count: 0, segment_changes: 0, notes: '',
});

export default function TeacherExamsPage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [studentId, setStudentId] = useState('');
  const [form, setForm] = useState<ExamFormValue>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const [{ data: circles }, { data: rows }] = await Promise.all([
      supabase.from('circles')
        .select('circle_members(students(id, full_name, status))')
        .eq('teacher_id', me.id).eq('is_active', true),
      supabase.from('exams')
        .select('id, date, exam_type, error_count, lahn_count, segment_changes, total_score, max_score, student_id, students(full_name)')
        .eq('teacher_id', me.id).eq('is_deleted', false)
        .order('date', { ascending: false }).limit(100),
    ]);
    setStudents((circles || [])
      .flatMap((c: any) => (c.circle_members || []).map((m: any) => m.students))
      .filter((s: any) => s && s.status === 'active')
      .map((s: any) => ({ id: s.id, full_name: s.full_name }))
      .sort((a: { full_name: string }, b: { full_name: string }) => a.full_name.localeCompare(b.full_name, 'ar')));
    setExams((rows || []).map((r: any) => ({ ...r, student_name: r.students?.full_name ?? '—' })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const duplicate = !!studentId && exams.some(x => x.student_id === studentId && x.exam_type === form.exam_type);

  const save = async () => {
    if (!teacherId || !studentId) { toast({ title: 'اختاري الطالبة', variant: 'destructive' }); return; }
    if (duplicate) { toast({ title: 'هذه الطالبة أدت هذا الاختبار مسبقًا', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('exams').insert({
      student_id: studentId, teacher_id: teacherId, exam_type: form.exam_type, date: form.date,
      error_count: form.error_count, lahn_count: form.lahn_count,
      segment_changes: form.segment_changes, notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes('one_exam_type_per_student_season')
        ? 'هذه الطالبة أدت هذا الاختبار مسبقًا في هذا الفصل' : error.message;
      toast({ title: 'تعذر الحفظ', description: msg, variant: 'destructive' }); return;
    }
    toast({ title: 'سُجّل الاختبار' });
    setForm(emptyForm());
    fetchAll();
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileCheck className="text-accent" />
        <h1 className="text-2xl font-display">الاختبارات</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base font-body">تسجيل اختبار</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>الطالبة</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="اختاري الطالبة" /></SelectTrigger>
              <SelectContent>
                {students.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ExamForm value={form} onChange={setForm} duplicate={duplicate} />
          <Button className="w-full" onClick={save} disabled={saving || duplicate}>{saving ? '...' : 'تسجيل'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">اختباراتك السابقة</CardTitle></CardHeader>
        <CardContent>
          {exams.length === 0 ? <p className="text-muted-foreground text-center py-4">لا اختبارات بعد.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>الطالبة</TableHead>
                <TableHead>النوع</TableHead><TableHead>الأخطاء</TableHead>
                <TableHead>اللحون</TableHead><TableHead>الدرجة</TableHead><TableHead>التقدير</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exams.map(x => {
                  const grade = examGradeText(x.total_score, x.max_score);
                  return (
                    <TableRow key={x.id}>
                      <TableCell>{x.date}</TableCell>
                      <TableCell>{x.student_name}</TableCell>
                      <TableCell>{EXAM_TYPES[x.exam_type] ?? x.exam_type}</TableCell>
                      <TableCell>{x.error_count}</TableCell>
                      <TableCell>{x.lahn_count}</TableCell>
                      <TableCell className={scoreColor(x.total_score, x.max_score)}>
                        <span className="font-bold">{x.total_score}</span>
                        <span className="text-xs text-muted-foreground"> / {x.max_score}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={gradeColors[grade] || ''}>{grade}</Badge></TableCell>
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
