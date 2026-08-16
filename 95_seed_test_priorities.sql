-- ============================================================
-- 95_seed_test_priorities.sql — (اختبار فقط، لا يُنفذ في الإنتاج)
-- يمنح «طالبات التجربة» استمارات تقديم بأولويات مواعيد حقيقية
-- مأخوذة من خيارات المواعيد الحالية في صفحة «النماذج»،
-- كي يمكن تجربة زر «توزيع تلقائي» في صفحة الحلقات.
-- شرط: أن تكون خيارات المواعيد في «النماذج» محفوظة بيوم ووقت.
-- آمن لإعادة التنفيذ (لا يكرر استمارة لطالبة لها واحدة).
-- ============================================================

WITH opts AS (
  SELECT array_agg(x->>'label' ORDER BY ord) AS labels
  FROM public.form_settings,
       jsonb_array_elements(config->'day_options') WITH ORDINALITY AS t(x, ord)
  WHERE form_key = 'student_register'
)
INSERT INTO public.applicants
  (full_name, national_id, phone, attendance_pledge, track_id, preferred_slots, preferred_period, created_at)
SELECT s.full_name, s.national_id, coalesce(s.phone, '0500000000'), true, s.track_id,
       (SELECT labels[1:least(3, coalesce(array_length(labels, 1), 0))] FROM opts),
       'evening',
       now() - (row_number() OVER (ORDER BY s.full_name)) * interval '1 minute'
FROM public.students s
WHERE s.full_name LIKE 'طالبة تجربة%'
  AND (SELECT coalesce(array_length(labels, 1), 0) FROM opts) > 0
  AND NOT EXISTS (SELECT 1 FROM public.applicants a WHERE a.national_id = s.national_id);

SELECT count(*) AS "استمارات تجريبية بأولويات",
       (SELECT array_agg(x->>'label')
        FROM public.form_settings, jsonb_array_elements(config->'day_options') x
        WHERE form_key = 'student_register') AS "الخيارات المعتمدة"
FROM public.applicants WHERE full_name LIKE 'طالبة تجربة%';
