-- ============================================================
-- 35_slot_capacity.sql — سعة المواعيد بالدقائق
-- قاعدة معتمدة: تسميع الصفحة الواحدة = دقيقتان.
--   دقائق الطالبة في الموعد = صفحات الجلسة × ٢
--   صفحات الجلسة = نصاب الفصل ÷ عدد جلسات الفصل (١٤)
--   ⇒ ٧ص→١٤د، ١٤ص→٢٨د، ٢٩ص→٥٨د، ٤٣ص→٨٦د
-- ويُحسب اكتفاء كل موعد من **الأولوية الأولى فقط** لكل متقدمة.
-- آمن لإعادة التنفيذ.
-- ============================================================

-- 1) دقائق الصفحة قابلة للتغيير من الإعدادات
INSERT INTO public.app_settings (key, value, description) VALUES
  ('minutes_per_page', '2', 'دقائق تسميع الصفحة الواحدة — أساس حساب دقائق الطالبة في موعدها')
ON CONFLICT (key) DO NOTHING;

-- 2) دقائق المسار في الموعد الواحد
CREATE OR REPLACE FUNCTION public.track_minutes(p_quota numeric)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(1, (
    round(p_quota / COALESCE((SELECT sessions_count FROM public.seasons WHERE is_current LIMIT 1), 14))
    * COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'minutes_per_page'), 2)
  )::int);
$$;

-- 3) سعة الحلقة بالدقائق: مجموع مواعيدها المرتبطة، أو نافذتها إن لم تُربط
--    (circle_slots قد لا يكون موجودًا إن لم يُنفذ 32 — نتعامل معه ديناميكيًا)
CREATE OR REPLACE FUNCTION public.circle_capacity(p_circle uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v int;
BEGIN
  IF to_regclass('public.circle_slots') IS NOT NULL THEN
    EXECUTE 'SELECT sum(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::int
               FROM public.circle_slots cs
               JOIN public.availability_slots s ON s.id = cs.slot_id
              WHERE cs.circle_id = $1'
      INTO v USING p_circle;
  END IF;
  IF v IS NULL THEN
    SELECT (EXTRACT(EPOCH FROM (c.end_time - c.start_time)) / 60)::int
      INTO v FROM public.circles c WHERE c.id = p_circle;
  END IF;
  RETURN COALESCE(v, 0);
END $$;

-- 4) دقائق كل مسار — مصدر حقيقة واحد للواجهة (يقرأه الزائر في نموذج التسجيل)
DROP VIEW IF EXISTS public.v_public_track_minutes;
CREATE VIEW public.v_public_track_minutes AS
SELECT t.id AS track_id, t.name, public.track_minutes(t.quota_pages_per_season) AS minutes
FROM public.tracks t
WHERE t.is_active;
GRANT SELECT ON public.v_public_track_minutes TO anon, authenticated;

-- 5) حمل كل موعد = مجموع دقائق من اخترنه **أولوية أولى** (مجمَّع، بلا أي بيانات شخصية)
--    التجميع بالمسار أيضًا ليطابق العميلُ كل طالبة بمجموعة المواعيد التي رأتها فعلًا
--    (طالبة مسار مرتبط بمسمعة ترى مواعيد تلك المسمعة وحدها).
DROP VIEW IF EXISTS public.v_public_slot_load;
CREATE VIEW public.v_public_slot_load AS
SELECT a.preferred_slots[1]                                    AS label,
       a.track_id,
       sum(public.track_minutes(t.quota_pages_per_season))::int AS used_minutes,
       count(*)::int                                            AS students
FROM public.applicants a
JOIN public.tracks t ON t.id = a.track_id
WHERE a.status <> 'rejected'
  AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
  AND a.preferred_slots[1] IS NOT NULL
GROUP BY 1, 2;
GRANT SELECT ON public.v_public_slot_load TO anon, authenticated;

-- 6) إعادة حساب دقائق العضويات القائمة على القاعدة الجديدة
UPDATE public.circle_members cm
SET minutes = public.track_minutes(t.quota_pages_per_season)
FROM public.students s
JOIN public.tracks t ON t.id = s.track_id
WHERE s.id = cm.student_id
  AND cm.minutes IS DISTINCT FROM public.track_minutes(t.quota_pages_per_season);

-- 7) تقرير: حلقات تجاوز مجموع دقائق طالباتها سعتها بعد إعادة الحساب
--    (انقلي منها طالبات من صفحة الحلقات — لا يمنع النظام العرض، لكنه لن يقبل إضافة جديدة)
SELECT c.number                                   AS "الحلقة",
       public.circle_capacity(c.id)               AS "السعة (دقيقة)",
       COALESCE(sum(cm.minutes), 0)::int          AS "المستهلك (دقيقة)",
       count(cm.id)::int                          AS "عدد الطالبات"
FROM public.circles c
LEFT JOIN public.circle_members cm ON cm.circle_id = c.id
WHERE c.is_active
GROUP BY c.id, c.number
HAVING COALESCE(sum(cm.minutes), 0) > public.circle_capacity(c.id)
ORDER BY 1;
