-- ============================================================
-- 16_hostings.sql — الاستضافات
-- الإدارة تنشئ لقاء (عنوان، من قدّمته، متى، وصف، مرفقات المادة العلمية)
-- أو ترسل رابطًا خاصًا للضيفة تعبئ بياناته بنفسها (/guest/:token)،
-- والطالبات يطّلعن على المادة ويعبئن نموذج قياس الرضا (تقييم 1-5 + تعليق).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.hostings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  host_name text NOT NULL DEFAULT '',          -- من قدّمت اللقاء
  event_date date,
  description text,
  attachments text[] NOT NULL DEFAULT '{}',    -- المادة العلمية (مخزن hostings)
  guest_token uuid NOT NULL DEFAULT gen_random_uuid(),  -- رابط تعبئة الضيفة
  guest_filled_at timestamptz,
  is_published boolean NOT NULL DEFAULT true,  -- تظهر للطالبات
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hostings_token ON public.hostings (guest_token);
ALTER TABLE public.hostings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage hostings" ON public.hostings;
CREATE POLICY "Admins manage hostings" ON public.hostings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Authenticated read published hostings" ON public.hostings;
CREATE POLICY "Authenticated read published hostings" ON public.hostings
  FOR SELECT TO authenticated USING (is_published);

-- قياس الرضا
CREATE TABLE IF NOT EXISTS public.hosting_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hosting_id uuid NOT NULL REFERENCES public.hostings(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hosting_id, student_id)
);
ALTER TABLE public.hosting_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students submit own feedback" ON public.hosting_feedback;
CREATE POLICY "Students submit own feedback" ON public.hosting_feedback
  FOR INSERT TO authenticated WITH CHECK (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Students read own feedback" ON public.hosting_feedback;
CREATE POLICY "Students read own feedback" ON public.hosting_feedback
  FOR SELECT TO authenticated USING (student_id = public.current_student_id());
DROP POLICY IF EXISTS "Admins and supervisors read feedback" ON public.hosting_feedback;
CREATE POLICY "Admins and supervisors read feedback" ON public.hosting_feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- مخزن المادة العلمية — عام للقراءة (مادة تعليمية)، الرفع للإدارة فقط
INSERT INTO storage.buckets (id, name, public)
VALUES ('hostings', 'hostings', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Hosting material upload" ON storage.objects;
CREATE POLICY "Hosting material upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hostings' AND public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- بوابة الضيفة (بلا تسجيل دخول): قراءة وتعبئة عبر الرمز فقط
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_hosting_by_token(p_token uuid)
RETURNS TABLE (id uuid, title text, host_name text, event_date date, description text, guest_filled_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.id, h.title, h.host_name, h.event_date, h.description, h.guest_filled_at
  FROM public.hostings h WHERE h.guest_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.submit_hosting_by_token(
  p_token uuid, p_title text, p_host_name text, p_event_date date, p_description text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hostings
  SET title = p_title, host_name = p_host_name, event_date = p_event_date,
      description = p_description, guest_filled_at = now(), updated_at = now()
  WHERE guest_token = p_token;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.get_hosting_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_hosting_by_token(uuid, text, text, date, text) TO anon, authenticated;

SELECT 'hostings ready' AS status;
