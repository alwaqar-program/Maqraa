-- ============================================================
-- 20_form_settings.sql — تحرير نماذج التسجيل من لوحة الإدارة
-- إعدادات نصوص النماذج + أسئلة إضافية + إجاباتها مع الطلبات.
-- المواصفة: docs/specs/2026-08-11-editable-registration-forms.md
-- ============================================================

-- إعدادات كل نموذج (سجل واحد لكل نموذج، config يحمل النصوص والخيارات)
CREATE TABLE IF NOT EXISTS public.form_settings (
  form_key text PRIMARY KEY CHECK (form_key IN ('student_register', 'teacher_agreement', 'hosting_feedback')),
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.form_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read form settings" ON public.form_settings;
CREATE POLICY "Anyone read form settings" ON public.form_settings
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage form settings" ON public.form_settings;
CREATE POLICY "Admins manage form settings" ON public.form_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- الأسئلة الإضافية (الحذف = تعطيل، فتبقى إجابات الطلبات القديمة مفهومة)
CREATE TABLE IF NOT EXISTS public.form_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_key text NOT NULL CHECK (form_key IN ('student_register', 'teacher_agreement', 'hosting_feedback')),
  label text NOT NULL,
  qtype text NOT NULL DEFAULT 'text' CHECK (qtype IN ('text', 'select', 'multiselect')),
  options text[] NOT NULL DEFAULT '{}',
  required boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_questions_key ON public.form_questions (form_key, sort_order);
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone read active questions" ON public.form_questions;
CREATE POLICY "Anyone read active questions" ON public.form_questions
  FOR SELECT TO anon, authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage questions" ON public.form_questions;
CREATE POLICY "Admins manage questions" ON public.form_questions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- إجابات الأسئلة الإضافية مع كل طلب: {question_id: "نص" | ["خيار", ...]}
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS extra_answers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.teacher_agreements ADD COLUMN IF NOT EXISTS extra_answers jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.hosting_feedback ADD COLUMN IF NOT EXISTS extra_answers jsonb NOT NULL DEFAULT '{}';

SELECT 'form settings ready' AS status;
