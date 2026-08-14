-- ============================================================
-- 26_circles.sql — نظام الحلقات (يستبدل الحجز الفردي)
-- حلقات مرقمة لكل مسمعة (أكثر من حلقة بأيام مختلفة)، توزيع الطالبات
-- بالدقائق حسب المسار (٥أجزاء=10د، ١٠=20د، ٢٠=40د، ختمة=60د)،
-- انسحاب/استبعاد بحالة محفوظة، حضور جديد (حضور/تعويض/غياب + أسباب
-- + إجراء متخذ عند غيابين)، نطاق المشرفة يشمل حلقاتها،
-- وإيقاف الغياب التلقائي الليلي.
-- آمن لإعادة التنفيذ.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) لا يمكن تكرار اسم المسمعة
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_full_name
  ON public.teachers (full_name);

-- 2) الحلقات
CREATE TABLE IF NOT EXISTS public.circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number int NOT NULL UNIQUE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  supervisor_id uuid REFERENCES public.supervisors(id) ON DELETE SET NULL,  -- المشرفة المتابعة
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
-- لا تتداخل حلقتان للمسمعة نفسها في اليوم نفسه (حلقتا مسمعتين مختلفتين بنفس الوقت مسموح)
ALTER TABLE public.circles DROP CONSTRAINT IF EXISTS no_overlapping_circles;
ALTER TABLE public.circles ADD CONSTRAINT no_overlapping_circles
  EXCLUDE USING gist (
    teacher_id WITH =,
    weekday WITH =,
    numrange(
      (EXTRACT(EPOCH FROM start_time))::numeric,
      (EXTRACT(EPOCH FROM end_time))::numeric
    ) WITH &&
  ) WHERE (is_active);

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read circles" ON public.circles;
CREATE POLICY "Authenticated read circles" ON public.circles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage circles" ON public.circles;
CREATE POLICY "Admins manage circles" ON public.circles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) عضوية الحلقات — الطالبة في حلقة واحدة، وتحجز دقائق بحسب مسارها
CREATE TABLE IF NOT EXISTS public.circle_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  minutes int NOT NULL CHECK (minutes > 0),
  choice_rank int CHECK (choice_rank >= 1),   -- 1=الاختيار الأول... NULL=إسناد يدوي
  created_at timestamptz NOT NULL DEFAULT now(),
  added_by text
);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON public.circle_members (circle_id);

ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read circle members" ON public.circle_members;
CREATE POLICY "Authenticated read circle members" ON public.circle_members
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage circle members" ON public.circle_members;
CREATE POLICY "Admins manage circle members" ON public.circle_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) حالة الطالبة: نشطة / منسحبة / مستبعدة (البيانات والسجلات تبقى كاملة)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','withdrawn','excluded'));
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status_date date;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status_reason text;

-- 5) صلاحية المسمعة تتبع الحلقات الآن (الاسم القديم يبقى لتوافق كل السياسات القائمة)
CREATE OR REPLACE FUNCTION public.teacher_has_active_booking(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.circle_members cm
    JOIN public.circles c ON c.id = cm.circle_id
    WHERE cm.student_id = p_student
      AND c.teacher_id = public.current_teacher_id()
      AND c.is_active
  ) OR EXISTS (
    -- توافق مؤقت مع الحجوزات القديمة إن بقيت نشطة
    SELECT 1 FROM public.bookings b
    JOIN public.availability_slots s ON s.id = b.slot_id
    WHERE b.student_id = p_student AND b.status = 'active'
      AND s.teacher_id = public.current_teacher_id()
  );
$$;

-- 6) نطاق المشرفة يشمل طالبات حلقاتها (إضافة إلى نطاق المسارات)
CREATE OR REPLACE FUNCTION public.current_supervisor_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.supervisors WHERE user_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.student_in_supervisor_scope(p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students st
    WHERE st.id = p_student
      AND st.track_id IN (SELECT public.supervisor_track_ids())
  ) OR EXISTS (
    SELECT 1 FROM public.circle_members cm
    JOIN public.circles c ON c.id = cm.circle_id
    WHERE cm.student_id = p_student
      AND c.supervisor_id = public.current_supervisor_id()
  );
$$;

-- 7) الحضور الجديد: حضور / تعويض / غياب + سبب + ربط بالحلقة
--    ('late' تبقى مقبولة للسجلات القديمة فقط — الواجهة لا تسجلها)
ALTER TABLE public.session_attendance DROP CONSTRAINT IF EXISTS session_attendance_status_check;
ALTER TABLE public.session_attendance ADD CONSTRAINT session_attendance_status_check
  CHECK (status IN ('present','makeup','absent','late'));
ALTER TABLE public.session_attendance ADD COLUMN IF NOT EXISTS reason text
  CHECK (reason IS NULL OR reason IN ('مرض','نوم','ظرف عائلي','ظرف عمل','نسيان'));
ALTER TABLE public.session_attendance ADD COLUMN IF NOT EXISTS circle_id uuid
  REFERENCES public.circles(id) ON DELETE SET NULL;

-- 8) الإجراء المتخذ عند بلوغ غيابين فأكثر (سجل واحد لكل طالبة في الفصل)
CREATE TABLE IF NOT EXISTS public.absence_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  season_id uuid REFERENCES public.seasons(id),
  action text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, season_id)
);
ALTER TABLE public.absence_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage absence actions" ON public.absence_actions;
CREATE POLICY "Admins manage absence actions" ON public.absence_actions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Supervisors manage scoped absence actions" ON public.absence_actions;
CREATE POLICY "Supervisors manage scoped absence actions" ON public.absence_actions
  FOR ALL TO authenticated
  USING (public.student_in_supervisor_scope(student_id))
  WITH CHECK (public.student_in_supervisor_scope(student_id));

-- 9) تنبيهات الغياب: غيابان فأكثر (بدل حد الثلاث غيابات بعذر/بدون عذر)
DROP VIEW IF EXISTS public.v_absence_alerts;
CREATE VIEW public.v_absence_alerts
WITH (security_invoker = true) AS
SELECT a.student_id, st.full_name, a.season_id,
       count(*) FILTER (WHERE a.status = 'absent') AS absences,
       cm.circle_id, c.number AS circle_number, c.supervisor_id,
       aa.action AS action_taken
FROM public.session_attendance a
JOIN public.students st ON st.id = a.student_id
LEFT JOIN public.circle_members cm ON cm.student_id = a.student_id
LEFT JOIN public.circles c ON c.id = cm.circle_id
LEFT JOIN public.absence_actions aa
       ON aa.student_id = a.student_id
      AND (aa.season_id = a.season_id OR (aa.season_id IS NULL AND a.season_id IS NULL))
WHERE NOT a.is_deleted AND st.status = 'active'
GROUP BY a.student_id, st.full_name, a.season_id, cm.circle_id, c.number, c.supervisor_id, aa.action
HAVING count(*) FILTER (WHERE a.status = 'absent') >= 2;

-- 10) إيقاف الغياب التلقائي الليلي (القرار: الرصد يدوي عبر صفحة الحضور)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-absences') THEN
      PERFORM cron.unschedule('auto-absences');
    END IF;
  END IF;
END $$;

SELECT 'circles system ready' AS status;
