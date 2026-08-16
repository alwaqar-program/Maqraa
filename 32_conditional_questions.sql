-- ============================================================
-- 32_conditional_questions.sql — أسئلة شرطية في النماذج
-- سؤال يظهر فقط بناء على إجابة سؤال (اختيار) قبله:
--   depends_on = السؤال الشرط، depends_value = الإجابة التي تُظهره.
-- آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS depends_on uuid REFERENCES public.form_questions(id) ON DELETE SET NULL;
ALTER TABLE public.form_questions
  ADD COLUMN IF NOT EXISTS depends_value text;

-- رقم جوال المسمعة في نموذج الاتفاقية (يُنسخ لملفها عند القبول)
ALTER TABLE public.teacher_agreements ADD COLUMN IF NOT EXISTS phone text;

SELECT 'conditional questions + agreement phone ready' AS status;
