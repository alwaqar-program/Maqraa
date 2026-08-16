-- ============================================================
-- 30_delete_test_teachers.sql — حذف المسمعات التجريبيات نهائيًا
-- يستهدف كل مسمعة اسمها يحتوي «تجربة» (الأولى/الثانية/الثالثة):
-- يحذف حضورها وتسميعها وحلقاتها ومواعيدها (وحجوزاتها تبعًا)
-- ويفك ربط الاختبارات والاتفاقيات، ثم يحذفها ويحذف حساب دخولها.
-- آمن لإعادة التنفيذ — لا يمس أي مسمعة حقيقية.
-- ============================================================

BEGIN;

DO $$
DECLARE
  ids  uuid[];
  uids uuid[];
BEGIN
  SELECT array_agg(id),
         array_agg(user_id) FILTER (WHERE user_id IS NOT NULL)
    INTO ids, uids
  FROM public.teachers
  WHERE full_name LIKE '%تجربة%';

  IF ids IS NULL THEN
    RAISE NOTICE 'لا مسمعات تجريبية — لا شيء يُحذف';
    RETURN;
  END IF;

  -- سجلات تجريبية مرتبطة بهن (تُحذف لأنها بيانات تجربة)
  DELETE FROM public.session_attendance      WHERE teacher_id = ANY(ids);
  DELETE FROM public.teacher_recitation_log  WHERE teacher_id = ANY(ids);

  -- مراجع اختيارية: تُفك بدل الحذف (سجل الطالبة يبقى)
  UPDATE public.exams              SET teacher_id = NULL WHERE teacher_id = ANY(ids);
  UPDATE public.teacher_agreements SET teacher_id = NULL WHERE teacher_id = ANY(ids);

  -- حلقاتهن (عضوية الطالبات فيها تُحذف تبعًا — يعدن «غير موزعات»)
  DELETE FROM public.circles WHERE teacher_id = ANY(ids);

  -- المسمعات أنفسهن (مواعيد توفرهن وحجوزاتها تُحذف تبعًا)
  DELETE FROM public.teachers WHERE id = ANY(ids);

  -- حسابات الدخول التجريبية (أدوارها تُحذف تبعًا)
  IF uids IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(uids);
  END IF;

  RAISE NOTICE 'حُذفت % مسمعات تجريبية', array_length(ids, 1);
END $$;

COMMIT;
