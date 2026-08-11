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
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Check, X, MessageSquareText } from 'lucide-react';
import { WEEKDAYS } from '@/lib/schedule';

interface Applicant {
  id: string;
  full_name: string;
  phone: string;
  national_id: string | null;
  track_id: string | null;
  track_name?: string;
  preferred_days: number[];
  preferred_period: string | null;
  suggestions: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  student_id: string | null;
}

const STATUS_LABEL: Record<string, string> = { pending: 'بانتظار المراجعة', accepted: 'مقبولة', rejected: 'مرفوضة' };

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [tab, setTab] = useState('pending');
  const [action, setAction] = useState<{ a: Applicant; type: 'accept' | 'reject' } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('applicants')
      .select('*, tracks(name)')
      .order('created_at'); // الأسبقية بالتسجيل
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setApplicants((data || []).map((r: any) => ({ ...r, track_name: r.tracks?.name })));
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

  const filtered = applicants.filter(a => a.status === tab);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserPlus className="text-accent" />
        <h1 className="text-2xl font-display">المتقدمات</h1>
        <Badge variant="outline">{applicants.filter(a => a.status === 'pending').length} بانتظار المراجعة</Badge>
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
                  <TableHead>الاسم</TableHead>
                  <TableHead>الهوية</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead>الأيام (٥–٧ص)</TableHead>
                  <TableHead>الفترة</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  <TableHead>سُجّل في</TableHead>
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
                    <TableCell className="text-sm">
                      {(a.preferred_days || []).map(d => WEEKDAYS[d]).join('، ') || '—'}
                    </TableCell>
                    <TableCell>{a.preferred_period === 'morning' ? 'صباح' : a.preferred_period === 'evening' ? 'مساء' : '—'}</TableCell>
                    <TableCell>
                      {a.suggestions
                        ? <span title={a.suggestions}><MessageSquareText size={16} className="text-info" /></span>
                        : '—'}
                    </TableCell>
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
