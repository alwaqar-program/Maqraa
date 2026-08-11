import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { MessageSquarePlus, Paperclip, Search } from 'lucide-react';

interface Suggestion {
  id: string; title: string; body: string;
  attachments: string[]; created_at: string; created_by: string;
  author_name?: string; author_role?: string;
}

/** اطلاع المشرفات ومديرة النظام على الاقتراحات */
export default function SuggestionsAdminPage() {
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase.from('suggestions')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); setLoading(false); return; }
    // اسم المرسلة ودورها عبر دالة آمنة
    const withAuthors = await Promise.all((data || []).map(async (s: any) => {
      const { data: a } = await supabase.rpc('suggestion_author', { p_user: s.created_by });
      const author = Array.isArray(a) ? a[0] : a;
      return { ...s, author_name: author?.author_name ?? '—', author_role: author?.author_role ?? '' };
    }));
    setRows(withAuthors);
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openAttachment = async (path: string) => {
    const { data, error } = await supabase.storage.from('suggestions').createSignedUrl(path, 3600);
    if (error || !data) { toast({ title: 'تعذر فتح المرفق', variant: 'destructive' }); return; }
    window.open(data.signedUrl, '_blank');
  };

  const filtered = rows.filter(s =>
    !search || s.title.includes(search) || s.body.includes(search) || (s.author_name ?? '').includes(search));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="text-accent" />
        <h1 className="text-2xl font-display">الاقتراحات</h1>
        <Badge variant="outline">{rows.length}</Badge>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute right-3 top-3 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث بالعنوان أو النص أو المرسلة" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا اقتراحات بعد.</CardContent></Card>
      ) : (
        <div className="space-y-3 max-w-3xl">
          {filtered.map(s => (
            <Card key={s.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <b>{s.title}</b>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline">{s.author_role}</Badge>
                    <span>{s.author_name}</span>
                    <span>·</span>
                    <span>{s.created_at.slice(0, 10)}</span>
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{s.body}</p>
                {s.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.attachments.map(a => (
                      <button key={a} onClick={() => openAttachment(a)}>
                        <Badge variant="outline" className="gap-1 hover:border-accent cursor-pointer">
                          <Paperclip size={11} /> {a.split('/').pop()?.split('-').slice(1).join('-') || 'مرفق'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
