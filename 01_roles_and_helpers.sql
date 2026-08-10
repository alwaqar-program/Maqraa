-- ============================================================
-- 01_roles_and_helpers.sql — مقرأة الوقار
-- الأدوار + الدوال المساعدة. يُنفَّذ أولًا في SQL Editor.
-- ============================================================
-- ⚠️ أمان (درس حادثة اختراق الوقار 2026-07 — راجع 53_emergency_lockdown.sql):
--   لا تسجيل ذاتي إطلاقًا. بعد إنشاء المشروع مباشرة:
--   Authentication → Sign In / Up → عطّلي "Allow new users to sign up".
--   إنشاء الحسابات يتم فقط عبر Edge Function «admin-create-user» بصلاحية admin.
-- ============================================================

-- الدوال المساعدة تشير لجداول تُنشأ في ملفات لاحقة — عطّلي فحص أجسام الدوال أثناء الإنشاء
SET check_function_bodies = off;

-- الأدوار
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','teacher','supervisor','student','report_viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- هل يحمل المستخدم الدور؟ (SECURITY DEFINER لتجاوز RLS داخل السياسات نفسها)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- صف الطالبة المرتبط بالمستخدم الحالي
CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
$$;

-- صف المعلمة المرتبط بالمستخدم الحالي
CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.teachers WHERE user_id = auth.uid() LIMIT 1;
$$;

-- مسارات المشرفة الحالية (scope=general ⇒ كل المسارات)
CREATE OR REPLACE FUNCTION public.supervisor_track_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id FROM public.tracks t
  WHERE EXISTS (
    SELECT 1 FROM public.supervisors s
    WHERE s.user_id = auth.uid() AND s.is_active
      AND (s.scope = 'general' OR EXISTS (
        SELECT 1 FROM public.supervisor_tracks st
        WHERE st.supervisor_id = s.id AND st.track_id = t.id))
  );
$$;

-- سياسات user_roles
DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- إعدادات عامة قابلة للتعديل من النظام (حدود ساعات المعلمة وغيرها)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read settings" ON public.app_settings;
CREATE POLICY "Authenticated read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value, description) VALUES
  ('teacher_min_hours_per_week', '2',  'الحد الأدنى لساعات توفر المسمعة أسبوعيًا'),
  ('teacher_max_hours_per_week', '12', 'الحد الأعلى لساعات توفر المسمعة أسبوعيًا'),
  ('slot_duration_minutes',      '60', 'مدة موعد التسميع الفردي بالدقائق'),
  ('max_absences_per_season',    '3',  'حد الغيابات المسموح خلال الفصل (بعذر أو بدون) — تجاوزه يُبرز تنبيهًا للإدارة')
ON CONFLICT (key) DO NOTHING;
