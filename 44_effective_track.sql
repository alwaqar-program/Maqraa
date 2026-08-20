-- ============================================================
-- 44_effective_track.sql — المسار المعتمد بعد القبول هو مسار الطالبة
-- الاستمارة تحفظ مسار التسجيل تاريخيًا، لكن حساب حمل المواعيد والفرز
-- يجب أن يتبع المسار الحالي: مسار ملف الطالبة إن قُبلت، وإلا مسار الاستمارة.
-- كما تُستبعد من الحمل من انسحبت أو استُبعدت طالبتُها.
-- يُنفذ بعد 42. آمن لإعادة التنفيذ.
-- ============================================================

DROP VIEW IF EXISTS public.v_public_slot_load;
CREATE VIEW public.v_public_slot_load AS
SELECT a.preferred_slots[1] AS label,
       COALESCE(s.track_id, a.track_id) AS track_id,
       sum(public.track_minutes(t.quota_pages_per_season, t.seconds_per_page))::int AS used_minutes,
       count(*)::int AS students
FROM public.applicants a
LEFT JOIN public.students s ON s.id = a.student_id
JOIN public.tracks t ON t.id = COALESCE(s.track_id, a.track_id)
WHERE a.status <> 'rejected'
  AND COALESCE(array_length(a.preferred_slots, 1), 0) >= 1
  AND a.preferred_slots[1] IS NOT NULL
  AND (s.id IS NULL OR COALESCE(s.status, 'active') = 'active')
GROUP BY 1, 2;
GRANT SELECT ON public.v_public_slot_load TO anon, authenticated;

SELECT 'effective track live' AS status;
