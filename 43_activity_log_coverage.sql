-- ============================================================
-- 43_activity_log_coverage.sql — توسيع سجل النشاط لكل الجداول المهمة
-- كان يراقب أربعة جداول فقط (سرد/تسميع/حضور/حجوزات) — نضيف بقية
-- الجداول التي يهم تدقيق التغييرات فيها: الطالبات والمسمعات والحلقات
-- والعضويات والمواعيد والمتقدمات والاختبارات وإجراءات الغياب...
-- يستخدم دالة public.log_activity الموجودة في 08. آمن لإعادة التنفيذ.
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','teachers','supervisors','tracks','seasons',
    'circles','circle_members','availability_slots',
    'applicants','teacher_agreements','exams','absence_actions',
    'pledges','suggestions','hostings'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_log_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_log_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I '
        'FOR EACH ROW EXECUTE FUNCTION public.log_activity()', t);
    END IF;
  END LOOP;
END $$;

-- فهرس يخدم فلترة الصفحة بالجدول والتاريخ
CREATE INDEX IF NOT EXISTS idx_activity_log_table_created
  ON public.activity_log (table_name, created_at DESC);

-- تحقق: الجداول المراقبة الآن
SELECT tgrelid::regclass AS "الجدول المراقب"
FROM pg_trigger
WHERE tgname LIKE 'trg_log_%' AND NOT tgisinternal
ORDER BY 1;
