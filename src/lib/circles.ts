// منطق الحلقات المشترك: دقائق الطالبة حسب مسارها، سعة الموعد، ونص رقم الاختيار

/** عدد جلسات الفصل — كما في صفحة المسارات (نصاب الفصل ÷ ١٤ = نصاب الجلسة) */
export const SESSIONS_PER_SEASON = 14;
/** سرعة التسميع الافتراضية إن لم تُحدَّد للمسار: دقيقة و٤٠ ثانية للصفحة */
export const SECONDS_PER_PAGE = 100;

/** مسار كما يصل من القاعدة، أو عدد أجزائه فقط (توافق مع نداءات قديمة) */
export type TrackLike =
  | { quota_pages_per_season?: number | null; juz_count?: number | null; seconds_per_page?: number | null }
  | number | null | undefined;

/** ثواني الصفحة لهذا المسار (عمود tracks.seconds_per_page) */
export function trackSeconds(track: TrackLike): number {
  const s = track && typeof track === 'object' ? Number(track.seconds_per_page ?? 0) : 0;
  return s > 0 ? s : SECONDS_PER_PAGE;
}

/** «١:٤٠» — سرعة الصفحة بصيغة دقيقة:ثانية */
export function paceLabel(seconds: number): string {
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s} ثانية`;
}

/** صفحات الطالبة في الأسبوع = نصاب الفصل ÷ عدد أسابيع الفصل.
 *  المسار الأسبوعي جلسة واحدة (٧ / ١٤ / ٢٩ / ٤٣ صفحة)، والختمة الدورية
 *  ٦٠٤ صفحة موزَّعة على جلسات أيامها — والمقارنة أسبوعية في الطرفين. */
export function weeklyPages(track: TrackLike): number {
  if (track && typeof track === 'object' && track.quota_pages_per_season != null) {
    return Math.max(1, Math.round(Number(track.quota_pages_per_season) / SESSIONS_PER_SEASON));
  }
  const juz = Number((typeof track === 'number' ? track : track?.juz_count) ?? 0);
  if (juz <= 5) return 7;
  if (juz <= 10) return 14;
  if (juz <= 20) return 29;
  return 43;
}

/** دقائق الطالبة أسبوعيًا = صفحات أسبوعها × ثواني الصفحة لمسارها، مقرَّبة لأعلى دقيقة.
 *  للمسار الأسبوعي هي دقائق موعدها الواحد، وللختمة الدورية مجموع أيامها. */
export function trackMinutes(track: TrackLike): number {
  return Math.max(1, Math.ceil(weeklyPages(track) * trackSeconds(track) / 60));
}

/** علامة «مستبعدة من الفرز» — تُخزن في applicants.sort_slot_label (بلا مسمعة):
 *  تخرج الطالبة من شبكة الفرز ويتجاوزها التوزيع التلقائي حتى تُعاد */
export const SORT_EXCLUDED = '__مستبعدة من الفرز__';

/** صف توفر: يوم ووقت — مصدره v_public_circle_times أو availability_slots */
export interface TimeRow { weekday: number; start_time: string; end_time: string }

/** سعة الموعد **أسبوعيًا** = مجموع نوافذه في كل أيامه ولكل مسمعاته.
 *  فالموعد الدوري (الاثنين–السبت ٤–٦ مساءً) سعته ١٢ ساعة أسبوعيًا،
 *  وهي التي تُقارن بحاجة الطالبة الأسبوعية — فتغطي طالبة ختمة أسبوعية. */
export function slotCapacity(rows: TimeRow[], opt: { days: number[]; start?: string; end?: string }): number {
  if (!opt.start || !opt.end) return 0;
  return rows
    .filter(r => opt.days.includes(r.weekday)
      && r.start_time.slice(0, 5) === opt.start!.slice(0, 5)
      && r.end_time.slice(0, 5) === opt.end!.slice(0, 5))
    .reduce((a, r) => a + durationMinutes(r.start_time, r.end_time), 0);
}

/** مدة الحلقة بالدقائق من وقتي البداية والنهاية "HH:MM" */
export function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

/** «الاختيار الأول/الثاني/...» أو «إسناد يدوي» */
export function choiceLabel(rank: number | null | undefined): string {
  if (!rank) return 'إسناد يدوي';
  return `الاختيار ${ORDINALS[rank - 1] ?? rank}`;
}

/** أسباب الغياب والتعويض المعتمدة */
export const ATTENDANCE_REASONS = ['مرض', 'نوم', 'ظرف عائلي', 'ظرف عمل', 'نسيان'] as const;

/** "07:30" + 20 → "07:50" */
export function addMinutes(time: string, mins: number): string {
  const [h, m] = time.slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** أوقات كل دقيقتين داخل نافذة الحلقة — لتعديل وقت الطالبة يدويًا
 *  (الخطوة دقيقتان لأن الأوقات المولَّدة تتراكم بمضاعفات ١٢/٢٤/٤٩/٧٢) */
export function timeOptionsWithin(start: string, end: string, step = 2): string[] {
  const out: string[] = [];
  for (let t = start.slice(0, 5); t < end.slice(0, 5); t = addMinutes(t, step)) out.push(t);
  return out;
}

/** لوحة ألوان المسمعات — درجات هادئة متناسقة مع كريمي وبني وذهبي الهوية */
export const TEACHER_COLORS = [
  '#8C6A4A', // بني القهوة
  '#C08A2E', // ذهبي
  '#6E8B6B', // زيتوني
  '#4F7A8A', // أزرق مغبر
  '#8A5A6E', // توتي
  '#A0703C', // عسلي
  '#5F6B8A', // نيلي هادئ
  '#7A8C4F', // أخضر ليموني
  '#9A5C4A', // طوبي
  '#6B5B8A', // بنفسجي هادئ
];

/** لون المسمعة المحفوظ، أو لون ثابت من اللوحة حسب ترتيبها */
export function teacherColor(color: string | null | undefined, index = 0): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : TEACHER_COLORS[index % TEACHER_COLORS.length];
}

/** لون نص مقروء فوق لون معطى (أبيض للداكن، فحمي للفاتح) */
export function textOn(hex: string): string {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#1c1917' : '#ffffff';
}

/** درجات امتلاء الحلقة بألوان النظام: شاغرة رمادي، متاحة أخضر،
 *  تقترب ذهبي (لون الهوية)، مكتملة كهرماني، متجاوزة أحمر */
export interface FillTone { key: string; label: string; block: string; gauge: string; text: string }
export function fillTone(used: number, capacity: number, over = false): FillTone {
  const pct = capacity > 0 ? (used / capacity) * 100 : 0;
  if (over || pct > 100) return {
    key: 'over', label: 'متجاوزة',
    block: 'border-destructive/60 bg-destructive/5', gauge: 'bg-destructive', text: 'text-destructive',
  };
  if (used === 0) return {
    key: 'empty', label: 'شاغرة',
    block: 'border-border bg-muted/20', gauge: 'bg-muted-foreground/25', text: 'text-muted-foreground',
  };
  if (pct < 60) return {
    key: 'open', label: 'متاحة',
    block: 'border-success/40 bg-success/5', gauge: 'bg-success', text: 'text-success',
  };
  if (pct < 90) return {
    key: 'filling', label: 'تقترب من الاكتمال',
    block: 'border-accent/60 bg-accent/10', gauge: 'bg-accent', text: 'text-accent-foreground',
  };
  return {
    key: 'full', label: 'مكتملة',
    block: 'border-warning/60 bg-warning/10', gauge: 'bg-warning', text: 'text-warning',
  };
}

/** فئة المتبقي للختمة (بالصفحات، الختمة 604) — كتظليل النموذج السابق */
export function remainingCategory(remainingPages: number): { label: string; cls: string } {
  if (remainingPages <= 10) return { label: 'متبقي حزب فأقل', cls: 'bg-orange-100 dark:bg-orange-950/40' };
  if (remainingPages <= 20) return { label: 'متبقي جزء فأقل', cls: 'bg-pink-100 dark:bg-pink-950/40' };
  if (remainingPages <= 60) return { label: 'متبقي ٣ أجزاء فأقل', cls: 'bg-sky-100 dark:bg-sky-950/40' };
  return { label: 'متبقي أكثر من ٣ أجزاء', cls: 'bg-green-100 dark:bg-green-950/40' };
}
