-- ============================================================
-- 13_open_slots_view.sql — المواعيد الشاغرة للطالبات
-- الطالبة لا ترى حجوزات غيرها (RLS)، فكانت المواعيد المحجوزة تظهر
-- شاغرة أمامها ثم يفشل الحجز. هذا العرض يتجاوز RLS بأمان لأنه
-- لا يكشف إلا: الموعد شاغر أم لا + اسم المسمعة (معلومة عامة أصلًا).
-- ============================================================
DROP VIEW IF EXISTS public.v_open_slots;
CREATE VIEW public.v_open_slots
WITH (security_invoker = false) AS   -- بصلاحيات المالك عمدًا لتجاوز RLS
SELECT s.id, s.weekday, s.start_time, s.end_time,
       s.teacher_id, t.full_name AS teacher_name
FROM public.availability_slots s
JOIN public.teachers t ON t.id = s.teacher_id
WHERE s.is_active
  AND t.is_active
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.slot_id = s.id AND b.status = 'active'
  );

GRANT SELECT ON public.v_open_slots TO authenticated;

SELECT 'open slots view ready' AS status;
