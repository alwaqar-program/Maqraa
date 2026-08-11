import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MessageSquarePlus, Paperclip, X } from 'lucide-react';

interface Suggestion {
  id: string; title: string; body: string;
  attachments: string[]; created_at: string;
}

const MAX_FILES = 3;
const MAX_MB = 5;

/** صندوق الاقتراحات — مساحة حرة تصل للمشرفات ومديرة النظام (طالبة أو مسمعة) */
export default function SuggestionBoxPage() {
  const [mine, setMine] = useState<Suggestion[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchMine = useCallback(async () => {
    const { data } = await supabase.from('suggestions')
      .select('id, title, body, attachments, created_at')
      .order('created_at', { ascending: false }).limit(30);
    setMine(data || []);
  }, []);
  useEffect(() => { fetchMine(); }, [fetchMine]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, MAX_FILES);
    const tooBig = next.find(f => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { toast({ title: `«${tooBig.name}» أكبر من ${MAX_MB}MB`, variant: 'destructive' }); return; }
    setFiles(next);
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast({ title: 'العنوان والوصف مطلوبان', variant: 'destructive' }); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    // رفع المرفقات أولًا
    const paths: string[] = [];
    for (const f of files) {
      const path = `${user!.id}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from('suggestions').upload(path, f);
      if (error) { toast({ title: `تعذر رفع ${f.name}`, description: error.message, variant: 'destructive' }); setSaving(false); return; }
      paths.push(path);
    }
    const { error } = await supabase.from('suggestions').insert({
      title: title.trim(), body: body.trim(), attachments: paths,
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر الإرسال', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'وصل اقتراحك للمشرفات والإدارة — شكرًا لك 🌿' });
    setTitle(''); setBody(''); setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
    fetchMine();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="text-accent" />
        <h1 className="text-2xl font-display">اقتراحاتي</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base font-body">نسعد باستقبال مقترحاتك وملاحظاتك</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>العنوان</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>مرفقات (اختياري — حتى {MAX_FILES} ملفات، {MAX_MB}MB لكل ملف)</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" size="sm" className="gap-1"
                onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES}>
                <Paperclip size={14} /> إرفاق ملف
              </Button>
              <input ref={fileRef} type="file" multiple hidden
                accept="image/*,.pdf,.doc,.docx,.xlsx"
                onChange={e => addFiles(e.target.files)} />
              {files.map((f, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  {f.name}
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={11} /></button>
                </Badge>
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={saving}>
            {saving ? 'جارٍ الإرسال...' : 'إرسال الاقتراح'}
          </Button>
        </CardContent>
      </Card>

      {mine.length > 0 && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle className="text-base font-body">اقتراحاتك السابقة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mine.map(s => (
              <div key={s.id} className="border-b last:border-0 pb-3">
                <div className="flex items-center justify-between">
                  <b>{s.title}</b>
                  <span className="text-xs text-muted-foreground">{s.created_at.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{s.body}</p>
                {s.attachments.length > 0 && (
                  <Badge variant="outline" className="mt-1 gap-1"><Paperclip size={11} /> {s.attachments.length} مرفق</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
