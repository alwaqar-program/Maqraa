-- ============================================================
-- 17_guest_attachments.sql — رفع الضيفة للمادة العلمية
-- الضيفة (بلا حساب) ترفع مرفقات لقائها عبر رابطها الخاص:
-- المسار المطلوب: guest/{token}/{filename} — والرمز الصحيح هو الإذن.
-- ============================================================

DROP POLICY IF EXISTS "Guest hosting upload" ON storage.objects;
CREATE POLICY "Guest hosting upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'hostings'
    AND (storage.foldername(name))[1] = 'guest'
    AND EXISTS (
      SELECT 1 FROM public.hostings h
      WHERE h.guest_token::text = (storage.foldername(name))[2]
    )
  );

-- تعبئة الضيفة تشمل الآن مرفقاتها (تُلحق بالموجود)
CREATE OR REPLACE FUNCTION public.submit_hosting_by_token(
  p_token uuid, p_title text, p_host_name text, p_event_date date, p_description text,
  p_attachments text[] DEFAULT '{}'
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hostings
  SET title = p_title, host_name = p_host_name, event_date = p_event_date,
      description = p_description,
      attachments = attachments || COALESCE(p_attachments, '{}'),
      guest_filled_at = now(), updated_at = now()
  WHERE guest_token = p_token;
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_hosting_by_token(uuid, text, text, date, text, text[]) TO anon, authenticated;

SELECT 'guest attachments ready' AS status;
