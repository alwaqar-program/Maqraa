-- ============================================================
-- 22_form_assets.sql — صور ترويسات النماذج
-- مخزن عام تقرؤه النماذج، والرفع/الاستبدال للإدارة فقط.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('form-assets', 'form-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins upload form assets" ON storage.objects;
CREATE POLICY "Admins upload form assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'form-assets' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update form assets" ON storage.objects;
CREATE POLICY "Admins update form assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'form-assets' AND public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins delete form assets" ON storage.objects;
CREATE POLICY "Admins delete form assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'form-assets' AND public.has_role(auth.uid(), 'admin'));

SELECT 'form assets bucket ready' AS status;
