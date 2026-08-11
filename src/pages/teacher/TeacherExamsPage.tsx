import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileCheck } from 'lucide-react';

interface Exam {
  id: string; date: string; title: string; score: number; max_score: number;
  student_name: string;
}

export default function TeacherExamsPage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; full_name: string }[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [form, setForm] = useState({
    student_id: '', title: '', date: new Date().toISOString().slice(0, 10),
    score: 0, max_score: 100, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const [{ data: bookings }, { data: rows }] = await Promise.all([
      supabase.from('bookings')
        .select('students(id, full_name), availability_slots!inner(teacher_id)')
        .eq('status', 'active').eq('availability_slots.teacher_id', me.id),
      supabase.from('exams')
        .select('id, date, title, score, max_score, students(full_name)')
        .eq('teacher_id', me.id).eq('is_deleted', false)
        .order('date', { ascending: false }).limit(100),
    ]);
    setStudents((bookings || []).map((b: any) => b.students).filter(Boolean));
    setExams((rows || []).map((r: any) => ({ ...r, student_name: r.students?.full_name ?? '—' })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    if (!teacherId || !form.student_id || !form.title.trim()) {
      toast({ title: 'الطالبة وعنوان الاختبار مطلوبان', variant: 'destructive' }); return;
    }
    if (form.score > form.max_score) { toast({ title: 'الدرجة أكبر من الدرجة العظمى', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('exams').insert({
      student_id: form.student_id, teacher_id: teacherId, title: form.title,
      date: form.date, score: form.score, max_score: form.max_score, notes: form.notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'سُجّل الاختبار' });
    setForm({ ...form, title: '', score: 0, notes: '' });
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
        <CardHeader><CardTitle className="text-base font-body">تسجيل اختبار لطالبة من حجوزاتك</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الطالبة</Label>
              <Select value={form.student_id} onValueChange={v => setForm({ ...form, student_id: v })}>
                <SelectTrigger><SelectValue placeholder="اختاري" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>عنوان الاختبار</Label>
            <Input placeholder="مثال: اختبار الأجزاء ١–٥" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
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
          <Button className="w-full" onClick={save} disabled={saving}>{saving ? '...' : 'تسجيل'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">اختباراتك السابقة</CardTitle></CardHeader>
        <CardContent>
          {exams.length === 0 ? <p className="text-muted-foreground text-center py-4">لا اختبارات بعد.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>الطالبة</TableHead>
                <TableHead>الاختبار</TableHead><TableHead>الدرجة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exams.map(x => (
                  <TableRow key={x.id}>
                    <TableCell>{x.date}</TableCell>
                    <TableCell>{x.student_name}</TableCell>
                    <TableCell>{x.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{x.score} / {x.max_score}</Badge>
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
