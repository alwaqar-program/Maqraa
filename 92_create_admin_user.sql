-- ============================================================
-- 92_create_admin_user.sql — إنشاء حساب مديرة النظام
--   admin@alwaqar.com / admin
-- يُنفَّذ في SQL Editor بعد MAQRAA_setup_bundle.sql. آمن لإعادة التنفيذ.
-- ⚠️ كلمة المرور ضعيفة — للتطوير فقط، غيّريها قبل أي استخدام حقيقي.
-- ============================================================
DO $$
DECLARE v_uid uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@alwaqar.com') THEN
    SELECT id INTO v_uid FROM auth.users WHERE email = 'admin@alwaqar.com';
  ELSE
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      'admin@alwaqar.com', crypt('admin', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', 'admin@alwaqar.com', 'email_verified', true),
      'email', now(), now(), now()
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;

-- تحقق
SELECT u.email, r.role
FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id
WHERE u.email = 'admin@alwaqar.com';
