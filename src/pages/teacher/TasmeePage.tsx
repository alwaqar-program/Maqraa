import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { useToast } from '@/hooks/use-toast';
import { Mic, BookOpen, Check, X, AlertCircle } from 'lucide-react';
import { allVerseOptions, globalIndexOfKey } from '@/lib/quran-verses';
import { keyToDb, surahNameOf } from '@/lib/mushaf';

// نفس آلية وتصميم صفحة التسميع في الوقار (RecitationForm): قائمة طالبات
// بحالات اليوم (سمّعت/غائبة)، اختيار بالنقر، ثم نموذج «سورة|آية» بحثي.
interface CircleStudent { id: string; full_name: string; }
interface TodayLog { student_id: string; to_surah: number; to_verse: number; pages: number | null; }

export default function TasmeePage() {
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [students, setStudents] = useState<CircleStudent[]>([]);
  const [todayLogs, setTodayLogs] = useState<TodayLog[]>([]);
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [errors, setErrors] = useState(0);
  const [lahn, setLahn] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchStudents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('teachers').select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!me) { setLoading(false); return; }
    setTeacherId(me.id);
    const { data: circles } = await supabase.from('circles')
      .select('circle_members(students(id, full_name, status))')
      .eq('teacher_id', me.id).eq('is_active', true);
    setStudents((circles || [])
      .flatMap((c: any) => (c.circle_members || []).map((m: any) => m.students))
      .filter((s: any) => s && s.status === 'active')
      .map((s: any) => ({ id: s.id, full_name: s.full_name ?? '—' }))
      .sort((a: CircleStudent, b: CircleStudent) => a.full_name.localeCompare(b.full_name, 'ar')));
    setLoading(false);
  }, []);
  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  // سجلات وغيابات اليوم المختار — تُلوِّن قائمة الطالبات وتمنع التسجيل للغائبة
  const refreshDay = useCallback(async () => {
    if (!teacherId) return;
    const [{ data: rec }, { data: att }] = await Promise.all([
      supabase.from('teacher_recitation_log')
        .select('student_id, to_surah, to_verse, pages')
        .eq('teacher_id', teacherId).eq('date', date).eq('is_deleted', false),
      supabase.from('session_attendance')
        .select('student_id, status')
        .eq('teacher_id', teacherId).eq('date', date).eq('is_deleted', false),
    ]);
    setTodayLogs(rec || []);
    setAbsentIds(new Set((att || []).filter((a: any) => a.status === 'absent').map((a: any) => a.student_id)));
  }, [teacherId, date]);
  useEffect(() => { refreshDay(); }, [refreshDay]);

  const recitedToday = (id: string) => todayLogs.some(r => r.student_id === id);
  const isAbsent = (id: string) => absentIds.has(id);
  const studentToday = (id: string) => todayLogs.filter(r => r.student_id === id);

  const verseOpts = useMemo(() => allVerseOptions(), []);
  const fromG = fromKey ? globalIndexOfKey(fromKey) : null;
  const toG = toKey ? globalIndexOfKey(toKey) : null;
  const orderOk = fromG == null || toG == null || fromG <= toG;

  const selectedStudent = students.find(s => s.id === selected);

  // تصفير النطاق والعدادات عند تبديل الطالبة
  useEffect(() => { setFromKey(''); setToKey(''); setErrors(0); setLahn(0); setNotes(''); }, [selected]);

  const save = async () => {
    if (!teacherId || !selected) { toast({ title: 'اختاري الطالبة', variant: 'destructive' }); return; }
    const from = keyToDb(fromKey);
    const to = keyToDb(toKey);
    if (!from || !to) { toast({ title: 'تنبيه', description: 'اختاري نطاق التسميع (من/إلى سورة وآية)', variant: 'destructive' }); return; }
    if (!orderOk) { toast({ title: 'تنبيه', description: 'بداية النطاق يجب أن تكون قبل نهايته في ترتيب المصحف', variant: 'destructive' }); return; }
    if (isAbsent(selected)) { toast({ title: 'تنبيه', description: 'لا يمكن تسجيل تسميع لطالبة غائبة', variant: 'destructive' }); return; }
    setSaving(true);
    const { error } = await supabase.from('teacher_recitation_log').insert({
      student_id: selected, teacher_id: teacherId, date,
      from_surah: from.surah, from_verse: from.verse,
      to_surah: to.surah, to_verse: to.verse,
      error_count: errors, lahn_count: lahn,
      notes: notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'تم حفظ التسميع' });
    setSelected('');
    refreshDay();
  };

  if (!loading && !teacherId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف مسمعة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Mic className="text-accent" />
        <h1 className="text-2xl font-display">تسجيل التسميع</h1>
        <div className="ms-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">تاريخ التسميع</Label>
          <Input type="date" className="w-40" value={date} max={new Date().toISOString().slice(0, 10)}
            onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">جارٍ التحميل…</CardContent></Card>
      ) : students.length === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-10 text-center">
          <BookOpen size={36} className="text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground text-sm">لا طالبات في حلقاتك بعد.</p>
        </CardContent></Card>
      ) : selected && selectedStudent ? (
        <Card>
          <CardContent className="py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BookOpen size={14} />
              </div>
              <p className="font-medium text-sm truncate">{selectedStudent.full_name}</p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => setSelected('')}>
              تغيير الطالبة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-2 max-h-[65vh] overflow-y-auto">
            {students.map(s => {
              const recited = recitedToday(s.id);
              const absent = isAbsent(s.id);
              const info = studentToday(s.id);
              const last = info[info.length - 1];
              return (
                <button key={s.id} onClick={() => !absent && setSelected(s.id)} disabled={absent}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-right ${
                    selected === s.id ? 'border-primary bg-primary/5'
                    : absent ? 'border-destructive/20 bg-destructive/5 opacity-60 cursor-not-allowed'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${recited ? 'bg-success/10 text-success' : absent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                      {recited ? <Check size={16} /> : absent ? <X size={16} /> : <BookOpen size={14} />}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.full_name}</p>
                      {info.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          سمّعت: {Math.round(info.reduce((sum, r) => sum + Number(r.pages || 0), 0) * 100) / 100} صفحات · آخر موضع {surahNameOf(last.to_surah)} آية {last.to_verse}
                        </p>
                      )}
                      {absent && <p className="text-xs text-destructive">غائبة هذا اليوم</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {recited && <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">سمّعت ✓</Badge>}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      {selectedStudent && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <p className="font-medium text-sm">تسجيل تسميع — {selectedStudent.full_name}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">من: سورة | رقم الآية *</Label>
                <SearchableSelect options={verseOpts} value={fromKey} onValueChange={setFromKey}
                  placeholder="السورة|الآية" searchPlaceholder="مثال: البقرة 5" maxVisible={100} allowClear />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">إلى: سورة | رقم الآية *</Label>
                <SearchableSelect options={verseOpts} value={toKey} onValueChange={setToKey}
                  placeholder="السورة|الآية" searchPlaceholder="مثال: البقرة 10" maxVisible={100} allowClear />
              </div>
            </div>
            {!orderOk && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/5 p-2 rounded">
                <AlertCircle size={16} /> بداية النطاق يجب أن تكون قبل نهايته في ترتيب المصحف
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">عدد الأخطاء <span className="text-muted-foreground">(−0.25)</span></Label>
                <NumberStepper value={errors} onChange={setErrors} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">عدد اللحون <span className="text-muted-foreground">(−0.25)</span></Label>
                <NumberStepper value={lahn} onChange={setLahn} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              الدرجة المتوقعة: <b>{Math.max(0, 20 - 0.25 * (errors + lahn))}</b> / 20
              {' — '}التقدير: <b>{(errors + lahn) <= 2 ? 'ممتاز' : (errors + lahn) <= 4 ? 'جيد جدًا' : (errors + lahn) <= 6 ? 'جيد' : 'ضعيف'}</b>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
            <Button onClick={save} disabled={saving || !orderOk} className="w-full">{saving ? 'جارٍ الحفظ…' : 'حفظ التسميع'}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
