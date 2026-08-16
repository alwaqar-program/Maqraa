-- ============================================================
-- 30_slot_daily_flag.sql — علامة «موعد دوري» الصريحة
-- التمييز بين موعد يوم وموعد دوري لا يُستنتج من تتابع الأيام
-- (روان ونورة: الجمعة+السبت موعدا يوم منفصلان رغم تتابعهما) —
-- بل بعلامة is_daily تُضبط من زر «إضافة موعد دوري».
-- يُنفذ بعد 29. آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS is_daily boolean NOT NULL DEFAULT false;

-- مواعيد زهرة وميمونة الزكري (الختمة الدورية) هي الدورية الوحيدة حاليًا
UPDATE public.availability_slots a
SET is_daily = true
FROM public.teachers t
WHERE t.id = a.teacher_id
  AND t.full_name IN ('زهرة', 'ميمونة الزكري');

-- تحقق: عدد المواعيد الدورية لكل مسمعة
SELECT t.full_name, count(*) FILTER (WHERE a.is_daily) AS daily_slots, count(*) AS total_slots
FROM public.teachers t
JOIN public.availability_slots a ON a.teacher_id = t.id
GROUP BY t.full_name ORDER BY t.full_name;
