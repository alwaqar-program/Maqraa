// إعدادات النماذج القابلة للتعديل — القيم الافتراضية = النصوص المعتمدة الحالية،
// وتُدمج فوقها إعدادات form_settings إن وُجدت (fallback آمن عند غياب الصف).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FormKey = 'student_register' | 'teacher_agreement' | 'hosting_feedback';

export interface FormQuestion {
  id: string;
  form_key: FormKey;
  label: string;
  qtype: 'text' | 'select' | 'multiselect';
  options: string[];
  required: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface DayOption { value: number; label: string; }

export const FORM_DEFAULTS = {
  student_register: {
    is_open: true,
    closed_message: 'التسجيل مغلق حاليًا — نسعد بكِ في الفصل القادم بإذن الله 🌿',
    title: 'تسجيل طالبات مقرأة الوقار — الفصل الأول',
    section_data_title: 'بياناتك',
    section_track_title: 'مسارك',
    section_times_title: 'مواعيدك',
    section_pledge_title: 'عهدك وملاحظاتك',
    absence_policy_title: 'نظام الغياب والالتزام',
    important_notes_title: 'ملاحظات مهمة',
    welcome: 'غاليتنا، المقرأة استمرارٌ لعهدك مع كتاب الله بعد الختم — «كان عمله ديمة»',
    times_note: 'يرجى اختيار المواعيد المناسبة، وسيتم مراعاة الوقت المناسب في توزيع الحلقات وفق الأسبقية بالتسجيل.',
    absence_policy: '',
    pledge_text: 'أتعهد بالالتزام بنظام الحضور والغياب',
    important_notes: '',
    suggestions_title: 'مقترحاتك وملاحظاتك',
    suggestions_note: 'غاليتنا طالبة مقرأة الوقار — نسعد باستقبال مقترحاتك وملاحظاتك.',
    success_body: 'سيتم توزيع الحلقات وفق الأسبقية بالتسجيل، وسنتواصل معك على جوالك.',
    day_options: [
      { value: 0, label: 'الأحد ٥–٧ صباحًا' },
      { value: 1, label: 'الاثنين ٥–٧ صباحًا' },
      { value: 2, label: 'الثلاثاء ٥–٧ صباحًا' },
      { value: 3, label: 'الأربعاء ٥–٧ صباحًا' },
      { value: 4, label: 'الخميس ٥–٧ صباحًا' },
    ] as DayOption[],
  },
  teacher_agreement: {
    is_open: true,
    closed_message: 'استقبال المسمعات مغلق حاليًا — شكرًا لاهتمامك، تابعينا لإعلان الفصل القادم 🌿',
    duration_text: '٦ أشهر، تبدأ من تاريخ الاتفاق مع المسمعة.',
    maqraa_items: [
      'الأخلاق الحسنة والثقة والشفافية.',
      'إتاحة الفرصة لخدمة كتاب الله وحملته، وما يترتب على ذلك من عظيم الثواب.',
      'إطلاع المسمعات على منهج المقرأة وتقديم التوجيه والمعلومات اللازمة لسير العمل، ومتابعة الإشكالات الواردة والسعي في معالجتها دوريًا.',
      'منح المسمعة ساعات تطوعية موثقة في منصة التطوع.',
    ],
    teacher_items: [
      'مراعاة الضوابط الشرعية في كل ما يعد ضمن نطاق المقرأة، والتحلي بأخلاق حامل القرآن وتمثّل القدوة الحسنة للطالبات.',
      'حرص المسمعة على الرفق والتيسير والعدل بين الطالبات.',
      'الالتزام بالتسميع للطالبات وفق الطريقة المتبعة في المقرأة، مع التدوين في ملف المتابعة.',
      'الالتزام بالتسميع للطالبات وفق المواعيد المتفق عليها، بما لا يقل عن ٥ ساعات أسبوعيًا.',
      'تبليغ المشرفة حال وجود طارئ يحول دون الالتزام بالموعد المحدد واتخاذ الإجراء المناسب (الاتفاق على موعد آخر مع الطالبات / توكيل من تنوب بالتسميع بالتنسيق مع المشرفة).',
      'التحلي بالمرونة والتعاون فيما يحقق مصلحة للمقرأة والطالبات.',
    ],
    closing_text: 'هذا وصلى الله وسلم على نبينا محمد.',
    signature_hint: 'يعد بمثابة توقيع للموافقة على البنود أعلاه.',
    min_hours: 2,
    max_hours: 12,
  },
  hosting_feedback: {
    prompt_label: 'قياس الرضا عن اللقاء',
    comment_placeholder: 'ملاحظاتك (اختياري)',
  },
};

export type FormConfig<K extends FormKey> = (typeof FORM_DEFAULTS)[K] & { header_path?: string };

/** رابط صورة الترويسة المرفوعة — أو null فتُستخدم الصورة الافتراضية المضمنة */
export function headerUrl(config: { header_path?: string }): string | null {
  if (!config.header_path) return null;
  return supabase.storage.from('form-assets').getPublicUrl(config.header_path).data.publicUrl;
}

/** يجلب إعدادات النموذج وأسئلته الإضافية النشطة — مع الافتراضيات احتياطًا */
export function useFormSettings<K extends FormKey>(key: K) {
  const [config, setConfig] = useState<FormConfig<K>>(FORM_DEFAULTS[key]);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: row }, { data: qs }] = await Promise.all([
        supabase.from('form_settings').select('config').eq('form_key', key).maybeSingle(),
        supabase.from('form_questions').select('*')
          .eq('form_key', key).eq('is_active', true).order('sort_order'),
      ]);
      if (row?.config) setConfig({ ...FORM_DEFAULTS[key], ...(row.config as object) });
      setQuestions((qs || []) as FormQuestion[]);
      setLoaded(true);
    })();
  }, [key]);

  return { config, questions, loaded };
}
