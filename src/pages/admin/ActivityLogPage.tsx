import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ClearFilters } from '@/components/ui/clear-filters';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUrlState } from '@/lib/use-url-state';
import { ScrollText, Search, Download, Eye, RotateCcw } from 'lucide-react';

interface LogRow {
  id: string; table_name: string; row_id: string; student_id: string | null;
  action: string; changes: Record<string, { old: unknown; new: unknown }> | null;
  auth_uid: string | null; date: string | null; created_at: string;
}

const PAGE = 100;

/** أسماء الجداول بالعربية — ما ليس هنا يُعرض باسمه التقني */
const TABLE_LABELS: Record<string, string> = {
  students: 'الطالبات',
  teachers: 'المسمعات',
  supervisors: 'المشرفات',
  tracks: 'المسارات',
  seasons: 'الفصول',
  circles: 'الحلقات',
  circle_members: 'عضوية الحلقات',
  availability_slots: 'مواعيد التوفر',
  applicants: 'المتقدمات',
  teacher_agreements: 'اتفاقيات المسمعات',
  session_attendance: 'الحضور',
  self_recitation_log: 'السرد الذاتي',
  teacher_recitation_log: 'التسميع',
  bookings: 'الحجوزات',
  exams: 'الاختبارات',
  absence_actions: 'إجراءات الغياب',
  pledges: 'التعهدات',
  suggestions: 'الاقتراحات',
  hostings: 'الاستضافات',
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  created: { label: 'إضافة', cls: 'bg-success text-success-foreground' },
  updated: { label: 'تعديل', cls: 'bg-info text-info-foreground' },
  deleted: { label: 'حذف', cls: 'bg-destructive text-destructive-foreground' },
  restored: { label: 'استرجاع', cls: 'bg-warning text-warning-foreground' },
};

/** أسماء الحقول بالعربية في نافذة التفاصيل */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'الاسم', national_id: 'رقم الهوية', phone: 'الجوال', email: 'البريد',
  track_id: 'المسار', is_active: 'نشطة', status: 'الحالة', status_date: 'تاريخ الحالة',
  status_reason: 'سبب الحالة', minutes: 'الدقائق', choice_rank: 'رقم الاختيار',
  circle_id: 'الحلقة', student_id: 'الطالبة', teacher_id: 'المسمعة', supervisor_id: 'المشرفة',
  start_time: 'من', end_time: 'إلى', weekday: 'اليوم', is_daily: 'دوري', number: 'الرقم',
  pages: 'الصفحات', from_surah: 'من سورة', from_verse: 'من آية', to_surah: 'إلى سورة',
  to_verse: 'إلى آية', score: 'الدرجة', grade: 'التقدير', mistakes: 'الأخطاء', lahn: 'اللحون',
  reason: 'السبب', notes: 'ملاحظات', action: 'الإجراء', date: 'التاريخ',
  meeting_link: 'رابط الاجتماع', color: 'اللون', seconds_per_page: 'ثواني الصفحة',
  quota_pages_per_season: 'نصاب الفصل', preferred_slots: 'المواعيد بالأولوية',
  preferred_period: 'الفترة الأنسب', sort_teacher_id: 'إسناد الفرز', sort_slot_label: 'موعد الفرز',
  is_deleted: 'محذوف', added_by: 'أُضيفت بواسطة', attendance_pledge: 'تعهد الحضور',
};

const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

