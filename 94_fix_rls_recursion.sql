-- ============================================================
-- 94_fix_rls_recursion.sql — إصلاح حلقة الرجوع في سياسات RLS
-- السبب: سياسات students تستعلم bookings وسياسات bookings تستعلم students.
-- الحل: دوال SECURITY DEFINER (تتجاوز RLS داخليًا) تقطع الحلقة.
-- نفّذيه مرة واحدة في SQL Editor. آمن لإعادة التنفيذ.
-- ============================================================

-- هل للمسمعة الحالية حجز نشط مع هذه الطالبة؟
CREATE OR REPLACE FUNCTION public.teacher_has_active_booking(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.availability_slots s ON s.id = b.slot_id
    WHERE b.student_id = p_student AND b.status = 'active'
      AND s.teacher_id = public.current_teacher_id()
  );
$$;

-- هل الطالبة ضمن نطاق مسارات المشرفة الحالية؟
CREATE OR REPLACE FUNCTION public.student_in_supervisor_scope(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students st
    WHERE st.id = p_student
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  );
$$;

-- students
DROP POLICY IF EXISTS "Teachers read booked students" ON public.students;
CREATE POLICY "Teachers read booked students" ON public.students
  FOR SELECT TO authenticated USING (public.teacher_has_active_booking(id));

-- bookings
DROP POLICY IF EXISTS "Supervisors read scoped bookings" ON public.bookings;
CREATE POLICY "Supervisors read scoped bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));

-- self_recitation_log
DROP POLICY IF EXISTS "Teachers read booked self log" ON public.self_recitation_log;
CREATE POLICY "Teachers read booked self log" ON public.self_recitation_log
  FOR SELECT TO authenticated USING (public.teacher_has_active_booking(student_id));
DROP POLICY IF EXISTS "Supervisors read scoped self log" ON public.self_recitation_log;
CREATE POLICY "Supervisors read scoped self log" ON public.self_recitation_log
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));

-- teacher_recitation_log
DROP POLICY IF EXISTS "Teachers manage own tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Teachers manage own tasmee" ON public.teacher_recitation_log
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (
    teacher_id = public.current_teacher_id()
    AND public.teacher_has_active_booking(student_id)
  );
DROP POLICY IF EXISTS "Supervisors read scoped tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Supervisors read scoped tasmee" ON public.teacher_recitation_log
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));

-- session_attendance
DROP POLICY IF EXISTS "Teachers manage own attendance" ON public.session_attendance;
CREATE POLICY "Teachers manage own attendance" ON public.session_attendance
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (
    teacher_id = public.current_teacher_id()
    AND public.teacher_has_active_booking(student_id)
  );
DROP POLICY IF EXISTS "Supervisors read scoped attendance" ON public.session_attendance;
CREATE POLICY "Supervisors read scoped attendance" ON public.session_attendance
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));

-- enrollments (كانت تستعلم tracks عبر supervisor_track_ids مباشرة — سليمة، تبقى كما هي)

SELECT 'RLS recursion fix applied' AS status;
