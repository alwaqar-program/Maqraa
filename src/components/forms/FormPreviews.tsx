import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { FormQuestion } from '@/lib/form-settings';
import ExtraQuestions, { ExtraAnswers } from './ExtraQuestions';
import RegisterPage from '@/pages/RegisterPage';
import RegisterTeacherPage from '@/pages/RegisterTeacherPage';

/**
 * معاينات النماذج داخل صفحة «النماذج» — تعرض المسودة قبل الحفظ.
 * نماذج التسجيل والاتفاقية تعرض الصفحات الحقيقية نفسها بالمسودة المحقونة
 * (الإرسال معطل) — فأي تعديل على الصفحات المنشورة ينعكس هنا تلقائيًا.
 */

export function StudentRegisterPreview({ config, questions }: { config: any; questions: FormQuestion[] }) {
  return <RegisterPage preview={{ config, questions }} />;
}

export function TeacherAgreementPreview({ config, questions }: { config: any; questions: FormQuestion[] }) {
  return <RegisterTeacherPage preview={{ config, questions }} />;
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
