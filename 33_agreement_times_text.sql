-- ============================================================
-- 33_agreement_times_text.sql — المواعيد المتفق عليها نص حر
-- في اتفاقية المسمعات: بدل صفوف يوم/وقت، حقل نص طويل تكتبه المسمعة.
-- آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.teacher_agreements ADD COLUMN IF NOT EXISTS agreed_times_text text;

SELECT 'agreement times text ready' AS status;
