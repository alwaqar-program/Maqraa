import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useUrlState } from '@/lib/use-url-state';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Check, X, MessageSquareText } from 'lucide-react';
import { WEEKDAYS } from '@/lib/schedule';
import { supabase as sb } from '@/integrations/supabase/client';
import { FormQuestion } from '@/lib/form-settings';
import { answerText } from '@/components/forms/ExtraQuestions';
import { exportToCsv, CsvColumnDef } from '@/lib/csv-utils';
import { Download } from 'lucide-react';

interface Applicant {
  id: string;
  full_name: string;
  phone: string;
  national_id: string | null;
  track_id: string | null;
  track_name?: string;
  preferred_days: number[];
  preferred_slots?: string[];
  preferred_period: string | null;
  suggestions: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  extra_answers: Record<string, any>;
  student_id: string | null;
}

const STATUS_LABEL: Record<string, string> = { pending: 'بانتظار المراجعة', accepted: 'مقبولة', rejected: 'مرفوضة' };

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [extraQs, setExtraQs] = useState<FormQuestion[]>([]);
  const [tab, setTab] = useUrlState('tab', 'pending');
  const [action, setAction] = useState<{ a: Applicant; type: 'accept' | 'reject' } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('applicants')
      .select('*, tracks(name)')
      .order('created_at'); // الأسبقية بالتسجيل
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setApplicants((data || []).map((r: any) => ({ ...r, track_name: r.tracks?.name, extra_answers: r.extra_answers ?? {} })));
    const { data: qs } = await sb.from('form_questions').select('*')
      .eq('form_key', 'student_register').order('sort_order');
    setExtraQs((qs || []) as FormQuestion[]);
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const doAction = async () => {
    if (!action) return;
    const { a, type } = action;
    setAction(null);
    if (type === 'accept') {
      // القبول = إنشاء ملف طالبة مربوط بمسارها (حساب الدخول يُنشأ من صفحة المستخدمين)
      const { data: student, error: stErr } = await supabase.from('students').insert({
        full_name: a.full_name, national_id: a.national_id || `APP-${a.id.slice(0, 8)}`,
        phone: a.phone, track_id: a.track_id,
      }).select('id').single();
      if (stErr) { toast({ title: 'تعذر إنشاء الطالبة', description: stErr.message, variant: 'destructive' }); return; }
      const { error } = await supabase.from('applicants')
        .update({ status: 'accepted', student_id: student.id, reviewed_at: new Date().toISOString() })
        .eq('id', a.id);
      if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
      toast({ title: `قُبلت ${a.full_name} وأُنشئ ملفها — أكملي رقم هويتها من صفحة الطالبات` });
    } else {
      const { error } = await supabase.from('applicants')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', a.id);
      if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
      toast({ title: 'رُفض الطلب' });
    }
    fetchAll();
  };

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Applicant) => unknown; type: SortType }> = {
    name: { get: r => r.full_name, type: 'text' },
    nid: { get: r => r.national_id, type: 'text' },
    track: { get: r => r.track_name, type: 'text' },
    created: { get: r => r.created_at, type: 'date' },
  };
  let filtered = applicants.filter(a => a.status === tab);
  if (sortKey && SORTS[sortKey]) filtered = sortRows(filtered, SORTS[sortKey].get, sortDir, SORTS[sortKey].type);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserPlus className="text-accent" />
        <h1 className="text-2xl font-display">المتقدمات</h1>
        <Badge variant="outline">{applicants.filter(a => a.status === 'pending').length} بانتظار المراجعة</Badge>
        <Button variant="outline" size="sm" className="gap-1 mr-auto" onClick={() => {
          const cols: CsvColumnDef[] = [
            { key: 'full_name', header: 'الاسم' },
            { key: 'national_id', header: 'الهوية' },
            { key: 'phone', header: 'الجوال' },
            { key: 'track_name', header: 'المسار' },
            { key: 'days_text', header: 'الأيام' },
            { key: 'period_text', header: 'الفترة' },
            { key: 'suggestions', header: 'ملاحظات' },
            { key: 'status', header: 'الحالة' },
            { key: 'created_at', header: 'سُجّل في', transform: v => String(v).slice(0, 10) },
            ...extraQs.map(q => ({ key: `q_${q.id}`, header: q.label })),
          ];
          exportToCsv(filtered.map(a => ({
            ...a,
            days_text: a.preferred_slots?.length ? a.preferred_slots.map((sl, i) => `${i + 1}) ${sl}`).join(' · ') : (a.preferred_days || []).map(d => WEEKDAYS[d]).join('، '),
            period_text: a.preferred_period === 'morning' ? 'صباح' : a.preferred_period === 'evening' ? 'مساء' : '',
            ...Object.fromEntries(extraQs.map(q => [`q_${q.id}`, answerText(a.extra_answers[q.id])])),
          })), cols, 'متقدمات-المقرأة.csv');
        }}>
          <Download size={14} /> CSV
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <TabsTrigger key={k} value={k}>
              {v} ({applicants.filter(a => a.status === k).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا طلبات في هذه الفئة.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <SortableHead label="الاسم" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الهوية" sortKey="nid" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>الجوال</TableHead>
                  <SortableHead label="المسار" sortKey="track" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>المواعيد (بالأولوية)</TableHead>
                  <TableHead>الفترة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  {extraQs.filter(q => q.is_active).map(q => <TableHead key={q.id}>{q.label}</TableHead>)}
                  <SortableHead label="سُجّل في" sortKey="created" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  {tab === 'pending' && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a, i) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{a.full_name}</TableCell>
                    <TableCell dir="ltr">{a.national_id ?? '—'}</TableCell>
                    <TableCell dir="ltr">{a.phone}</TableCell>
                    <TableCell>{a.track_name ?? '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {a.preferred_slots?.length
                        ? a.preferred_slots.map((sl, i) => `${i + 1}) ${sl}`).join(' · ')
                        : (a.preferred_days || []).map(d => WEEKDAYS[d]).join('، ') || '—'}
                    </TableCell>
                    <TableCell>{a.preferred_period === 'morning' ? 'صباح' : a.preferred_period === 'evening' ? 'مساء' : '—'}</TableCell>
                    <TableCell>
                      {a.suggestions
                        ? <span title={a.suggestions}><MessageSquareText size={16} className="text-info" /></span>
                        : '—'}
                    </TableCell>
                    {extraQs.filter(q => q.is_active).map(q => (
                      <TableCell key={q.id} className="text-sm">{answerText(a.extra_answers[q.id])}</TableCell>
                    ))}
                    <TableCell className="text-sm text-muted-foreground">{a.created_at.slice(0, 10)}</TableCell>
                    {tab === 'pending' && (
                      <TableCell className="whitespace-nowrap">
                        <Button size="sm" variant="outline" className="gap-1 ml-2"
                          onClick={() => setAction({ a, type: 'accept' })}>
                          <Check size={14} /> قبول
                        </Button>
                        <Button size="sm" variant="ghost" className="gap-1 text-destructive"
                          onClick={() => setAction({ a, type: 'reject' })}>
                          <X size={14} /> رفض
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!action} onOpenChange={open => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.type === 'accept' ? 'قبول الطالبة' : 'رفض الطلب'}</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.type === 'accept'
                ? `سيُنشأ ملف طالبة لـ«${action?.a.full_name}» في مسار ${action?.a.track_name ?? '—'} — حساب الدخول يُنشأ لاحقًا من صفحة المستخدمين.`
                : `سيُرفض طلب «${action?.a.full_name}» — يمكنك التراجع بتغيير حالته لاحقًا.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={doAction}>{action?.type === 'accept' ? 'قبول' : 'رفض'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
