-- ============================================================
-- 21_close_forms.sql — قفل روابط التسجيل
-- الإدارة تفتح/تقفل التسجيل من صفحة «النماذج»؛ والقفل مُنفَذ في
-- سياسة الإدخال نفسها فلا يقبل النظام طلبًا والرابط مقفل حتى لو
-- تجاوز أحدهم الواجهة. غياب الإعداد = مفتوح (التوافق الخلفي).
-- ============================================================

CREATE OR REPLACE FUNCTION public.form_is_open(p_form_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (config->>'is_open')::boolean FROM public.form_settings WHERE form_key = p_form_key),
    true
  );
$$;
GRANT EXECUTE ON FUNCTION public.form_is_open(text) TO anon, authenticated;

-- تسجيل الطالبات
DROP POLICY IF EXISTS "Anyone can apply" ON public.applicants;
CREATE POLICY "Anyone can apply" ON public.applicants
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending' AND attendance_pledge = true
    AND public.form_is_open('student_register')
  );

-- اتفاقية المسمعات
DROP POLICY IF EXISTS "Anyone can sign agreement" ON public.teacher_agreements;
CREATE POLICY "Anyone can sign agreement" ON public.teacher_agreements
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pending' AND public.form_is_open('teacher_agreement'));

SELECT 'form locking ready' AS status;
