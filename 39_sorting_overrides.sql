-- ============================================================
-- 39_sorting_overrides.sql — الإسناد اليدوي من صفحة الفرز
-- سحب الطالبة إلى مسمعة أخرى في صفحة «فرز الطالبات» يُحفظ هنا،
-- فلا يضيع عند التحديث، ويحترمه التوزيع التلقائي في صفحة الحلقات.
-- آمن لإعادة التنفيذ.
-- ============================================================

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS sort_teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS sort_slot_label text;   -- نص الموعد (اليوم والوقت) كما يعرضه النموذج

CREATE INDEX IF NOT EXISTS idx_applicants_sort_teacher ON public.applicants (sort_teacher_id);

SELECT 'sorting overrides ready' AS status;
