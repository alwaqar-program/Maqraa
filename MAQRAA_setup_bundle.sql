-- ============================================================
-- 01_roles_and_helpers.sql — مقرأة الوقار
-- الأدوار + الدوال المساعدة. يُنفَّذ أولًا في SQL Editor.
-- ============================================================
-- ⚠️ أمان (درس حادثة اختراق الوقار 2026-07 — راجع 53_emergency_lockdown.sql):
--   لا تسجيل ذاتي إطلاقًا. بعد إنشاء المشروع مباشرة:
--   Authentication → Sign In / Up → عطّلي "Allow new users to sign up".
--   إنشاء الحسابات يتم فقط عبر Edge Function «admin-create-user» بصلاحية admin.
-- ============================================================

-- الدوال المساعدة تشير لجداول تُنشأ في ملفات لاحقة — عطّلي فحص أجسام الدوال أثناء الإنشاء
SET check_function_bodies = off;

-- الأدوار
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','teacher','supervisor','student','report_viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- هل يحمل المستخدم الدور؟ (SECURITY DEFINER لتجاوز RLS داخل السياسات نفسها)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- صف الطالبة المرتبط بالمستخدم الحالي
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
$$;

-- صف المعلمة المرتبط بالمستخدم الحالي
CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.teachers WHERE user_id = auth.uid() LIMIT 1;
$$;

-- مسارات المشرفة الحالية (scope=general ⇒ كل المسارات)
CREATE OR REPLACE FUNCTION public.supervisor_track_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id FROM public.tracks t
  WHERE EXISTS (
    SELECT 1 FROM public.supervisors s
    WHERE s.user_id = auth.uid() AND s.is_active
      AND (s.scope = 'general' OR EXISTS (
        SELECT 1 FROM public.supervisor_tracks st
        WHERE st.supervisor_id = s.id AND st.track_id = t.id))
  );
$$;

-- سياسات user_roles
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- إعدادات عامة قابلة للتعديل من النظام (حدود ساعات المعلمة وغيرها)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read settings" ON public.app_settings;
CREATE POLICY "Authenticated read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value, description) VALUES
  ('teacher_min_hours_per_week', '2',  'الحد الأدنى لساعات توفر المسمعة أسبوعيًا'),
  ('teacher_max_hours_per_week', '12', 'الحد الأعلى لساعات توفر المسمعة أسبوعيًا'),
  ('slot_duration_minutes',      '60', 'مدة موعد التسميع الفردي بالدقائق'),
  ('max_absences_per_season',    '3',  'حد الغيابات المسموح خلال الفصل (بعذر أو بدون) — تجاوزه يُبرز تنبيهًا للإدارة')
ON CONFLICT (key) DO NOTHING;
-- ============================================================
-- 02_structure.sql — مقرأة الوقار
-- المسارات + الفصول + المعلمات + المشرفات.
-- ============================================================

-- المسارات: النصاب بالفصل (جدول نصاب التسميع: المجموع = المحفوظ لكل مسار، 1 جزء = 20 صفحة)
-- quota_pages_per_season قابل للتعديل من واجهة الإدارة (لا ثوابت في الكود)
CREATE TABLE IF NOT EXISTS public.tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  juz_count numeric(5,2) NOT NULL CHECK (juz_count > 0),          -- 5/10/20/30/60
  quota_pages_per_season numeric(7,2) NOT NULL CHECK (quota_pages_per_season > 0), -- 100/200/400/600/1200
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read tracks" ON public.tracks;
CREATE POLICY "Authenticated read tracks" ON public.tracks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage tracks" ON public.tracks;
CREATE POLICY "Admins manage tracks" ON public.tracks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- بذر جدول نصاب التسميع المعتمد (لكل مسار — المجموع بالفصل)
INSERT INTO public.tracks (name, juz_count, quota_pages_per_season, sort_order)
SELECT v.name, v.juz, v.pages, v.ord
FROM (VALUES
  ('خمسة أجزاء',  5.0,  100.0, 1),
  ('عشرة أجزاء', 10.0,  200.0, 2),
  ('عشرون جزءًا', 20.0,  400.0, 3),
  ('ختمة',       30.0,  600.0, 4),
  ('ختمتان',     60.0, 1200.0, 5)
) AS v(name, juz, pages, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.tracks);

-- الفصول (الدورات) — 14 جلسة أسبوعية افتراضيًا حسب جدول النصاب، قابلة للتعديل
CREATE TABLE IF NOT EXISTS public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  sessions_count int NOT NULL DEFAULT 14 CHECK (sessions_count > 0),
  max_students int,                                   -- «يُغلق التسجيل حين اكتمال العدد» (فارغ = بلا حد)
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','active','closed')),
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date)
);
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read seasons" ON public.seasons;
CREATE POLICY "Authenticated read seasons" ON public.seasons
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage seasons" ON public.seasons;
CREATE POLICY "Admins manage seasons" ON public.seasons
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- فصل حالي واحد فقط
CREATE UNIQUE INDEX IF NOT EXISTS one_current_season
  ON public.seasons (is_current) WHERE is_current;

-- المعلمات (المسمعات) — رابط اجتماع ثابت لكل معلمة
CREATE TABLE IF NOT EXISTS public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  national_id text UNIQUE,
  phone text,
  email text,
  meeting_link text,               -- غرفة الاجتماع الدائمة (Zoom/Meet) تظهر للطالبة في موعدها
  bio text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read teachers" ON public.teachers;
CREATE POLICY "Authenticated read teachers" ON public.teachers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Teachers update own profile" ON public.teachers;
CREATE POLICY "Teachers update own profile" ON public.teachers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage teachers" ON public.teachers;
CREATE POLICY "Admins manage teachers" ON public.teachers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- المشرفات: مشرفة مسار أو مشرفة عامة
CREATE TABLE IF NOT EXISTS public.supervisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  scope text NOT NULL DEFAULT 'track' CHECK (scope IN ('track','general')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supervisor_tracks (
  supervisor_id uuid NOT NULL REFERENCES public.supervisors(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (supervisor_id, track_id)
);
ALTER TABLE public.supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read supervisors" ON public.supervisors;
CREATE POLICY "Authenticated read supervisors" ON public.supervisors
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage supervisors" ON public.supervisors;
CREATE POLICY "Admins manage supervisors" ON public.supervisors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated read supervisor tracks" ON public.supervisor_tracks;
CREATE POLICY "Authenticated read supervisor tracks" ON public.supervisor_tracks
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage supervisor tracks" ON public.supervisor_tracks;
CREATE POLICY "Admins manage supervisor tracks" ON public.supervisor_tracks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
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


-- دوال كسر حلقة RLS (SECURITY DEFINER تتجاوز RLS داخليًا)
CREATE OR REPLACE FUNCTION public.teacher_has_active_booking(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.availability_slots s ON s.id = b.slot_id
    WHERE b.student_id = p_student AND b.status = 'active'
      AND s.teacher_id = public.current_teacher_id()
  );
$$;
CREATE OR REPLACE FUNCTION public.student_in_supervisor_scope(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students st
    WHERE st.id = p_student
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  );
$$;

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
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));

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
  FOR SELECT TO authenticated USING (public.teacher_has_active_booking(id));
-- ============================================================
-- 05_mushaf_reference.sql — مقرأة الوقار
-- جدول مرجع المصحف (604 صفحات، مصحف المدينة) + البذر.
-- البذر منقول حرفيًا من نظام الوقار (18_seed_mushaf_reference.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mushaf_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surah_number int NOT NULL,
  surah_name text NOT NULL,
  page_number int NOT NULL UNIQUE,
  verse_start int NOT NULL,
  verse_end int NOT NULL,
  juz_number int NOT NULL,
  hizb_number int NOT NULL,
  sort_order int NOT NULL,
  cumulative_completion_pct numeric(6,2) NOT NULL
);
ALTER TABLE public.mushaf_reference ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read mushaf" ON public.mushaf_reference;
CREATE POLICY "Authenticated read mushaf" ON public.mushaf_reference
  FOR SELECT TO authenticated USING (true);


INSERT INTO public.mushaf_reference
  (surah_number, surah_name, page_number, verse_start, verse_end, juz_number, hizb_number, sort_order, cumulative_completion_pct)
