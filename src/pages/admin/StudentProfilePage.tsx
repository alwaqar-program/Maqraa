import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRight, User } from 'lucide-react';
import { surahNameOf } from '@/lib/mushaf';
import { WEEKDAYS, formatTime } from '@/lib/schedule';
import { choiceLabel } from '@/lib/circles';
import { FormQuestion } from '@/lib/form-settings';
import { answerText } from '@/components/forms/ExtraQuestions';

/** ملف الطالبة الشامل — كل ما يتعلق بها في مكان واحد (يُفتح من الطالبات والمتقدمات والأرشيف) */

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: 'نشطة', cls: 'text-success border-success' },
  withdrawn: { label: 'منسحبة', cls: 'text-warning border-warning' },
  excluded: { label: 'مستبعدة', cls: 'text-destructive border-destructive' },
};
const ATT_META: Record<string, { label: string; cls: string }> = {
  present: { label: 'حضور', cls: 'bg-success/15 text-success border-success/40' },
  makeup: { label: 'تعويض', cls: 'bg-orange-500/15 text-orange-600 border-orange-400/50' },
  absent: { label: 'غياب', cls: 'bg-yellow-400/20 text-yellow-700 border-yellow-500/50' },
  late: { label: 'متأخرة', cls: '' },
};
const PERIOD_LABEL: Record<string, string> = { morning: 'الصباح', evening: 'المساء', both: 'كلاهما' };

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<any>(null);
  const [applicant, setApplicant] = useState<any>(null);
  const [extraQs, setExtraQs] = useState<FormQuestion[]>([]);
  const [circle, setCircle] = useState<any>(null);
  const [tasmee, setTasmee] = useState<any[]>([]);
  const [sard, setSard] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [pledges, setPledges] = useState<any[]>([]);
  const [absenceAction, setAbsenceAction] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: st } = await supabase.from('students')
        .select('*, tracks(name, juz_count)').eq('id', id).maybeSingle();
      setStudent(st);
      const [{ data: cm }, { data: t }, { data: s }, { data: att }, { data: ex }, { data: pl }, { data: qs }, { data: aa }] =
        await Promise.all([
          supabase.from('circle_members')
            .select('minutes, choice_rank, start_time, circles(number, weekday, start_time, end_time, teachers(full_name))')
            .eq('student_id', id).maybeSingle(),
          supabase.from('teacher_recitation_log')
            .select('id, date, from_surah, from_verse, to_surah, to_verse, pages, score, grade, teachers(full_name)')
            .eq('student_id', id).eq('is_deleted', false).order('date', { ascending: false }).range(0, 499),
          supabase.from('self_recitation_log')
            .select('id, date, from_surah, from_verse, to_surah, to_verse, pages')
            .eq('student_id', id).eq('is_deleted', false).order('date', { ascending: false }).range(0, 499),
          supabase.from('session_attendance')
            .select('id, date, status, reason, notes')
            .eq('student_id', id).eq('is_deleted', false).order('date', { ascending: false }).range(0, 499),
          supabase.from('exams')
            .select('id, date, title, score, max_score, notes, teachers(full_name)')
            .eq('student_id', id).eq('is_deleted', false).order('date', { ascending: false }),
          supabase.from('student_pledges')
            .select('signed_at, pledge_templates(title)').eq('student_id', id),
          supabase.from('form_questions').select('*').eq('form_key', 'student_register').order('sort_order'),
          supabase.from('absence_actions').select('action').eq('student_id', id).maybeSingle(),
        ]);
      setCircle(cm);
      setTasmee(t || []); setSard(s || []); setAttendance(att || []);
      setExams(ex || []); setPledges(pl || []); setExtraQs((qs || []) as FormQuestion[]);
      setAbsenceAction((aa as any)?.action ?? null);
      // استمارة تقديمها: بربط الملف أو برقم الهوية — نفس البيانات بلا تكرار
      if (st) {
        const { data: apps } = await supabase.from('applicants')
          .select('*').or(`student_id.eq.${id},national_id.eq.${st.national_id}`)
          .order('created_at').limit(1);
        setApplicant(apps?.[0] ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-muted-foreground">جارٍ التحميل...</p>;
  if (!student) return <p className="text-muted-foreground">لم يُعثر على الطالبة.</p>;

  const range = (r: any) => `${surahNameOf(r.from_surah)} ${r.from_verse} ← ${surahNameOf(r.to_surah)} ${r.to_verse}`;
  const tasmeePages = tasmee.reduce((a, r) => a + Number(r.pages || 0), 0);
  const sardPages = sard.reduce((a, r) => a + Number(r.pages || 0), 0);
  const totalPages = tasmeePages + sardPages;
  const khatmat = Math.floor(totalPages / 604);
  const attCount = (k: string) => attendance.filter(a => a.status === k).length;
  const status = STATUS_LABEL[student.status ?? 'active'] ?? STATUS_LABEL.active;
  const c = circle?.circles;

  const stats = [
    { label: 'صفحات التسميع', value: tasmeePages },
    { label: 'صفحات السرد', value: sardPages },
    { label: 'المنجز الكلي', value: `${totalPages} ص` },
    { label: 'حضور', value: attCount('present') },
    { label: 'تعويض', value: attCount('makeup') },
    { label: 'غياب', value: attCount('absent') },
  ];

  return (
    <div className="space-y-6">
      {/* الترويسة */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="رجوع">
          <ArrowRight size={18} />
        </Button>
        <User className="text-accent" />
        <h1 className="text-2xl font-display">{student.full_name}</h1>
        <Badge variant="outline" className={status.cls}>{status.label}</Badge>
        {student.tracks?.name && <Badge variant="outline">{student.tracks.name}</Badge>}
        {khatmat >= 1 && (
          <Badge className="bg-accent text-accent-foreground gap-1">
            🌿 {khatmat === 1 ? 'ختمة' : `${khatmat} ختمات`}
          </Badge>
        )}
        {student.user_id
          ? <Badge variant="outline" className="text-success border-success">حساب مفعّل</Badge>
          : <Badge variant="outline" className="text-muted-foreground">بلا حساب</Badge>}
      </div>

      {student.status && student.status !== 'active' && (
        <Card className="border-warning/60"><CardContent className="pt-4 pb-3 text-sm">
          {status.label} بتاريخ {student.status_date ?? '—'}{student.status_reason ? ` — السبب: ${student.status_reason}` : ''}
        </CardContent></Card>
      )}

      {/* الإحصاءات */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {stats.map(x => (
          <Card key={x.label}><CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-display text-primary">{x.value}</p>
            <p className="text-xs text-muted-foreground">{x.label}</p>
          </CardContent></Card>
        ))}
      </div>
      {attCount('absent') >= 2 && (
        <Card className="border-destructive/50"><CardContent className="pt-4 pb-3 text-sm">
          ⚠️ بلغت {attCount('absent')} غيابات — الإجراء المتخذ: {absenceAction ?? 'لم يُسجل بعد'}
        </CardContent></Card>
      )}

      {/* البيانات + الحلقة + التقديم */}
      <div className="grid md:grid-cols-3 gap-4 items-start">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base font-body">البيانات</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p>رقم الهوية: <b dir="ltr">{student.national_id}</b></p>
            <p>الجوال: <b dir="ltr">{student.phone ?? '—'}</b></p>
            <p>البريد: <b dir="ltr">{student.email ?? '—'}</b></p>
            <p>المسار: <b>{student.tracks?.name ?? '—'}</b></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base font-body">حلقتها</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {c ? (
              <>
                <p>الحلقة: <b>({c.number}) أ.{c.teachers?.full_name ?? '—'}</b></p>
                <p>وقت الحلقة: {WEEKDAYS[c.weekday]} {formatTime(c.start_time)} – {formatTime(c.end_time)}</p>
                <p>وقتها الفردي: <b>{circle.start_time ? formatTime(circle.start_time) : '—'}</b> ({circle.minutes} دقيقة)</p>
                <p>وُضعت في: <b>{circle.choice_rank ? `اختيارها ${choiceLabel(circle.choice_rank)}` : 'إسناد يدوي'}</b></p>
              </>
            ) : <p className="text-muted-foreground">غير موزعة على حلقة بعد.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base font-body">بيانات التقديم</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {applicant ? (
              <>
                <p>تاريخ التقديم: {String(applicant.created_at).slice(0, 10)}</p>
                <p>الفترة الأنسب: {PERIOD_LABEL[applicant.preferred_period] ?? '—'}</p>
                {(applicant.preferred_slots ?? []).length > 0 && (
                  <div>
                    <p className="mb-1">أولوياتها للمواعيد:</p>
                    <ol className="space-y-0.5 pr-4 list-decimal marker:text-accent">
                      {applicant.preferred_slots.map((sl: string, i: number) => <li key={i}>{sl}</li>)}
                    </ol>
                  </div>
                )}
                {applicant.suggestions && <p>مقترحاتها: {applicant.suggestions}</p>}
                {extraQs.filter(q => applicant.extra_answers?.[q.id] != null).map(q => (
                  <p key={q.id}>{q.label}: <b>{answerText(applicant.extra_answers[q.id])}</b></p>
                ))}
              </>
            ) : <p className="text-muted-foreground">لا توجد استمارة تقديم مرتبطة.</p>}
          </CardContent>
        </Card>
      </div>

      {/* السجلات */}
      <Tabs defaultValue="tasmee" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="tasmee">التسميع ({tasmee.length})</TabsTrigger>
          <TabsTrigger value="sard">السرد الذاتي ({sard.length})</TabsTrigger>
          <TabsTrigger value="attendance">الحضور ({attendance.length})</TabsTrigger>
          <TabsTrigger value="exams">الاختبارات ({exams.length})</TabsTrigger>
          <TabsTrigger value="pledges">التعهدات ({pledges.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tasmee">
          <Card><CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>النطاق</TableHead><TableHead>الصفحات</TableHead>
                <TableHead>الدرجة</TableHead><TableHead>التقدير</TableHead><TableHead>المسمعة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {tasmee.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{range(r)}</TableCell>
                    <TableCell>{r.pages}</TableCell>
                    <TableCell>{r.score}</TableCell>
                    <TableCell><Badge variant={r.grade === 'ممتاز' ? 'default' : 'outline'}>{r.grade}</Badge></TableCell>
                    <TableCell>{r.teachers?.full_name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="sard">
          <Card><CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>النطاق</TableHead><TableHead>الصفحات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sard.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell className="whitespace-nowrap">{range(r)}</TableCell>
                    <TableCell>{r.pages}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card><CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>الحالة</TableHead>
                <TableHead>السبب</TableHead><TableHead>ملاحظات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {attendance.map(r => {
                  const m = ATT_META[r.status] ?? { label: r.status, cls: '' };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                      <TableCell><Badge variant="outline" className={m.cls}>{m.label}</Badge></TableCell>
                      <TableCell>{r.reason ?? '—'}</TableCell>
                      <TableCell>{r.notes ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="exams">
          <Card><CardContent className="pt-6 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>التاريخ</TableHead><TableHead>الاختبار</TableHead>
                <TableHead>الدرجة</TableHead><TableHead>المسمعة</TableHead><TableHead>ملاحظات</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exams.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.score} / {r.max_score}</TableCell>
                    <TableCell>{r.teachers?.full_name ?? '—'}</TableCell>
                    <TableCell>{r.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="pledges">
          <Card><CardContent className="pt-6">
            {pledges.length === 0 ? <p className="text-muted-foreground text-sm">لم توقع أي تعهد بعد.</p> : (
              <ul className="space-y-2 text-sm">
                {pledges.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    ✒️ {p.pledge_templates?.title ?? 'تعهد'}
                    <span className="text-muted-foreground text-xs">— وُقع في {String(p.signed_at).slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
