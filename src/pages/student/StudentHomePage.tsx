import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Home, BookOpen, ExternalLink, Repeat } from 'lucide-react';
import { WEEKDAYS, formatTime } from '@/lib/schedule';

interface HomeData {
  name: string;
  trackName: string | null;
  quotaPages: number | null;
  selfPages: number;
  teacherPages: number;
  khatmahEquiv: number;
  circle: { number: number; weekday: number; start_time: string; my_time: string | null; teacher: string; link: string | null } | null;
}

export default function StudentHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.from('students')
        .select('id, full_name, tracks(name, quota_pages_per_season)').limit(1).maybeSingle();
      if (!me) { setLoading(false); return; }

      const [{ data: selfLogs }, { data: teacherLogs }, { data: membership }] = await Promise.all([
        supabase.from('self_recitation_log').select('pages').eq('student_id', me.id).eq('is_deleted', false),
        supabase.from('teacher_recitation_log').select('pages').eq('student_id', me.id).eq('is_deleted', false),
        supabase.from('circle_members')
          .select('start_time, circles(number, weekday, start_time, teachers(full_name, meeting_link))')
          .eq('student_id', me.id).maybeSingle(),
      ]);
      const selfPages = (selfLogs || []).reduce((s: number, r: any) => s + Number(r.pages || 0), 0);
      const teacherPages = (teacherLogs || []).reduce((s: number, r: any) => s + Number(r.pages || 0), 0);
      const c: any = membership?.circles;
      const track: any = me.tracks;
      setData({
        name: me.full_name,
        trackName: track?.name ?? null,
        quotaPages: track?.quota_pages_per_season ?? null,
        selfPages, teacherPages,
        khatmahEquiv: Math.round(((selfPages + teacherPages) / 604) * 100) / 100,
        circle: c ? {
          number: c.number, weekday: c.weekday, start_time: c.start_time,
          my_time: (membership as any)?.start_time ?? null,
          teacher: c.teachers?.full_name ?? '—', link: c.teachers?.meeting_link ?? null,
        } : null,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="text-muted-foreground">جارٍ التحميل...</p>;
  if (!data) return <p className="text-muted-foreground mt-10 text-center">حسابك غير مرتبط بملف طالبة — تواصلي مع الإدارة.</p>;

  const pct = data.quotaPages ? Math.min(100, Math.round((data.teacherPages / data.quotaPages) * 100)) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Home className="text-accent" />
        <h1 className="text-2xl font-display">أهلًا {data.name.split(' ')[0]} 🌿</h1>
      </div>

      {/* نصاب الفصل */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-body flex items-center justify-between">
            <span>إنجازك في الفصل — {data.trackName ?? 'بلا مسار'}</span>
            {pct !== null && <Badge className="bg-accent text-accent-foreground">{pct}%</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pct !== null && <Progress value={pct} className="h-3" />}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-display text-primary">{data.teacherPages}</p>
              <p className="text-xs text-muted-foreground">صفحة تسميع {data.quotaPages ? `من ${data.quotaPages}` : ''}</p>
            </div>
            <div>
              <p className="text-2xl font-display text-primary">{data.selfPages}</p>
              <p className="text-xs text-muted-foreground">صفحة سرد ذاتي</p>
            </div>
            <div>
              <p className="text-2xl font-display text-accent-foreground/80 flex items-center justify-center gap-1">
                <Repeat size={18} className="text-accent" /> {data.khatmahEquiv}
              </p>
              <p className="text-xs text-muted-foreground">ختمة مكافئة (÷604)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* حلقتي */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">حلقتك</CardTitle></CardHeader>
        <CardContent>
          {data.circle ? (
            <div className="flex flex-wrap items-center gap-4">
              <p>
                <b>حلقة {data.circle.number}</b> — {WEEKDAYS[data.circle.weekday]} {formatTime(data.circle.start_time)}
                {data.circle.my_time && <> (وقتك {formatTime(data.circle.my_time)})</>} — المسمعة {data.circle.teacher}
              </p>
              {data.circle.link && (
                <Button asChild size="sm" className="gap-1">
                  <a href={data.circle.link} target="_blank" rel="noreferrer"><ExternalLink size={14} /> دخول الجلسة</a>
                </Button>
              )}
              <Button asChild size="sm" variant="outline"><Link to="/me/circle">تفاصيل حلقتي</Link></Button>
            </div>
          ) : (
            <p className="text-muted-foreground">لم توضعي في حلقة بعد — سيتم توزيع الحلقات وستجدينها في «حلقتي».</p>
          )}
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="gap-2">
        <Link to="/me/sard"><BookOpen size={16} /> سجّلي سرد اليوم</Link>
      </Button>
    </div>
  );
}
