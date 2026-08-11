import { useEffect, useState, useCallback, useRef } from 'react';
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
import { Plus, Pencil, Presentation, LinkIcon, Paperclip, Star, X } from 'lucide-react';

interface Hosting {
  id: string; title: string; host_name: string; event_date: string | null;
  description: string | null; attachments: string[]; guest_token: string;
  guest_filled_at: string | null; is_published: boolean;
  avg_rating?: number | null; responses?: number;
  comments?: { student: string; rating: number; comment: string | null }[];
}

export default function HostingsAdminPage() {
  const [hostings, setHostings] = useState<Hosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Hosting | null>(null);
  const [viewingFeedback, setViewingFeedback] = useState<Hosting | null>(null);
  const [form, setForm] = useState({ title: '', host_name: '', event_date: '', description: '' });
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: fb }] = await Promise.all([
      supabase.from('hostings').select('*').order('created_at', { ascending: false }),
      supabase.from('hosting_feedback').select('hosting_id, rating, comment, students(full_name)'),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    setHostings((rows || []).map((h: any) => {
      const mine = (fb || []).filter((f: any) => f.hosting_id === h.id);
      return {
        ...h,
        responses: mine.length,
        avg_rating: mine.length ? Math.round((mine.reduce((a: number, f: any) => a + f.rating, 0) / mine.length) * 10) / 10 : null,
        comments: mine.map((f: any) => ({ student: f.students?.full_name ?? '—', rating: f.rating, comment: f.comment })),
      };
    }));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => { setEditing(null); setForm({ title: '', host_name: '', event_date: '', description: '' }); setFiles([]); setDialogOpen(true); };
  const openEdit = (h: Hosting) => {
    setEditing(h);
    setForm({ title: h.title, host_name: h.host_name, event_date: h.event_date ?? '', description: h.description ?? '' });
    setFiles([]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // المرفقات الجديدة تُرفع أولًا ثم تُلحق بالموجود
    const newPaths: string[] = [];
    for (const f of files) {
      const path = `${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from('hostings').upload(path, f);
      if (error) { toast({ title: `تعذر رفع ${f.name}`, description: error.message, variant: 'destructive' }); return; }
      newPaths.push(path);
    }
    const payload: any = {
      title: form.title, host_name: form.host_name,
      event_date: form.event_date || null, description: form.description || null,
    };
    if (editing) payload.attachments = [...editing.attachments, ...newPaths];
    else payload.attachments = newPaths;

    const q = editing
      ? supabase.from('hostings').update(payload).eq('id', editing.id)
      : supabase.from('hostings').insert(payload);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث الاستضافة' : 'أُنشئت الاستضافة' });
    setDialogOpen(false);
    fetchAll();
  };

  const togglePublish = async (h: Hosting) => {
    const { error } = await supabase.from('hostings').update({ is_published: !h.is_published }).eq('id', h.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const copyGuestLink = (h: Hosting) => {
    const url = `${window.location.origin}/guest/${h.guest_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'نُسخ رابط الضيفة — أرسليه لها لتعبئ بيانات اللقاء بنفسها' });
  };

  const attachmentUrl = (path: string) =>
    supabase.storage.from('hostings').getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Presentation className="text-accent" />
          <h1 className="text-2xl font-display">الاستضافات</h1>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> استضافة جديدة</Button>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : hostings.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          لا استضافات بعد — أنشئي الأولى أو أرسلي رابط التعبئة للضيفة.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {hostings.map(h => (
            <Card key={h.id} className={!h.is_published ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{h.title || <span className="text-muted-foreground">بانتظار تعبئة الضيفة…</span>}</span>
                  <div className="flex items-center gap-1">
                    <Switch checked={h.is_published} onCheckedChange={() => togglePublish(h)} title="الظهور للطالبات" />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(h)}><Pencil size={15} /></Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {h.host_name && <>قدّمتها: <b className="text-foreground">{h.host_name}</b> · </>}
                  {h.event_date ?? 'بلا تاريخ'}
                  {h.guest_filled_at && <Badge variant="outline" className="mr-2">عبّأتها الضيفة</Badge>}
                </p>
                {h.description && <p className="whitespace-pre-wrap">{h.description}</p>}
                {h.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {h.attachments.map(a => (
                      <a key={a} href={attachmentUrl(a)} target="_blank" rel="noreferrer">
                        <Badge variant="outline" className="gap-1 hover:border-accent cursor-pointer">
                          <Paperclip size={11} /> {a.split('-').slice(1).join('-') || a}
                        </Badge>
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between border-t pt-2">
                  <button className="flex items-center gap-1 hover:text-info"
                    onClick={() => setViewingFeedback(h)} disabled={!h.responses}>
                    <Star size={14} className="text-accent" />
                    {h.avg_rating ? <><b>{h.avg_rating}</b>/5 ({h.responses} تقييم)</> : 'لا تقييمات بعد'}
                  </button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => copyGuestLink(h)}>
                    <LinkIcon size={13} /> رابط الضيفة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* التقييمات */}
      <Dialog open={!!viewingFeedback} onOpenChange={open => !open && setViewingFeedback(null)}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader><DialogTitle>قياس الرضا — {viewingFeedback?.title}</DialogTitle></DialogHeader>
          <ul className="space-y-3">
            {viewingFeedback?.comments?.map((c, i) => (
              <li key={i} className="border-b last:border-0 pb-2">
                <div className="flex justify-between">
                  <b className="text-sm">{c.student}</b>
                  <span className="text-accent">{'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}</span>
                </div>
                {c.comment && <p className="text-sm text-muted-foreground mt-1">{c.comment}</p>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* إنشاء/تعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل الاستضافة' : 'استضافة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              يمكنك ترك الحقول فارغة وإرسال «رابط الضيفة» لها لتعبئها بنفسها.
            </p>
            <div className="space-y-2">
              <Label>عنوان اللقاء</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>من قدّمته</Label>
                <Input value={form.host_name} onChange={e => setForm({ ...form, host_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>متى</Label>
                <Input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>وصف اللقاء</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>المادة العلمية (مرفقات)</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => fileRef.current?.click()}>
                  <Paperclip size={14} /> إرفاق
                </Button>
                <input ref={fileRef} type="file" multiple hidden onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
                {files.map((f, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {f.name}
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={11} /></button>
                  </Badge>
                ))}
                {editing && editing.attachments.length > 0 && (
                  <span className="text-xs text-muted-foreground">({editing.attachments.length} مرفق سابق يبقى)</span>
                )}
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ' : 'إنشاء'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
