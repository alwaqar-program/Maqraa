-- ============================================================
-- 28_teacher_track.sql — ربط اختياري: مسمعة ↔ مسار
-- طالبة المسار المرتبط بمسمعة ترى في نموذج التسجيل مواعيد حلقات
-- مسمعة مسارها فقط، ومن اختارت مسارًا بلا مسمعة معينة ترى مواعيد
-- حلقات المسمعات غير المعينات على مسار.
-- آمن لإعادة التنفيذ.
-- ============================================================

-- 1) الربط الاختياري (فارغ = مسمعة عامة لكل المسارات)
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS track_id uuid REFERENCES public.tracks(id) ON DELETE SET NULL;

-- 2) عرض عام لأوقات الحلقات النشطة — للنموذج العام (anon)
--    أعمدة آمنة فقط: يوم/وقت/مسار المسمعة — بلا أسماء ولا بيانات شخصية
CREATE OR REPLACE VIEW public.v_public_circle_times AS
SELECT c.weekday, c.start_time, c.end_time, t.track_id
FROM public.circles c
JOIN public.teachers t ON t.id = c.teacher_id
WHERE c.is_active AND t.is_active;

GRANT SELECT ON public.v_public_circle_times TO anon, authenticated;