VALUES
  (1, 'الفاتحة', 1, 1, 7, 1, 1, 1, 0.17),
  (2, 'البقرة', 2, 1, 5, 1, 1, 2, 0.33),
  (2, 'البقرة', 3, 6, 16, 1, 1, 3, 0.5),
  (2, 'البقرة', 4, 17, 24, 1, 1, 4, 0.66),
  (2, 'البقرة', 5, 25, 29, 1, 1, 5, 0.83),
  (2, 'البقرة', 6, 30, 37, 1, 1, 6, 0.99),
  (2, 'البقرة', 7, 38, 48, 1, 1, 7, 1.16),
  (2, 'البقرة', 8, 49, 57, 1, 1, 8, 1.32),
  (2, 'البقرة', 9, 58, 61, 1, 1, 9, 1.49),
  (2, 'البقرة', 10, 62, 69, 1, 1, 10, 1.66),
  (2, 'البقرة', 11, 70, 76, 1, 2, 11, 1.82),
  (2, 'البقرة', 12, 77, 83, 1, 2, 12, 1.99),
  (2, 'البقرة', 13, 84, 88, 1, 2, 13, 2.15),
  (2, 'البقرة', 14, 89, 93, 1, 2, 14, 2.32),
  (2, 'البقرة', 15, 94, 101, 1, 2, 15, 2.48),
  (2, 'البقرة', 16, 102, 105, 1, 2, 16, 2.65),
  (2, 'البقرة', 17, 106, 112, 1, 2, 17, 2.81),
  (2, 'البقرة', 18, 113, 119, 1, 2, 18, 2.98),
  (2, 'البقرة', 19, 120, 126, 1, 2, 19, 3.15),
  (2, 'البقرة', 20, 127, 134, 1, 2, 20, 3.31),
  (2, 'البقرة', 21, 135, 141, 1, 2, 21, 3.48),
  (2, 'البقرة', 22, 142, 145, 2, 3, 22, 3.64),
  (2, 'البقرة', 23, 146, 153, 2, 3, 23, 3.81),
  (2, 'البقرة', 24, 154, 163, 2, 3, 24, 3.97),
  (2, 'البقرة', 25, 164, 169, 2, 3, 25, 4.14),
  (2, 'البقرة', 26, 170, 176, 2, 3, 26, 4.3),
  (2, 'البقرة', 27, 177, 181, 2, 3, 27, 4.47),
  (2, 'البقرة', 28, 182, 186, 2, 3, 28, 4.64),
  (2, 'البقرة', 29, 187, 190, 2, 3, 29, 4.8),
  (2, 'البقرة', 30, 191, 196, 2, 3, 30, 4.97),
  (2, 'البقرة', 31, 197, 202, 2, 3, 31, 5.13),
  (2, 'البقرة', 32, 203, 210, 2, 4, 32, 5.3),
  (2, 'البقرة', 33, 211, 215, 2, 4, 33, 5.46),
  (2, 'البقرة', 34, 216, 219, 2, 4, 34, 5.63),
  (2, 'البقرة', 35, 220, 224, 2, 4, 35, 5.79),
  (2, 'البقرة', 36, 225, 230, 2, 4, 36, 5.96),
  (2, 'البقرة', 37, 231, 233, 2, 4, 37, 6.13),
  (2, 'البقرة', 38, 234, 237, 2, 4, 38, 6.29),
  (2, 'البقرة', 39, 238, 245, 2, 4, 39, 6.46),
  (2, 'البقرة', 40, 246, 248, 2, 4, 40, 6.62),
  (2, 'البقرة', 41, 249, 252, 2, 4, 41, 6.79),
  (2, 'البقرة', 42, 253, 256, 3, 5, 42, 6.95),
  (2, 'البقرة', 43, 257, 259, 3, 5, 43, 7.12),
  (2, 'البقرة', 44, 260, 264, 3, 5, 44, 7.28),
  (2, 'البقرة', 45, 265, 269, 3, 5, 45, 7.45),
  (2, 'البقرة', 46, 270, 274, 3, 5, 46, 7.62),
  (2, 'البقرة', 47, 275, 281, 3, 5, 47, 7.78),
  (2, 'البقرة', 48, 282, 282, 3, 5, 48, 7.95),
  (2, 'البقرة', 49, 283, 286, 3, 5, 49, 8.11),
  (3, 'آل عمران', 50, 1, 9, 3, 5, 50, 8.28),
  (3, 'آل عمران', 51, 10, 15, 3, 5, 51, 8.44),
  (3, 'آل عمران', 52, 16, 22, 3, 6, 52, 8.61),
  (3, 'آل عمران', 53, 23, 29, 3, 6, 53, 8.77),
  (3, 'آل عمران', 54, 30, 37, 3, 6, 54, 8.94),
  (3, 'آل عمران', 55, 38, 45, 3, 6, 55, 9.11),
  (3, 'آل عمران', 56, 46, 52, 3, 6, 56, 9.27),
  (3, 'آل عمران', 57, 53, 61, 3, 6, 57, 9.44),
  (3, 'آل عمران', 58, 62, 70, 3, 6, 58, 9.6),
  (3, 'آل عمران', 59, 71, 77, 3, 6, 59, 9.77),
  (3, 'آل عمران', 60, 78, 83, 3, 6, 60, 9.93),
  (3, 'آل عمران', 61, 84, 91, 3, 6, 61, 10.1),
  (3, 'آل عمران', 62, 92, 100, 4, 7, 62, 10.26),
  (3, 'آل عمران', 63, 101, 108, 4, 7, 63, 10.43),
  (3, 'آل عمران', 64, 109, 115, 4, 7, 64, 10.6),
  (3, 'آل عمران', 65, 116, 121, 4, 7, 65, 10.76),
  (3, 'آل عمران', 66, 122, 132, 4, 7, 66, 10.93),
  (3, 'آل عمران', 67, 133, 140, 4, 7, 67, 11.09),
  (3, 'آل عمران', 68, 141, 148, 4, 7, 68, 11.26),
  (3, 'آل عمران', 69, 149, 153, 4, 7, 69, 11.42),
  (3, 'آل عمران', 70, 154, 157, 4, 7, 70, 11.59),
  (3, 'آل عمران', 71, 158, 165, 4, 7, 71, 11.75),
  (3, 'آل عمران', 72, 166, 173, 4, 8, 72, 11.92),
  (3, 'آل عمران', 73, 174, 180, 4, 8, 73, 12.09),
  (3, 'آل عمران', 74, 181, 186, 4, 8, 74, 12.25),
  (3, 'آل عمران', 75, 187, 194, 4, 8, 75, 12.42),
  (3, 'آل عمران', 76, 195, 200, 4, 8, 76, 12.58),
  (4, 'النساء', 77, 1, 6, 4, 8, 77, 12.75),
  (4, 'النساء', 78, 7, 11, 4, 8, 78, 12.91),
  (4, 'النساء', 79, 12, 14, 4, 8, 79, 13.08),
  (4, 'النساء', 80, 15, 19, 4, 8, 80, 13.25),
  (4, 'النساء', 81, 20, 23, 4, 8, 81, 13.41),
  (4, 'النساء', 82, 24, 26, 5, 9, 82, 13.58),
  (4, 'النساء', 83, 27, 33, 5, 9, 83, 13.74),
  (4, 'النساء', 84, 34, 37, 5, 9, 84, 13.91),
  (4, 'النساء', 85, 38, 44, 5, 9, 85, 14.07),
  (4, 'النساء', 86, 45, 51, 5, 9, 86, 14.24),
  (4, 'النساء', 87, 52, 59, 5, 9, 87, 14.4),
  (4, 'النساء', 88, 60, 65, 5, 9, 88, 14.57),
  (4, 'النساء', 89, 66, 74, 5, 9, 89, 14.74),
  (4, 'النساء', 90, 75, 79, 5, 9, 90, 14.9),
  (4, 'النساء', 91, 80, 86, 5, 9, 91, 15.07),
  (4, 'النساء', 92, 87, 91, 5, 10, 92, 15.23),
  (4, 'النساء', 93, 92, 94, 5, 10, 93, 15.4),
  (4, 'النساء', 94, 95, 101, 5, 10, 94, 15.56),
  (4, 'النساء', 95, 102, 105, 5, 10, 95, 15.73),
  (4, 'النساء', 96, 106, 113, 5, 10, 96, 15.89),
  (4, 'النساء', 97, 114, 121, 5, 10, 97, 16.06),
  (4, 'النساء', 98, 122, 127, 5, 10, 98, 16.23),
  (4, 'النساء', 99, 128, 134, 5, 10, 99, 16.39),
  (4, 'النساء', 100, 135, 140, 5, 10, 100, 16.56),
  (4, 'النساء', 101, 141, 147, 5, 10, 101, 16.72),
  (4, 'النساء', 102, 148, 154, 6, 11, 102, 16.89),
  (4, 'النساء', 103, 155, 162, 6, 11, 103, 17.05),
  (4, 'النساء', 104, 163, 170, 6, 11, 104, 17.22),
  (4, 'النساء', 105, 171, 175, 6, 11, 105, 17.38),
  (4, 'النساء', 106, 176, 176, 6, 11, 106, 17.55),
  (5, 'المائدة', 107, 3, 5, 6, 11, 107, 17.72),
  (5, 'المائدة', 108, 6, 9, 6, 11, 108, 17.88),
  (5, 'المائدة', 109, 10, 13, 6, 11, 109, 18.05),
  (5, 'المائدة', 110, 14, 17, 6, 11, 110, 18.21),
  (5, 'المائدة', 111, 18, 23, 6, 11, 111, 18.38),
  (5, 'المائدة', 112, 24, 31, 6, 12, 112, 18.54),
  (5, 'المائدة', 113, 32, 36, 6, 12, 113, 18.71),
  (5, 'المائدة', 114, 37, 41, 6, 12, 114, 18.87),
  (5, 'المائدة', 115, 42, 45, 6, 12, 115, 19.04),
  (5, 'المائدة', 116, 46, 50, 6, 12, 116, 19.21),
  (5, 'المائدة', 117, 51, 57, 6, 12, 117, 19.37),
  (5, 'المائدة', 118, 58, 64, 6, 12, 118, 19.54),
  (5, 'المائدة', 119, 65, 70, 6, 12, 119, 19.7),
  (5, 'المائدة', 120, 71, 77, 6, 12, 120, 19.87),
  (5, 'المائدة', 121, 78, 83, 6, 12, 121, 20.03),
  (5, 'المائدة', 122, 84, 90, 7, 13, 122, 20.2),
  (5, 'المائدة', 123, 91, 95, 7, 13, 123, 20.36),
  (5, 'المائدة', 124, 96, 103, 7, 13, 124, 20.53),
  (5, 'المائدة', 125, 104, 108, 7, 13, 125, 20.7),
  (5, 'المائدة', 126, 109, 113, 7, 13, 126, 20.86),
  (5, 'المائدة', 127, 114, 120, 7, 13, 127, 21.03),
  (6, 'الأنعام', 128, 1, 8, 7, 13, 128, 21.19),
  (6, 'الأنعام', 129, 9, 18, 7, 13, 129, 21.36),
  (6, 'الأنعام', 130, 19, 27, 7, 13, 130, 21.52),
  (6, 'الأنعام', 131, 28, 35, 7, 13, 131, 21.69),
  (6, 'الأنعام', 132, 36, 44, 7, 14, 132, 21.85),
  (6, 'الأنعام', 133, 45, 52, 7, 14, 133, 22.02),
  (6, 'الأنعام', 134, 53, 59, 7, 14, 134, 22.19),
  (6, 'الأنعام', 135, 60, 68, 7, 14, 135, 22.35),
  (6, 'الأنعام', 136, 69, 73, 7, 14, 136, 22.52),
  (6, 'الأنعام', 137, 74, 81, 7, 14, 137, 22.68),
  (6, 'الأنعام', 138, 82, 90, 7, 14, 138, 22.85),
  (6, 'الأنعام', 139, 91, 94, 7, 14, 139, 23.01),
  (6, 'الأنعام', 140, 95, 101, 7, 14, 140, 23.18),
  (6, 'الأنعام', 141, 102, 110, 7, 14, 141, 23.34),
  (6, 'الأنعام', 142, 111, 118, 8, 15, 142, 23.51),
  (6, 'الأنعام', 143, 119, 124, 8, 15, 143, 23.68),
  (6, 'الأنعام', 144, 125, 130, 8, 15, 144, 23.84),
  (6, 'الأنعام', 145, 131, 137, 8, 15, 145, 24.01),
  (6, 'الأنعام', 146, 138, 142, 8, 15, 146, 24.17),
  (6, 'الأنعام', 147, 143, 146, 8, 15, 147, 24.34),
  (6, 'الأنعام', 148, 147, 151, 8, 15, 148, 24.5),
  (6, 'الأنعام', 149, 152, 157, 8, 15, 149, 24.67),
  (6, 'الأنعام', 150, 158, 165, 8, 15, 150, 24.83),
  (7, 'الأعراف', 151, 1, 11, 8, 15, 151, 25.0),
  (7, 'الأعراف', 152, 12, 22, 8, 16, 152, 25.17),
  (7, 'الأعراف', 153, 23, 30, 8, 16, 153, 25.33),
  (7, 'الأعراف', 154, 31, 37, 8, 16, 154, 25.5),
  (7, 'الأعراف', 155, 38, 43, 8, 16, 155, 25.66),
  (7, 'الأعراف', 156, 44, 51, 8, 16, 156, 25.83),
  (7, 'الأعراف', 157, 52, 57, 8, 16, 157, 25.99),
  (7, 'الأعراف', 158, 58, 67, 8, 16, 158, 26.16),
  (7, 'الأعراف', 159, 68, 73, 8, 16, 159, 26.32),
  (7, 'الأعراف', 160, 74, 81, 8, 16, 160, 26.49),
  (7, 'الأعراف', 161, 82, 87, 8, 16, 161, 26.66),
  (7, 'الأعراف', 162, 88, 95, 9, 17, 162, 26.82),
  (7, 'الأعراف', 163, 96, 104, 9, 17, 163, 26.99),
  (7, 'الأعراف', 164, 105, 120, 9, 17, 164, 27.15),
  (7, 'الأعراف', 165, 121, 130, 9, 17, 165, 27.32),
  (7, 'الأعراف', 166, 131, 137, 9, 17, 166, 27.48),
  (7, 'الأعراف', 167, 138, 143, 9, 17, 167, 27.65),
  (7, 'الأعراف', 168, 144, 149, 9, 17, 168, 27.81),
  (7, 'الأعراف', 169, 150, 155, 9, 17, 169, 27.98),
  (7, 'الأعراف', 170, 156, 159, 9, 17, 170, 28.15),
  (7, 'الأعراف', 171, 160, 163, 9, 17, 171, 28.31),
  (7, 'الأعراف', 172, 164, 170, 9, 18, 172, 28.48),
  (7, 'الأعراف', 173, 171, 178, 9, 18, 173, 28.64),
  (7, 'الأعراف', 174, 179, 187, 9, 18, 174, 28.81),
  (7, 'الأعراف', 175, 188, 195, 9, 18, 175, 28.97),
  (7, 'الأعراف', 176, 196, 206, 9, 18, 176, 29.14),
  (8, 'الأنفال', 177, 1, 8, 9, 18, 177, 29.3),
  (8, 'الأنفال', 178, 9, 16, 9, 18, 178, 29.47),
  (8, 'الأنفال', 179, 17, 25, 9, 18, 179, 29.64),
  (8, 'الأنفال', 180, 26, 33, 9, 18, 180, 29.8),
  (8, 'الأنفال', 181, 34, 40, 9, 18, 181, 29.97),
  (8, 'الأنفال', 182, 41, 45, 10, 19, 182, 30.13),
  (8, 'الأنفال', 183, 46, 52, 10, 19, 183, 30.3),
  (8, 'الأنفال', 184, 53, 61, 10, 19, 184, 30.46),
  (8, 'الأنفال', 185, 62, 69, 10, 19, 185, 30.63),
  (8, 'الأنفال', 186, 70, 75, 10, 19, 186, 30.79),
  (9, 'التوبة', 187, 1, 6, 10, 19, 187, 30.96),
  (9, 'التوبة', 188, 7, 13, 10, 19, 188, 31.13),
  (9, 'التوبة', 189, 14, 20, 10, 19, 189, 31.29),
  (9, 'التوبة', 190, 21, 26, 10, 19, 190, 31.46),
  (9, 'التوبة', 191, 27, 31, 10, 19, 191, 31.62),
  (9, 'التوبة', 192, 32, 36, 10, 20, 192, 31.79),
  (9, 'التوبة', 193, 37, 40, 10, 20, 193, 31.95),
  (9, 'التوبة', 194, 41, 47, 10, 20, 194, 32.12),
  (9, 'التوبة', 195, 48, 54, 10, 20, 195, 32.28),
  (9, 'التوبة', 196, 55, 61, 10, 20, 196, 32.45),
  (9, 'التوبة', 197, 62, 68, 10, 20, 197, 32.62),
  (9, 'التوبة', 198, 69, 72, 10, 20, 198, 32.78),
  (9, 'التوبة', 199, 73, 79, 10, 20, 199, 32.95),
  (9, 'التوبة', 200, 80, 86, 10, 20, 200, 33.11),
  (9, 'التوبة', 201, 87, 93, 10, 20, 201, 33.28),
  (9, 'التوبة', 202, 94, 99, 11, 21, 202, 33.44),
  (9, 'التوبة', 203, 100, 106, 11, 21, 203, 33.61),
  (9, 'التوبة', 204, 107, 111, 11, 21, 204, 33.77),
  (9, 'التوبة', 205, 112, 117, 11, 21, 205, 33.94),
  (9, 'التوبة', 206, 118, 122, 11, 21, 206, 34.11),
  (9, 'التوبة', 207, 123, 129, 11, 21, 207, 34.27),
  (10, 'يونس', 208, 1, 6, 11, 21, 208, 34.44),
  (10, 'يونس', 209, 7, 14, 11, 21, 209, 34.6),
  (10, 'يونس', 210, 15, 20, 11, 21, 210, 34.77),
  (10, 'يونس', 211, 21, 25, 11, 21, 211, 34.93),
  (10, 'يونس', 212, 26, 33, 11, 22, 212, 35.1),
  (10, 'يونس', 213, 34, 42, 11, 22, 213, 35.26),
  (10, 'يونس', 214, 43, 53, 11, 22, 214, 35.43),
  (10, 'يونس', 215, 54, 61, 11, 22, 215, 35.6),
  (10, 'يونس', 216, 62, 70, 11, 22, 216, 35.76),
  (10, 'يونس', 217, 71, 78, 11, 22, 217, 35.93),
  (10, 'يونس', 218, 79, 88, 11, 22, 218, 36.09),
  (10, 'يونس', 219, 89, 97, 11, 22, 219, 36.26),
  (10, 'يونس', 220, 98, 106, 11, 22, 220, 36.42),
  (10, 'يونس', 221, 107, 109, 11, 22, 221, 36.59),
  (11, 'هود', 222, 6, 12, 12, 23, 222, 36.75),
  (11, 'هود', 223, 13, 19, 12, 23, 223, 36.92),
  (11, 'هود', 224, 20, 28, 12, 23, 224, 37.09),
  (11, 'هود', 225, 29, 37, 12, 23, 225, 37.25),
  (11, 'هود', 226, 38, 45, 12, 23, 226, 37.42),
  (11, 'هود', 227, 46, 53, 12, 23, 227, 37.58),
  (11, 'هود', 228, 54, 62, 12, 23, 228, 37.75),
  (11, 'هود', 229, 63, 71, 12, 23, 229, 37.91),
  (11, 'هود', 230, 72, 81, 12, 23, 230, 38.08),
  (11, 'هود', 231, 82, 88, 12, 23, 231, 38.25),
  (11, 'هود', 232, 89, 97, 12, 24, 232, 38.41),
  (11, 'هود', 233, 98, 108, 12, 24, 233, 38.58),
  (11, 'هود', 234, 109, 117, 12, 24, 234, 38.74),
  (11, 'هود', 235, 118, 123, 12, 24, 235, 38.91),
  (12, 'يوسف', 236, 5, 14, 12, 24, 236, 39.07),
  (12, 'يوسف', 237, 15, 22, 12, 24, 237, 39.24),
  (12, 'يوسف', 238, 23, 30, 12, 24, 238, 39.4),
  (12, 'يوسف', 239, 31, 37, 12, 24, 239, 39.57),
  (12, 'يوسف', 240, 38, 43, 12, 24, 240, 39.74),
  (12, 'يوسف', 241, 44, 52, 12, 24, 241, 39.9),
  (12, 'يوسف', 242, 53, 63, 13, 25, 242, 40.07),
  (12, 'يوسف', 243, 64, 69, 13, 25, 243, 40.23),
  (12, 'يوسف', 244, 70, 78, 13, 25, 244, 40.4),
  (12, 'يوسف', 245, 79, 86, 13, 25, 245, 40.56),
  (12, 'يوسف', 246, 87, 95, 13, 25, 246, 40.73),
  (12, 'يوسف', 247, 96, 103, 13, 25, 247, 40.89),
  (12, 'يوسف', 248, 104, 111, 13, 25, 248, 41.06),
  (13, 'الرعد', 249, 1, 5, 13, 25, 249, 41.23),
  (13, 'الرعد', 250, 6, 13, 13, 25, 250, 41.39),
  (13, 'الرعد', 251, 14, 18, 13, 25, 251, 41.56),
  (13, 'الرعد', 252, 19, 28, 13, 26, 252, 41.72),
  (13, 'الرعد', 253, 29, 34, 13, 26, 253, 41.89),
  (13, 'الرعد', 254, 35, 42, 13, 26, 254, 42.05),
  (13, 'الرعد', 255, 43, 43, 13, 26, 255, 42.22),
  (14, 'إبراهيم', 256, 6, 10, 13, 26, 256, 42.38),
  (14, 'إبراهيم', 257, 11, 18, 13, 26, 257, 42.55),
  (14, 'إبراهيم', 258, 19, 24, 13, 26, 258, 42.72),
  (14, 'إبراهيم', 259, 25, 33, 13, 26, 259, 42.88),
  (14, 'إبراهيم', 260, 34, 42, 13, 26, 260, 43.05),
  (14, 'إبراهيم', 261, 43, 52, 13, 26, 261, 43.21),
  (15, 'الحجر', 262, 1, 15, 14, 27, 262, 43.38),
  (15, 'الحجر', 263, 16, 31, 14, 27, 263, 43.54),
  (15, 'الحجر', 264, 32, 51, 14, 27, 264, 43.71),
  (15, 'الحجر', 265, 52, 70, 14, 27, 265, 43.87),
  (15, 'الحجر', 266, 71, 90, 14, 27, 266, 44.04),
  (15, 'الحجر', 267, 91, 99, 14, 27, 267, 44.21),
  (16, 'النحل', 268, 7, 14, 14, 27, 268, 44.37),
  (16, 'النحل', 269, 15, 26, 14, 27, 269, 44.54),
  (16, 'النحل', 270, 27, 34, 14, 27, 270, 44.7),
  (16, 'النحل', 271, 35, 42, 14, 27, 271, 44.87),
  (16, 'النحل', 272, 43, 54, 14, 28, 272, 45.03),
  (16, 'النحل', 273, 55, 64, 14, 28, 273, 45.2),
  (16, 'النحل', 274, 65, 72, 14, 28, 274, 45.36),
  (16, 'النحل', 275, 73, 79, 14, 28, 275, 45.53),
  (16, 'النحل', 276, 80, 87, 14, 28, 276, 45.7),
  (16, 'النحل', 277, 88, 93, 14, 28, 277, 45.86),
  (16, 'النحل', 278, 94, 102, 14, 28, 278, 46.03),
  (16, 'النحل', 279, 103, 110, 14, 28, 279, 46.19),
  (16, 'النحل', 280, 111, 118, 14, 28, 280, 46.36),
  (16, 'النحل', 281, 119, 128, 14, 28, 281, 46.52),
  (17, 'الإسراء', 282, 1, 7, 15, 29, 282, 46.69),
  (17, 'الإسراء', 283, 8, 17, 15, 29, 283, 46.85),
  (17, 'الإسراء', 284, 18, 27, 15, 29, 284, 47.02),
  (17, 'الإسراء', 285, 28, 38, 15, 29, 285, 47.19),
  (17, 'الإسراء', 286, 39, 49, 15, 29, 286, 47.35),
  (17, 'الإسراء', 287, 50, 58, 15, 29, 287, 47.52),
  (17, 'الإسراء', 288, 59, 66, 15, 29, 288, 47.68),
  (17, 'الإسراء', 289, 67, 75, 15, 29, 289, 47.85),
  (17, 'الإسراء', 290, 76, 86, 15, 29, 290, 48.01),
  (17, 'الإسراء', 291, 87, 96, 15, 29, 291, 48.18),
  (17, 'الإسراء', 292, 97, 104, 15, 30, 292, 48.34),
  (17, 'الإسراء', 293, 105, 111, 15, 30, 293, 48.51),
  (18, 'الكهف', 294, 5, 15, 15, 30, 294, 48.68),
  (18, 'الكهف', 295, 16, 20, 15, 30, 295, 48.84),
  (18, 'الكهف', 296, 21, 27, 15, 30, 296, 49.01),
  (18, 'الكهف', 297, 28, 34, 15, 30, 297, 49.17),
  (18, 'الكهف', 298, 35, 45, 15, 30, 298, 49.34),
  (18, 'الكهف', 299, 46, 53, 15, 30, 299, 49.5),
  (18, 'الكهف', 300, 54, 61, 15, 30, 300, 49.67),
  (18, 'الكهف', 301, 62, 74, 15, 30, 301, 49.83),
  (18, 'الكهف', 302, 75, 83, 16, 31, 302, 50.0),
  (18, 'الكهف', 303, 84, 97, 16, 31, 303, 50.17),
  (18, 'الكهف', 304, 98, 110, 16, 31, 304, 50.33),
  (19, 'مريم', 305, 1, 11, 16, 31, 305, 50.5),
  (19, 'مريم', 306, 12, 25, 16, 31, 306, 50.66),
  (19, 'مريم', 307, 26, 38, 16, 31, 307, 50.83),
  (19, 'مريم', 308, 39, 51, 16, 31, 308, 50.99),
  (19, 'مريم', 309, 52, 64, 16, 31, 309, 51.16),
  (19, 'مريم', 310, 65, 76, 16, 31, 310, 51.32),
  (19, 'مريم', 311, 77, 95, 16, 31, 311, 51.49),
  (19, 'مريم', 312, 96, 98, 16, 32, 312, 51.66),
  (20, 'طه', 313, 13, 37, 16, 32, 313, 51.82),
  (20, 'طه', 314, 38, 51, 16, 32, 314, 51.99),
  (20, 'طه', 315, 52, 64, 16, 32, 315, 52.15),
  (20, 'طه', 316, 65, 76, 16, 32, 316, 52.32),
  (20, 'طه', 317, 77, 87, 16, 32, 317, 52.48),
  (20, 'طه', 318, 88, 98, 16, 32, 318, 52.65),
  (20, 'طه', 319, 99, 113, 16, 32, 319, 52.81),
  (20, 'طه', 320, 114, 125, 16, 32, 320, 52.98),
  (20, 'طه', 321, 126, 135, 16, 32, 321, 53.15),
  (21, 'الأنبياء', 322, 1, 10, 17, 33, 322, 53.31),
  (21, 'الأنبياء', 323, 11, 24, 17, 33, 323, 53.48),
  (21, 'الأنبياء', 324, 25, 35, 17, 33, 324, 53.64),
  (21, 'الأنبياء', 325, 36, 44, 17, 33, 325, 53.81),
  (21, 'الأنبياء', 326, 45, 57, 17, 33, 326, 53.97),
  (21, 'الأنبياء', 327, 58, 72, 17, 33, 327, 54.14),
  (21, 'الأنبياء', 328, 73, 81, 17, 33, 328, 54.3),
  (21, 'الأنبياء', 329, 82, 90, 17, 33, 329, 54.47),
  (21, 'الأنبياء', 330, 91, 101, 17, 33, 330, 54.64),
  (21, 'الأنبياء', 331, 102, 112, 17, 33, 331, 54.8),
  (22, 'الحج', 332, 1, 5, 17, 34, 332, 54.97),
  (22, 'الحج', 333, 6, 15, 17, 34, 333, 55.13),
  (22, 'الحج', 334, 16, 23, 17, 34, 334, 55.3),
  (22, 'الحج', 335, 24, 30, 17, 34, 335, 55.46),
  (22, 'الحج', 336, 31, 38, 17, 34, 336, 55.63),
  (22, 'الحج', 337, 39, 46, 17, 34, 337, 55.79),
  (22, 'الحج', 338, 47, 55, 17, 34, 338, 55.96),
  (22, 'الحج', 339, 56, 64, 17, 34, 339, 56.13),
  (22, 'الحج', 340, 65, 72, 17, 34, 340, 56.29),
  (22, 'الحج', 341, 73, 78, 17, 34, 341, 56.46),
  (23, 'المؤمنون', 342, 1, 17, 18, 35, 342, 56.62),
  (23, 'المؤمنون', 343, 18, 27, 18, 35, 343, 56.79),
  (23, 'المؤمنون', 344, 28, 42, 18, 35, 344, 56.95),
  (23, 'المؤمنون', 345, 43, 59, 18, 35, 345, 57.12),
  (23, 'المؤمنون', 346, 60, 74, 18, 35, 346, 57.28),
  (23, 'المؤمنون', 347, 75, 89, 18, 35, 347, 57.45),
  (23, 'المؤمنون', 348, 90, 104, 18, 35, 348, 57.62),
  (23, 'المؤمنون', 349, 105, 118, 18, 35, 349, 57.78),
  (24, 'النور', 350, 1, 10, 18, 35, 350, 57.95),
  (24, 'النور', 351, 11, 20, 18, 35, 351, 58.11),
  (24, 'النور', 352, 21, 27, 18, 36, 352, 58.28),
  (24, 'النور', 353, 28, 31, 18, 36, 353, 58.44),
  (24, 'النور', 354, 32, 36, 18, 36, 354, 58.61),
  (24, 'النور', 355, 37, 43, 18, 36, 355, 58.77),
  (24, 'النور', 356, 44, 53, 18, 36, 356, 58.94),
  (24, 'النور', 357, 54, 58, 18, 36, 357, 59.11),
  (24, 'النور', 358, 59, 61, 18, 36, 358, 59.27),
  (24, 'النور', 359, 62, 64, 18, 36, 359, 59.44),
  (25, 'الفرقان', 360, 3, 11, 18, 36, 360, 59.6),
  (25, 'الفرقان', 361, 12, 20, 18, 36, 361, 59.77),
  (25, 'الفرقان', 362, 21, 32, 19, 37, 362, 59.93),
  (25, 'الفرقان', 363, 33, 43, 19, 37, 363, 60.1),
  (25, 'الفرقان', 364, 44, 55, 19, 37, 364, 60.26),
  (25, 'الفرقان', 365, 56, 67, 19, 37, 365, 60.43),
  (25, 'الفرقان', 366, 68, 77, 19, 37, 366, 60.6),
  (26, 'الشعراء', 367, 1, 19, 19, 37, 367, 60.76),
  (26, 'الشعراء', 368, 20, 39, 19, 37, 368, 60.93),
  (26, 'الشعراء', 369, 40, 60, 19, 37, 369, 61.09),
  (26, 'الشعراء', 370, 61, 83, 19, 37, 370, 61.26),
  (26, 'الشعراء', 371, 84, 111, 19, 37, 371, 61.42),
  (26, 'الشعراء', 372, 112, 136, 19, 38, 372, 61.59),
  (26, 'الشعراء', 373, 137, 159, 19, 38, 373, 61.75),
  (26, 'الشعراء', 374, 160, 183, 19, 38, 374, 61.92),
  (26, 'الشعراء', 375, 184, 206, 19, 38, 375, 62.09),
  (26, 'الشعراء', 376, 207, 227, 19, 38, 376, 62.25),
  (27, 'النمل', 377, 1, 13, 19, 38, 377, 62.42),
  (27, 'النمل', 378, 14, 22, 19, 38, 378, 62.58),
  (27, 'النمل', 379, 23, 35, 19, 38, 379, 62.75),
  (27, 'النمل', 380, 36, 44, 19, 38, 380, 62.91),
  (27, 'النمل', 381, 45, 55, 19, 38, 381, 63.08),
  (27, 'النمل', 382, 56, 63, 20, 39, 382, 63.25),
  (27, 'النمل', 383, 64, 76, 20, 39, 383, 63.41),
  (27, 'النمل', 384, 77, 88, 20, 39, 384, 63.58),
  (27, 'النمل', 385, 89, 93, 20, 39, 385, 63.74),
  (28, 'القصص', 386, 6, 13, 20, 39, 386, 63.91),
  (28, 'القصص', 387, 14, 21, 20, 39, 387, 64.07),
  (28, 'القصص', 388, 22, 28, 20, 39, 388, 64.24),
  (28, 'القصص', 389, 29, 35, 20, 39, 389, 64.4),
  (28, 'القصص', 390, 36, 43, 20, 39, 390, 64.57),
  (28, 'القصص', 391, 44, 50, 20, 39, 391, 64.74),
  (28, 'القصص', 392, 51, 59, 20, 40, 392, 64.9),
  (28, 'القصص', 393, 60, 70, 20, 40, 393, 65.07),
  (28, 'القصص', 394, 71, 77, 20, 40, 394, 65.23),
  (28, 'القصص', 395, 78, 84, 20, 40, 395, 65.4),
  (28, 'القصص', 396, 85, 88, 20, 40, 396, 65.56),
  (29, 'العنكبوت', 397, 7, 14, 20, 40, 397, 65.73),
  (29, 'العنكبوت', 398, 15, 23, 20, 40, 398, 65.89),
  (29, 'العنكبوت', 399, 24, 30, 20, 40, 399, 66.06),
  (29, 'العنكبوت', 400, 31, 38, 20, 40, 400, 66.23),
  (29, 'العنكبوت', 401, 39, 45, 20, 40, 401, 66.39),
  (29, 'العنكبوت', 402, 46, 52, 21, 41, 402, 66.56),
  (29, 'العنكبوت', 403, 53, 63, 21, 41, 403, 66.72),
  (29, 'العنكبوت', 404, 64, 69, 21, 41, 404, 66.89),
  (30, 'الروم', 405, 6, 15, 21, 41, 405, 67.05),
  (30, 'الروم', 406, 16, 24, 21, 41, 406, 67.22),
  (30, 'الروم', 407, 25, 32, 21, 41, 407, 67.38),
  (30, 'الروم', 408, 33, 41, 21, 41, 408, 67.55),
  (30, 'الروم', 409, 42, 50, 21, 41, 409, 67.72),
  (30, 'الروم', 410, 51, 60, 21, 41, 410, 67.88),
  (31, 'لقمان', 411, 1, 11, 21, 41, 411, 68.05),
  (31, 'لقمان', 412, 12, 19, 21, 42, 412, 68.21),
  (31, 'لقمان', 413, 20, 28, 21, 42, 413, 68.38),
  (31, 'لقمان', 414, 29, 34, 21, 42, 414, 68.54),
  (32, 'السجدة', 415, 1, 11, 21, 42, 415, 68.71),
  (32, 'السجدة', 416, 12, 20, 21, 42, 416, 68.87),
  (32, 'السجدة', 417, 21, 30, 21, 42, 417, 69.04),
  (33, 'الأحزاب', 418, 1, 6, 21, 42, 418, 69.21),
  (33, 'الأحزاب', 419, 7, 15, 21, 42, 419, 69.37),
  (33, 'الأحزاب', 420, 16, 22, 21, 42, 420, 69.54),
  (33, 'الأحزاب', 421, 23, 30, 21, 42, 421, 69.7),
  (33, 'الأحزاب', 422, 31, 35, 22, 43, 422, 69.87),
  (33, 'الأحزاب', 423, 36, 43, 22, 43, 423, 70.03),
  (33, 'الأحزاب', 424, 44, 50, 22, 43, 424, 70.2),
  (33, 'الأحزاب', 425, 51, 54, 22, 43, 425, 70.36),
  (33, 'الأحزاب', 426, 55, 62, 22, 43, 426, 70.53),
  (33, 'الأحزاب', 427, 63, 73, 22, 43, 427, 70.7),
  (34, 'سبأ', 428, 1, 7, 22, 43, 428, 70.86),
  (34, 'سبأ', 429, 8, 14, 22, 43, 429, 71.03),
  (34, 'سبأ', 430, 15, 22, 22, 43, 430, 71.19),
  (34, 'سبأ', 431, 23, 31, 22, 43, 431, 71.36),
  (34, 'سبأ', 432, 32, 39, 22, 44, 432, 71.52),
  (34, 'سبأ', 433, 40, 48, 22, 44, 433, 71.69),
  (34, 'سبأ', 434, 49, 54, 22, 44, 434, 71.85),
  (35, 'فاطر', 435, 4, 11, 22, 44, 435, 72.02),
  (35, 'فاطر', 436, 12, 18, 22, 44, 436, 72.19),
  (35, 'فاطر', 437, 19, 30, 22, 44, 437, 72.35),
  (35, 'فاطر', 438, 31, 38, 22, 44, 438, 72.52),
  (35, 'فاطر', 439, 39, 44, 22, 44, 439, 72.68),
  (35, 'فاطر', 440, 45, 45, 22, 44, 440, 72.85),
  (36, 'يس', 441, 13, 27, 22, 44, 441, 73.01),
  (36, 'يس', 442, 28, 40, 23, 45, 442, 73.18),
  (36, 'يس', 443, 41, 54, 23, 45, 443, 73.34),
  (36, 'يس', 444, 55, 70, 23, 45, 444, 73.51),
  (36, 'يس', 445, 71, 83, 23, 45, 445, 73.68),
  (37, 'الصافات', 446, 1, 24, 23, 45, 446, 73.84),
  (37, 'الصافات', 447, 25, 51, 23, 45, 447, 74.01),
  (37, 'الصافات', 448, 52, 76, 23, 45, 448, 74.17),
  (37, 'الصافات', 449, 77, 102, 23, 45, 449, 74.34),
  (37, 'الصافات', 450, 103, 126, 23, 45, 450, 74.5),
  (37, 'الصافات', 451, 127, 153, 23, 45, 451, 74.67),
  (37, 'الصافات', 452, 154, 182, 23, 46, 452, 74.83),
  (38, 'ص', 453, 1, 16, 23, 46, 453, 75.0),
  (38, 'ص', 454, 17, 26, 23, 46, 454, 75.17),
  (38, 'ص', 455, 27, 42, 23, 46, 455, 75.33),
  (38, 'ص', 456, 43, 61, 23, 46, 456, 75.5),
  (38, 'ص', 457, 62, 83, 23, 46, 457, 75.66),
  (38, 'ص', 458, 84, 88, 23, 46, 458, 75.83),
  (39, 'الزمر', 459, 6, 10, 23, 46, 459, 75.99),
  (39, 'الزمر', 460, 11, 21, 23, 46, 460, 76.16),
  (39, 'الزمر', 461, 22, 31, 23, 46, 461, 76.32),
  (39, 'الزمر', 462, 32, 40, 24, 47, 462, 76.49),
  (39, 'الزمر', 463, 41, 47, 24, 47, 463, 76.66),
  (39, 'الزمر', 464, 48, 56, 24, 47, 464, 76.82),
  (39, 'الزمر', 465, 57, 67, 24, 47, 465, 76.99),
  (39, 'الزمر', 466, 68, 74, 24, 47, 466, 77.15),
  (39, 'الزمر', 467, 75, 75, 24, 47, 467, 77.32),
  (40, 'غافر', 468, 8, 16, 24, 47, 468, 77.48),
  (40, 'غافر', 469, 17, 25, 24, 47, 469, 77.65),
  (40, 'غافر', 470, 26, 33, 24, 47, 470, 77.81),
  (40, 'غافر', 471, 34, 40, 24, 47, 471, 77.98),
  (40, 'غافر', 472, 41, 49, 24, 48, 472, 78.15),
  (40, 'غافر', 473, 50, 58, 24, 48, 473, 78.31),
  (40, 'غافر', 474, 59, 66, 24, 48, 474, 78.48),
  (40, 'غافر', 475, 67, 77, 24, 48, 475, 78.64),
  (40, 'غافر', 476, 78, 85, 24, 48, 476, 78.81),
  (41, 'فصلت', 477, 1, 11, 24, 48, 477, 78.97),
  (41, 'فصلت', 478, 12, 20, 24, 48, 478, 79.14),
  (41, 'فصلت', 479, 21, 29, 24, 48, 479, 79.3),
  (41, 'فصلت', 480, 30, 38, 24, 48, 480, 79.47),
  (41, 'فصلت', 481, 39, 46, 24, 48, 481, 79.64),
  (41, 'فصلت', 482, 47, 54, 25, 49, 482, 79.8),
  (42, 'الشورى', 483, 1, 10, 25, 49, 483, 79.97),
  (42, 'الشورى', 484, 11, 15, 25, 49, 484, 80.13),
  (42, 'الشورى', 485, 16, 22, 25, 49, 485, 80.3),
  (42, 'الشورى', 486, 23, 31, 25, 49, 486, 80.46),
  (42, 'الشورى', 487, 32, 44, 25, 49, 487, 80.63),
  (42, 'الشورى', 488, 45, 51, 25, 49, 488, 80.79),
  (42, 'الشورى', 489, 52, 53, 25, 49, 489, 80.96),
  (43, 'الزخرف', 490, 11, 22, 25, 49, 490, 81.13),
  (43, 'الزخرف', 491, 23, 33, 25, 49, 491, 81.29),
  (43, 'الزخرف', 492, 34, 47, 25, 50, 492, 81.46),
  (43, 'الزخرف', 493, 48, 60, 25, 50, 493, 81.62),
  (43, 'الزخرف', 494, 61, 73, 25, 50, 494, 81.79),
  (43, 'الزخرف', 495, 74, 89, 25, 50, 495, 81.95),
  (44, 'الدخان', 496, 1, 18, 25, 50, 496, 82.12),
  (44, 'الدخان', 497, 19, 39, 25, 50, 497, 82.28),
  (44, 'الدخان', 498, 40, 59, 25, 50, 498, 82.45),
  (45, 'الجاثية', 499, 1, 13, 25, 50, 499, 82.62),
  (45, 'الجاثية', 500, 14, 22, 25, 50, 500, 82.78),
  (45, 'الجاثية', 501, 23, 32, 25, 50, 501, 82.95),
  (45, 'الجاثية', 502, 33, 37, 26, 51, 502, 83.11),
  (46, 'الأحقاف', 503, 6, 14, 26, 51, 503, 83.28),
  (46, 'الأحقاف', 504, 15, 20, 26, 51, 504, 83.44),
  (46, 'الأحقاف', 505, 21, 28, 26, 51, 505, 83.61),
  (46, 'الأحقاف', 506, 29, 35, 26, 51, 506, 83.77),
  (47, 'محمد', 507, 1, 11, 26, 51, 507, 83.94),
  (47, 'محمد', 508, 12, 19, 26, 51, 508, 84.11),
  (47, 'محمد', 509, 20, 29, 26, 51, 509, 84.27),
  (47, 'محمد', 510, 30, 38, 26, 51, 510, 84.44),
  (48, 'الفتح', 511, 1, 9, 26, 51, 511, 84.6),
  (48, 'الفتح', 512, 10, 15, 26, 52, 512, 84.77),
  (48, 'الفتح', 513, 16, 23, 26, 52, 513, 84.93),
  (48, 'الفتح', 514, 24, 28, 26, 52, 514, 85.1),
  (48, 'الفتح', 515, 29, 29, 26, 52, 515, 85.26),
  (49, 'الحجرات', 516, 5, 11, 26, 52, 516, 85.43),
  (49, 'الحجرات', 517, 12, 18, 26, 52, 517, 85.6),
  (50, 'ق', 518, 1, 15, 26, 52, 518, 85.76),
  (50, 'ق', 519, 16, 35, 26, 52, 519, 85.93),
  (50, 'ق', 520, 36, 45, 26, 52, 520, 86.09),
  (51, 'الذاريات', 521, 7, 30, 26, 52, 521, 86.26),
  (51, 'الذاريات', 522, 31, 51, 27, 53, 522, 86.42),
  (51, 'الذاريات', 523, 52, 60, 27, 53, 523, 86.59),
  (52, 'الطور', 524, 15, 31, 27, 53, 524, 86.75),
  (52, 'الطور', 525, 32, 49, 27, 53, 525, 86.92),
  (53, 'النجم', 526, 1, 26, 27, 53, 526, 87.09),
  (53, 'النجم', 527, 27, 44, 27, 53, 527, 87.25),
  (53, 'النجم', 528, 45, 62, 27, 53, 528, 87.42),
  (54, 'القمر', 529, 7, 27, 27, 53, 529, 87.58),
  (54, 'القمر', 530, 28, 49, 27, 53, 530, 87.75),
  (54, 'القمر', 531, 50, 55, 27, 53, 531, 87.91),
  (55, 'الرحمن', 532, 19, 41, 27, 54, 532, 88.08),
  (55, 'الرحمن', 533, 42, 69, 27, 54, 533, 88.25),
  (55, 'الرحمن', 534, 70, 78, 27, 54, 534, 88.41),
  (56, 'الواقعة', 535, 17, 50, 27, 54, 535, 88.58),
  (56, 'الواقعة', 536, 51, 76, 27, 54, 536, 88.74),
  (56, 'الواقعة', 537, 77, 96, 27, 54, 537, 88.91),
  (57, 'الحديد', 538, 4, 11, 27, 54, 538, 89.07),
  (57, 'الحديد', 539, 12, 18, 27, 54, 539, 89.24),
  (57, 'الحديد', 540, 19, 24, 27, 54, 540, 89.4),
  (57, 'الحديد', 541, 25, 29, 27, 54, 541, 89.57),
  (58, 'المجادلة', 542, 1, 6, 28, 55, 542, 89.74),
  (58, 'المجادلة', 543, 7, 11, 28, 55, 543, 89.9),
  (58, 'المجادلة', 544, 12, 21, 28, 55, 544, 90.07),
  (58, 'المجادلة', 545, 22, 22, 28, 55, 545, 90.23),
  (59, 'الحشر', 546, 4, 9, 28, 55, 546, 90.4),
  (59, 'الحشر', 547, 10, 16, 28, 55, 547, 90.56),
  (59, 'الحشر', 548, 17, 24, 28, 55, 548, 90.73),
  (60, 'الممتحنة', 549, 1, 5, 28, 55, 549, 90.89),
  (60, 'الممتحنة', 550, 6, 11, 28, 55, 550, 91.06),
  (60, 'الممتحنة', 551, 12, 13, 28, 55, 551, 91.23),
  (61, 'الصف', 552, 6, 14, 28, 56, 552, 91.39),
  (62, 'الجمعة', 553, 1, 8, 28, 56, 553, 91.56),
  (62, 'الجمعة', 554, 9, 11, 28, 56, 554, 91.72),
  (63, 'المنافقون', 555, 5, 11, 28, 56, 555, 91.89),
  (64, 'التغابن', 556, 1, 9, 28, 56, 556, 92.05),
  (64, 'التغابن', 557, 10, 18, 28, 56, 557, 92.22),
  (65, 'الطلاق', 558, 1, 5, 28, 56, 558, 92.38),
  (65, 'الطلاق', 559, 6, 12, 28, 56, 559, 92.55),
  (66, 'التحريم', 560, 1, 7, 28, 56, 560, 92.72),
  (66, 'التحريم', 561, 8, 12, 28, 56, 561, 92.88),
  (67, 'الملك', 562, 1, 12, 29, 57, 562, 93.05),
  (67, 'الملك', 563, 13, 26, 29, 57, 563, 93.21),
  (67, 'الملك', 564, 27, 30, 29, 57, 564, 93.38),
  (68, 'القلم', 565, 17, 42, 29, 57, 565, 93.54),
  (68, 'القلم', 566, 43, 52, 29, 57, 566, 93.71),
  (69, 'الحاقة', 567, 9, 35, 29, 57, 567, 93.87),
  (69, 'الحاقة', 568, 36, 52, 29, 57, 568, 94.04),
  (70, 'المعارج', 569, 11, 40, 29, 57, 569, 94.21),
  (70, 'المعارج', 570, 41, 44, 29, 57, 570, 94.37),
  (71, 'نوح', 571, 11, 28, 29, 57, 571, 94.54),
  (72, 'الجن', 572, 1, 13, 29, 58, 572, 94.7),
  (72, 'الجن', 573, 14, 28, 29, 58, 573, 94.87),
  (73, 'المزمل', 574, 1, 19, 29, 58, 574, 95.03),
  (73, 'المزمل', 575, 20, 20, 29, 58, 575, 95.2),
  (74, 'المدثر', 576, 19, 47, 29, 58, 576, 95.36),
  (74, 'المدثر', 577, 48, 56, 29, 58, 577, 95.53),
  (75, 'القيامة', 578, 20, 40, 29, 58, 578, 95.7),
  (76, 'الإنسان', 579, 6, 25, 29, 58, 579, 95.86),
  (76, 'الإنسان', 580, 26, 31, 29, 58, 580, 96.03),
  (77, 'المرسلات', 581, 20, 50, 29, 58, 581, 96.19),
  (78, 'النبأ', 582, 1, 30, 30, 59, 582, 96.36),
  (78, 'النبأ', 583, 31, 40, 30, 59, 583, 96.52),
  (79, 'النازعات', 584, 17, 46, 30, 59, 584, 96.69),
  (80, 'عبس', 585, 1, 40, 30, 59, 585, 96.85),
  (80, 'عبس', 586, 41, 42, 30, 59, 586, 97.02),
  (82, 'الإنفطار', 587, 1, 19, 30, 59, 587, 97.19),
  (83, 'المطففين', 588, 5, 33, 30, 59, 588, 97.35),
  (83, 'المطففين', 589, 34, 36, 30, 59, 589, 97.52),
  (84, 'الانشقاق', 590, 25, 25, 30, 59, 590, 97.68),
  (86, 'الطارق', 591, 1, 17, 30, 59, 591, 97.85),
  (87, 'الأعلى', 592, 11, 19, 30, 60, 592, 98.01),
  (88, 'الغاشية', 593, 23, 26, 30, 60, 593, 98.18),
  (89, 'الفجر', 594, 23, 30, 30, 60, 594, 98.34),
  (90, 'البلد', 595, 19, 20, 30, 60, 595, 98.51),
  (92, 'الليل', 596, 10, 21, 30, 60, 596, 98.68),
  (94, 'الشرح', 597, 3, 8, 30, 60, 597, 98.84),
  (96, 'العلق', 598, 13, 19, 30, 60, 598, 99.01),
  (98, 'البينة', 599, 6, 8, 30, 60, 599, 99.17),
  (100, 'العاديات', 600, 6, 11, 30, 60, 600, 99.34),
  (103, 'العصر', 601, 1, 3, 30, 60, 601, 99.5),
  (106, 'قريش', 602, 1, 4, 30, 60, 602, 99.67),
  (109, 'الكافرون', 603, 1, 6, 30, 60, 603, 99.83),
  (112, 'الإخلاص', 604, 1, 4, 30, 60, 604, 100.0);
