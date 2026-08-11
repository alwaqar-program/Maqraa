import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Star } from 'lucide-react';
import { FormQuestion, headerUrl } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers } from './ExtraQuestions';
import headerDefault from '@/assets/header.png';

/**
 * معاينات النماذج داخل صفحة «النماذج» — تعرض المسودة قبل الحفظ.
 * نسخ عرضٍ مطابقة بصريًا للنماذج العامة (الأزرار معطلة).
 */

function PreviewShell({ children, config }: { children: React.ReactNode; config: any }) {
  return (
    <div className="bg-background rounded-xl border p-6 space-y-5 text-right">
      <img src={headerUrl(config) ?? headerDefault} alt="" className="w-full rounded-xl" />
      {children}
    </div>
  );
}

export function StudentRegisterPreview({ config, questions }: { config: any; questions: FormQuestion[] }) {
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([]);
  const [extra, setExtra] = useState<ExtraAnswers>({});
  useEffect(() => {
    supabase.from('tracks').select('id, name').eq('is_active', true).order('sort_order')
      .then(({ data }) => setTracks(data || []));
  }, []);

  if (config.is_open === false) {
    return (
      <Card className="text-center"><CardContent className="py-10 space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="text-lg">{config.closed_message}</p>
      </CardContent></Card>
    );
  }

  return (
    <PreviewShell config={config}>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-display">{config.title}</h2>
        <p className="text-muted-foreground text-sm">{config.welcome}</p>
      </div>
      <div className="space-y-2">
        <Label>الاســم الربــاعـي <span className="text-destructive">*</span></Label>
        <Input disabled placeholder="" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label>رقم الهوية *</Label><Input disabled /></div>
        <div className="space-y-2"><Label>رقم الجوال *</Label><Input disabled dir="ltr" placeholder="05xxxxxxxx" /></div>
      </div>
      <div className="space-y-2">
        <Label>المســار *</Label>
        <div className="flex flex-wrap gap-2">
          {tracks.map(t => (
            <span key={t.id} className="border rounded-lg px-3 py-2 text-sm">{t.name}</span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>المواعيد المناسبة</Label>
        <p className="text-xs text-muted-foreground">{config.times_note}</p>
        <div className="grid gap-2">
          {(config.day_options ?? []).map((d: any, i: number) => (
            <span key={i} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm">
              <Checkbox disabled /> {d.label}
            </span>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>الـفـتـرة الأنـسـب</Label>
        <div className="flex gap-2">
          <span className="border rounded-lg px-4 py-2 text-sm">صباح</span>
          <span className="border rounded-lg px-4 py-2 text-sm">مساء</span>
        </div>
      </div>
      <div className="space-y-2">
        <Label>مقترحاتك وملاحظاتك</Label>
        <p className="text-xs text-muted-foreground">{config.suggestions_note}</p>
        <Textarea disabled rows={2} />
      </div>

      <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />

      {config.absence_policy?.trim() && (
        <div className="border border-accent/40 bg-accent/5 rounded-lg p-4 space-y-1">
          <p className="font-display text-primary">{config.absence_policy_title ?? 'نظام الغياب والالتزام'}</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.absence_policy}</p>
        </div>
      )}
      <span className="flex items-center gap-2 border rounded-lg px-3 py-3 text-sm font-medium">
        <Checkbox disabled /> {config.pledge_text}
      </span>
      {config.important_notes?.trim() && (
        <div className="border rounded-lg p-4 space-y-1 bg-muted/40">
          <p className="font-display text-primary">{config.important_notes_title ?? 'ملاحظات مهمة'}</p>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.important_notes}</p>
        </div>
      )}
      <Button className="w-full" disabled>إرسال التسجيل</Button>
    </PreviewShell>
  );
}

export function TeacherAgreementPreview({ config, questions }: { config: any; questions: FormQuestion[] }) {
  const [extra, setExtra] = useState<ExtraAnswers>({});

  if (config.is_open === false) {
    return (
      <Card className="text-center"><CardContent className="py-10 space-y-3">
        <p className="text-4xl">🔒</p>
        <p className="text-lg">{config.closed_message}</p>
      </CardContent></Card>
    );
  }

  return (
    <PreviewShell config={config}>
      <h2 className="text-xl font-display text-center">اتفاقية المسمعات في مقرأة الوقار</h2>
      <p className="text-center text-2xl font-display">﷽</p>
      <div>
        <h3 className="font-display text-primary mb-1">مدة التعاون مع المقرأة</h3>
        <p className="text-sm">{config.duration_text}</p>
      </div>
      <div>
        <h3 className="font-display text-primary mb-1">تلتزم (مقرأة الوقار) تجاه (المسمعات) بـ:</h3>
        <ul className="space-y-1 text-sm">{(config.maqraa_items ?? []).map((x: string, i: number) => <li key={i}>✦ {x}</li>)}</ul>
      </div>
      <div>
        <h3 className="font-display text-primary mb-1">كما تلتزم (المسمعات) تجاه (مقرأة الوقار) بـ:</h3>
        <ul className="space-y-1 text-sm">{(config.teacher_items ?? []).map((x: string, i: number) => <li key={i}>✦ {x}</li>)}</ul>
      </div>
      <p className="text-center text-sm">{config.closing_text}</p>
      <div className="border-t pt-4 space-y-3">
        <div className="space-y-1">
          <Label>اسم المسمعة *</Label>
          <Input disabled />
          <p className="text-xs text-muted-foreground">{config.signature_hint}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          المواعيد: يوم + من/إلى — بمجموع {config.min_hours}–{config.max_hours} ساعة أسبوعيًا
        </p>
        <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />
        <Button className="w-full" disabled>أوافق على البنود وأوقّع</Button>
      </div>
    </PreviewShell>
  );
}

export function HostingFeedbackPreview({ config, questions }: { config: any; questions: FormQuestion[] }) {
  const [extra, setExtra] = useState<ExtraAnswers>({});
  return (
    <div className="bg-background rounded-xl border p-6 space-y-3 text-right">
      <p className="font-medium flex items-center gap-1"><Star size={14} className="text-accent" /> {config.prompt_label}</p>
      <div className="flex gap-1 text-2xl text-muted-foreground/40" dir="ltr">★★★★★</div>
      <Textarea disabled rows={2} placeholder={config.comment_placeholder} />
      <ExtraQuestions questions={questions} answers={extra} onChange={setExtra} />
      <Button size="sm" disabled>إرسال التقييم</Button>
    </div>
  );
}
