-- ============================================================
-- 97_cleanup_test_students.sql — تنظيف بيانات الطالبات الاختبارية
-- يحذف: كل الطالبات في جدول students (المقبولات والمنسحبات والمستبعدات —
--        كلهن بيانات اختبار) مع كامل سجلاتهن (حلقات، حجوزات، حضور،
--        تسميع، سرد، اختبارات، تعهدات، تقييمات استضافات — حذف متسلسل)،
--        وكل الاستمارات المقبولة أو المرفوضة.
-- يبقي: الاستمارات المعلقة (الطالبات المسجلات بانتظار الفرز)،
--        والمسمعات ومواعيدهن والمسارات والحلقات والفصول والنماذج والإعدادات.
-- ملاحظة: حسابات الدخول التجريبية (student1@maqraa.test...) تبقى في auth
--        بلا أثر — حذفها لاحقًا من لوحة Supabase إن أردت.
-- ============================================================

-- قبل الحذف: ماذا سيُحذف وماذا سيبقى؟
SELECT 'استمارات ستُحذف (مقبولة/مرفوضة)' AS "البند", count(*) AS "العدد"
  FROM public.applicants WHERE status <> 'pending'
UNION ALL
SELECT 'استمارات ستبقى (مسجلات بانتظار الفرز)', count(*)
  FROM public.applicants WHERE status = 'pending'
UNION ALL SELECT 'طالبات ستُحذف بكامل سجلاتهن', count(*) FROM public.students
UNION ALL SELECT 'عضويات حلقات ستُحذف تبعًا', count(*) FROM public.circle_members;

-- 1) الاستمارات المقبولة والمرفوضة (تُحذف أولًا لأنها تشير إلى الطالبات بلا حذف متسلسل)
DELETE FROM public.applicants WHERE status <> 'pending';

-- احتياط: فك أي ربط متبقٍ من استمارة معلقة بطالبة
UPDATE public.applicants SET student_id = NULL WHERE student_id IS NOT NULL;

-- 2) كل الطالبات — الحذف المتسلسل يمسح سجلاتهن كلها
--    (circle_members, bookings, session_attendance, teacher/self_recitation_log,
--     exams, enrollments, student_pledges, hosting_feedback)
DELETE FROM public.students;

-- بعد الحذف
SELECT 'الطالبات' AS "الجدول", count(*) AS "المتبقي" FROM public.students
UNION ALL SELECT 'الاستمارات (كلها معلقة)', count(*) FROM public.applicants
UNION ALL SELECT 'المسمعات (لم تُمس)', count(*) FROM public.teachers
UNION ALL SELECT 'مواعيد المسمعات (لم تُمس)', count(*) FROM public.availability_slots
UNION ALL SELECT 'المسارات (لم تُمس)', count(*) FROM public.tracks
UNION ALL SELECT 'الحلقات (بقيت فارغة)', count(*) FROM public.circles;
