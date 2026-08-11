-- ============================================================
-- 24_applicant_slots.sql — تخزين مواعيد المتقدمة كمواعيد كاملة
-- (يوم + وقت) بدل الأيام فقط — يميز موعدي اليوم الواحد.
-- preferred_days تبقى للتوافق (الأيام الفريدة).
-- ============================================================
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS preferred_slots text[] NOT NULL DEFAULT '{}';
SELECT 'applicant slots ready' AS status;
