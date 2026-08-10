-- ============================================================
-- 08_activity_log.sql — مقرأة الوقار
-- سجل تدقيق كامل عبر TRIGGER (منقول من نمط 35_recording_activity_log.sql في الوقار)
-- مع إضافة auth_uid — درس التحقيق في حادثة 2026-07: actor النصي وحده لا يكفي.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  student_id uuid,
  action text NOT NULL CHECK (action IN ('created','updated','deleted','restored')),
  changes jsonb,                      -- {field: {old, new}} للتعديلات
  auth_uid uuid,                      -- من نفّذ فعليًا (حساب المصادقة)
  date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_row ON public.activity_log (table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_student ON public.activity_log (student_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON public.activity_log (created_at DESC);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read activity log" ON public.activity_log;
CREATE POLICY "Admins read activity log" ON public.activity_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb; j_old jsonb; v_action text; v_changes jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    j := to_jsonb(OLD); v_action := 'deleted';
  ELSIF TG_OP = 'INSERT' THEN
    j := to_jsonb(NEW); v_action := 'created';
  ELSE
    j := to_jsonb(NEW); j_old := to_jsonb(OLD);
    IF COALESCE((j_old->>'is_deleted')::boolean, false) = false
       AND COALESCE((j->>'is_deleted')::boolean, false) = true THEN
      v_action := 'deleted';
    ELSIF COALESCE((j_old->>'is_deleted')::boolean, false) = true
       AND COALESCE((j->>'is_deleted')::boolean, false) = false THEN
      v_action := 'restored';
    ELSE
      v_action := 'updated';
    END IF;
    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      INTO v_changes
    FROM jsonb_each(j) n
    LEFT JOIN jsonb_each(j_old) o ON o.key = n.key
    WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('created_at','updated_at');
    IF v_changes IS NULL THEN RETURN NULL; END IF;   -- لا تغيير فعلي
  END IF;

  INSERT INTO public.activity_log (table_name, row_id, student_id, action, changes, auth_uid, date)
  VALUES (
    TG_TABLE_NAME,
    (j->>'id')::uuid,
    (j->>'student_id')::uuid,
    v_action,
    v_changes,
    auth.uid(),
    COALESCE((j->>'date')::date, current_date)
  );
  RETURN NULL;  -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS trg_log_self ON public.self_recitation_log;
CREATE TRIGGER trg_log_self AFTER INSERT OR UPDATE OR DELETE ON public.self_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_tasmee ON public.teacher_recitation_log;
CREATE TRIGGER trg_log_tasmee AFTER INSERT OR UPDATE OR DELETE ON public.teacher_recitation_log
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_attendance ON public.session_attendance;
CREATE TRIGGER trg_log_attendance AFTER INSERT OR UPDATE OR DELETE ON public.session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
DROP TRIGGER IF EXISTS trg_log_bookings ON public.bookings;
CREATE TRIGGER trg_log_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

-- تحقق
SELECT tgname AS "التريغر", tgrelid::regclass AS "الجدول"
FROM pg_trigger
WHERE tgname IN ('trg_log_self','trg_log_tasmee','trg_log_attendance','trg_log_bookings');
