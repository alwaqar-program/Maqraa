import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { BookOpen } from 'lucide-react';
import RangePicker from '@/components/recitation/RangePicker';
import { keyToDb, surahNameOf, nextVerseKey } from '@/lib/mushaf';

interface SardRow {
  id: string;
  date: string;
  from_surah: number; from_verse: number;
  to_surah: number; to_verse: number;
  pages: number;
  notes: string | null;
}

export default function SardPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [rows, setRows] = useState<SardRow[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
    if (!me) { setLoading(false); return; }
    setStudentId(me.id);
    const { data } = await supabase.from('self_recitation_log')
      .select('id, date, from_surah, from_verse, to_surah, to_verse, pages, notes')
      .eq('student_id', me.id).eq('is_deleted', false)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
      .limit(30);
    const list = (data || []) as SardRow[];
    setRows(list);
    // تعبئة تلقائية: «من» = الآية التالية لآخر «إلى»
    if (list.length > 0 && !fromKey) {
      setFromKey(nextVerseKey(list[0].to_surah, list[0].to_verse));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    if (!studentId) return;
    const from = keyToDb(fromKey);
    const to = keyToDb(toKey);
    if (!from || !to) { toast({ title: 'حدّدي نطاق السرد كاملًا', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('self_recitation_log').insert({
      student_id: studentId, date,
      from_surah: from.surah, from_verse: from.verse,
      to_surah: to.surah, to_verse: to.verse,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'سُجّل سردك — تقبل الله 🌿' });
    setFromKey(''); setToKey(''); setNotes('');
    fetchAll();
  };

  if (!loading && !studentId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف طالبة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BookOpen className="text-accent" />
        <h1 className="text-2xl font-display">سردي الذاتي</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle className="text-base font-body">سجّلي ما سردتِه اليوم</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-44">
            <Label>التاريخ</Label>
            <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)} />
          </div>
          <RangePicker fromKey={fromKey} toKey={toKey} onFromChange={setFromKey} onToChange={setToKey} />
          <div className="space-y-2">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? '...' : 'حفظ السرد'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">آخر سجلاتك</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">سجّلي أول سرد لك — «كان عمله ديمة» 🌿</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>الصفحات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell>{surahNameOf(r.from_surah)} {r.from_verse}</TableCell>
                    <TableCell>{surahNameOf(r.to_surah)} {r.to_verse}</TableCell>
                    <TableCell>{r.pages}</TableCell>
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
