-- ============================================================
-- 40_weekly_model.sql — توحيد الحساب على أساس الأسبوع
-- تصحيح لملف 38: عدد الجلسات ليس خاصية ثابتة في المسار، بل يُقرأ من
-- المواعيد المعرَّفة (الختمة الدورية: جلسة كل يوم من الاثنين إلى السبت
-- أو ما هو محدد في النظام). فالمقارنة الصحيحة أسبوعية في الطرفين:
--   حاجة الطالبة أسبوعيًا = (نصاب الفصل ÷ أسابيع الفصل) × ثواني الصفحة
--   سعة الموعد أسبوعيًا   = مجموع نوافذ كل أيامه
-- ⇒ مجموع جلسات الحلقة الدورية يجب أن يغطي طالبة ختمة أسبوعية واحدة على الأقل.
-- يُنفذ بعد 38. آمن لإعادة التنفيذ.
-- ============================================================

DROP VIEW IF EXISTS public.v_public_slot_load;
DROP VIEW IF EXISTS public.v_public_track_minutes;
DROP FUNCTION IF EXISTS public.track_minutes(numeric, numeric, int);
DROP FUNCTION IF EXISTS public.track_minutes(numeric, numeric);

-- عدد الجلسات لم يعد عمودًا في المسار (يُشتق من المواعيد)
ALTER TABLE public.tracks DROP COLUMN IF EXISTS sessions_per_week;

-- دقائق الطالبة أسبوعيًا = صفحات الأسبوع × ثواني الصفحة، مقرَّبة لأعلى دقيقة
CREATE OR REPLACE FUNCTION public.track_minutes(p_quota numeric, p_seconds numeric DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, ceil(
    GREATEST(1, round(
      p_quota / COALESCE((SELECT sessions_count FROM public.seasons WHERE is_current LIMIT 1), 14)
    ))
    * COALESCE(p_seconds,
               (SELECT value::numeric FROM public.app_settings WHERE key = 'seconds_per_page'),
               100)
    / 60.0
  )::int);
$$;

CREATE VIEW public.v_public_track_minutes AS
SELECT t.id AS track_id, t.name, t.seconds_per_page,
       public.track_minutes(t.quota_pages_per_season, t.seconds_per_page) AS minutes
FROM public.tracks t
WHERE t.is_active;
GRANT SELECT ON public.v_public_track_minutes TO anon, authenticated;

CREATE VIEW public.v_public_slot_load AS
SELECT a.preferred_slots[1] AS label,
       a.track_id,
       sum(public.track_minutes(t.quota_pages_per_season, t.seconds_per_page))::int AS used_minutes,
       count(*)::int AS students
FROM public.applicants a
JOIN public.tracks t ON t.id = a.track_id
WHERE a.status <> 'rejected'
  AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
  AND a.preferred_slots[1] IS NOT NULL
GROUP BY 1, 2;
GRANT SELECT ON public.v_public_slot_load TO anon, authenticated;

UPDATE public.circle_members cm
SET minutes = public.track_minutes(t.quota_pages_per_season, t.seconds_per_page)
FROM public.students s
JOIN public.tracks t ON t.id = s.track_id
WHERE s.id = cm.student_id
  AND cm.minutes IS DISTINCT FROM public.track_minutes(t.quota_pages_per_season, t.seconds_per_page);

-- حاجة كل مسار أسبوعيًا مقابل سعة الحلقات الأسبوعية (مجموع مواعيد كل حلقة)
SELECT t.name                                                            AS "المسار",
       round(t.quota_pages_per_season / 14)                              AS "صفحات الأسبوع",
       t.seconds_per_page                                                AS "ثواني الصفحة",
       public.track_minutes(t.quota_pages_per_season, t.seconds_per_page) AS "دقائق الأسبوع"
FROM public.tracks t
WHERE t.is_active
ORDER BY t.sort_order;
