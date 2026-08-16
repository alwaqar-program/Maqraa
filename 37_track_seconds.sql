-- ============================================================
-- 37_track_seconds.sql — سرعة التسميع لكل مسار على حدة
-- بدل قيمة واحدة لكل النظام: عمود seconds_per_page في جدول المسارات،
-- يُعدَّل من صفحة «المسارات». والقيمة العامة في app_settings تبقى
-- احتياطًا لأي مسار لم تُحدَّد سرعته.
--   دقائق الموعد = ceil(صفحات الجلسة × ثواني الصفحة ÷ ٦٠)
-- يُنفذ بعد 36. آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS seconds_per_page numeric(6,1) NOT NULL DEFAULT 100
  CHECK (seconds_per_page > 0);

COMMENT ON COLUMN public.tracks.seconds_per_page IS 'ثواني تسميع الصفحة الواحدة لهذا المسار (١٠٠ = دقيقة و٤٠ ثانية)';

-- العروض تعتمد على الدالة، فتُحذف قبل تغيير توقيعها ثم تُعاد
DROP VIEW IF EXISTS public.v_public_slot_load;
DROP VIEW IF EXISTS public.v_public_track_minutes;
DROP FUNCTION IF EXISTS public.track_minutes(numeric);

-- دقائق المسار: بسرعته الخاصة إن مُرّرت، وإلا القيمة العامة
CREATE OR REPLACE FUNCTION public.track_minutes(p_quota numeric, p_seconds numeric DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, ceil(
    round(p_quota / COALESCE((SELECT sessions_count FROM public.seasons WHERE is_current LIMIT 1), 14))
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
SELECT a.preferred_slots[1]                                                      AS label,
       a.track_id,
       sum(public.track_minutes(t.quota_pages_per_season, t.seconds_per_page))::int AS used_minutes,
       count(*)::int                                                             AS students
FROM public.applicants a
JOIN public.tracks t ON t.id = a.track_id
WHERE a.status <> 'rejected'
  AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
  AND a.preferred_slots[1] IS NOT NULL
GROUP BY 1, 2;
GRANT SELECT ON public.v_public_slot_load TO anon, authenticated;

-- إعادة حساب دقائق العضويات القائمة بسرعة كل مسار
UPDATE public.circle_members cm
SET minutes = public.track_minutes(t.quota_pages_per_season, t.seconds_per_page)
FROM public.students s
JOIN public.tracks t ON t.id = s.track_id
WHERE s.id = cm.student_id
  AND cm.minutes IS DISTINCT FROM public.track_minutes(t.quota_pages_per_season, t.seconds_per_page);

SELECT t.name                                                            AS "المسار",
       round(t.quota_pages_per_season / 14)                              AS "صفحات الجلسة",
       t.seconds_per_page                                                AS "ثواني الصفحة",
       public.track_minutes(t.quota_pages_per_season, t.seconds_per_page) AS "دقائق الموعد"
FROM public.tracks t
WHERE t.is_active
ORDER BY t.sort_order;
