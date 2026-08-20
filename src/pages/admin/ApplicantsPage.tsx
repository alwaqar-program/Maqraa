import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { UserPlus, Check, X, MessageSquareText, Eye, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WEEKDAYS } from '@/lib/schedule';
import { supabase as sb } from '@/integrations/supabase/client';
import { FormQuestion } from '@/lib/form-settings';
import { answerText } from '@/components/forms/ExtraQuestions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [search, setSearch] = useUrlState('q');
  const [trackFilter, setTrackFilter] = useUrlState('track', 'all');
  const [periodFilter, setPeriodFilter] = useUrlState('period', 'all');
  const [action, setAction] = useState<{ a: Applicant; type: 'accept' | 'reject' } | null>(null);
  const [viewing, setViewing] = useState<Applicant | null>(null);   // بطاقة تفاصيل المتقدمة
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('applicants')
      .select('*, tracks(name)')
      .order('created_at'); // الأسبقية بالتسجيل
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setApplicants((data || []).map((r: any) => ({ ...r, track_name: r.tracks?.name, extra_answers: r.extra_answers ?? {} })));
    const { data: qs } = await sb.from('form_questions').select('*')
      .eq('form_key', 'student_register').order('sort_order');
    // «النص الإرشادي» فقرة عرض بلا إجابة — لا عمود له في الجدول ولا في CSV
    setExtraQs(((qs || []) as FormQuestion[]).filter(q => q.qtype !== 'note'));
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
  const trackNames = [...new Set(applicants.map(a => a.track_name).filter(Boolean))] as string[];
  let filtered = applicants.filter(a => a.status === tab
    && (!search || a.full_name.includes(search) || (a.national_id ?? '').includes(search) || a.phone.includes(search))
    && (trackFilter === 'all' || a.track_name === trackFilter)
    && (periodFilter === 'all' || a.preferred_period === periodFilter));
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
            period_text: a.preferred_period === 'morning' ? 'صباح' : a.preferred_period === 'evening' ? 'مساء' : a.preferred_period === 'both' ? 'كلاهما' : '',
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

      {/* بحث وفلاتر — تُحفظ في الرابط */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={15} className="absolute right-3 top-3 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم أو الهوية أو الجوال"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={trackFilter} onValueChange={setTrackFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المسارات</SelectItem>
            {trackNames.map(t => <SelectItem key={t} value={t}>{t.split(/\s*(?=\()/)[0]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفترات</SelectItem>
            <SelectItem value="morning">صباح</SelectItem>
            <SelectItem value="evening">مساء</SelectItem>
            <SelectItem value="both">كلاهما</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{filtered.length} نتيجة</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">لا طلبات في هذه الفئة.</p>
          ) : (
            <Table className="[&_td]:py-2 [&_th]:whitespace-nowrap">
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <SortableHead label="الاسم" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead className="hidden lg:table-cell" label="الهوية" sortKey="nid" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>الجوال</TableHead>
                  <SortableHead label="المسار" sortKey="track" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead>المواعيد (بالأولوية)</TableHead>
                  <TableHead className="hidden lg:table-cell">الفترة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <SortableHead className="hidden lg:table-cell" label="سُجّل في" sortKey="created" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a, i) => (
                  <TableRow key={a.id}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button,a,input,[role="switch"],[role="checkbox"]')) return;
                      setViewing(a);
                    }}
                    className="cursor-pointer">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{a.full_name}</TableCell>
                    <TableCell dir="ltr" className="hidden lg:table-cell">{a.national_id ?? '—'}</TableCell>
                    <TableCell dir="ltr">{a.phone}</TableCell>
                    <TableCell className="whitespace-nowrap" title={a.track_name ?? undefined}>{a.track_name?.split(/\s*(?=\()/)[0] ?? '—'}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {a.preferred_slots?.length ? (
                        <>
                          {a.preferred_slots[0]}
                          {a.preferred_slots.length > 1 && (
                            <span className="mr-1.5 rounded-full border border-accent/50 bg-accent/10 px-1.5 text-xs">
                              +{a.preferred_slots.length - 1}
                            </span>
                          )}
                        </>
                      ) : (a.preferred_days || []).map(d => WEEKDAYS[d]).join('، ') || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{a.preferred_period === 'morning' ? 'صباح' : a.preferred_period === 'evening' ? 'مساء' : a.preferred_period === 'both' ? 'كلاهما' : '—'}</TableCell>
                    <TableCell>
                      {a.suggestions ? <MessageSquareText size={16} className="text-info" /> : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">{a.created_at.slice(0, 10)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.student_id && (
                        <Button variant="ghost" size="icon" title="ملف الطالبة"
                          onClick={() => navigate(`/students/${a.student_id}`)}>
                          <Eye size={16} />
                        </Button>
                      )}
                      {tab === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1 ml-2"
                            onClick={() => setAction({ a, type: 'accept' })}>
                            <Check size={14} /> قبول
                          </Button>
                          <Button size="sm" variant="ghost" className="gap-1 text-destructive"
                            onClick={() => setAction({ a, type: 'reject' })}>
                            <X size={14} /> رفض
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* بطاقة المتقدمة الكاملة — كل ما في الاستمارة في مكان واحد */}
      <Dialog open={!!viewing} onOpenChange={open => !open && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {viewing.full_name}
                  <Badge variant="outline">{STATUS_LABEL[viewing.status]}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">الهوية</p><p dir="ltr" className="text-right">{viewing.national_id ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">الجوال</p><p dir="ltr" className="text-right">{viewing.phone}</p></div>
                  <div><p className="text-xs text-muted-foreground">المسار</p><p>{viewing.track_name ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">الفترة الأنسب</p><p>{viewing.preferred_period === 'morning' ? 'صباح' : viewing.preferred_period === 'evening' ? 'مساء' : viewing.preferred_period === 'both' ? 'كلاهما' : '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">سُجّلت في</p><p>{viewing.created_at.slice(0, 10)}</p></div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">مواعيدها بترتيب الأولوية</p>
                  {viewing.preferred_slots?.length ? (
                    <div className="space-y-1">
                      {viewing.preferred_slots.map((sl, j) => (
                        <p key={j} className="flex items-center gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-full bg-accent text-accent-foreground text-xs font-bold flex items-center justify-center">{j + 1}</span>
                          {sl}
                        </p>
                      ))}
                    </div>
                  ) : <p>{(viewing.preferred_days || []).map(d => WEEKDAYS[d]).join('، ') || '—'}</p>}
                </div>

                {viewing.suggestions && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">ملاحظاتها ومقترحاتها</p>
                    <p className="border border-accent/30 bg-accent/5 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">{viewing.suggestions}</p>
                  </div>
                )}

                {extraQs.filter(q => q.is_active && answerText(viewing.extra_answers[q.id]) !== '—').map(q => (
                  <div key={q.id}>
                    <p className="text-xs text-muted-foreground mb-1">{q.label}</p>
                    <p className="whitespace-pre-wrap">{answerText(viewing.extra_answers[q.id])}</p>
                  </div>
                ))}

                <div className="flex gap-2 pt-2 border-t">
                  {viewing.status === 'pending' && (
                    <>
                      <Button className="gap-1 flex-1" onClick={() => { setAction({ a: viewing, type: 'accept' }); setViewing(null); }}>
                        <Check size={15} /> قبول
                      </Button>
                      <Button variant="outline" className="gap-1 flex-1 text-destructive" onClick={() => { setAction({ a: viewing, type: 'reject' }); setViewing(null); }}>
                        <X size={15} /> رفض
                      </Button>
                    </>
                  )}
                  {viewing.student_id && (
                    <Button variant="outline" className="gap-1 flex-1" onClick={() => navigate(`/students/${viewing.student_id}`)}>
                      <Eye size={15} /> ملف الطالبة
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
