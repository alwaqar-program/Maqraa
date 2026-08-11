-- ============================================================
-- 25_period_both.sql — خيار «كلاهما» في الفترة الأنسب
-- ============================================================
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_preferred_period_check;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_preferred_period_check
  CHECK (preferred_period IN ('morning', 'evening', 'both'));
SELECT 'period both ready' AS status;
