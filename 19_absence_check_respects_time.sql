-- ============================================================
-- 19_absence_check_respects_time.sql — فحص الغياب يفرّق بين
-- موعد فات وموعد لم يحن: لا يُسجَّل غياب إلا لموعد انتهى وقته فعلًا
-- (بتوقيت الرياض). الأيام السابقة تُفحص كاملة كالمعتاد.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_mark_absences(p_date date DEFAULT current_date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_now_riyadh timestamp := (now() AT TIME ZONE 'Asia/Riyadh');
BEGIN
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
    -- الموعد انتهى فعلًا: يوم سابق، أو اليوم وقد تجاوزنا وقت نهايته (بتوقيت الرياض)
    AND (p_date < v_now_riyadh::date
         OR (p_date = v_now_riyadh::date AND s.end_time <= v_now_riyadh::time))
    AND NOT EXISTS (
      SELECT 1 FROM public.session_attendance a
      WHERE a.student_id = b.student_id AND a.date = p_date AND NOT a.is_deleted
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.teacher_recitation_log t
      WHERE t.student_id = b.student_id AND t.date = p_date AND NOT t.is_deleted
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

SELECT 'absence check now respects slot end time' AS status;
