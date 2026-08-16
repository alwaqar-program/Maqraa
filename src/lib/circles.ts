// منطق الحلقات المشترك: دقائق الطالبة حسب مسارها، سعة الحلقة، ونص رقم الاختيار

/** دقائق التسميع الأسبوعية حسب المسار: ٥أجزاء=10د، ١٠=20د، ٢٠=40د، ختمة=60د */
export function trackMinutes(juzCount: number | null | undefined): number {
  const j = Number(juzCount ?? 0);
  if (j <= 5) return 10;
  if (j <= 10) return 20;
  if (j <= 20) return 40;
  return 60;
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

/** أوقات كل ٥ دقائق داخل نافذة الحلقة — لتعديل وقت الطالبة يدويًا */
export function timeOptionsWithin(start: string, end: string, step = 5): string[] {
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
