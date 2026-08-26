import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { ClearFilters } from '@/components/ui/clear-filters';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useUrlState } from '@/lib/use-url-state';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Timer, Save } from 'lucide-react';
import { SuperDeleteButton, useSuperAdmin } from '@/components/ui/super-delete';

// دوام المسمعات — تتبع بدء/انتهاء الحلقات (check-in/out) لمديرة النظام:
// سجل مفصل + مجموع الوقت لكل مسمعة في الفترة + حساب المكافأة بأجر الساعة.
interface Row {
  id: string; date: string; started_at: string; ended_at: string | null; minutes: number | null;
  teacher_id: string; teacher_name: string; circle_number: number | null;
}

const ALL = '__all__';

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
const clockOf = (ts: string) =>
  new Date(ts).toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
/** 95 → «1:35» */
const hoursLabel = (mins: number) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

export default function TeacherTimePage() {
  const [from, setFrom] = useUrlState('from', monthStart());
  const [to, setTo] = useUrlState('to', new Date().toISOString().slice(0, 10));
  const [teacherFilter, setTeacherFilter] = useUrlState('teacher', ALL);
  const [rows, setRows] = useState<Row[]>([]);
  const [rate, setRate] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isSuper = useSuperAdmin();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: setting }] = await Promise.all([
      supabase.from('teacher_checkins')
        .select('id, date, started_at, ended_at, minutes, teacher_id, teachers(full_name), circles(number)')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false }).order('started_at', { ascending: false })
        .range(0, 9999),
      supabase.from('app_settings').select('value').eq('key', 'teacher_hour_rate').maybeSingle(),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setRows((data || []).map((r: any) => ({
      ...r,
      teacher_name: r.teachers?.full_name ?? '—',
      circle_number: r.circles?.number ?? null,
    })));
    if (setting?.value && setting.value !== '0') setRate(setting.value);
    setLoading(false);
  }, [from, to, toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const deleteRow = async (r: Row) => {
    const { error } = await supabase.from('teacher_checkins').delete().eq('id', r.id);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'حُذف سجل الدوام' });
    fetchAll();
  };

  const saveRate = async () => {
    setSavingRate(true);
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'teacher_hour_rate', value: rate.trim() || '0', updated_at: new Date().toISOString() });
    setSavingRate(false);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else toast({ title: 'حُفظ أجر الساعة' });
  };

  const teachers = useMemo(() =>
    [...new Map(rows.map(r => [r.teacher_id, r.teacher_name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ar')), [rows]);

  const filtered = useMemo(() =>
    teacherFilter === ALL ? rows : rows.filter(r => r.teacher_id === teacherFilter), [rows, teacherFilter]);

  // مجموع كل مسمعة في الفترة + مكافأتها = الساعات × أجر الساعة
  const rateNum = parseFloat(rate) || 0;
  const totals = useMemo(() => {
    const acc: Record<string, { name: string; minutes: number; sessions: number; open: number }> = {};
    filtered.forEach(r => {
      const t = acc[r.teacher_id] ?? (acc[r.teacher_id] = { name: r.teacher_name, minutes: 0, sessions: 0, open: 0 });
      t.sessions += 1;
      if (r.minutes == null) t.open += 1;
      else t.minutes += r.minutes;
    });
    return Object.values(acc).sort((a, b) => b.minutes - a.minutes);
  }, [filtered]);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Row) => unknown; type: SortType }> = {
    date: { get: r => r.date, type: 'date' },
    teacher: { get: r => r.teacher_name, type: 'text' },
    circle: { get: r => r.circle_number, type: 'number' },
    minutes: { get: r => r.minutes ?? -1, type: 'number' },
  };
  const sorted = sortKey && SORTS[sortKey] ? sortRows(filtered, SORTS[sortKey].get, sortDir, SORTS[sortKey].type) : filtered;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Timer className="text-accent" />
        <h1 className="text-2xl font-display">دوام المسمعات</h1>
        <ClearFilters />
      </div>

      <p className="text-sm text-muted-foreground">
        المسمعة تسجل بدء الحلقة وانتهاءها من صفحتها، والمدة تُحسب تلقائيًا — المكافأة = مجموع الساعات × أجر الساعة.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1"><Label>من</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-1 min-w-44">
          <Label>المسمعة</Label>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>الكل</SelectItem>
              {teachers.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>أجر الساعة (ريال)</Label>
          <div className="flex items-center gap-1.5">
            <Input type="number" min={0} step="0.5" className="w-28" value={rate}
              onChange={e => setRate(e.target.value)} placeholder="0" />
            <Button size="sm" variant="outline" className="gap-1" onClick={saveRate} disabled={savingRate}>
              <Save size={13} /> حفظ
            </Button>
          </div>
        </div>
      </div>

      {/* مجموع كل مسمعة في الفترة */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">المجاميع والمكافآت — من {from} إلى {to}</CardTitle></CardHeader>
        <CardContent>
          {totals.length === 0 ? <p className="text-muted-foreground text-center py-4">لا تسجيلات في هذه الفترة.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المسمعة</TableHead>
                  <TableHead>الفترات</TableHead>
                  <TableHead>مجموع الوقت (ساعة:دقيقة)</TableHead>
                  <TableHead>المكافأة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {totals.map(t => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.sessions}</TableCell>
                    <TableCell className="font-medium" dir="ltr">{hoursLabel(t.minutes)}</TableCell>
                    <TableCell>
                      {rateNum > 0
                        ? <b>{(Math.round((t.minutes / 60) * rateNum * 100) / 100).toLocaleString('ar-SA')} ريال</b>
                        : <span className="text-muted-foreground text-sm">حدّدي أجر الساعة</span>}
                    </TableCell>
                    <TableCell>
                      {t.open > 0 && <Badge variant="outline" className="text-yellow-600 border-yellow-400">{t.open} بلا انتهاء</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* السجل المفصل */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">السجل المفصل <Badge variant="outline" className="mr-1">{sorted.length}</Badge></CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="التاريخ" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="المسمعة" sortKey="teacher" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الحلقة" sortKey="circle" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>بدأت</TableHead>
                  <TableHead>انتهت</TableHead>
                  <SortableHead label="المدة (د)" sortKey="minutes" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  {isSuper && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-medium">{r.teacher_name}</TableCell>
                    <TableCell>{r.circle_number != null ? `حلقة ${r.circle_number}` : '—'}</TableCell>
                    <TableCell>{clockOf(r.started_at)}</TableCell>
                    <TableCell>
                      {r.ended_at ? clockOf(r.ended_at)
                        : <Badge variant="outline" className="text-yellow-600 border-yellow-400">جارية / لم تُنهَ</Badge>}
                    </TableCell>
                    <TableCell>{r.minutes ?? '—'}</TableCell>
                    {isSuper && (
                      <TableCell>
                        <SuperDeleteButton
                          title="حذف سجل دوام"
                          description={<>سيُحذف سجل دوام <b>{r.teacher_name}</b> بتاريخ {r.date} ({r.minutes != null ? `${r.minutes} دقيقة` : 'بلا انتهاء'}).</>}
                          onConfirm={() => deleteRow(r)}
                        />
                      </TableCell>
                    )}
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
