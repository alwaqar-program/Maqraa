import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Presentation, Paperclip, Star, CheckCircle2 } from 'lucide-react';
import { useFormSettings } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers, missingRequired } from '@/components/forms/ExtraQuestions';

interface Hosting {
  id: string; title: string; host_name: string; event_date: string | null;
  description: string | null; attachments: string[];
  my_rating?: number; my_comment?: string | null;
}

export default function StudentHostingsPage() {
  const { config, questions } = useFormSettings('hosting_feedback');
  const [extraByHosting, setExtraByHosting] = useState<Record<string, ExtraAnswers>>({});
  const [studentId, setStudentId] = useState<string | null>(null);
  const [hostings, setHostings] = useState<Hosting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { rating: number; comment: string }>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
    setStudentId(me?.id ?? null);
    const [{ data: rows }, { data: fb }] = await Promise.all([
      supabase.from('hostings').select('id, title, host_name, event_date, description, attachments')
        .eq('is_published', true).order('event_date', { ascending: false }),
      me ? supabase.from('hosting_feedback').select('hosting_id, rating, comment').eq('student_id', me.id)
         : Promise.resolve({ data: [] } as any),
    ]);
    setHostings((rows || []).map((h: any) => {
      const mine = (fb || []).find((f: any) => f.hosting_id === h.id);
      return { ...h, my_rating: mine?.rating, my_comment: mine?.comment };
    }));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submit = async (h: Hosting) => {
    if (!studentId) return;
    const d = drafts[h.id];
    if (!d?.rating) { toast({ title: 'اختاري تقييمك أولًا', variant: 'destructive' }); return; }
    const extra = extraByHosting[h.id] ?? {};
    const missing = missingRequired(questions, extra, { rating: String(d.rating) });
    if (missing) { toast({ title: `«${missing}» مطلوب`, variant: 'destructive' }); return; }
    const { error } = await supabase.from('hosting_feedback').insert({
      hosting_id: h.id, student_id: studentId, rating: d.rating, comment: d.comment || null,
      ...(Object.keys(extra).length ? { extra_answers: extra } : {}),
    });
    if (error) { toast({ title: 'تعذر الإرسال', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'شكرًا لتقييمك 🌿' });
    fetchAll();
  };

  const attachmentUrl = (path: string) =>
    supabase.storage.from('hostings').getPublicUrl(path).data.publicUrl;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Presentation className="text-accent" />
        <h1 className="text-2xl font-display">الاستضافات</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : hostings.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا استضافات منشورة بعد.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {hostings.map(h => {
            const d = drafts[h.id] ?? { rating: 0, comment: '' };
            return (
              <Card key={h.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{h.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    {h.host_name && <>قدّمتها: <b className="text-foreground">{h.host_name}</b> · </>}
                    {h.event_date ?? ''}
                  </p>
                  {h.description && <p className="whitespace-pre-wrap">{h.description}</p>}
                  {h.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {h.attachments.map(a => (
                        <a key={a} href={attachmentUrl(a)} target="_blank" rel="noreferrer">
                          <Badge variant="outline" className="gap-1 hover:border-accent cursor-pointer">
                            <Paperclip size={11} /> {a.split('-').slice(1).join('-') || 'مرفق'}
                          </Badge>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* قياس الرضا */}
                  <div className="border-t pt-3">
                    {h.my_rating ? (
                      <p className="flex items-center gap-2 text-success">
                        <CheckCircle2 size={15} /> قيّمتِ هذا اللقاء:
                        <span className="text-accent">{'★'.repeat(h.my_rating)}{'☆'.repeat(5 - h.my_rating)}</span>
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <p className="font-medium flex items-center gap-1"><Star size={14} className="text-accent" /> {config.prompt_label}</p>
                        <div className="flex gap-1" dir="ltr">
                          {[1, 2, 3, 4, 5].map(n => (
                            <button key={n} type="button"
                              className={`text-2xl transition-colors ${n <= d.rating ? 'text-accent' : 'text-muted-foreground/30 hover:text-accent/60'}`}
                              onClick={() => setDrafts({ ...drafts, [h.id]: { ...d, rating: n } })}>
                              ★
                            </button>
                          ))}
                        </div>
                        <Textarea rows={2} placeholder={config.comment_placeholder} value={d.comment}
                          onChange={e => setDrafts({ ...drafts, [h.id]: { ...d, comment: e.target.value } })} />
                        <ExtraQuestions questions={questions} answers={extraByHosting[h.id] ?? {}}
                          onChange={a => setExtraByHosting({ ...extraByHosting, [h.id]: a })}
                          baseAnswers={{ rating: String(d.rating || '') }} />
                        <Button size="sm" onClick={() => submit(h)}>إرسال التقييم</Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