-- ============================================================
-- 06_recitation_logs.sql — مقرأة الوقار
-- سجل السرد الذاتي (الطالبة) + سجل التسميع (المسمعة).
-- النموذج تراكمي: التسميع متاح في كل المصحف والطالبة تختار ما تشاء؛
--   * التقدم = مجموع الصفحات مقابل نصاب المسار بالفصل (جدول نصاب التسميع).
--   * الختمات المكافئة = مجموع الصفحات ÷ 604 (كما في إحصائية المقرأة الرسمية).
-- الفهارس والصفحات تُحسب في القاعدة من (سورة، آية) — لا تُؤخذ من العميل.
-- ============================================================

-- مرجع السور (مولّد من src/lib/quran-verses.ts — 114 سورة، 6236 آية)
CREATE TABLE IF NOT EXISTS public.surahs (
  surah_number int PRIMARY KEY,
  name text NOT NULL UNIQUE,
  verse_count int NOT NULL,
  global_offset int NOT NULL          -- مجموع آيات السور السابقة
);
ALTER TABLE public.surahs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read surahs" ON public.surahs;
CREATE POLICY "Authenticated read surahs" ON public.surahs
  FOR SELECT TO authenticated USING (true);

DELETE FROM public.surahs;
INSERT INTO public.surahs (surah_number, name, verse_count, global_offset) VALUES
  (1, 'الفاتحة', 7, 0),
  (2, 'البقرة', 286, 7),
  (3, 'آل عمران', 200, 293),
  (4, 'النساء', 176, 493),
  (5, 'المائدة', 120, 669),
  (6, 'الأنعام', 165, 789),
  (7, 'الأعراف', 206, 954),
  (8, 'الأنفال', 75, 1160),
  (9, 'التوبة', 129, 1235),
  (10, 'يونس', 109, 1364),
  (11, 'هود', 123, 1473),
  (12, 'يوسف', 111, 1596),
  (13, 'الرعد', 43, 1707),
  (14, 'إبراهيم', 52, 1750),
  (15, 'الحجر', 99, 1802),
  (16, 'النحل', 128, 1901),
  (17, 'الإسراء', 111, 2029),
  (18, 'الكهف', 110, 2140),
  (19, 'مريم', 98, 2250),
  (20, 'طه', 135, 2348),
  (21, 'الأنبياء', 112, 2483),
  (22, 'الحج', 78, 2595),
  (23, 'المؤمنون', 118, 2673),
  (24, 'النور', 64, 2791),
  (25, 'الفرقان', 77, 2855),
  (26, 'الشعراء', 227, 2932),
  (27, 'النمل', 93, 3159),
  (28, 'القصص', 88, 3252),
  (29, 'العنكبوت', 69, 3340),
  (30, 'الروم', 60, 3409),
  (31, 'لقمان', 34, 3469),
  (32, 'السجدة', 30, 3503),
  (33, 'الأحزاب', 73, 3533),
  (34, 'سبأ', 54, 3606),
  (35, 'فاطر', 45, 3660),
  (36, 'يس', 83, 3705),
  (37, 'الصافات', 182, 3788),
  (38, 'ص', 88, 3970),
  (39, 'الزمر', 75, 4058),
  (40, 'غافر', 85, 4133),
  (41, 'فصلت', 54, 4218),
  (42, 'الشورى', 53, 4272),
  (43, 'الزخرف', 89, 4325),
  (44, 'الدخان', 59, 4414),
  (45, 'الجاثية', 37, 4473),
  (46, 'الأحقاف', 35, 4510),
  (47, 'محمد', 38, 4545),
  (48, 'الفتح', 29, 4583),
  (49, 'الحجرات', 18, 4612),
  (50, 'ق', 45, 4630),
  (51, 'الذاريات', 60, 4675),
  (52, 'الطور', 49, 4735),
  (53, 'النجم', 62, 4784),
  (54, 'القمر', 55, 4846),
  (55, 'الرحمن', 78, 4901),
  (56, 'الواقعة', 96, 4979),
  (57, 'الحديد', 29, 5075),
  (58, 'المجادلة', 22, 5104),
  (59, 'الحشر', 24, 5126),
  (60, 'الممتحنة', 13, 5150),
  (61, 'الصف', 14, 5163),
  (62, 'الجمعة', 11, 5177),
  (63, 'المنافقون', 11, 5188),
  (64, 'التغابن', 18, 5199),
  (65, 'الطلاق', 12, 5217),
  (66, 'التحريم', 12, 5229),
  (67, 'الملك', 30, 5241),
  (68, 'القلم', 52, 5271),
  (69, 'الحاقة', 52, 5323),
  (70, 'المعارج', 44, 5375),
  (71, 'نوح', 28, 5419),
  (72, 'الجن', 28, 5447),
  (73, 'المزمل', 20, 5475),
  (74, 'المدثر', 56, 5495),
  (75, 'القيامة', 40, 5551),
  (76, 'الإنسان', 31, 5591),
  (77, 'المرسلات', 50, 5622),
  (78, 'النبأ', 40, 5672),
  (79, 'النازعات', 46, 5712),
  (80, 'عبس', 42, 5758),
  (81, 'التكوير', 29, 5800),
  (82, 'الإنفطار', 19, 5829),
  (83, 'المطففين', 36, 5848),
  (84, 'الانشقاق', 25, 5884),
  (85, 'البروج', 22, 5909),
  (86, 'الطارق', 17, 5931),
  (87, 'الأعلى', 19, 5948),
  (88, 'الغاشية', 26, 5967),
  (89, 'الفجر', 30, 5993),
  (90, 'البلد', 20, 6023),
  (91, 'الشمس', 15, 6043),
  (92, 'الليل', 21, 6058),
  (93, 'الضحى', 11, 6079),
  (94, 'الشرح', 8, 6090),
  (95, 'التين', 8, 6098),
  (96, 'العلق', 19, 6106),
  (97, 'القدر', 5, 6125),
  (98, 'البينة', 8, 6130),
  (99, 'الزلزلة', 8, 6138),
  (100, 'العاديات', 11, 6146),
  (101, 'القارعة', 11, 6157),
  (102, 'التكاثر', 8, 6168),
  (103, 'العصر', 3, 6176),
  (104, 'الهمزة', 9, 6179),
  (105, 'الفيل', 5, 6188),
  (106, 'قريش', 4, 6193),
  (107, 'الماعون', 7, 6197),
  (108, 'الكوثر', 3, 6204),
  (109, 'الكافرون', 6, 6207),
  (110, 'النصر', 3, 6213),
  (111, 'المسد', 5, 6216),
  (112, 'الإخلاص', 4, 6221),
  (113, 'الفلق', 5, 6225),
  (114, 'الناس', 6, 6230);

