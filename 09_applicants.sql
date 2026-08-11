-- ============================================================
-- 09_applicants.sql — مقرأة الوقار
-- تسجيل الطالبات (نموذج عام بلا دخول) حسب النموذج المعتمد:
--   الاسم الرباعي، الجوال، تعهد الحضور، المسار (٥/١٠/٢٠/٣٠/٦٠)،
--   المواعيد المناسبة (الأحد–الخميس ٥–٧ صباحًا)، الفترة الأنسب، المقترحات.
-- التوزيع وفق الأسبقية بالتسجيل → created_at هو مرجع الأولوية.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  national_id text,
  phone text NOT NULL,
  attendance_pledge boolean NOT NULL DEFAULT false,   -- أتعهد بالالتزام بنظام الحضور والغياب
  track_id uuid REFERENCES public.tracks(id),
  preferred_days int[] NOT NULL DEFAULT '{}',         -- 0=الأحد .. 4=الخميس (فتحة ٥–٧ صباحًا)
  preferred_period text CHECK (preferred_period IN ('morning','evening')),
  suggestions text,                                    -- مقترحات وملاحظات
  season_id uuid REFERENCES public.seasons(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  review_note text,
  reviewed_at timestamptz,
  student_id uuid REFERENCES public.students(id),      -- يُعبأ عند القبول
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS national_id text;
CREATE INDEX IF NOT EXISTS idx_applicants_status ON public.applicants (status, created_at);
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;

-- ربط الفصل الحالي تلقائيًا
CREATE OR REPLACE FUNCTION public.applicants_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.season_id IS NULL THEN
    SELECT id INTO NEW.season_id FROM public.seasons WHERE is_current LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_applicants_before ON public.applicants;
CREATE TRIGGER trg_applicants_before BEFORE INSERT OR UPDATE ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.applicants_before();

-- سياسات: النموذج عام (anon يُدخل فقط ولا يقرأ) والإدارة تدير
DROP POLICY IF EXISTS "Anyone can apply" ON public.applicants;
CREATE POLICY "Anyone can apply" ON public.applicants
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND attendance_pledge = true);
DROP POLICY IF EXISTS "Admins manage applicants" ON public.applicants;
CREATE POLICY "Admins manage applicants" ON public.applicants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- النموذج يحتاج قراءة المسارات النشطة دون تسجيل دخول
DROP POLICY IF EXISTS "Anon read active tracks" ON public.tracks;
CREATE POLICY "Anon read active tracks" ON public.tracks
  FOR SELECT TO anon USING (is_active = true);

SELECT 'applicants ready' AS status;
