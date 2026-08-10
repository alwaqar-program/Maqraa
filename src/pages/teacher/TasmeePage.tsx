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
import { Mic } from 'lucide-react';
import RangePicker from '@/components/recitation/RangePicker';
import { keyToDb, surahNameOf } from '@/lib/mushaf';

interface BookedStudent { id: string; full_name: string; booking_id: string; }
interface TasmeeRow {
  id: string; date: string; student_name: string;
  from_surah: number; from_verse: number; to_surah: number; to_verse: number;
  pages: number; lahn_jali_count: number; lahn_khafi_count: number;
  score: number; grade: string;
}

export default function TasmeePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<BookedStudent[]>([]);
  const [rows, setRows] = useState<TasmeeRow[]>([]);
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [jali, setJali] = useState(0);
  const [khafi, setKhafi] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: me } = await supabase.from('teachers').select('id').limit(1).maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);

    const [{ data: bookings }, { data: logs }] = await Promise.all([
      supabase.from('bookings')
        .select('id, students(id, full_name), availability_slots!inner(teacher_id)')
        .eq('status', 'active').eq('availability_slots.teacher_id', me.id),
      supabase.from('teacher_recitation_log')
        .select('id, date, from_surah, from_verse, to_surah, to_verse, pages, lahn_jali_count, lahn_khafi_count, score, grade, students(full_name)')
        .eq('teacher_id', me.id).eq('is_deleted', false)
        .order('date', { ascending: false }).limit(20),
    ]);
    setStudents((bookings || []).map((b: any) => ({
      id: b.students?.id, full_name: b.students?.full_name ?? '—', booking_id: b.id,
    })).filter((s: BookedStudent) => s.id));
    setRows((logs || []).map((r: any) => ({ ...r, student_name: r.students?.full_name ?? '—' })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    if (!teacherId || !studentId) { toast({ title: 'اختاري الطالبة', variant: 'destructive' }); return; }
    const from = keyToDb(fromKey);
    const to = keyToDb(toKey);
    if (!from || !to) { toast({ title: 'حدّدي نطاق التسميع كاملًا', variant: 'destructive' }); return; }
    setSaving(true);
    const booking = students.find(s => s.id === studentId)?.booking_id ?? null;
    const { error } = await supabase.from('teacher_recitation_log').insert({
      student_id: studentId, teacher_id: teacherId, booking_id: booking, date,
      from_surah: from.surah, from_verse: from.verse,
      to_surah: to.surah, to_verse: to.verse,
      lahn_jali_count: jali, lahn_khafi_count: khafi,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'سُجّل التسميع' });
    setFromKey(''); setToKey(''); setJali(0); setKhafi(0); setNotes('');
    fetchAll();
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mic className="text-accent" />
        <h1 className="text-2xl font-display">تسجيل التسميع</h1>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الطالبة</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="اختاري من طالبات حجوزاتك" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
                onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <RangePicker fromKey={fromKey} toKey={toKey} onFromChange={setFromKey} onToChange={setToKey} />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>ألحان جلية <span className="text-muted-foreground">(−0.5)</span></Label>
              <Input type="number" min={0} value={jali} onChange={e => setJali(Math.max(0, Number(e.target.value)))} />
            </div>
            <div className="space-y-2">
              <Label>ألحان خفية <span className="text-muted-foreground">(−0.25)</span></Label>
              <Input type="number" min={0} value={khafi} onChange={e => setKhafi(Math.max(0, Number(e.target.value)))} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            الدرجة المتوقعة: <b>{Math.max(0, 20 - 0.5 * jali - 0.25 * khafi)}</b> / 20
          </p>

          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <Button onClick={save} disabled={saving} className="w-full">{saving ? '...' : 'حفظ التسميع'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">آخر تسميعاتك</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">لا تسميعات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>النطاق</TableHead>
                  <TableHead>الصفحات</TableHead>
                  <TableHead>الدرجة</TableHead>
                  <TableHead>التقدير</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{r.student_name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {surahNameOf(r.from_surah)} {r.from_verse} ← {surahNameOf(r.to_surah)} {r.to_verse}
                    </TableCell>
                    <TableCell>{r.pages}</TableCell>
                    <TableCell>{r.score}</TableCell>
                    <TableCell><Badge variant={r.grade === 'ممتاز' ? 'default' : 'outline'}>{r.grade}</Badge></TableCell>
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
