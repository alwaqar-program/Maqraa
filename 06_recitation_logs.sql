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
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.availability_slots s ON s.id = b.slot_id
    WHERE b.student_id = self_recitation_log.student_id AND b.status = 'active'
      AND s.teacher_id = public.current_teacher_id()
  ));
DROP POLICY IF EXISTS "Supervisors read scoped self log" ON public.self_recitation_log;
CREATE POLICY "Supervisors read scoped self log" ON public.self_recitation_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students st WHERE st.id = self_recitation_log.student_id
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  ));
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
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.availability_slots s ON s.id = b.slot_id
      WHERE b.student_id = teacher_recitation_log.student_id AND b.status = 'active'
        AND s.teacher_id = public.current_teacher_id()
    )
  );
DROP POLICY IF EXISTS "Supervisors read scoped tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Supervisors read scoped tasmee" ON public.teacher_recitation_log
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students st WHERE st.id = teacher_recitation_log.student_id
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  ));
DROP POLICY IF EXISTS "Admins manage tasmee" ON public.teacher_recitation_log;
CREATE POLICY "Admins manage tasmee" ON public.teacher_recitation_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
