-- ============================================================
-- 15_suggestions.sql — الاقتراحات
-- مساحة حرة: عنوان + وصف + مرفقات، يرسلها الطالبات والمسمعات
-- وتصل للمشرفات ومديرة النظام (قراءة فقط لديهن، وكل مرسلة ترى اقتراحاتها).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  attachments text[] NOT NULL DEFAULT '{}',   -- مسارات الملفات في مخزن suggestions
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggestions_created ON public.suggestions (created_at DESC);
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated create own suggestion" ON public.suggestions;
CREATE POLICY "Authenticated create own suggestion" ON public.suggestions
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS "Owners read own suggestions" ON public.suggestions;
CREATE POLICY "Owners read own suggestions" ON public.suggestions
  FOR SELECT TO authenticated USING (created_by = auth.uid());
DROP POLICY IF EXISTS "Admins and supervisors read suggestions" ON public.suggestions;
CREATE POLICY "Admins and supervisors read suggestions" ON public.suggestions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));
DROP POLICY IF EXISTS "Admins delete suggestions" ON public.suggestions;
CREATE POLICY "Admins delete suggestions" ON public.suggestions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- مخزن المرفقات (خاص — الوصول عبر روابط موقعة)
INSERT INTO storage.buckets (id, name, public)
VALUES ('suggestions', 'suggestions', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Suggestion attachments upload" ON storage.objects;
CREATE POLICY "Suggestion attachments upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'suggestions' AND owner = auth.uid());
DROP POLICY IF EXISTS "Suggestion attachments read" ON storage.objects;
CREATE POLICY "Suggestion attachments read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'suggestions'
    AND (owner = auth.uid()
         OR public.has_role(auth.uid(), 'admin')
         OR public.has_role(auth.uid(), 'supervisor'))
  );

-- اسم المرسلة ودورها للعرض (يتجاوز RLS بأمان — أسماء فقط)
CREATE OR REPLACE FUNCTION public.suggestion_author(p_user uuid)
RETURNS TABLE (author_name text, author_role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
           (SELECT st.full_name FROM public.students st WHERE st.user_id = p_user LIMIT 1),
           (SELECT t.full_name FROM public.teachers t WHERE t.user_id = p_user LIMIT 1),
           (SELECT u.email::text FROM auth.users u WHERE u.id = p_user)
         ) AS author_name,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.students st WHERE st.user_id = p_user) THEN 'طالبة'
           WHEN EXISTS (SELECT 1 FROM public.teachers t WHERE t.user_id = p_user) THEN 'مسمعة'
           ELSE 'أخرى'
         END AS author_role;
$$;

SELECT 'suggestions ready' AS status;
