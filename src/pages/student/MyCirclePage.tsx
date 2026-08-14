import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users2, Link2 } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';

interface MyCircle {
  number: number; weekday: number; start_time: string; end_time: string;
  minutes: number; teacher_name: string; meeting_link: string | null;
}

/** حلقة الطالبة — التوزيع إداري (لا حجز ذاتي) */
export default function MyCirclePage() {
  const [circle, setCircle] = useState<MyCircle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.from('students').select('id').limit(1).maybeSingle();
      if (!me) { setLoading(false); return; }
      const { data } = await supabase.from('circle_members')
        .select('minutes, circles(number, weekday, start_time, end_time, is_active, teachers(full_name, meeting_link))')
        .eq('student_id', me.id).maybeSingle();
      const c: any = data?.circles;
      if (c) setCircle({
        number: c.number, weekday: c.weekday, start_time: c.start_time, end_time: c.end_time,
        minutes: (data as any).minutes, teacher_name: c.teachers?.full_name ?? '—',
        meeting_link: c.teachers?.meeting_link ?? null,
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Users2 className="text-accent" />
        <h1 className="text-2xl font-display">حلقتي</h1>
      </div>

      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : !circle ? (
        <Card><CardContent className="pt-10 pb-8 text-center space-y-2">
          <p className="text-4xl">🌿</p>
          <p>لم توضعي في حلقة بعد — سيتم توزيع الحلقات وفق الأسبقية بالتسجيل، وستجدين حلقتك هنا.</p>
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <p className="font-display text-4xl text-primary">حلقة {circle.number}</p>
            <p className="text-lg">المسمعة: <b>{circle.teacher_name}</b></p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-sm px-3 py-1">
                {WEEKDAYS[circle.weekday]} {formatTime(circle.start_time)} – {formatTime(circle.end_time)}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">مدة تسميعك: {circle.minutes} دقيقة</Badge>
            </div>
            {circle.meeting_link && (
              <a href={circle.meeting_link} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-info hover:underline">
                <Link2 size={15} /> رابط اجتماع الحلقة
              </a>
            )}
            <p className="text-xs text-muted-foreground">
              لتغيير الحلقة تواصلي مع إدارة المقرأة.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
