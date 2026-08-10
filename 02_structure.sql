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
