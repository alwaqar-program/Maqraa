-- ============================================================
-- 14_no_overlap_slots.sql — منع تداخل مواعيد المسمعة
-- لا يجوز للمسمعة موعدان نشطان متداخلان زمنيًا في اليوم نفسه
-- (قيد استبعاد في القاعدة — يشمل التطابق التام والتداخل الجزئي).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.availability_slots DROP CONSTRAINT IF EXISTS no_overlapping_slots;
ALTER TABLE public.availability_slots ADD CONSTRAINT no_overlapping_slots
  EXCLUDE USING gist (
    teacher_id WITH =,
    weekday WITH =,
    numrange(
      (EXTRACT(EPOCH FROM start_time))::numeric,
      (EXTRACT(EPOCH FROM end_time))::numeric
    ) WITH &&
  ) WHERE (is_active);

SELECT 'no-overlap constraint ready' AS status;
