import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, FileSignature, Users } from 'lucide-react';

interface Template {
  id: string; title: string; body: string; is_active: boolean;
  signatures: { student_name: string; signed_at: string }[];
}

export default function PledgesAdminPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [viewing, setViewing] = useState<Template | null>(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: tpl, error }, { data: sigs }, { count }] = await Promise.all([
      supabase.from('pledge_templates').select('*').order('created_at'),
      supabase.from('student_pledges').select('template_id, signed_at, students(full_name)'),
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setTemplates((tpl || []).map((t: any) => ({
      ...t,
      signatures: (sigs || []).filter((s: any) => s.template_id === t.id)
        .map((s: any) => ({ student_name: s.students?.full_name ?? '—', signed_at: s.signed_at })),
    })));
    setTotalStudents(count ?? 0);
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => { setEditing(null); setForm({ title: '', body: '' }); setDialogOpen(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ title: t.title, body: t.body }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast({ title: 'العنوان والنص مطلوبان', variant: 'destructive' }); return; }
    const q = editing
      ? supabase.from('pledge_templates').update(form).eq('id', editing.id)
      : supabase.from('pledge_templates').insert(form);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث التعهد' : 'أُضيف التعهد' });
    setDialogOpen(false);
    fetchAll();
  };

  const toggleActive = async (t: Template) => {
    const { error } = await supabase.from('pledge_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="text-accent" />
          <h1 className="text-2xl font-display">التعهدات</h1>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> تعهد جديد</Button>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map(t => (
            <Card key={t.id} className={!t.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{t.title}</span>
                  <div className="flex items-center gap-2">
                    <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil size={15} /></Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{t.body}</p>
                <button className="flex items-center gap-2 text-sm hover:text-info" onClick={() => setViewing(t)}>
                  <Users size={15} className="text-accent" />
                  وقّعت <b>{t.signatures.length}</b> من {totalStudents} طالبة
                  {t.signatures.length < totalStudents && <Badge variant="outline">ناقص {totalStudents - t.signatures.length}</Badge>}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* الموقّعات */}
      <Dialog open={!!viewing} onOpenChange={open => !open && setViewing(null)}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>الموقّعات على «{viewing?.title}»</DialogTitle></DialogHeader>
          {viewing?.signatures.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">لا توقيعات بعد.</p>
          ) : (
            <ul className="space-y-2">
              {viewing?.signatures.map((s, i) => (
                <li key={i} className="flex justify-between text-sm border-b pb-2">
                  <span>{s.student_name}</span>
                  <span className="text-muted-foreground">{s.signed_at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* إنشاء/تعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل التعهد' : 'تعهد جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>نص التعهد</Label>
              <Textarea rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
