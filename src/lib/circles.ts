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

/** صفحات الجلسة الواحدة: نصاب الفصل ÷ عدد الجلسات — ٧ / ١٤ / ٢٩ / ٤٣ للمسارات المعتمدة */
export function sessionPages(track: TrackLike): number {
  if (track && typeof track === 'object' && track.quota_pages_per_season != null) {
    return Math.max(1, Math.round(Number(track.quota_pages_per_season) / SESSIONS_PER_SEASON));
  }
  const juz = Number((typeof track === 'number' ? track : track?.juz_count) ?? 0);
  if (juz <= 5) return 7;
  if (juz <= 10) return 14;
  if (juz <= 20) return 29;
  return 43;
}

/** دقائق الطالبة في موعدها = صفحات الجلسة × ثواني الصفحة لمسارها، مقرَّبة لأعلى دقيقة */
export function trackMinutes(track: TrackLike): number {
  return Math.max(1, Math.ceil(sessionPages(track) * trackSeconds(track) / 60));
}

/** صف توفر: يوم ووقت — مصدره v_public_circle_times أو availability_slots */
export interface TimeRow { weekday: number; start_time: string; end_time: string }

/** سعة الموعد بالدقائق **للجلسة الواحدة** = مجموع نوافذ المسمعات التي تعرضه.
 *  الخيار الواحد قد يمثل عدة مسمعات بنفس اليوم والوقت (تُجمع نوافذهن)،
 *  والموعد الدوري يتكرر عدة أيام بنفس النافذة — والطالبة تحضره كل يوم،
 *  فسعته لا تتضاعف بعدد الأيام: نقسم على عدد الأيام المطابقة. */
export function slotCapacity(rows: TimeRow[], opt: { days: number[]; start?: string; end?: string }): number {
  if (!opt.start || !opt.end) return 0;
  const matched = rows.filter(r => opt.days.includes(r.weekday)
    && r.start_time.slice(0, 5) === opt.start!.slice(0, 5)
    && r.end_time.slice(0, 5) === opt.end!.slice(0, 5));
  if (!matched.length) return 0;
  const dayCount = new Set(matched.map(r => r.weekday)).size;
  return Math.round(matched.reduce((a, r) => a + durationMinutes(r.start_time, r.end_time), 0) / dayCount);
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

/** فئة المتبقي للختمة (بالصفحات، الختمة 604) — كتظليل النموذج السابق */
export function remainingCategory(remainingPages: number): { label: string; cls: string } {
  if (remainingPages <= 10) return { label: 'متبقي حزب فأقل', cls: 'bg-orange-100 dark:bg-orange-950/40' };
  if (remainingPages <= 20) return { label: 'متبقي جزء فأقل', cls: 'bg-pink-100 dark:bg-pink-950/40' };
  if (remainingPages <= 60) return { label: 'متبقي ٣ أجزاء فأقل', cls: 'bg-sky-100 dark:bg-sky-950/40' };
  return { label: 'متبقي أكثر من ٣ أجزاء', cls: 'bg-green-100 dark:bg-green-950/40' };
}
