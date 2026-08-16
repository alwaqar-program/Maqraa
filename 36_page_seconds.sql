-- ============================================================
-- 36_page_seconds.sql — تعديل قاعدة الزمن: الصفحة = دقيقة و٤٠ ثانية (١٠٠ ثانية)
-- بدل دقيقتين. دقائق الطالبة = صفحات الجلسة × ١٠٠ ثانية، تُقرَّب لأعلى دقيقة
-- (لا نحجز لها وقتًا أقل من حاجتها):
--   ٧ص→١٢د، ١٤ص→٢٤د، ٢٩ص→٤٩د، ٤٣ص→٧٢د
-- يُنفذ بعد 35_slot_capacity.sql. آمن لإعادة التنفيذ.
-- ============================================================

INSERT INTO public.app_settings (key, value, description) VALUES
  ('seconds_per_page', '100', 'ثواني تسميع الصفحة الواحدة (١٠٠ = دقيقة و٤٠ ثانية) — أساس حساب دقائق الطالبة')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- دقائق المسار في الموعد الواحد — بالثواني ثم تقريب لأعلى دقيقة
CREATE OR REPLACE FUNCTION public.track_minutes(p_quota numeric)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, ceil(
    round(p_quota / COALESCE((SELECT sessions_count FROM public.seasons WHERE is_current LIMIT 1), 14))
    * COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'seconds_per_page'), 100)
    / 60.0
  )::int);
$$;

-- إعادة حساب دقائق العضويات القائمة على القاعدة الجديدة
UPDATE public.circle_members cm
SET minutes = public.track_minutes(t.quota_pages_per_season)
FROM public.students s
JOIN public.tracks t ON t.id = s.track_id
WHERE s.id = cm.student_id
  AND cm.minutes IS DISTINCT FROM public.track_minutes(t.quota_pages_per_season);

-- الجديد لكل مسار
SELECT t.name                                            AS "المسار",
       round(t.quota_pages_per_season / 14)              AS "صفحات الجلسة",
       public.track_minutes(t.quota_pages_per_season)    AS "دقائق الموعد"
FROM public.tracks t
WHERE t.is_active
ORDER BY t.sort_order;
