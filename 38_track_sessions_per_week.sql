-- ============================================================
-- 38_track_sessions_per_week.sql — جلسات الأسبوع لكل مسار
-- الخطأ الذي عالجه هذا الملف: كان النظام يفترض جلسة واحدة أسبوعيًا لكل
-- مسار، فيحمّل نصاب الأسبوع كله على جلسة واحدة. مسار «الختمة الأسبوعية»
-- (٦٠٤ صفحة في الأسبوع) موزَّع على جلسات يومية ⇒ نحو ١٠٠ صفحة للجلسة،
-- لا ٦٠٤. فأضفنا عمودًا لعدد جلسات الأسبوع يدخل في القسمة:
--   صفحات الجلسة = نصاب الفصل ÷ (عدد أسابيع الفصل × جلسات الأسبوع)
--   دقائق الموعد = ceil(صفحات الجلسة × ثواني الصفحة ÷ ٦٠)
-- يُنفذ بعد 37. آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS sessions_per_week int NOT NULL DEFAULT 1
  CHECK (sessions_per_week > 0);

COMMENT ON COLUMN public.tracks.sessions_per_week IS 'عدد جلسات التسميع أسبوعيًا لهذا المسار (١ للمسارات الأسبوعية، ٥–٦ للمسارات اليومية)';

-- المسارات اليومية (الختمة الأسبوعية / الدورية) — ٦ جلسات أسبوعيًا مبدئيًا
UPDATE public.tracks SET sessions_per_week = 6
WHERE sessions_per_week = 1
  AND (name LIKE '%أسبوعية%' OR name LIKE '%دوري%' OR name LIKE '%يومي%');

DROP VIEW IF EXISTS public.v_public_slot_load;
DROP VIEW IF EXISTS public.v_public_track_minutes;
DROP FUNCTION IF EXISTS public.track_minutes(numeric, numeric);

-- دقائق الجلسة الواحدة: نصاب الفصل ÷ (أسابيع الفصل × جلسات الأسبوع) × ثواني الصفحة
CREATE OR REPLACE FUNCTION public.track_minutes(
  p_quota numeric,
  p_seconds numeric DEFAULT NULL,
  p_sessions_per_week int DEFAULT 1
) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, ceil(
    GREATEST(1, round(
      p_quota
      / COALESCE((SELECT sessions_count FROM public.seasons WHERE is_current LIMIT 1), 14)
      / GREATEST(COALESCE(p_sessions_per_week, 1), 1)
    ))
    * COALESCE(p_seconds,
               (SELECT value::numeric FROM public.app_settings WHERE key = 'seconds_per_page'),
               100)
    / 60.0
  )::int);
$$;

CREATE VIEW public.v_public_track_minutes AS
SELECT t.id AS track_id, t.name, t.seconds_per_page, t.sessions_per_week,
       public.track_minutes(t.quota_pages_per_season, t.seconds_per_page, t.sessions_per_week) AS minutes
FROM public.tracks t
WHERE t.is_active;
GRANT SELECT ON public.v_public_track_minutes TO anon, authenticated;

CREATE VIEW public.v_public_slot_load AS
SELECT a.preferred_slots[1] AS label,
       a.track_id,
       sum(public.track_minutes(t.quota_pages_per_season, t.seconds_per_page, t.sessions_per_week))::int AS used_minutes,
       count(*)::int AS students
FROM public.applicants a
JOIN public.tracks t ON t.id = a.track_id
WHERE a.status <> 'rejected'
  AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
  AND a.preferred_slots[1] IS NOT NULL
GROUP BY 1, 2;
GRANT SELECT ON public.v_public_slot_load TO anon, authenticated;

-- إعادة حساب دقائق العضويات القائمة
UPDATE public.circle_members cm
SET minutes = public.track_minutes(t.quota_pages_per_season, t.seconds_per_page, t.sessions_per_week)
FROM public.students s
JOIN public.tracks t ON t.id = s.track_id
WHERE s.id = cm.student_id
  AND cm.minutes IS DISTINCT FROM public.track_minutes(t.quota_pages_per_season, t.seconds_per_page, t.sessions_per_week);

SELECT t.name                                        AS "المسار",
       t.quota_pages_per_season                      AS "نصاب الفصل",
       t.sessions_per_week                           AS "جلسات الأسبوع",
       round(t.quota_pages_per_season / 14 / GREATEST(t.sessions_per_week, 1)) AS "صفحات الجلسة",
       t.seconds_per_page                            AS "ثواني الصفحة",
       public.track_minutes(t.quota_pages_per_season, t.seconds_per_page, t.sessions_per_week) AS "دقائق الموعد"
FROM public.tracks t
WHERE t.is_active
ORDER BY t.sort_order;
