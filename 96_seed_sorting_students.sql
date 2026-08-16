-- ============================================================
-- 96_seed_sorting_students.sql — (اختبار فقط) ٦٠ طالبة لتجربة الفرز والتوزيع
-- ينشئ طالبات باسم «طالبة فرز NN» مع استماراتهن، ويأخذ أولوياتهن من
-- مواعيد المسمعات الحقيقية بنفس صياغة النص التي يولدها نموذج التسجيل
-- (وإلا لن يطابقها التوزيع التلقائي).
-- مسارات متنوعة، أسبقية تسجيل متدرجة، وبعضهن بلا أولويات لاختبار
-- المرحلة الثانية من التوزيع.
-- آمن لإعادة التنفيذ (يحذف بذرته السابقة أولًا). للحذف النهائي: القسم ٠ وحده.
-- يُنفذ بعد 35_slot_capacity.sql.
-- ============================================================

-- 0) تنظيف بذرة سابقة
DELETE FROM public.circle_members
 WHERE student_id IN (SELECT id FROM public.students WHERE full_name LIKE 'طالبة فرز%');
DELETE FROM public.applicants WHERE full_name LIKE 'طالبة فرز%';
DELETE FROM public.students   WHERE full_name LIKE 'طالبة فرز%';

-- 1) نص الموعد بالعربية — نسخة طبق الأصل من genSlotLabel في الواجهة
CREATE OR REPLACE FUNCTION public.ar_slot_label(p_weekday int, p_start time, p_end time, p_to int DEFAULT NULL)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  names text[] := ARRAY['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  fh int := EXTRACT(HOUR   FROM p_start)::int;
  fm int := EXTRACT(MINUTE FROM p_start)::int;
  th int := EXTRACT(HOUR   FROM p_end)::int;
  tm int := EXTRACT(MINUTE FROM p_end)::int;
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

-- 2) خيارات المواعيد المعروضة فعلًا (نفس اشتقاق النموذج: عادية فريدة + دورية مطوية)
CREATE OR REPLACE VIEW public.v_seed_slot_options AS
  SELECT DISTINCT t.track_id,
         public.ar_slot_label(s.weekday, s.start_time, s.end_time) AS label
  FROM public.availability_slots s
  JOIN public.teachers t ON t.id = s.teacher_id
  WHERE t.is_active AND NOT s.is_daily
UNION
  SELECT t.track_id,
         public.ar_slot_label(min(s.weekday), s.start_time, s.end_time, max(s.weekday))
  FROM public.availability_slots s
  JOIN public.teachers t ON t.id = s.teacher_id
  WHERE t.is_active AND s.is_daily
  GROUP BY t.track_id, s.start_time, s.end_time;

-- 3) ٦٠ طالبة بمسارات متنوعة (الأقصر أكثر عددًا كالواقع)
WITH tr AS (
  SELECT id, row_number() OVER (ORDER BY sort_order) AS rn, count(*) OVER () AS cnt
  FROM public.tracks WHERE is_active
)
INSERT INTO public.students (full_name, national_id, phone, track_id, is_active)
SELECT 'طالبة فرز ' || lpad(i::text, 2, '0'),
       '10' || lpad(i::text, 8, '0'),
       '05' || lpad((5000000 + i)::text, 8, '0'),
       (SELECT id FROM tr WHERE rn = LEAST(cnt, CASE
          WHEN i % 20 = 9 THEN 5           -- قلة على المسار الخامس إن وُجد
          WHEN i % 10 < 4 THEN 1           -- ٤٠٪ خمسة أجزاء
          WHEN i % 10 < 7 THEN 2           -- ٣٠٪ عشرة أجزاء
          WHEN i % 10 < 9 THEN 3           -- ٢٠٪ عشرون جزءًا
          ELSE 4 END)),                    -- الباقي ختمة
       true
FROM generate_series(1, 60) AS i;

-- 4) استماراتهن: أولويات مرتبة من مواعيد مجموعتهن (المسار المرتبط بمسمعة يرى مواعيدها وحدها)
WITH st AS (
  SELECT s.id, s.full_name, s.national_id, s.phone, s.track_id,
         row_number() OVER (ORDER BY s.full_name) AS i
  FROM public.students s WHERE s.full_name LIKE 'طالبة فرز%'
), pooled AS (
  SELECT st.*,
         CASE WHEN EXISTS (SELECT 1 FROM public.v_seed_slot_options o WHERE o.track_id = st.track_id)
              THEN st.track_id ELSE NULL END AS pool_track
  FROM st
), picks AS (
  SELECT p.*, (
    SELECT array_agg(o.label ORDER BY md5(p.i::text || o.label))
    FROM public.v_seed_slot_options o
    WHERE o.track_id IS NOT DISTINCT FROM p.pool_track
  ) AS labels
  FROM pooled p
)
INSERT INTO public.applicants
  (full_name, national_id, phone, attendance_pledge, track_id,
   preferred_slots, preferred_days, preferred_period, status, student_id, created_at)
SELECT full_name, national_id, phone, true, track_id,
       CASE WHEN i % 12 = 0 THEN '{}'::text[]      -- ٥ طالبات بلا أولويات (المرحلة الثانية)
            ELSE COALESCE(labels[1 : LEAST(3, COALESCE(array_length(labels, 1), 0))], '{}'::text[]) END,
       '{}'::int[],
       CASE i % 3 WHEN 0 THEN 'morning' WHEN 1 THEN 'evening' ELSE 'both' END,
       'accepted', id,
       now() - ((61 - i) * interval '3 minutes')   -- أسبقية تسجيل متدرجة
FROM picks;

-- 5) ملخص: الحمل على كل موعد (الأولوية الأولى فقط) مقابل سعته
SELECT l.label                                   AS "الموعد",
       COALESCE(tk.name, 'عام')                  AS "المجموعة",
       l.students                                AS "عدد الطالبات",
       l.used_minutes                            AS "المطلوب (دقيقة)"
FROM public.v_public_slot_load l
LEFT JOIN public.tracks tk ON tk.id = l.track_id
ORDER BY 4 DESC;
