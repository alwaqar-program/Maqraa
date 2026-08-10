-- ============================================================
-- 93_seed_test_accounts.sql — حسابات اختبار للأدوار (تطوير فقط)
--   مسمعة:   teacher1@maqraa.test / test1234   → المسمعة الأولى (فتحات 1-4)
--   طالبة:   student1@maqraa.test / test1234   → طالبة تجربة 1 (لديها حجز)
--   طالبة:   student11@maqraa.test / test1234  → طالبة تجربة 11 (بلا حجز — لاختبار شاشة الحجز)
--   مشرفة:   supervisor@maqraa.test / test1234 → مشرفة عامة
--   مُطّلع:  reports@maqraa.test / test1234
-- آمن لإعادة التنفيذ. احذفي هذه الحسابات قبل أي استخدام حقيقي (المرحلة 7).
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.mk_user(p_email text, p_password text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = p_email;
  IF v_uid IS NOT NULL THEN RETURN v_uid; END IF;
  v_uid := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    p_email, crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  );
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_uid, v_uid::text,
          jsonb_build_object('sub', v_uid::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  RETURN v_uid;
END $$;

DO $$
DECLARE v uuid;
BEGIN
  -- مسمعة مرتبطة بالمسمعة الأولى المبذورة
  v := pg_temp.mk_user('teacher1@maqraa.test', 'test1234');
  INSERT INTO public.user_roles (user_id, role) VALUES (v, 'teacher') ON CONFLICT DO NOTHING;
  UPDATE public.teachers SET user_id = v WHERE id = 'b0000000-0000-0000-0000-000000000001';

  -- طالبة لديها حجز
  v := pg_temp.mk_user('student1@maqraa.test', 'test1234');
  INSERT INTO public.user_roles (user_id, role) VALUES (v, 'student') ON CONFLICT DO NOTHING;
  UPDATE public.students SET user_id = v WHERE id = 'd0000000-0000-0000-0000-000000000001';

  -- طالبة بلا حجز
  v := pg_temp.mk_user('student11@maqraa.test', 'test1234');
  INSERT INTO public.user_roles (user_id, role) VALUES (v, 'student') ON CONFLICT DO NOTHING;
  UPDATE public.students SET user_id = v WHERE id = 'd0000000-0000-0000-0000-000000000011';

  -- مشرفة عامة
  v := pg_temp.mk_user('supervisor@maqraa.test', 'test1234');
  INSERT INTO public.user_roles (user_id, role) VALUES (v, 'supervisor') ON CONFLICT DO NOTHING;
  INSERT INTO public.supervisors (user_id, full_name, scope)
  VALUES (v, 'مشرفة عامة (تجربة)', 'general')
  ON CONFLICT (user_id) DO NOTHING;

  -- مُطّلع تقارير
  v := pg_temp.mk_user('reports@maqraa.test', 'test1234');
  INSERT INTO public.user_roles (user_id, role) VALUES (v, 'report_viewer') ON CONFLICT DO NOTHING;
END $$;

-- تحقق
SELECT u.email, r.role FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id ORDER BY r.role;
