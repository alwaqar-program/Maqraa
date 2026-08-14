import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
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
import { ClipboardCheck, Search, AlertTriangle, Save } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { ATTENDANCE_REASONS } from '@/lib/circles';

interface LogRow {
  id: string; date: string; status: string; reason: string | null;
  student_id: string; student_name: string; teacher_name: string; notes: string | null;
}
interface Circle {
  id: string; number: number; teacher_id: string; weekday: number;
  start_time: string; end_time: string; teacher_name?: string;
}
interface MemberRow { student_id: string; student_name: string; }
interface Alert {
  student_id: string; full_name: string; season_id: string | null;
  absences: number; circle_number: number | null; action_taken: string | null;
}

// حضور أخضر — تعويض برتقالي — غياب أصفر
const STATUS: Record<string, { label: string; cls: string }> = {
  present: { label: 'حضور', cls: 'bg-success text-success-foreground' },
  makeup: { label: 'تعويض', cls: 'bg-orange-500 text-white' },
  absent: { label: 'غياب', cls: 'bg-yellow-400 text-yellow-950' },
  late: { label: 'متأخرة (قديم)', cls: 'bg-muted text-muted-foreground' },
};

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

export default function AttendanceAdminPage() {
  const [from, setFrom] = useUrlState('from', monthStart());
  const [to, setTo] = useUrlState('to', new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useUrlState('q');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [absCount, setAbsCount] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [actionDraft, setActionDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  // تسجيل حضور حلقة
  const [circles, setCircles] = useState<Circle[]>([]);
  const [recCircle, setRecCircle] = useState('');
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));
  const [recMembers, setRecMembers] = useState<MemberRow[]>([]);
  const [recState, setRecState] = useState<Record<string, { status: string; reason: string }>>({});
  const [recSaving, setRecSaving] = useState(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: allAbs }, { data: alertRows }, { data: cs }] = await Promise.all([
      supabase.from('session_attendance')
        .select('id, date, status, reason, notes, student_id, students(full_name), teachers(full_name)')
        .gte('date', from).lte('date', to).eq('is_deleted', false)
        .order('date', { ascending: false }).limit(500),
      // عداد الغياب الكلي (كل الفترة، لا يتأثر بفلتر التاريخ)
      supabase.from('session_attendance')
        .select('student_id').eq('status', 'absent').eq('is_deleted', false).range(0, 9999),
      supabase.from('v_absence_alerts').select('*'),
      supabase.from('circles').select('*, teachers(full_name)').eq('is_active', true).order('number'),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setRows((data || []).map((r: any) => ({
      ...r, student_name: r.students?.full_name ?? '—', teacher_name: r.teachers?.full_name ?? '—',
    })));
    const counts: Record<string, number> = {};
    (allAbs || []).forEach((a: any) => { counts[a.student_id] = (counts[a.student_id] ?? 0) + 1; });
    setAbsCount(counts);
    setAlerts(alertRows || []);
    setActionDraft(Object.fromEntries((alertRows || []).map((a: any) => [a.student_id, a.action_taken ?? ''])));
    setCircles((cs || []).map((c: any) => ({ ...c, teacher_name: c.teachers?.full_name })));
    setLoading(false);
  }, [from, to, toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---------- تسجيل حضور حلقة ----------
  const loadCircleSheet = useCallback(async (circleId: string, date: string) => {
    if (!circleId) return;
    const [{ data: ms }, { data: existing }] = await Promise.all([
      supabase.from('circle_members').select('student_id, students(full_name)').eq('circle_id', circleId),
      supabase.from('session_attendance').select('student_id, status, reason')
        .eq('date', date).eq('is_deleted', false),
    ]);
    const list = (ms || []).map((m: any) => ({ student_id: m.student_id, student_name: m.students?.full_name ?? '—' }));
    setRecMembers(list);
    const st: Record<string, { status: string; reason: string }> = {};
    list.forEach(m => {
      const ex = (existing || []).find((e: any) => e.student_id === m.student_id);
      st[m.student_id] = { status: ex?.status ?? '', reason: ex?.reason ?? '' };
    });
    setRecState(st);
  }, []);
  useEffect(() => { loadCircleSheet(recCircle, recDate); }, [recCircle, recDate, loadCircleSheet]);

  const saveSheet = async () => {
    const circle = circles.find(c => c.id === recCircle);
    if (!circle) return;
    const entries = recMembers
      .filter(m => recState[m.student_id]?.status)
      .map(m => ({
        student_id: m.student_id,
        teacher_id: circle.teacher_id,
        circle_id: circle.id,
        date: recDate,
        status: recState[m.student_id].status,
        reason: recState[m.student_id].status === 'present' ? null : (recState[m.student_id].reason || null),
      }));
    if (!entries.length) { toast({ title: 'لم تحددي حالة لأي طالبة', variant: 'destructive' }); return; }
    setRecSaving(true);
    const { error } = await supabase.from('session_attendance')
      .upsert(entries, { onConflict: 'student_id,date' });
    setRecSaving(false);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `حُفظ حضور الحلقة ${circle.number} — ${entries.length} طالبة` });
    fetchAll();
  };

  const saveAction = async (a: Alert) => {
    const action = (actionDraft[a.student_id] ?? '').trim();
    if (!action) { toast({ title: 'اكتبي الإجراء أولًا', variant: 'destructive' }); return; }
    const { error } = await supabase.from('absence_actions').upsert({
      student_id: a.student_id, season_id: a.season_id, action, updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,season_id' });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: 'حُفظ الإجراء المتخذ' }); fetchAll(); }
  };

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: LogRow) => unknown; type: SortType }> = {
    date: { get: r => r.date, type: 'date' },
    student: { get: r => r.student_name, type: 'text' },
    teacher: { get: r => r.teacher_name, type: 'text' },
    status: { get: r => r.status, type: 'text' },
  };
  let filtered = rows.filter(r => !search || r.student_name.includes(search));
  if (sortKey && SORTS[sortKey]) filtered = sortRows(filtered, SORTS[sortKey].get, sortDir, SORTS[sortKey].type);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="text-accent" />
        <h1 className="text-2xl font-display">الحضور والغياب</h1>
      </div>

      {/* تنبيهات: غيابان فأكثر → إجراء متخذ */}
      {alerts.length > 0 && (
        <Card className="border-yellow-400/60">
          <CardContent className="pt-5 space-y-3">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle size={17} className="text-yellow-500" />
              طالبات بلغن غيابين فأكثر ({alerts.length}) — يلزم إجراء
            </p>
            {alerts.map(a => (
              <div key={`${a.student_id}-${a.season_id}`} className="flex items-center gap-2 flex-wrap border-b last:border-0 pb-2 text-sm">
                <b>{a.full_name}</b>
                <Badge className={STATUS.absent.cls}>غياب {a.absences}</Badge>
                {a.circle_number && <span className="text-muted-foreground">حلقة {a.circle_number}</span>}
                <span className="mr-auto flex items-center gap-1.5 min-w-64 flex-1 sm:flex-none">
                  <Input className="h-8 text-sm" placeholder="الإجراء المتخذ..."
                    value={actionDraft[a.student_id] ?? ''}
                    onChange={e => setActionDraft({ ...actionDraft, [a.student_id]: e.target.value })} />
                  <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => saveAction(a)}>
                    <Save size={13} /> حفظ
                  </Button>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* تسجيل حضور حلقة */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">تسجيل حضور حلقة</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 min-w-56">
              <Label>الحلقة</Label>
              <Select value={recCircle} onValueChange={setRecCircle}>
                <SelectTrigger><SelectValue placeholder="اختاري الحلقة" /></SelectTrigger>
                <SelectContent>
                  {circles.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      حلقة {c.number} — {c.teacher_name} ({WEEKDAYS[c.weekday]} {formatTime(c.start_time)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} />
            </div>
          </div>

          {recCircle && (
            recMembers.length === 0
              ? <p className="text-sm text-muted-foreground">لا طالبات في هذه الحلقة.</p>
              : (
                <div className="space-y-2">
                  {recMembers.map(m => {
                    const st = recState[m.student_id] ?? { status: '', reason: '' };
                    const set = (patch: Partial<{ status: string; reason: string }>) =>
                      setRecState({ ...recState, [m.student_id]: { ...st, ...patch } });
                    const n = absCount[m.student_id] ?? 0;
                    return (
                      <div key={m.student_id} className="flex items-center gap-2 flex-wrap border rounded-lg px-3 py-2">
                        <span className="font-medium text-sm min-w-40">{m.student_name}</span>
                        {n > 0 && <Badge variant="outline" className="text-yellow-600 border-yellow-400">غياب {n}</Badge>}
                        <span className="mr-auto flex items-center gap-1.5 flex-wrap">
                          {(['present', 'makeup', 'absent'] as const).map(k => (
                            <button key={k} type="button"
                              onClick={() => set({ status: k, ...(k === 'present' ? { reason: '' } : {}) })}
                              className={`rounded-full px-3.5 py-1 text-xs font-medium border transition-colors ${
                                st.status === k ? STATUS[k].cls + ' border-transparent'
                                : 'border-border text-muted-foreground hover:border-foreground/40'}`}>
                              {STATUS[k].label}
                            </button>
                          ))}
                          {(st.status === 'absent' || st.status === 'makeup') && (
                            <Select value={st.reason || undefined} onValueChange={v => set({ reason: v })}>
                              <SelectTrigger className="h-7 w-32 text-xs">
                                <SelectValue placeholder={st.status === 'absent' ? 'سبب الغياب' : 'سبب التعويض'} />
                              </SelectTrigger>
                              <SelectContent>
                                {ATTENDANCE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </span>
                      </div>
                    );
                  })}
                  <Button className="gap-1" onClick={saveSheet} disabled={recSaving}>
                    <Save size={15} /> {recSaving ? '...' : 'حفظ حضور الحلقة'}
                  </Button>
                </div>
              )
          )}
        </CardContent>
      </Card>

      {/* السجل */}
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
        <Badge variant="outline" className="mb-1">{filtered.length} سجل</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="التاريخ" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الطالبة" sortKey="student" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="المسمعة" sortKey="teacher" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الحالة" sortKey="status" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>السبب</TableHead>
                  <TableHead>عداد الغياب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell>{r.teacher_name}</TableCell>
                    <TableCell><Badge className={STATUS[r.status]?.cls}>{STATUS[r.status]?.label ?? r.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.reason ?? r.notes ?? '—'}</TableCell>
                    <TableCell>
                      {r.status === 'absent'
                        ? <Badge variant="outline" className="text-yellow-600 border-yellow-400">غياب {absCount[r.student_id] ?? 1}</Badge>
                        : '—'}
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
