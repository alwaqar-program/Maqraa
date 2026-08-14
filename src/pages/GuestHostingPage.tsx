import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Paperclip, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import logoImg from '@/assets/logo-maqraa.png';

/** بوابة الضيفة: تعبئ بيانات لقائها عبر رابط خاص دون تسجيل دخول */
export default function GuestHostingPage() {
  const { token } = useParams<{ token: string }>();
  const [found, setFound] = useState<boolean | null>(null);
  const [form, setForm] = useState({ title: '', host_name: '', event_date: '', description: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) { setFound(false); return; }
    supabase.rpc('get_hosting_by_token', { p_token: token }).then(({ data }) => {
      const h = Array.isArray(data) ? data[0] : data;
      if (!h) { setFound(false); return; }
      setFound(true);
      setForm({
        title: h.title ?? '', host_name: h.host_name ?? '',
        event_date: h.event_date ?? '', description: h.description ?? '',
      });
    });
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // رفع المادة العلمية أولًا — المسار guest/{token}/... هو إذن الرفع
    const paths: string[] = [];
    for (const f of files) {
      const path = `guest/${token}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from('hostings').upload(path, f);
      if (upErr) { toast({ title: `تعذر رفع ${f.name}`, description: upErr.message, variant: 'destructive' }); setSaving(false); return; }
      paths.push(path);
    }
    const { data, error } = await supabase.rpc('submit_hosting_by_token', {
      p_token: token, p_title: form.title.trim(), p_host_name: form.host_name.trim(),
      p_event_date: form.event_date || null, p_description: form.description.trim() || null,
      p_attachments: paths,
    });
    setSaving(false);
    if (error || !data) { toast({ title: 'تعذر الحفظ', description: error?.message, variant: 'destructive' }); return; }
    setDone(true);
  };

  if (found === null) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  if (found === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center"><CardContent className="py-10">
          <p className="text-muted-foreground">الرابط غير صالح — تواصلي مع إدارة المقرأة.</p>
        </CardContent></Card>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center"><CardContent className="pt-10 pb-8 space-y-3">
          <CheckCircle2 size={48} className="mx-auto text-success" />
          <h1 className="text-2xl font-display">شكرًا لك 🌿</h1>
          <p className="text-muted-foreground">وصلت بيانات اللقاء لإدارة مقرأة الوقار.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <img src={logoImg} alt="شعار مقرأة الوقار" className="mx-auto w-24 object-contain" />
          <h1 className="text-2xl font-display">بيانات لقاء الاستضافة</h1>
          <p className="text-sm text-muted-foreground">أهلًا بك ضيفةً كريمة على مقرأة الوقار — عبّئي بيانات لقائك</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>عنوان اللقاء <span className="text-destructive">*</span></Label>
                <Input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسمك (من قدّمت اللقاء) <span className="text-destructive">*</span></Label>
                  <Input required value={form.host_name} onChange={e => setForm({ ...form, host_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>تاريخ اللقاء</Label>
                  <Input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>نبذة عن اللقاء</Label>
                <Textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>المادة العلمية (مرفقات — اختياري)</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-accent">
                    <Paperclip size={14} /> إرفاق ملف
                    <input type="file" multiple hidden accept="image/*,.pdf,.doc,.docx,.pptx"
                      onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
                  </label>
                  {files.map((f, i) => (
                    <Badge key={i} variant="outline" className="gap-1">
                      {f.name}
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={11} /></button>
                    </Badge>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? '...' : 'إرسال'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
