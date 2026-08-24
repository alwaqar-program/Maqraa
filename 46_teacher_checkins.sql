-- ============================================================
-- 46_teacher_checkins.sql — تسجيل بدء/انتهاء الحلقة للمسمعة (check-in/out)
-- المسمعة تسجل «بدأتُ الحلقة» عند البدء و«أنهيتُها» عند الانتهاء،
-- والمدة تُحسب تلقائيًا بالدقائق لاحتساب المكافأة على الوقت الفعلي.
-- التتبع يظهر لمديرة النظام في صفحة «دوام المسمعات».
-- سجل واحد لكل حلقة في اليوم. آمن لإعادة التنفيذ.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.teacher_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT current_date,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  -- المدة بالدقائق — تُحسب تلقائيًا عند تسجيل الانتهاء
  minutes int GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NULL THEN NULL
         ELSE GREATEST(0, (EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::int)
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_id, date),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_teacher_checkins_teacher_date
  ON public.teacher_checkins (teacher_id, date);

ALTER TABLE public.teacher_checkins ENABLE ROW LEVEL SECURITY;

-- المسمعة تسجل وتُنهي لحلقاتها هي فقط
DROP POLICY IF EXISTS "Teachers manage own checkins" ON public.teacher_checkins;
CREATE POLICY "Teachers manage own checkins" ON public.teacher_checkins
  FOR ALL TO authenticated
  USING (teacher_id = public.current_teacher_id())
  WITH CHECK (
    teacher_id = public.current_teacher_id()
    AND EXISTS (
      SELECT 1 FROM public.circles c
      WHERE c.id = circle_id AND c.teacher_id = public.current_teacher_id()
    )
  );

-- المديرة ترى وتدير الكل (تصحيح نسيان الإنهاء ونحوه)
DROP POLICY IF EXISTS "Admins manage checkins" ON public.teacher_checkins;
CREATE POLICY "Admins manage checkins" ON public.teacher_checkins
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- أجر الساعة (ريال) لحساب المكافأة — تعدَّل من صفحة «دوام المسمعات»
INSERT INTO public.app_settings (key, value)
VALUES ('teacher_hour_rate', '0')
ON CONFLICT (key) DO NOTHING;

SELECT 'teacher checkins ready' AS status;