-- الفهرس العالمي لآية (سورة، آية) — يرفض المدخلات غير الصحيحة
CREATE OR REPLACE FUNCTION public.verse_global_index(p_surah int, p_verse int)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE v_offset int; v_count int; BEGIN
  SELECT global_offset, verse_count INTO v_offset, v_count
  FROM public.surahs WHERE surah_number = p_surah;
  IF v_offset IS NULL THEN RAISE EXCEPTION 'سورة غير صحيحة: %', p_surah; END IF;
  IF p_verse < 1 OR p_verse > v_count THEN
    RAISE EXCEPTION 'آية غير صحيحة: سورة % آية %', p_surah, p_verse;
  END IF;
  RETURN v_offset + p_verse;
END $$;

-- عدد صفحات النطاق من مرجع المصحف (يطابق منطق pageOfVerse في الواجهة):
-- صفحة الآية = آخر صفحة تبدأ عند أو قبل الآية.
CREATE OR REPLACE FUNCTION public.page_of_index(p_index int)
RETURNS int LANGUAGE sql STABLE AS $$
  SELECT max(m.page_number)
  FROM public.mushaf_reference m
  JOIN public.surahs s ON s.surah_number = m.surah_number
  WHERE s.global_offset + m.verse_start <= p_index;
$$;
CREATE OR REPLACE FUNCTION public.range_pages(p_from_index int, p_to_index int)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT GREATEST(1, public.page_of_index(p_to_index) - public.page_of_index(p_from_index) + 1)::numeric;
$$;

