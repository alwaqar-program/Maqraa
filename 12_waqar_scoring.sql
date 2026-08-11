-- ============================================================
-- 12_waqar_scoring.sql — نموذج الأخطاء واللحون «زي الوقار بالضبط»
--
-- التسميع  /20: score = 20 − 0.25 × (الأخطاء + اللحون)   (بحد أدنى صفر)
--   التقدير على المجموع: 0-2 ممتاز · 3-4 جيد جدًا · 5-6 جيد · 7+ ضعيف
--
-- الاختبار: أنواع ثابتة بلا عنوان حر —
--   weekly_1 الأسبوع الأول /20 · weekly_2 الأسبوع الثاني /20 · final النهائي /40
--   الدرجة = الحد الأقصى − 0.25×(الأخطاء+اللحون) − 2×تغيير المقطع (مرة واحدة كحد أقصى)
--   ولا يتكرر النوع نفسه للطالبة في الفصل الواحد.
-- ============================================================

-- ------------------------------------------------------------
-- التسميع: إعادة تسمية الأعمدة وإعادة تعريف الدرجة والتقدير
-- ------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.teacher_recitation_log RENAME COLUMN lahn_jali_count TO error_count;
  ALTER TABLE public.teacher_recitation_log RENAME COLUMN lahn_khafi_count TO lahn_count;
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- الأعمدة المولدة لا تُعدّل في مكانها — والعرض v_season_progress يعتمد على score
DROP VIEW IF EXISTS public.v_season_progress;
ALTER TABLE public.teacher_recitation_log DROP COLUMN IF EXISTS score;
ALTER TABLE public.teacher_recitation_log
  ADD COLUMN score numeric(5,2) GENERATED ALWAYS AS (
    GREATEST(0, 20 - 0.25 * (COALESCE(error_count, 0) + COALESCE(lahn_count, 0)))
  ) STORED;
ALTER TABLE public.teacher_recitation_log DROP COLUMN IF EXISTS grade;
ALTER TABLE public.teacher_recitation_log
  ADD COLUMN grade text GENERATED ALWAYS AS (
    CASE
      WHEN (COALESCE(error_count, 0) + COALESCE(lahn_count, 0)) <= 2 THEN 'ممتاز'
      WHEN (COALESCE(error_count, 0) + COALESCE(lahn_count, 0)) <= 4 THEN 'جيد جدًا'
      WHEN (COALESCE(error_count, 0) + COALESCE(lahn_count, 0)) <= 6 THEN 'جيد'
      ELSE 'ضعيف'
    END
  ) STORED;

-- إعادة إنشاء عرض تقدم الفصل كما كان
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
-- الاختبارات: إعادة البناء على نموذج الوقار (بلا عنوان حر)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.exams CASCADE;
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.teachers(id),
  season_id uuid REFERENCES public.seasons(id),
  date date NOT NULL DEFAULT current_date,
  exam_type text NOT NULL CHECK (exam_type IN ('weekly_1', 'weekly_2', 'final')),
  error_count int NOT NULL DEFAULT 0 CHECK (error_count >= 0),          -- عدد الأخطاء
  lahn_count int NOT NULL DEFAULT 0 CHECK (lahn_count >= 0),            -- عدد اللحون
  segment_changes int NOT NULL DEFAULT 0 CHECK (segment_changes BETWEEN 0 AND 1), -- تغيير المقطع (مرة واحدة، خصم درجتين)
  max_score numeric(5,2) GENERATED ALWAYS AS (
    CASE exam_type WHEN 'final' THEN 40 ELSE 20 END
  ) STORED,
  total_errors int GENERATED ALWAYS AS (error_count + lahn_count) STORED,
  total_score numeric(5,2) GENERATED ALWAYS AS (
    GREATEST(0,
      (CASE exam_type WHEN 'final' THEN 40 ELSE 20 END)
      - 0.25 * (error_count + lahn_count)
      - 2 * segment_changes)
  ) STORED,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- لا يتكرر نوع الاختبار للطالبة في الفصل نفسه
CREATE UNIQUE INDEX IF NOT EXISTS one_exam_type_per_student_season
  ON public.exams (student_id, exam_type, season_id) WHERE NOT is_deleted;
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

SELECT 'waqar scoring applied' AS status;
