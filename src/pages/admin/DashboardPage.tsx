import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayoutDashboard, Users, GraduationCap, CalendarClock, Mic, BookOpen, Repeat, AlertTriangle } from 'lucide-react';

interface Stats {
  students: number;
  teachers: number;
  weeklyHours: number;
  inCircles: number;
  withoutCircle: number;
  tasmeePages: number;
  selfPages: number;
  khatmahEquiv: number;
  absenceAlerts: { student_id: string; full_name: string; absences: number }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [students, teachers, hours, members, tasmee, selfLogs, alerts] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('v_teacher_weekly_hours').select('total_hours'),
        supabase.from('circle_members').select('id', { count: 'exact', head: true }),
        supabase.from('teacher_recitation_log').select('pages').eq('is_deleted', false),
        supabase.from('self_recitation_log').select('pages').eq('is_deleted', false),
        supabase.from('v_absence_alerts').select('*'),
      ]);
      const tasmeePages = (tasmee.data || []).reduce((a: number, r: any) => a + Number(r.pages || 0), 0);
      const selfPages = (selfLogs.data || []).reduce((a: number, r: any) => a + Number(r.pages || 0), 0);
      setStats({
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        weeklyHours: Math.round((hours.data || []).reduce((a: number, r: any) => a + Number(r.total_hours || 0), 0) * 10) / 10,
        // الطالبة في حلقة واحدة (student_id فريد في circle_members) — والباقيات بلا حلقة
        inCircles: members.count ?? 0,
        withoutCircle: Math.max(0, (students.count ?? 0) - (members.count ?? 0)),
        tasmeePages: Math.round(tasmeePages),
        selfPages: Math.round(selfPages),
        khatmahEquiv: Math.round(((tasmeePages + selfPages) / 604) * 100) / 100,
        absenceAlerts: (alerts.data || []) as any,
      });
    })();
  }, []);

  if (!stats) return <p className="text-muted-foreground">جارٍ التحميل...</p>;

  const tiles = [
    { label: 'الطالبات', value: stats.students, icon: <Users size={20} />, href: '/students' },
    { label: 'المسمعات', value: stats.teachers, icon: <GraduationCap size={20} />, href: '/teachers' },
    { label: 'ساعة أسبوعية', value: stats.weeklyHours, icon: <CalendarClock size={20} />, href: '/teacher-time' },
    { label: 'طالبة في حلقة', value: stats.inCircles, icon: <CalendarClock size={20} />, href: '/circles' },
    { label: 'وجه تسميع', value: stats.tasmeePages, icon: <Mic size={20} />, href: '/reports' },
    { label: 'وجه سرد ذاتي', value: stats.selfPages, icon: <BookOpen size={20} />, href: '/reports' },
    { label: 'ختمة مكافئة', value: stats.khatmahEquiv, icon: <Repeat size={20} />, href: '/reports' },
    { label: 'طالبة بلا حلقة', value: stats.withoutCircle, icon: <CalendarClock size={20} />, href: '/circles' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="text-accent" />
        <h1 className="text-2xl font-display">لوحة المعلومات</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map(t => (
          <Link key={t.label + t.value} to={t.href}>
            <Card className="hover:border-accent transition-colors">
              <CardContent className="pt-5 text-center space-y-1">
                <div className="text-accent flex justify-center">{t.icon}</div>
                <p className="text-3xl font-display text-primary">{t.value}</p>
                <p className="text-sm text-muted-foreground">{t.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {stats.absenceAlerts.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} /> تجاوزن حد الغيابات (3 غيابات بعذر أو بدون)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {stats.absenceAlerts.map(a => (
              <Badge key={a.student_id} variant="destructive">{a.full_name} — {a.absences} غيابات</Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
