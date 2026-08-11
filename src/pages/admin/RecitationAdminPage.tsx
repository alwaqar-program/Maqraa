import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Mic, Search } from 'lucide-react';
import { surahNameOf } from '@/lib/mushaf';

interface Row {
  id: string; date: string; student_name: string; teacher_name?: string;
  from_surah: number; from_verse: number; to_surah: number; to_verse: number;
  pages: number; score?: number; grade?: string;
}

function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function RecitationAdminPage() {
  const [tab, setTab] = useState<'tasmee' | 'self'>('tasmee');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const table = tab === 'tasmee' ? 'teacher_recitation_log' : 'self_recitation_log';
    const select = tab === 'tasmee'
      ? 'id, date, from_surah, from_verse, to_surah, to_verse, pages, score, grade, students(full_name), teachers(full_name)'
      : 'id, date, from_surah, from_verse, to_surah, to_verse, pages, students(full_name)';
    const { data, error } = await supabase.from(table).select(select)
      .gte('date', from).lte('date', to).eq('is_deleted', false)
      .order('date', { ascending: false }).limit(500);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setRows((data || []).map((r: any) => ({
      ...r,
      student_name: r.students?.full_name ?? '—',
      teacher_name: r.teachers?.full_name,
    })));
    setLoading(false);
  }, [tab, from, to, toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = rows.filter(r => !search || r.student_name.includes(search));
  const totalPages = Math.round(filtered.reduce((a, r) => a + Number(r.pages || 0), 0) * 100) / 100;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Mic className="text-accent" />
        <h1 className="text-2xl font-display">سجل التسميع والسرد</h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <Tabs value={tab} onValueChange={v => setTab(v as any)} dir="rtl">
          <TabsList>
            <TabsTrigger value="tasmee">تسميع المسمعات</TabsTrigger>
            <TabsTrigger value="self">السرد الذاتي</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="space-y-1">
          <Label>من</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>إلى</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>الطالبة</Label>
          <div className="relative">
            <Search size={14} className="absolute right-2.5 top-3 text-muted-foreground" />
            <Input className="pr-8 w-44" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Badge variant="outline" className="mb-1">{filtered.length} سجل — {totalPages} صفحة</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الطالبة</TableHead>
                  <TableHead>النطاق</TableHead>
                  <TableHead>الصفحات</TableHead>
                  {tab === 'tasmee' && <>
                    <TableHead>الدرجة</TableHead>
                    <TableHead>التقدير</TableHead>
                    <TableHead>المسمعة</TableHead>
                  </>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.date}</TableCell>
                    <TableCell className="font-medium">{r.student_name}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {surahNameOf(r.from_surah)} {r.from_verse} ← {surahNameOf(r.to_surah)} {r.to_verse}
                    </TableCell>
                    <TableCell>{r.pages}</TableCell>
                    {tab === 'tasmee' && <>
                      <TableCell>{r.score}</TableCell>
                      <TableCell><Badge variant={r.grade === 'ممتاز' ? 'default' : 'outline'}>{r.grade}</Badge></TableCell>
                      <TableCell>{r.teacher_name}</TableCell>
                    </>}
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