-- ------------------------------------------------------------
-- سجل السرد الذاتي (تسجّله الطالبة بنفسها)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.self_recitation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id),
  date date NOT NULL DEFAULT current_date,
  from_surah int NOT NULL REFERENCES public.surahs(surah_number),
  from_verse int NOT NULL,
  to_surah int NOT NULL REFERENCES public.surahs(surah_number),
  to_verse int NOT NULL,
  from_index int,                    -- يُحسب في التريغر
  to_index int,
  pages numeric(6,2),
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_self_log_student_date ON public.self_recitation_log (student_id, date);
ALTER TABLE public.self_recitation_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- سجل التسميع (تسجّله المسمعة في الموعد) — درجة مولدة من الألحان
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_recitation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id),
  booking_id uuid REFERENCES public.bookings(id),
  season_id uuid REFERENCES public.seasons(id),
  date date NOT NULL DEFAULT current_date,
  from_surah int NOT NULL REFERENCES public.surahs(surah_number),
  from_verse int NOT NULL,
  to_surah int NOT NULL REFERENCES public.surahs(surah_number),
  to_verse int NOT NULL,
  from_index int,
  to_index int,
  pages numeric(6,2),
  lahn_jali_count int NOT NULL DEFAULT 0 CHECK (lahn_jali_count >= 0),
  lahn_khafi_count int NOT NULL DEFAULT 0 CHECK (lahn_khafi_count >= 0),
  -- التسميع /20: نصف درجة لكل لحن جلي، ربع درجة لكل لحن خفي (نمط 19_tasmee_exams.sql في الوقار)
  score numeric(5,2) GENERATED ALWAYS AS (
    GREATEST(0, 20 - 0.5 * lahn_jali_count - 0.25 * lahn_khafi_count)
  ) STORED,
  grade text GENERATED ALWAYS AS (
    CASE
      WHEN (0.5 * lahn_jali_count + 0.25 * lahn_khafi_count) <= 0.5 THEN 'ممتاز'
      WHEN (0.5 * lahn_jali_count + 0.25 * lahn_khafi_count) <= 1.0 THEN 'جيد جدًا'
      WHEN (0.5 * lahn_jali_count + 0.25 * lahn_khafi_count) <= 1.5 THEN 'جيد'
      ELSE 'ضعيف'
    END
  ) STORED,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_log_student_date ON public.teacher_recitation_log (student_id, date);
