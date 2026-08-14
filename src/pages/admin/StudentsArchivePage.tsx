import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Archive, RotateCcw } from 'lucide-react';

interface Row {
  id: string; full_name: string; national_id: string; phone: string | null;
  status: string; status_date: string | null; status_reason: string | null;
  track_name?: string;
}

/** أرشيف المنسحبات والمستبعدات — كامل بياناتهن وسجلاتهن محفوظة، مع إمكانية الإرجاع */
export default function StudentsArchivePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('students')
      .select('id, full_name, national_id, phone, status, status_date, status_reason, tracks(name)')
      .in('status', ['withdrawn', 'excluded']).order('status_date', { ascending: false });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setRows((data || []).map((r: any) => ({ ...r, track_name: r.tracks?.name })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const restore = async (r: Row) => {
    const { error } = await supabase.from('students').update({
      status: 'active', status_date: null, status_reason: null, is_active: true,
    }).eq('id', r.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `أُعيد تفعيل ${r.full_name} — وزعيها على حلقة من صفحة الحلقات` }); fetchAll(); }
  };

  const TableOf = ({ list, dateLabel }: { list: Row[]; dateLabel: string }) => (
    <Card><CardContent className="pt-6">
      {list.length === 0 ? <p className="text-muted-foreground text-sm">لا سجلات.</p> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>الاسم</TableHead><TableHead>الهوية</TableHead><TableHead>الجوال</TableHead>
            <TableHead>المسار</TableHead><TableHead>{dateLabel}</TableHead><TableHead>السبب</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {list.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link to={`/students/${r.id}`} className="hover:text-info hover:underline">{r.full_name}</Link>
                </TableCell>
                <TableCell dir="ltr">{r.national_id}</TableCell>
                <TableCell dir="ltr">{r.phone ?? '—'}</TableCell>
                <TableCell>{r.track_name ?? '—'}</TableCell>
                <TableCell>{r.status_date ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-56">{r.status_reason ?? '—'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="gap-1" onClick={() => restore(r)}>
                    <RotateCcw size={13} /> إعادة تفعيل
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent></Card>
  );

  const withdrawn = rows.filter(r => r.status === 'withdrawn');
  const excluded = rows.filter(r => r.status === 'excluded');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Archive className="text-accent" />
        <h1 className="text-2xl font-display">المنسحبات والمستبعدات</h1>
        <Badge variant="outline">{rows.length}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        كامل بيانات الطالبة وسجلاتها السابقة (تسميع، حضور، اختبارات) تبقى محفوظة — الاسم يفتح ملفها.
      </p>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <Tabs defaultValue="withdrawn" dir="rtl">
          <TabsList>
            <TabsTrigger value="withdrawn">المنسحبات ({withdrawn.length})</TabsTrigger>
            <TabsTrigger value="excluded">المستبعدات ({excluded.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="withdrawn"><TableOf list={withdrawn} dateLabel="تاريخ الانسحاب" /></TabsContent>
          <TabsContent value="excluded"><TableOf list={excluded} dateLabel="تاريخ الاستبعاد" /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
