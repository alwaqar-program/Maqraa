-- ============================================================
-- 10_exams_pledges_users.sql — مقرأة الوقار
-- الاختبارات + التعهدات + دالة عرض المستخدمين للإدارة + قيم إعدادات إضافية.
-- ============================================================

-- ------------------------------------------------------------
-- الاختبارات
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id),
  season_id uuid REFERENCES public.seasons(id),
  date date NOT NULL DEFAULT current_date,
  title text NOT NULL,                          -- مثال: اختبار الجزء الأول
  score numeric NOT NULL CHECK (score >= 0),
  max_score numeric NOT NULL DEFAULT 100 CHECK (max_score > 0),
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (score <= max_score)
);
CREATE INDEX IF NOT EXISTS idx_exams_student ON public.exams (student_id, date);
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.exams_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id FROM public.seasons WHERE is_current LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_exams_before ON public.exams;
CREATE TRIGGER trg_exams_before BEFORE INSERT OR UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.exams_before();

DROP POLICY IF EXISTS "Students read own exams" ON public.exams;
CREATE POLICY "Students read own exams" ON public.exams
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Teachers manage own exams" ON public.exams;
CREATE POLICY "Teachers manage own exams" ON public.exams
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (teacher_id = public.current_teacher_id() AND public.teacher_has_active_booking(student_id));
DROP POLICY IF EXISTS "Supervisors read scoped exams" ON public.exams;
CREATE POLICY "Supervisors read scoped exams" ON public.exams
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));
DROP POLICY IF EXISTS "Admins manage exams" ON public.exams;
CREATE POLICY "Admins manage exams" ON public.exams
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- التعهدات: قوالب تعتمدها الإدارة وتوقّعها الطالبة
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pledge_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pledge_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.student_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.pledge_templates(id) ON DELETE CASCADE,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, template_id)
);
ALTER TABLE public.student_pledges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read active templates" ON public.pledge_templates;
CREATE POLICY "Authenticated read active templates" ON public.pledge_templates
  FOR SELECT TO authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage templates" ON public.pledge_templates;
CREATE POLICY "Admins manage templates" ON public.pledge_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Students sign own pledges" ON public.student_pledges;
CREATE POLICY "Students sign own pledges" ON public.student_pledges
  FOR INSERT TO authenticated WITH CHECK (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Students read own pledges" ON public.student_pledges;
CREATE POLICY "Students read own pledges" ON public.student_pledges
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Admins manage student pledges" ON public.student_pledges;
CREATE POLICY "Admins manage student pledges" ON public.student_pledges
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- تعهد افتراضي (نص التسجيل المعتمد)
INSERT INTO public.pledge_templates (title, body)
SELECT 'تعهد الحضور والغياب',
       'أتعهد بالالتزام بنظام الحضور والغياب في مقرأة الوقار، وأن أحافظ على موعدي الأسبوعي الثابت طوال الفصل.'
WHERE NOT EXISTS (SELECT 1 FROM public.pledge_templates WHERE title = 'تعهد الحضور والغياب');

-- ------------------------------------------------------------
-- عرض المستخدمين للإدارة (auth.users لا يُقرأ مباشرة من الواجهة)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admins only';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, u.created_at, u.last_sign_in_at
    FROM auth.users u ORDER BY u.created_at;
END $$;

SELECT 'exams + pledges + users ready' AS status;
