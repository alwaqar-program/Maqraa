-- ============================================================
-- 07_attendance.sql — مقرأة الوقار
-- حضور جلسة التسميع الأسبوعية المحجوزة + تنبيه تجاوز حد الغيابات.
-- قاعدة المقرأة: «يُسمح بثلاث غيابات فقط خلال الفصل، بعذر أو بدون» —
-- التجاوز يُبرز تنبيهًا للإدارة (لا استبعاد تلقائي؛ القرار بشري).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  season_id uuid REFERENCES public.seasons(id),
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL CHECK (status IN ('present','absent','late')),
  is_excused boolean NOT NULL DEFAULT false,      -- غياب بعذر (يُحتسب ضمن الحد لكنه موثق)
  excuse_note text,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.session_attendance (student_id, date);
ALTER TABLE public.session_attendance ENABLE ROW LEVEL SECURITY;

-- ربط الفصل الحالي تلقائيًا
CREATE OR REPLACE FUNCTION public.attendance_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id FROM public.seasons WHERE is_current LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_attendance_before ON public.session_attendance;
CREATE TRIGGER trg_attendance_before BEFORE INSERT OR UPDATE ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.attendance_before();

-- عرض تنبيهات الغياب: من بلغت أو تجاوزت الحد (من app_settings)
CREATE OR REPLACE VIEW public.v_absence_alerts
WITH (security_invoker = true) AS
SELECT a.student_id, st.full_name, a.season_id,
       count(*) FILTER (WHERE a.status = 'absent') AS absences,
       (SELECT value::int FROM public.app_settings WHERE key = 'max_absences_per_season') AS max_allowed
FROM public.session_attendance a
JOIN public.students st ON st.id = a.student_id
WHERE NOT a.is_deleted
GROUP BY a.student_id, st.full_name, a.season_id
HAVING count(*) FILTER (WHERE a.status = 'absent')
       >= (SELECT value::int FROM public.app_settings WHERE key = 'max_absences_per_season');

-- سياسات
DROP POLICY IF EXISTS "Students read own attendance" ON public.session_attendance;
CREATE POLICY "Students read own attendance" ON public.session_attendance
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Teachers manage own attendance" ON public.session_attendance;
CREATE POLICY "Teachers manage own attendance" ON public.session_attendance
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (
    teacher_id = public.current_teacher_id()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.availability_slots s ON s.id = b.slot_id
      WHERE b.student_id = session_attendance.student_id AND b.status = 'active'
        AND s.teacher_id = public.current_teacher_id()
    )
  );
DROP POLICY IF EXISTS "Supervisors read scoped attendance" ON public.session_attendance;
CREATE POLICY "Supervisors read scoped attendance" ON public.session_attendance
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students st WHERE st.id = session_attendance.student_id
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  ));
DROP POLICY IF EXISTS "Admins manage attendance" ON public.session_attendance;
CREATE POLICY "Admins manage attendance" ON public.session_attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
