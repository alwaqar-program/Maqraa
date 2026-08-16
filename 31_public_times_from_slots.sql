-- ============================================================
-- 31_public_times_from_slots.sql — مصدر مواعيد نموذج التسجيل
-- التسجيل يسبق إنشاء الحلقات، فالعرض العام يقرأ من أوقات توفر
-- المسمعات (availability_slots) بدل الحلقات، مع علامة الدوري
-- ومسار المسمعة (للفلترة: طالبة المسار المرتبط ترى مسمعته فقط).
-- يُنفذ بعد 30. آمن لإعادة التنفيذ.
-- ============================================================

DROP VIEW IF EXISTS public.v_public_circle_times;

CREATE VIEW public.v_public_circle_times AS
SELECT a.weekday, a.start_time, a.end_time, t.track_id, a.is_daily
FROM public.availability_slots a
JOIN public.teachers t ON t.id = a.teacher_id
WHERE t.is_active;

GRANT SELECT ON public.v_public_circle_times TO anon, authenticated;
