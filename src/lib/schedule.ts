// أدوات الجدولة — مقرأة الوقار

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "16:30:00" → "٤:٣٠ عصرًا" بصيغة مبسطة 12 ساعة */
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h < 12 ? 'صباحًا' : 'مساءً';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** مدة الفتحة بالساعات */
export function slotHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em - sh * 60 - sm) / 60;
}

export interface Slot {
  id: string;
  teacher_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export function totalWeeklyHours(slots: Pick<Slot, 'start_time' | 'end_time' | 'is_active'>[]): number {
  return slots.filter(s => s.is_active).reduce((sum, s) => sum + slotHours(s.start_time, s.end_time), 0);
}
