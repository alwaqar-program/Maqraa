// إعدادات النماذج القابلة للتعديل — القيم الافتراضية = النصوص المعتمدة الحالية،
// وتُدمج فوقها إعدادات form_settings إن وُجدت (fallback آمن عند غياب الصف).
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FormKey = 'student_register' | 'teacher_agreement' | 'hosting_feedback';

export interface FormQuestion {
  id: string;
  form_key: FormKey;
  label: string;
  qtype: 'text' | 'select' | 'multiselect' | 'note';   // note = فقرة إرشادية بلا إجابة
  options: string[];
  required: boolean;
  sort_order: number;
  is_active: boolean;
  depends_on?: string | null;      // شرطي بسؤال إضافي سابق: يظهر إذا أجيب السؤال المشار إليه...
  depends_field?: string | null;   // أو بحقل مدمج في النموذج (مفتاح من BASE_FIELDS)...
  depends_value?: string | null;   // ...بهذه الإجابة تحديدًا
}

/** حقل مدمج في النموذج يصلح شرطًا لظهور سؤال/فقرة.
 *  dynamic='tracks' يعني أن خياراته تُقرأ حيًا من جدول المسارات (القيمة = معرف المسار). */
export interface BaseField {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  dynamic?: 'tracks';
}

/** الحقول المدمجة القابلة لأن تكون شرطًا — مصدر واحد للمحرر والنماذج */
export const BASE_FIELDS: Record<FormKey, BaseField[]> = {
  student_register: [
    { key: 'track', label: 'المسار', dynamic: 'tracks' },
    { key: 'period', label: 'الفترة الأنسب', options: [
      { value: 'morning', label: 'الصباح' },
      { value: 'evening', label: 'المساء' },
      { value: 'both', label: 'كلاهما' },
    ] },
    { key: 'pledge', label: 'التعهد', options: [
      { value: 'نعم', label: 'وافقت على التعهد' },
      { value: 'لا', label: 'لم توافق بعد' },
    ] },
  ],
  // حقول اتفاقية المسمعات كلها نصية — الشرط فيها على الأسئلة الإضافية فقط
  teacher_agreement: [],
  hosting_feedback: [
    { key: 'rating', label: 'التقييم', options: [1, 2, 3, 4, 5].map(n => ({
      value: String(n), label: `${'★'.repeat(n)} (${n})`,
    })) },
  ],
};

/** موعد يوم واحد (value)، أو دوري بنفس الوقت من يوم value إلى يوم to.
 *  daily (قديم): يعني من الاثنين إلى السبت — يُقرأ للتوافق مع إعدادات محفوظة سابقًا */
export interface DayOption { value: number; label: string; start?: string; end?: string; to?: number; daily?: boolean; }

/** أيام الخيار كمصفوفة أرقام (0=الأحد..6=السبت) */
export function optionDays(d: DayOption): number[] {
  if (d.to != null && d.to !== d.value) {
    const [a, b] = d.to > d.value ? [d.value, d.to] : [d.to, d.value];
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  if (d.daily) return [1, 2, 3, 4, 5, 6];
  return [d.value];
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arNum = (n: number | string) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);
const WEEKDAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "05:00" → {h12: '٥', period: 'صباحًا'} مع الدقائق إن وجدت */
function arTime(t: string): { text: string; period: string } {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'صباحًا' : 'مساءً';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const text = m ? `${arNum(h12)}:${arNum(String(m).padStart(2, '0'))}` : arNum(h12);
  return { text, period };
}

/** "20:30" → «٨:٣٠ مساءً» — للعرض في منتقي الوقت */
export function arTimeLabel(t: string): string {
  const { text, period } = arTime(t);
  return `${text} ${period}`;
}

/** يولد نص الموعد تلقائيًا: «الأحد ٥–٧ صباحًا» أو «الأحد ١١ صباحًا – ١ مساءً»
 *  to (دوري): «يوميًا من الاثنين إلى السبت ٥–٧ صباحًا»
 *  (يقبل true للتوافق القديم = الاثنين إلى السبت) */
export function genSlotLabel(weekday: number, start: string, end: string, to?: number | boolean): string {
  const fromDay = to === true ? 1 : weekday;
  const toDay = to === true ? 6 : typeof to === 'number' ? to : null;
  const prefix = toDay != null && toDay !== fromDay
    ? `يوميًا من ${WEEKDAY_NAMES[Math.min(fromDay, toDay)]} إلى ${WEEKDAY_NAMES[Math.max(fromDay, toDay)]}`
    : (WEEKDAY_NAMES[weekday] ?? '');
  if (!start || !end) return prefix;
  const a = arTime(start), b = arTime(end);
  const times = a.period === b.period
    ? `${a.text}–${b.text} ${a.period}`
    : `${a.text} ${a.period} – ${b.text} ${b.period}`;
  return `${prefix} ${times}`;
}

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
    // مواعيد خاصة: المسارات المحددة هنا ترى قائمة مواعيد مختلفة في نموذج التسجيل
    special_track_ids: [] as string[],
    special_day_options: [] as DayOption[],
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
