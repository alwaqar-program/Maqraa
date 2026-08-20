-- ============================================================
-- 43_backfill_waitlist.sql — استنتاج قائمة الانتظار بأثر رجعي
-- يعيد تشغيل طابور التسجيل زمنيًا (بالأسبقية created_at):
-- لكل موعد، تُخصم دقائق كل متقدمة اختارته **أولوية أولى** حسب مسارها،
-- فمن تجاوز مجموعُهن سعته عند وصولها تُعلَّم أولويتها الأولى «قائمة انتظار».
-- (الأولويات الثانية والثالثة لا تُعلَّم — القاعدة نفسها في النموذج الحي).
-- يُنفذ بعد 42. آمن لإعادة التنفيذ (يحسب من الصفر في كل مرة).
-- ============================================================

-- نص الموعد العربي — نسخة مطابقة لمولّد الواجهة (كما في ملف 96)
CREATE OR REPLACE FUNCTION public.ar_slot_label(p_weekday int, p_start time, p_end time, p_to int DEFAULT NULL)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  names text[] := ARRAY['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  fh int := EXTRACT(HOUR FROM p_start)::int; fm int := EXTRACT(MINUTE FROM p_start)::int;
  th int := EXTRACT(HOUR FROM p_end)::int;   tm int := EXTRACT(MINUTE FROM p_end)::int;
  fp text; tp text; ft text; tt text; prefix text;
BEGIN
  fp := CASE WHEN fh < 12 THEN 'صباحًا' ELSE 'مساءً' END;
  tp := CASE WHEN th < 12 THEN 'صباحًا' ELSE 'مساءً' END;
  ft := translate((CASE WHEN fh % 12 = 0 THEN 12 ELSE fh % 12 END)::text, '0123456789', '٠١٢٣٤٥٦٧٨٩')
        || CASE WHEN fm <> 0 THEN ':' || translate(lpad(fm::text, 2, '0'), '0123456789', '٠١٢٣٤٥٦٧٨٩') ELSE '' END;
  tt := translate((CASE WHEN th % 12 = 0 THEN 12 ELSE th % 12 END)::text, '0123456789', '٠١٢٣٤٥٦٧٨٩')
        || CASE WHEN tm <> 0 THEN ':' || translate(lpad(tm::text, 2, '0'), '0123456789', '٠١٢٣٤٥٦٧٨٩') ELSE '' END;
  prefix := CASE WHEN p_to IS NOT NULL AND p_to <> p_weekday
                 THEN 'يوميًا من ' || names[LEAST(p_weekday, p_to) + 1] || ' إلى ' || names[GREATEST(p_weekday, p_to) + 1]
                 ELSE names[p_weekday + 1] END;
  RETURN prefix || ' ' ||
         CASE WHEN fp = tp THEN ft || '–' || tt || ' ' || fp
              ELSE ft || ' ' || fp || ' – ' || tt || ' ' || tp END;
END $$;

-- إعادة الحساب من الصفر
WITH slot_caps AS (
  -- سعة كل موعد أسبوعيًا داخل مجموعته (المسار المرتبط أو العامة) — مجموع نوافذ كل مسمعاته
  SELECT COALESCE(t.track_id::text, 'g') AS pool,
         public.ar_slot_label(s.weekday, s.start_time, s.end_time) AS label,
         sum(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::int AS cap
  FROM public.availability_slots s
  JOIN public.teachers t ON t.id = s.teacher_id
  WHERE t.is_active AND NOT s.is_daily
  GROUP BY 1, 2
  UNION ALL
  SELECT pool, public.ar_slot_label(min_day, start_time, end_time, NULLIF(max_day, min_day)), cap
  FROM (
    SELECT COALESCE(t.track_id::text, 'g') AS pool, s.start_time, s.end_time,
           min(s.weekday) AS min_day, max(s.weekday) AS max_day,
           sum(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60)::int AS cap
    FROM public.availability_slots s
    JOIN public.teachers t ON t.id = s.teacher_id
    WHERE t.is_active AND s.is_daily
    GROUP BY 1, 2, 3
  ) d
),
apps AS (
  SELECT a.id, a.created_at, a.preferred_slots[1] AS label,
         CASE WHEN EXISTS (SELECT 1 FROM public.teachers t2
                           WHERE t2.track_id = a.track_id AND t2.is_active)
              THEN a.track_id::text ELSE 'g' END AS pool,
         public.track_minutes(t.quota_pages_per_season, t.seconds_per_page) AS minutes
  FROM public.applicants a
  JOIN public.tracks t ON t.id = a.track_id
  WHERE a.status <> 'rejected'
    AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
),
ranked AS (
  SELECT ap.id, ap.label, sc.cap,
         sum(ap.minutes) OVER (PARTITION BY ap.pool, ap.label ORDER BY ap.created_at) AS running
  FROM apps ap
  LEFT JOIN slot_caps sc ON sc.pool = ap.pool AND sc.label = ap.label
)
UPDATE public.applicants a
SET waitlisted_slots = CASE
      WHEN r.cap IS NOT NULL AND r.running > r.cap THEN ARRAY[r.label]
      ELSE '{}'::text[] END
FROM ranked r
WHERE r.id = a.id;

-- النتيجة: من صارت أولويتها الأولى قائمة انتظار
SELECT a.full_name AS "المتقدمة", a.preferred_slots[1] AS "أولويتها الأولى",
       a.created_at::date AS "سُجّلت في"
FROM public.applicants a
WHERE a.waitlisted_slots <> '{}'
ORDER BY a.created_at;
