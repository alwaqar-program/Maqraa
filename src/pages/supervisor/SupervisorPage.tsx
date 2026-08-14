import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { LayoutDashboard, AlertTriangle, Save, Users2 } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { choiceLabel } from '@/lib/circles';

interface Circle {
  id: string; number: number; weekday: number; start_time: string; end_time: string;
  teacher_name?: string;
  members: { student_id: string; student_name: string; minutes: number; choice_rank: number | null }[];
}
interface Alert {
  student_id: string; full_name: string; season_id: string | null;
  absences: number; circle_id: string | null; circle_number: number | null;
  supervisor_id: string | null; action_taken: string | null;
}

/** لوحة المشرفة: حلقاتها + تنبيهات الغياب (غيابان فأكثر) مع الإجراء المتخذ */
export default function SupervisorPage() {
  const { user } = useAuth();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [actionDraft, setActionDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: sup } = await supabase.from('supervisors')
      .select('id').eq('user_id', user?.id ?? '').maybeSingle();
    if (!sup) { setLoading(false); return; }
    const [{ data: cs }, { data: alertRows }] = await Promise.all([
      supabase.from('circles')
        .select('id, number, weekday, start_time, end_time, teachers(full_name), circle_members(student_id, minutes, choice_rank, students(full_name))')
        .eq('supervisor_id', sup.id).eq('is_active', true).order('number'),
      supabase.from('v_absence_alerts').select('*'),
    ]);
    const myCircles = (cs || []).map((c: any) => ({
      id: c.id, number: c.number, weekday: c.weekday,
      start_time: c.start_time, end_time: c.end_time,
      teacher_name: c.teachers?.full_name,
      members: (c.circle_members || []).map((m: any) => ({
        student_id: m.student_id, minutes: m.minutes, choice_rank: m.choice_rank,
        student_name: m.students?.full_name ?? '—',
      })),
    }));
    setCircles(myCircles);
    // تنبيهات حلقاتها فقط
    const myIds = new Set(myCircles.map(c => c.id));
    const mine = (alertRows || []).filter((a: any) => a.circle_id && myIds.has(a.circle_id));
    setAlerts(mine);
    setActionDraft(Object.fromEntries(mine.map((a: any) => [a.student_id, a.action_taken ?? ''])));
    setLoading(false);
  }, [user?.id]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveAction = async (a: Alert) => {
    const action = (actionDraft[a.student_id] ?? '').trim();
    if (!action) { toast({ title: 'اكتبي الإجراء أولًا', variant: 'destructive' }); return; }
    const { error } = await supabase.from('absence_actions').upsert({
      student_id: a.student_id, season_id: a.season_id, action,
      updated_by: user?.email ?? 'مشرفة', updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,season_id' });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: 'حُفظ الإجراء المتخذ' }); fetchAll(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="text-accent" />
        <h1 className="text-2xl font-display">متابعة الحلقات</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <>
          {/* تنبيهات الغياب */}
          {alerts.length > 0 && (
            <Card className="border-yellow-400/60">
              <CardContent className="pt-5 space-y-3">
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle size={17} className="text-yellow-500" />
                  طالبات بلغن غيابين فأكثر ({alerts.length}) — يلزم إجراء
                </p>
                {alerts.map(a => (
                  <div key={`${a.student_id}-${a.season_id}`} className="flex items-center gap-2 flex-wrap border-b last:border-0 pb-2 text-sm">
                    <b>{a.full_name}</b>
                    <Badge className="bg-yellow-400 text-yellow-950">غياب {a.absences}</Badge>
                    <span className="text-muted-foreground">حلقة {a.circle_number}</span>
                    <span className="mr-auto flex items-center gap-1.5 min-w-64 flex-1 sm:flex-none">
                      <Input className="h-8 text-sm" placeholder="الإجراء المتخذ..."
                        value={actionDraft[a.student_id] ?? ''}
                        onChange={e => setActionDraft({ ...actionDraft, [a.student_id]: e.target.value })} />
                      <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => saveAction(a)}>
                        <Save size={13} /> حفظ
                      </Button>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {circles.length === 0 ? (
            <Card><CardContent className="pt-10 pb-8 text-center text-muted-foreground">
              لا حلقات مسندة إليك بعد — تُسند المشرفة للحلقة من صفحة الحلقات لدى الإدارة.
            </CardContent></Card>
          ) : circles.map(c => (
            <Card key={c.id}>
              <CardContent className="pt-5 space-y-3">
                <p className="font-medium flex items-center gap-2">
                  <Users2 size={17} className="text-accent" />
                  حلقة {c.number} — {c.teacher_name}
                  <Badge variant="outline">{WEEKDAYS[c.weekday]} {formatTime(c.start_time)} – {formatTime(c.end_time)}</Badge>
                  <Badge variant="outline">{c.members.length} طالبة</Badge>
                </p>
                {c.members.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {c.members.map(m => (
                      <div key={m.student_id} className="flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm">
                        <span className="font-medium">{m.student_name}</span>
                        <span className="text-muted-foreground text-xs mr-auto">
                          {m.minutes}د — {choiceLabel(m.choice_rank)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
