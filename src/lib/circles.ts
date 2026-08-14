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
