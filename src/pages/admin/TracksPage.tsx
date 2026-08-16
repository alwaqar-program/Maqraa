import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Route } from 'lucide-react';
import { trackMinutes } from '@/lib/circles';

interface Track {
  id: string;
  name: string;
  juz_count: number;
  quota_pages_per_season: number;
  sort_order: number;
  is_active: boolean;
}

export default function TracksPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Track | null>(null);
  const [form, setForm] = useState({ name: '', juz_count: 5, quota_pages_per_season: 100, sort_order: 0 });
  const { toast } = useToast();

  const fetchTracks = async () => {
    const { data, error } = await supabase.from('tracks').select('*').order('sort_order');
    if (error) toast({ title: 'خطأ في جلب المسارات', description: error.message, variant: 'destructive' });
    else setTracks(data || []);
    setLoading(false);
  };
  useEffect(() => { fetchTracks(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', juz_count: 5, quota_pages_per_season: 100, sort_order: tracks.length + 1 });
    setDialogOpen(true);
  };
  const openEdit = (t: Track) => {
    setEditing(t);
    setForm({ name: t.name, juz_count: t.juz_count, quota_pages_per_season: t.quota_pages_per_season, sort_order: t.sort_order });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'اسم المسار مطلوب', variant: 'destructive' }); return; }
    const q = editing
      ? supabase.from('tracks').update(form).eq('id', editing.id)
      : supabase.from('tracks').insert(form);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث المسار' : 'تم إضافة المسار' });
    setDialogOpen(false);
    fetchTracks();
  };

  const toggleActive = async (t: Track) => {
    const { error } = await supabase.from('tracks').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchTracks();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="text-accent" />
          <h1 className="text-2xl font-display">المسارات</h1>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> مسار جديد</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-body text-muted-foreground">
            نصاب التسميع بالفصل لكل مسار — «المجموع يساوي المحفوظ» (1 جزء = 20 صفحة)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المسار</TableHead>
                  <TableHead>الأجزاء</TableHead>
                  <TableHead>نصاب الفصل (صفحة)</TableHead>
                  <TableHead>نصاب الجلسة تقريبًا (÷14)</TableHead>
                  <TableHead>دقائق الموعد (صفحة = دقيقتان)</TableHead>
                  <TableHead>نشط</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracks.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.juz_count}</TableCell>
                    <TableCell>{t.quota_pages_per_season}</TableCell>
                    <TableCell className="text-muted-foreground">{Math.round(t.quota_pages_per_season / 14)} صفحة</TableCell>
                    <TableCell className="font-medium">{trackMinutes(t)} دقيقة</TableCell>
                    <TableCell><Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} /></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil size={16} /></Button>
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
          <DialogHeader><DialogTitle>{editing ? 'تعديل المسار' : 'مسار جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المسار</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عدد الأجزاء</Label>
                <Input type="number" min={0.5} step={0.5} value={form.juz_count}
                  onChange={e => setForm({ ...form, juz_count: Number(e.target.value), quota_pages_per_season: Math.round(Number(e.target.value) * 20) })} />
              </div>
              <div className="space-y-2">
                <Label>نصاب الفصل (صفحة)</Label>
                <Input type="number" min={1} value={form.quota_pages_per_season}
                  onChange={e => setForm({ ...form, quota_pages_per_season: Number(e.target.value) })} />
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
