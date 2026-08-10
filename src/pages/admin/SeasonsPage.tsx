import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, CalendarRange, Star } from 'lucide-react';

interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  sessions_count: number;
  max_students: number | null;
  status: 'planned' | 'open' | 'active' | 'closed';
  is_current: boolean;
}

const STATUS_LABELS: Record<Season['status'], string> = {
  planned: 'مخطط', open: 'تسجيل مفتوح', active: 'جارٍ', closed: 'مغلق',
};

export default function SeasonsPage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Season | null>(null);
  const [form, setForm] = useState({
    name: '', start_date: '', end_date: '', sessions_count: 14,
    max_students: '' as string | number, status: 'planned' as Season['status'],
  });
  const { toast } = useToast();

  const fetchSeasons = async () => {
    const { data, error } = await supabase.from('seasons').select('*').order('start_date', { ascending: false });
    if (error) toast({ title: 'خطأ في جلب الفصول', description: error.message, variant: 'destructive' });
    else setSeasons(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchSeasons(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', start_date: '', end_date: '', sessions_count: 14, max_students: '', status: 'planned' });
    setDialogOpen(true);
  };
  const openEdit = (s: Season) => {
    setEditing(s);
    setForm({
      name: s.name, start_date: s.start_date, end_date: s.end_date,
      sessions_count: s.sessions_count, max_students: s.max_students ?? '', status: s.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      toast({ title: 'الاسم وتاريخا البداية والنهاية مطلوبة', variant: 'destructive' }); return;
    }
    const payload = {
      name: form.name, start_date: form.start_date, end_date: form.end_date,
      sessions_count: form.sessions_count,
      max_students: form.max_students === '' ? null : Number(form.max_students),
      status: form.status,
    };
    const q = editing
      ? supabase.from('seasons').update(payload).eq('id', editing.id)
      : supabase.from('seasons').insert(payload);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث الفصل' : 'تم إضافة الفصل' });
    setDialogOpen(false);
    fetchSeasons();
  };

  const setCurrent = async (s: Season) => {
    // فصل حالي واحد: أزيلي العلم من الجميع ثم ضعيه على المختار
    const { error: clearErr } = await supabase.from('seasons').update({ is_current: false }).eq('is_current', true);
    if (clearErr) { toast({ title: 'خطأ', description: clearErr.message, variant: 'destructive' }); return; }
    const { error } = await supabase.from('seasons').update({ is_current: true }).eq('id', s.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `«${s.name}» أصبح الفصل الحالي` }); fetchSeasons(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange className="text-accent" />
          <h1 className="text-2xl font-display">الفصول</h1>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> فصل جديد</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفصل</TableHead>
                  <TableHead>من</TableHead>
                  <TableHead>إلى</TableHead>
                  <TableHead>الجلسات</TableHead>
                  <TableHead>حد الطالبات</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {seasons.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {s.name}
                      {s.is_current && <Badge className="mr-2 bg-accent text-accent-foreground">الحالي</Badge>}
                    </TableCell>
                    <TableCell>{s.start_date}</TableCell>
                    <TableCell>{s.end_date}</TableCell>
                    <TableCell>{s.sessions_count}</TableCell>
                    <TableCell>{s.max_students ?? '—'}</TableCell>
                    <TableCell>{STATUS_LABELS[s.status]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {!s.is_current && (
                        <Button variant="ghost" size="icon" title="اجعليه الفصل الحالي" onClick={() => setCurrent(s)}>
                          <Star size={16} />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil size={16} /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل الفصل' : 'فصل جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الفصل</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: الدورة الثالثة ١٤٤٨هـ" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>تاريخ البداية</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>تاريخ النهاية</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>عدد الجلسات</Label>
                <Input type="number" min={1} value={form.sessions_count} onChange={e => setForm({ ...form, sessions_count: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>حد الطالبات</Label>
                <Input type="number" min={1} placeholder="بلا حد" value={form.max_students}
                  onChange={e => setForm({ ...form, max_students: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as Season['status'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
