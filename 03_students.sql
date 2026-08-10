-- ============================================================
-- 03_students.sql — مقرأة الوقار
-- الطالبات (خاتمات الوقار) + تسجيلهن في الفصول.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  national_id text UNIQUE NOT NULL,
  phone text,
  email text,
  track_id uuid REFERENCES public.tracks(id),
  joined_at date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- تسجيل الفصول (فصل واحد لكل طالبة في كل موسم)
CREATE TABLE IF NOT EXISTS public.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id),
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','withdrawn','completed')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, season_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

-- سياسات students
DROP POLICY IF EXISTS "Students read own row" ON public.students;
CREATE POLICY "Students read own row" ON public.students
  FOR SELECT TO authenticated USING (user_id = auth.uid());
-- (سياسة قراءة المعلمة لطالبات حجوزاتها تُنشأ في 04 بعد إنشاء جداول الحجز)
DROP POLICY IF EXISTS "Supervisors read scoped students" ON public.students;
CREATE POLICY "Supervisors read scoped students" ON public.students
  FOR SELECT TO authenticated
  USING (track_id IN (SELECT public.supervisor_track_ids()));
DROP POLICY IF EXISTS "Admins manage students" ON public.students;
CREATE POLICY "Admins manage students" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- سياسات enrollments
DROP POLICY IF EXISTS "Students read own enrollments" ON public.enrollments;
CREATE POLICY "Students read own enrollments" ON public.enrollments
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Supervisors read scoped enrollments" ON public.enrollments;
CREATE POLICY "Supervisors read scoped enrollments" ON public.enrollments
  FOR SELECT TO authenticated
  USING (track_id IN (SELECT public.supervisor_track_ids()));
DROP POLICY IF EXISTS "Admins manage enrollments" ON public.enrollments;
CREATE POLICY "Admins manage enrollments" ON public.enrollments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
