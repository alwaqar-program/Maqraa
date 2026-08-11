// نموذج اختبارات المقرأة — مطابق للوقار
export const EXAM_TYPES: Record<string, string> = {
  weekly_1: 'الأسبوع الأول',
  weekly_2: 'الأسبوع الثاني',
  final: 'النهائي',
};

export const examMax = (type: string) => (type === 'final' ? 40 : 20);

/** الدرجة = الحد الأقصى − 0.25×(الأخطاء+اللحون) − 2×تغيير المقطع (بحد أدنى صفر) */
export const examScore = (type: string, errors: number, lahn: number, changes: number) =>
  Math.max(0, examMax(type) - 0.25 * (errors + lahn) - 2 * changes);

/** التقدير من نسبة الدرجة إلى حدها الأقصى */
export const examGradeText = (score: number | null, max: number | null): string => {
  if (!max) return 'ضعيف';
  const pct = ((score ?? 0) / max) * 100;
  if (pct >= 90) return 'ممتاز';
  if (pct >= 70) return 'جيد جدًا';
  if (pct >= 50) return 'جيد';
  return 'ضعيف';
};

export const gradeColors: Record<string, string> = {
  'ممتاز': 'bg-success/10 text-success border-success/20',
  'جيد جدًا': 'bg-info/10 text-info border-info/20',
  'جيد': 'bg-warning/10 text-warning border-warning/20',
  'ضعيف': 'bg-destructive/10 text-destructive border-destructive/20',
};

export const scoreColor = (score: number | null, max: number | null) => {
  if (!score || !max) return 'text-destructive';
  const pct = (score / max) * 100;
  if (pct >= 90) return 'text-success';
  if (pct >= 70) return 'text-info';
  if (pct >= 50) return 'text-warning';
  return 'text-destructive';
};
