-- ============================================================
-- 18_teacher_applicants.sql — اتفاقية المسمعات في مقرأة الوقار (v2)
-- المسمعة توقّع البنود باسمها، وتُدخل مواعيدها المتاحة (يوم + وقت)
-- بمجموع لا يقل عن ساعتين ولا يزيد على 12 ساعة أسبوعيًا.
-- القبول ينشئ ملف المسمعة ومواعيد توفرها تلقائيًا.
-- آمن لإعادة التنفيذ (يعيد بناء الجدول — بيانات التطوير فقط).
-- ============================================================
DROP TABLE IF EXISTS public.teacher_agreements CASCADE;
CREATE TABLE public.teacher_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,                 -- اسم المسمعة (يعد بمثابة توقيع)
  agreement_date date NOT NULL DEFAULT current_date,
  agreed_slots jsonb NOT NULL DEFAULT '[]',  -- [{weekday, start_time, end_time}]
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  teacher_id uuid REFERENCES public.teachers(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_agreements_status ON public.teacher_agreements (status, created_at);
ALTER TABLE public.teacher_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can sign agreement" ON public.teacher_agreements;
CREATE POLICY "Anyone can sign agreement" ON public.teacher_agreements
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending');
DROP POLICY IF EXISTS "Admins manage teacher agreements" ON public.teacher_agreements;
CREATE POLICY "Admins manage teacher agreements" ON public.teacher_agreements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

SELECT 'teacher agreements v2 ready' AS status;