/** سجل النشاط المركزي — كل إضافة وتعديل وحذف في النظام، بمن نفّذها ووقتها */
export default function ActivityLogPage() {
  const [params] = useSearchParams();
  const [from, setFrom] = useUrlState('from', monthStart());
  const [to, setTo] = useUrlState('to', new Date().toISOString().slice(0, 10));
  const [table, setTable] = useUrlState('t', 'all');
  const [action, setAction] = useUrlState('a', 'all');
  const [search, setSearch] = useUrlState('q');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<LogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const { toast } = useToast();
  const rowFilter = params.get('row');
  const studentFilter = params.get('student');

  // أسماء الطالبات والمسمعات وبريد المستخدمين — لعرض السجل بأسماء لا معرفات
  useEffect(() => {
    (async () => {
      const [{ data: st }, { data: tc }, { data: us }] = await Promise.all([
        supabase.from('students').select('id, full_name').range(0, 2999),
        supabase.from('teachers').select('id, full_name').range(0, 499),
        supabase.rpc('admin_list_users'),
      ]);
      const map: Record<string, string> = {};
      (st || []).forEach((s: any) => { map[s.id] = s.full_name; });
      (tc || []).forEach((t: any) => { map[t.id] = t.full_name; });
      setNames(map);
      const em: Record<string, string> = {};
      (us || []).forEach((u: any) => { em[u.id] = u.email; });
      setEmails(em);
    })();
  }, []);

  const fetchLogs = useCallback(async (nextPage = 0) => {
    setLoading(true);
    let q = supabase.from('activity_log').select('*')
      .gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`)
      .order('created_at', { ascending: false })
      .range(nextPage * PAGE, nextPage * PAGE + PAGE - 1);
    if (table !== 'all') q = q.eq('table_name', table);
    if (action !== 'all') q = q.eq('action', action);
    if (rowFilter) q = q.eq('row_id', rowFilter);
    if (studentFilter) q = q.eq('student_id', studentFilter);
    const { data, error } = await q;
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    const batch = (data || []) as LogRow[];
    setRows(prev => (nextPage === 0 ? batch : [...prev, ...batch]));
    setMore(batch.length === PAGE);
    setPage(nextPage);
    setLoading(false);
  }, [from, to, table, action, rowFilter, studentFilter, toast]);
  useEffect(() => { fetchLogs(0); }, [fetchLogs]);

  const nameOf = (id: string | null) => (id ? names[id] ?? `${id.slice(0, 8)}…` : '—');

  /** قيمة الحقل بصيغة مقروءة: معرفات → أسماء، أيام → أسماء، منطقي → نعم/لا */
  const fmt = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (field === 'weekday' && typeof v === 'number') return WEEKDAY_NAMES[v] ?? String(v);
    if (Array.isArray(v)) return v.length ? v.join(' · ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)) return names[s] ?? `${s.slice(0, 8)}…`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
    return s;
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim();
    return rows.filter(r =>
      nameOf(r.student_id).includes(q)
      || (TABLE_LABELS[r.table_name] ?? r.table_name).includes(q)
      || (r.auth_uid && (emails[r.auth_uid] ?? '').includes(q))
      || JSON.stringify(r.changes ?? {}).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, names, emails]);

  const exportCsv = () => {
    const head = ['التاريخ والوقت', 'الحدث', 'الجدول', 'الطالبة', 'من نفّذ', 'التغييرات'];
    const lines = filtered.map(r => [
      new Date(r.created_at).toLocaleString('ar-EG'),
      ACTION_LABELS[r.action]?.label ?? r.action,
      TABLE_LABELS[r.table_name] ?? r.table_name,
      nameOf(r.student_id),
      r.auth_uid ? emails[r.auth_uid] ?? r.auth_uid.slice(0, 8) : 'النظام',
      Object.entries(r.changes ?? {}).map(([k, v]: any) =>
        `${FIELD_LABELS[k] ?? k}: ${fmt(k, v.old)} → ${fmt(k, v.new)}`).join(' | '),
    ]);
    const csv = [head, ...lines].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `activity-log-${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="text-accent" />
          <h1 className="text-2xl font-display">سجل النشاط</h1>
          <Badge variant="outline">{filtered.length}{more ? '+' : ''}</Badge>
          <ClearFilters />
        </div>
        <Button variant="outline" className="gap-1" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={15} /> تصدير CSV
        </Button>
      </div>

      {(rowFilter || studentFilter) && (
        <p className="text-sm border border-accent/40 bg-accent/5 rounded-lg px-3 py-2 flex items-center gap-2">
          مُصفّى على {studentFilter ? `سجل ${nameOf(studentFilter)}` : 'صف واحد'}
          <Button variant="ghost" size="sm" className="gap-1 h-7"
            onClick={() => { window.location.href = '/activity-log'; }}>
            <RotateCcw size={13} /> إلغاء التصفية
          </Button>
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label>من</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label>إلى</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="space-y-1 min-w-44">
          <Label>الجدول</Label>
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الجداول</SelectItem>
              {Object.entries(TABLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-32">
          <Label>الحدث</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأحداث</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>بحث</Label>
          <div className="relative">
            <Search size={14} className="absolute right-2.5 top-3 text-muted-foreground" />
            <Input className="pr-8 w-48" placeholder="اسم أو بريد أو قيمة" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading && rows.length === 0 ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الوقت</TableHead>
                    <TableHead>الحدث</TableHead>
                    <TableHead>الجدول</TableHead>
                    <TableHead>الطالبة</TableHead>
                    <TableHead>من نفّذ</TableHead>
                    <TableHead>التغيير</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const changed = Object.keys(r.changes ?? {});
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(r.created_at).toLocaleString('ar-EG', {
                            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={ACTION_LABELS[r.action]?.cls}>{ACTION_LABELS[r.action]?.label ?? r.action}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{TABLE_LABELS[r.table_name] ?? r.table_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{nameOf(r.student_id)}</TableCell>
                        <TableCell className="text-xs" dir="ltr">
                          {r.auth_uid ? emails[r.auth_uid] ?? `${r.auth_uid.slice(0, 8)}…` : 'النظام'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-72">
                          {changed.length
                            ? changed.slice(0, 3).map(k => FIELD_LABELS[k] ?? k).join('، ') + (changed.length > 3 ? ` +${changed.length - 3}` : '')
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" title="تفاصيل" onClick={() => setDetail(r)}>
                            <Eye size={15} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا نشاط في هذه الفترة.</p>}
              {more && (
                <div className="text-center pt-4">
                  <Button variant="outline" onClick={() => fetchLogs(page + 1)} disabled={loading}>
                    {loading ? '...' : 'تحميل المزيد'}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail && <Badge className={ACTION_LABELS[detail.action]?.cls}>{ACTION_LABELS[detail.action]?.label}</Badge>}
              {detail && (TABLE_LABELS[detail.table_name] ?? detail.table_name)}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <p><span className="text-muted-foreground">الوقت:</span> {new Date(detail.created_at).toLocaleString('ar-EG')}</p>
                <p><span className="text-muted-foreground">من نفّذ:</span> <span dir="ltr">{detail.auth_uid ? emails[detail.auth_uid] ?? detail.auth_uid : 'النظام'}</span></p>
                <p><span className="text-muted-foreground">الطالبة:</span> {nameOf(detail.student_id)}</p>
                <p><span className="text-muted-foreground">معرّف الصف:</span> <span dir="ltr">{detail.row_id.slice(0, 8)}…</span></p>
              </div>
              {Object.keys(detail.changes ?? {}).length === 0 ? (
                <p className="text-muted-foreground">لا تفاصيل حقول لهذا الحدث.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>الحقل</TableHead><TableHead>قبل</TableHead><TableHead>بعد</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(detail.changes ?? {}).map(([k, v]: any) => (
                      <TableRow key={k}>
                        <TableCell className="font-medium whitespace-nowrap">{FIELD_LABELS[k] ?? k}</TableCell>
                        <TableCell className="text-muted-foreground">{fmt(k, v.old)}</TableCell>
                        <TableCell className="font-medium">{fmt(k, v.new)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
