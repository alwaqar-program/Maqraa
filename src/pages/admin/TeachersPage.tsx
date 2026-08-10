import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, GraduationCap } from 'lucide-react';

interface Teacher {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  meeting_link: string | null;
  is_active: boolean;
  user_id: string | null;
  total_hours?: number;
  booked?: number;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [form, setForm] = useState({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '' });
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: hours }, { data: bookings }] = await Promise.all([
      supabase.from('teachers').select('*').order('full_name'),
      supabase.from('v_teacher_weekly_hours').select('*'),
      supabase.from('bookings').select('slot_id, status, availability_slots(teacher_id)').eq('status', 'active'),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setTeachers((rows || []).map((t: any) => ({
      ...t,
      total_hours: (hours || []).find((h: any) => h.teacher_id === t.id)?.total_hours ?? 0,
      booked: (bookings || []).filter((b: any) => b.availability_slots?.teacher_id === t.id).length,
    })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', national_id: '', phone: '', email: '', meeting_link: '' });
    setDialogOpen(true);
  };
  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      full_name: t.full_name, national_id: t.national_id ?? '',
      phone: t.phone ?? '', email: t.email ?? '', meeting_link: t.meeting_link ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast({ title: 'الاسم مطلوب', variant: 'destructive' }); return; }
    const payload = {
      full_name: form.full_name, national_id: form.national_id || null,
      phone: form.phone || null, email: form.email || null,
      meeting_link: form.meeting_link || null,
    };
    const q = editing
      ? supabase.from('teachers').update(payload).eq('id', editing.id)
      : supabase.from('teachers').insert(payload);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث المسمعة' : 'تمت إضافة المسمعة' });
    setDialogOpen(false);
    fetchAll();
  };

  const toggleActive = async (t: Teacher) => {
    const { error } = await supabase.from('teachers').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="text-accent" />
          <h1 className="text-2xl font-display">المسمعات</h1>
          <Badge variant="outline">{teachers.length}</Badge>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> مسمعة جديدة</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>ساعات التوفر</TableHead>
                  <TableHead>طالباتها</TableHead>
                  <TableHead>رابط الاجتماع</TableHead>
                  <TableHead>حساب دخول</TableHead>
                  <TableHead>نشطة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.full_name}</TableCell>
                    <TableCell dir="ltr">{t.phone ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={Number(t.total_hours) < 2 ? 'destructive' : 'outline'}>
                        {t.total_hours} ساعة
                      </Badge>
                    </TableCell>
                    <TableCell>{t.booked}</TableCell>
                    <TableCell>{t.meeting_link ? '✓' : '—'}</TableCell>
                    <TableCell>
                      {t.user_id ? <Badge variant="outline" className="text-success border-success">مفعّل</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">بلا حساب</Badge>}
                    </TableCell>
                    <TableCell><Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil size={16} /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل المسمعة' : 'مسمعة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الجوال</Label>
                <Input dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>البريد</Label>
              <Input dir="ltr" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>رابط الاجتماع الثابت</Label>
              <Input dir="ltr" placeholder="https://zoom.us/j/..." value={form.meeting_link} onChange={e => setForm({ ...form, meeting_link: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
