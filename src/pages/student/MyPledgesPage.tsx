import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FileSignature, CheckCircle2 } from 'lucide-react';

interface Pledge {
  id: string; title: string; body: string;
  signed_at: string | null;
}

export default function MyPledgesPage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
    if (!me) { setLoading(false); return; }
    setStudentId(me.id);
    const [{ data: templates }, { data: mine }] = await Promise.all([
      supabase.from('pledge_templates').select('id, title, body').eq('is_active', true).order('created_at'),
      supabase.from('student_pledges').select('template_id, signed_at').eq('student_id', me.id),
    ]);
    setPledges((templates || []).map((t: any) => ({
      ...t,
      signed_at: (mine || []).find((m: any) => m.template_id === t.id)?.signed_at ?? null,
    })));
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const sign = async (p: Pledge) => {
    if (!studentId) return;
    const { error } = await supabase.from('student_pledges').insert({ student_id: studentId, template_id: p.id });
    if (error) { toast({ title: 'تعذر التوقيع', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'وُقّع التعهد — وفقك الله 🌿' });
    fetchAll();
  };

  if (!loading && !studentId) {
    return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف طالبة — تواصلي مع الإدارة.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileSignature className="text-accent" />
        <h1 className="text-2xl font-display">تعهداتي</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : pledges.length === 0 ? (
        <p className="text-muted-foreground text-center py-10">لا تعهدات مطلوبة حاليًا.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 max-w-3xl">
          {pledges.map(p => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{p.title}</span>
                  {p.signed_at && (
                    <Badge className="bg-success text-success-foreground gap-1">
                      <CheckCircle2 size={13} /> موقّع {p.signed_at.slice(0, 10)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{p.body}</p>
                {!p.signed_at && (
                  <Button className="w-full" onClick={() => sign(p)}>أتعهد وأوقّع</Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