CREATE INDEX IF NOT EXISTS idx_teacher_log_teacher_date ON public.teacher_recitation_log (teacher_id, date);
ALTER TABLE public.teacher_recitation_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- تريغر: حساب الفهارس والصفحات + ربط الفصل الحالي تلقائيًا
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recitation_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.from_index := public.verse_global_index(NEW.from_surah, NEW.from_verse);
  NEW.to_index   := public.verse_global_index(NEW.to_surah,   NEW.to_verse);
  IF NEW.to_index < NEW.from_index THEN
    RAISE EXCEPTION 'نهاية النطاق قبل بدايته';
  END IF;
  NEW.pages := public.range_pages(NEW.from_index, NEW.to_index);
  NEW.updated_at := now();
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id FROM public.seasons WHERE is_current LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_self_before ON public.self_recitation_log;
CREATE TRIGGER trg_self_before BEFORE INSERT OR UPDATE ON public.self_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.recitation_before();
DROP TRIGGER IF EXISTS trg_teacher_before ON public.teacher_recitation_log;
CREATE TRIGGER trg_teacher_before BEFORE INSERT OR UPDATE ON public.teacher_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.recitation_before();

-- ------------------------------------------------------------
-- تقدم الفصل: مجموع الصفحات مقابل نصاب المسار + الختمات المكافئة (÷604)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_season_progress
WITH (security_invoker = true) AS
WITH base AS (
  SELECT st.id AS student_id, st.full_name, st.track_id, t.name AS track_name,
         t.quota_pages_per_season, e.season_id
  FROM public.students st
  JOIN public.tracks t ON t.id = st.track_id
  JOIN public.enrollments e ON e.student_id = st.id AND e.status = 'enrolled'
  WHERE st.is_active
),
self_sum AS (
  SELECT student_id, season_id, SUM(pages) AS self_pages, count(*) AS self_entries
  FROM public.self_recitation_log WHERE NOT is_deleted GROUP BY 1, 2
),
teacher_sum AS (
  SELECT student_id, season_id, SUM(pages) AS teacher_pages, count(*) AS teacher_sessions,
         round(avg(score), 2) AS avg_score
  FROM public.teacher_recitation_log WHERE NOT is_deleted GROUP BY 1, 2
)
SELECT b.*, COALESCE(s.self_pages, 0) AS self_pages,
       COALESCE(ts.teacher_pages, 0) AS teacher_pages,
       COALESCE(s.self_entries, 0) AS self_entries,
       COALESCE(ts.teacher_sessions, 0) AS teacher_sessions,
       ts.avg_score,
       round(COALESCE(ts.teacher_pages, 0) / NULLIF(b.quota_pages_per_season, 0) * 100, 1) AS quota_pct,
       round((COALESCE(s.self_pages, 0) + COALESCE(ts.teacher_pages, 0)) / 604.0, 2) AS khatmah_equiv
