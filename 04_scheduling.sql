-- ============================================================
-- 04_scheduling.sql — مقرأة الوقار
-- توفر المعلمات (فتحات أسبوعية متكررة) + حجوزات الطالبات.
-- القواعد:
--   * مجموع ساعات المعلمة النشطة بين حدَّي app_settings (افتراضيًا 2–12 ساعة/أسبوع).
--   * كل فتحة = طالبة واحدة (موعد فردي متكرر أسبوعيًا).
--   * الطالبة تحجز مرة واحدة ولا تستطيع التعديل/الفك — المعلمة أو الإدارة فقط.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=الأحد .. 6=السبت
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.availability_slots(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released')),
  booked_at timestamptz NOT NULL DEFAULT now(),
  released_by text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- حجز نشط واحد لكل فتحة + حجز نشط واحد لكل طالبة
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_slot
  ON public.bookings (slot_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS one_active_booking_per_student
  ON public.bookings (student_id) WHERE status = 'active';

-- ------------------------------------------------------------
-- قيد ساعات المعلمة الأسبوعية (يقرأ الحدود من app_settings)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_teacher_weekly_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_minutes numeric;
  v_min_hours numeric := COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'teacher_min_hours_per_week'), 2);
  v_max_hours numeric := COALESCE((SELECT value::numeric FROM public.app_settings WHERE key = 'teacher_max_hours_per_week'), 12);
BEGIN
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60), 0)
    INTO v_total_minutes
  FROM public.availability_slots s
  WHERE s.teacher_id = NEW.teacher_id AND s.is_active AND s.id <> NEW.id;

  IF NEW.is_active THEN
    v_total_minutes := v_total_minutes + EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
  END IF;

  IF v_total_minutes > v_max_hours * 60 THEN
    RAISE EXCEPTION 'مجموع ساعات التوفر (% ساعة) يتجاوز الحد الأعلى % ساعة أسبوعيًا',
      round(v_total_minutes / 60, 1), v_max_hours;
  END IF;
  -- الحد الأدنى لا يُفرض صفًا بصف (المعلمة تبني جدولها تدريجيًا) —
  -- يُتحقق منه في الواجهة وفي تقرير الإدارة عبر v_teacher_weekly_hours أدناه.
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_check_teacher_hours ON public.availability_slots;
CREATE TRIGGER trg_check_teacher_hours
  BEFORE INSERT OR UPDATE ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.check_teacher_weekly_hours();

-- عرض ساعات كل معلمة (للوحة الإدارة والتحقق من الحد الأدنى)
CREATE OR REPLACE VIEW public.v_teacher_weekly_hours
WITH (security_invoker = true) AS
SELECT t.id AS teacher_id, t.full_name,
       round(COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600), 0), 2) AS total_hours,
       count(s.id) FILTER (WHERE s.is_active) AS active_slots
FROM public.teachers t
LEFT JOIN public.availability_slots s ON s.teacher_id = t.id AND s.is_active
GROUP BY t.id, t.full_name;

-- ------------------------------------------------------------
-- سياسات availability_slots
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated read slots" ON public.availability_slots;
CREATE POLICY "Authenticated read slots" ON public.availability_slots
  FOR SELECT TO authenticated USING (true);   -- الطالبة تحتاج رؤية المتاح للحجز
DROP POLICY IF EXISTS "Teachers manage own slots" ON public.availability_slots;
CREATE POLICY "Teachers manage own slots" ON public.availability_slots
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (teacher_id = public.current_teacher_id());
DROP POLICY IF EXISTS "Admins manage slots" ON public.availability_slots;
CREATE POLICY "Admins manage slots" ON public.availability_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- سياسات bookings
-- ------------------------------------------------------------
-- الطالبة: قراءة حجوزاتها + إنشاء حجز واحد فقط (الفهارس الفريدة تمنع الازدواج) — لا UPDATE/DELETE
DROP POLICY IF EXISTS "Students read own bookings" ON public.bookings;
CREATE POLICY "Students read own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Students create own booking" ON public.bookings;
CREATE POLICY "Students create own booking" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = public.current_student_id()
    AND status = 'active'
    AND EXISTS (SELECT 1 FROM public.availability_slots s WHERE s.id = slot_id AND s.is_active)
  );

-- المعلمة: قراءة/تعديل حجوزات فتحاتها (فك الحجز = status → released)
DROP POLICY IF EXISTS "Teachers read own slot bookings" ON public.bookings;
CREATE POLICY "Teachers read own slot bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.availability_slots s
    WHERE s.id = bookings.slot_id AND s.teacher_id = public.current_teacher_id()
  ));
DROP POLICY IF EXISTS "Teachers update own slot bookings" ON public.bookings;
CREATE POLICY "Teachers update own slot bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.availability_slots s
    WHERE s.id = bookings.slot_id AND s.teacher_id = public.current_teacher_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.availability_slots s
    WHERE s.id = bookings.slot_id AND s.teacher_id = public.current_teacher_id()
  ));

-- المشرفة: قراءة حجوزات طالبات مساراتها
DROP POLICY IF EXISTS "Supervisors read scoped bookings" ON public.bookings;
CREATE POLICY "Supervisors read scoped bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students st
    WHERE st.id = bookings.student_id
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  ));

DROP POLICY IF EXISTS "Admins manage bookings" ON public.bookings;
CREATE POLICY "Admins manage bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- سياسة مؤجلة من 03: المعلمة تقرأ بيانات طالبات حجوزاتها النشطة
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers read booked students" ON public.students;
CREATE POLICY "Teachers read booked students" ON public.students
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.availability_slots s ON s.id = b.slot_id
    WHERE b.student_id = students.id AND b.status = 'active'
      AND s.teacher_id = public.current_teacher_id()
  ));
