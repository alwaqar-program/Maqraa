-- ============================================================
-- 33_conditional_base_and_notes.sql — توسعة الأسئلة الشرطية
-- (١) شرط الظهور يمكن أن يُبنى على حقل مدمج في النموذج
--     (المسار / الفترة الأنسب / التعهد / التقييم) عبر depends_field،
--     إضافة إلى الشرط على سؤال إضافي سابق (depends_on من ملف 32).
-- (٢) نوع جديد 'note' = فقرة إرشادية تظهر بشرط بلا إجابة.
-- يُنفَّذ بعد ملف 32. آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.form_questions DROP CONSTRAINT IF EXISTS form_questions_qtype_check;
ALTER TABLE public.form_questions ADD CONSTRAINT form_questions_qtype_check
  CHECK (qtype IN ('text', 'select', 'multiselect', 'note'));

ALTER TABLE public.form_questions ADD COLUMN IF NOT EXISTS depends_field text;

SELECT 'conditional base fields + notes ready' AS status;