FROM base b
LEFT JOIN self_sum s ON s.student_id = b.student_id AND s.season_id = b.season_id
LEFT JOIN teacher_sum ts ON ts.student_id = b.student_id AND ts.season_id = b.season_id;

-- ------------------------------------------------------------
-- سياسات RLS
-- ------------------------------------------------------------
-- self_recitation_log: الطالبة تنشئ وتقرأ، وتعدل سجلات آخر 3 أيام فقط
DROP POLICY IF EXISTS "Students read own self log" ON public.self_recitation_log;
CREATE POLICY "Students read own self log" ON public.self_recitation_log
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Students insert own self log" ON public.self_recitation_log;
CREATE POLICY "Students insert own self log" ON public.self_recitation_log
  FOR INSERT TO authenticated
  WITH CHECK (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Students update recent self log" ON public.self_recitation_log;
CREATE POLICY "Students update recent self log" ON public.self_recitation_log
  FOR UPDATE TO authenticated
  USING (student_id = public.current_student_id() AND date >= current_date - 3)
  WITH CHECK (student_id = public.current_student_id() AND date >= current_date - 3);
DROP POLICY IF EXISTS "Teachers read booked self log" ON public.self_recitation_log;
CREATE POLICY "Teachers read booked self log" ON public.self_recitation_log
  FOR SELECT TO authenticated USING (public.teacher_has_active_booking(student_id));
DROP POLICY IF EXISTS "Supervisors read scoped self log" ON public.self_recitation_log;
CREATE POLICY "Supervisors read scoped self log" ON public.self_recitation_log
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));
DROP POLICY IF EXISTS "Admins manage self log" ON public.self_recitation_log;
CREATE POLICY "Admins manage self log" ON public.self_recitation_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- teacher_recitation_log: المسمعة تسجل لطالبات حجوزاتها النشطة فقط
DROP POLICY IF EXISTS "Students read own tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Students read own tasmee" ON public.teacher_recitation_log
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
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
DROP POLICY IF EXISTS "Admins manage tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Admins manage tasmee" ON public.teacher_recitation_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
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
    AND public.teacher_has_active_booking(student_id)
  );
