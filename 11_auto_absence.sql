-- ============================================================
-- 11_auto_absence.sql — الغياب التلقائي
-- القاعدة المعتمدة: أي طالبة لم تُسمِّع في يومها الأسبوعي المحجوز
-- يُسجَّل لها غياب تلقائي (بدون عذر) ويدخل عدّاد الغيابات فورًا،
-- وإذا حوّلته الإدارة إلى «بعذر» خرج من العدّاد.
-- ============================================================

-- فحص يوم معيّن: حجز نشط يومُه = يوم التاريخ، ولا تسميع ولا تحضير مسجل → غياب
CREATE OR REPLACE FUNCTION public.auto_mark_absences(p_date date DEFAULT current_date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  -- تُستدعى من الجدولة أو من الإدارة فقط
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins only';
  END IF;

  INSERT INTO public.session_attendance (booking_id, student_id, teacher_id, date, status, is_excused, notes)
  SELECT b.id, b.student_id, s.teacher_id, p_date, 'absent', false,
         'غياب تلقائي — لا تسميع في الموعد المحجوز'
  FROM public.bookings b
  JOIN public.availability_slots s ON s.id = b.slot_id
  WHERE b.status = 'active'
    AND s.is_active
    AND s.weekday = EXTRACT(dow FROM p_date)::int
    -- لا تسجيل حضور/غياب مسبق لهذا اليوم
    AND NOT EXISTS (
      SELECT 1 FROM public.session_attendance a
      WHERE a.student_id = b.student_id AND a.date = p_date AND NOT a.is_deleted
    )
    -- ولا تسميع مسجل لهذا اليوم
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_recitation_log t
      WHERE t.student_id = b.student_id AND t.date = p_date AND NOT t.is_deleted
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- عدّاد التنبيهات: الغياب بعذر لا يُحسب ضمن الحد
CREATE OR REPLACE VIEW public.v_absence_alerts
WITH (security_invoker = true) AS
SELECT a.student_id, st.full_name, a.season_id,
       count(*) FILTER (WHERE a.status = 'absent' AND NOT a.is_excused) AS absences,
       (SELECT value::int FROM public.app_settings WHERE key = 'max_absences_per_season') AS max_allowed
FROM public.session_attendance a
JOIN public.students st ON st.id = a.student_id
WHERE NOT a.is_deleted
GROUP BY a.student_id, st.full_name, a.season_id
HAVING count(*) FILTER (WHERE a.status = 'absent' AND NOT a.is_excused)
       >= (SELECT value::int FROM public.app_settings WHERE key = 'max_absences_per_season');

-- جدولة يومية 11:55 مساءً بتوقيت السعودية (20:55 UTC) عبر pg_cron
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('auto-absences') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'auto-absences');
  PERFORM cron.schedule('auto-absences', '55 20 * * *',
    $job$ SELECT public.auto_mark_absences(current_date); $job$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron غير متاح (%) — فعّليه من Database → Extensions ثم أعيدي تنفيذ هذا الملف', SQLERRM;
END $$;

SELECT 'auto absence ready' AS status;
