-- ============================================================
-- 91_admin_role.sql — منح دور «مديرة النظام» لحسابك
-- نفّذيه بعد إنشاء حسابك من اللوحة، مع تعديل البريد في السطر الأخير.
-- ============================================================
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'ضعي-بريدك-هنا@example.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- تحقق: يجب أن يظهر صف واحد بدور admin
SELECT u.email, r.role FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id;