DROP POLICY IF EXISTS "Supervisors read scoped attendance" ON public.session_attendance;
CREATE POLICY "Supervisors read scoped attendance" ON public.session_attendance
  FOR SELECT TO authenticated USING (public.student_in_supervisor_scope(student_id));
DROP POLICY IF EXISTS "Admins manage attendance" ON public.session_attendance;
CREATE POLICY "Admins manage attendance" ON public.session_attendance
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
-- ============================================================
-- 08_activity_log.sql — مقرأة الوقار
-- سجل تدقيق كامل عبر TRIGGER (منقول من نمط 35_recording_activity_log.sql في الوقار)
-- مع إضافة auth_uid — درس التحقيق في حادثة 2026-07: actor النصي وحده لا يكفي.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  student_id uuid,
  action text NOT NULL CHECK (action IN ('created','updated','deleted','restored')),
  changes jsonb,                      -- {field: {old, new}} للتعديلات
  auth_uid uuid,                      -- من نفّذ فعليًا (حساب المصادقة)
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_row ON public.activity_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_student ON public.activity_log (student_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log (created_at DESC);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read activity log" ON public.activity_log;
CREATE POLICY "Admins read activity log" ON public.activity_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb; j_old jsonb; v_action text; v_changes jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    j := to_jsonb(OLD); v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    j := to_jsonb(NEW); v_action := 'created';
  ELSE
    j := to_jsonb(NEW); j_old := to_jsonb(OLD);
    IF COALESCE((j_old->>'is_deleted')::boolean, false) = false
       AND COALESCE((j->>'is_deleted')::boolean, false) = true THEN
      v_action := 'deleted';
    ELSIF COALESCE((j_old->>'is_deleted')::boolean, false) = true
       AND COALESCE((j->>'is_deleted')::boolean, false) = false THEN
      v_action := 'restored';
    ELSE
      v_action := 'updated';
    END IF;
    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      INTO v_changes
    FROM jsonb_each(j) n
    LEFT JOIN jsonb_each(j_old) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('created_at','updated_at');
    IF v_changes IS NULL THEN RETURN NULL; END IF;   -- لا تغيير فعلي
  END IF;

  INSERT INTO public.activity_log (table_name, row_id, student_id, action, changes, auth_uid, date)
  VALUES (
    TG_TABLE_NAME,
    (j->>'id')::uuid,
    (j->>'student_id')::uuid,
    v_action,
    v_changes,
    auth.uid(),
    COALESCE((j->>'date')::date, current_date)
  );
  RETURN NULL;  -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS trg_log_self ON public.self_recitation_log;
CREATE TRIGGER trg_log_self AFTER INSERT OR UPDATE OR DELETE ON public.self_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_tasmee ON public.teacher_recitation_log;
CREATE TRIGGER trg_log_tasmee AFTER INSERT OR UPDATE OR DELETE ON public.teacher_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_attendance ON public.session_attendance;
CREATE TRIGGER trg_log_attendance AFTER INSERT OR UPDATE OR DELETE ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_bookings ON public.bookings;
CREATE TRIGGER trg_log_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- تحقق
SELECT tgname AS "التريغر", tgrelid::regclass AS "الجدول"
FROM pg_trigger
WHERE tgname IN ('trg_log_self','trg_log_tasmee','trg_log_attendance','trg_log_bookings');
-- ============================================================
-- 90_seed_dev.sql — مقرأة الوقار (بيئة تطوير فقط — لا يُنفَّذ في الإنتاج)
-- فصل حالي + 3 مسمعات بفتحات + 12 طالبة بحجوزات + أسبوعان من السجلات.
-- المسارات مبذورة في 02. الحسابات تُنشأ بعده عبر scripts/seed-users.ts.
-- ============================================================

-- فصل حالي
INSERT INTO public.seasons (id, name, start_date, end_date, sessions_count, status, is_current)
VALUES ('a0000000-0000-0000-0000-000000000001', 'الفصل الأول ١٤٤٨هـ',
        current_date - 21, current_date + 77, 14, 'active', true)
ON CONFLICT (id) DO NOTHING;

-- 3 مسمعات
INSERT INTO public.teachers (id, full_name, national_id, phone, meeting_link) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'المسمعة الأولى (تجربة)', '2000000001', '0500000001', 'https://zoom.us/j/111'),
  ('b0000000-0000-0000-0000-000000000002', 'المسمعة الثانية (تجربة)', '2000000002', '0500000002', 'https://zoom.us/j/222'),
  ('b0000000-0000-0000-0000-000000000003', 'المسمعة الثالثة (تجربة)', '2000000003', '0500000003', 'https://zoom.us/j/333')
ON CONFLICT (id) DO NOTHING;

-- فتحات توفر (أوقات أسبوعية، ساعة لكل فتحة) — المسمعة 1: 4 فتحات، 2: 6 فتحات، 3: فتحتان
INSERT INTO public.availability_slots (id, teacher_id, weekday, start_time, end_time)
SELECT ('c0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       t.id, w.weekday, w.start_time, w.end_time
FROM (VALUES
  (1,  'b0000000-0000-0000-0000-000000000001', 0, time '16:00', time '17:00'),
  (2,  'b0000000-0000-0000-0000-000000000001', 0, time '17:00', time '18:00'),
  (3,  'b0000000-0000-0000-0000-000000000001', 2, time '16:00', time '17:00'),
  (4,  'b0000000-0000-0000-0000-000000000001', 2, time '17:00', time '18:00'),
  (5,  'b0000000-0000-0000-0000-000000000002', 1, time '08:00', time '09:00'),
  (6,  'b0000000-0000-0000-0000-000000000002', 1, time '09:00', time '10:00'),
  (7,  'b0000000-0000-0000-0000-000000000002', 3, time '08:00', time '09:00'),
  (8,  'b0000000-0000-0000-0000-000000000002', 3, time '09:00', time '10:00'),
  (9,  'b0000000-0000-0000-0000-000000000002', 4, time '20:00', time '21:00'),
  (10, 'b0000000-0000-0000-0000-000000000002', 4, time '21:00', time '22:00'),
  (11, 'b0000000-0000-0000-0000-000000000003', 5, time '10:00', time '11:00'),
  (12, 'b0000000-0000-0000-0000-000000000003', 5, time '11:00', time '12:00')
) AS w(n, tid, weekday, start_time, end_time)
JOIN public.teachers t ON t.id = w.tid::uuid
ON CONFLICT (id) DO NOTHING;

-- 12 طالبة موزعات على المسارات
INSERT INTO public.students (id, full_name, national_id, phone, track_id)
SELECT ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'طالبة تجربة ' || i,
       '10000000' || lpad(i::text, 2, '0'),
       '05411111' || lpad(i::text, 2, '0'),
       (SELECT id FROM public.tracks ORDER BY sort_order LIMIT 1 OFFSET (i - 1) % 5)
FROM generate_series(1, 12) i
ON CONFLICT (id) DO NOTHING;

-- تسجيلهن في الفصل الحالي
INSERT INTO public.enrollments (student_id, season_id, track_id)
SELECT st.id, 'a0000000-0000-0000-0000-000000000001', st.track_id
FROM public.students st
WHERE st.id::text LIKE 'd0000000%'
ON CONFLICT (student_id, season_id) DO NOTHING;

-- حجوزات: الطالبات 1..10 يحجزن الفتحات 1..10 (تبقى فتحتان شاغرتان و طالبتان بلا حجز)
INSERT INTO public.bookings (slot_id, student_id, season_id)
SELECT ('c0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'a0000000-0000-0000-0000-000000000001'
FROM generate_series(1, 10) i
WHERE NOT EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.slot_id = ('c0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid
    AND b.status = 'active'
);

-- أسبوعان من السرد الذاتي (الطالبات 1..10، كل يومين، نطاقات متنوعة)
INSERT INTO public.self_recitation_log (student_id, date, from_surah, from_verse, to_surah, to_verse)
SELECT ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       current_date - d,
       ((i + d) % 100) + 1, 1,
       ((i + d) % 100) + 2, 1
FROM generate_series(1, 10) i, generate_series(0, 13, 2) d;

-- تسميع أسبوعي عند المسمعات (جلستان لكل طالبة محجوزة) بألحان متفاوتة
INSERT INTO public.teacher_recitation_log
  (student_id, teacher_id, date, from_surah, from_verse, to_surah, to_verse, lahn_jali_count, lahn_khafi_count)
SELECT b.student_id, s.teacher_id,
       current_date - w.d,
       ((row_number() OVER ()) % 90)::int + 1, 1,
       ((row_number() OVER ()) % 90)::int + 3, 1,
       (row_number() OVER ()) % 3,
       (row_number() OVER ()) % 5
FROM public.bookings b
JOIN public.availability_slots s ON s.id = b.slot_id
CROSS JOIN (VALUES (2), (9)) AS w(d)
WHERE b.status = 'active';

-- حضور الجلستين (طالبة 9 غائبة 3 مرات لاختبار تنبيه الغياب)
INSERT INTO public.session_attendance (booking_id, student_id, teacher_id, date, status)
SELECT b.id, b.student_id, s.teacher_id, current_date - w.d,
       CASE WHEN b.student_id = 'd0000000-0000-0000-0000-000000000009' THEN 'absent' ELSE 'present' END
FROM public.bookings b
JOIN public.availability_slots s ON s.id = b.slot_id
CROSS JOIN (VALUES (2), (9)) AS w(d)
WHERE b.status = 'active'
ON CONFLICT (student_id, date) DO NOTHING;
INSERT INTO public.session_attendance (booking_id, student_id, teacher_id, date, status)
SELECT b.id, b.student_id, s.teacher_id, current_date - 16, 'absent'
FROM public.bookings b JOIN public.availability_slots s ON s.id = b.slot_id
WHERE b.student_id = 'd0000000-0000-0000-0000-000000000009' AND b.status = 'active'
ON CONFLICT (student_id, date) DO NOTHING;

-- تحقق سريع
SELECT (SELECT count(*) FROM public.mushaf_reference)  AS mushaf_pages,
       (SELECT count(*) FROM public.surahs)            AS surahs,
       (SELECT count(*) FROM public.students)          AS students,
       (SELECT count(*) FROM public.bookings WHERE status='active') AS active_bookings,
       (SELECT count(*) FROM public.self_recitation_log)    AS self_logs,
       (SELECT count(*) FROM public.teacher_recitation_log) AS tasmee_logs,
       (SELECT count(*) FROM public.v_absence_alerts)  AS absence_alerts;
