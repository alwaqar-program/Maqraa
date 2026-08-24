-- ============================================================
-- 45_super_admin.sql — دور «المديرة العليا» super_admin
-- يرث كل صلاحيات admin تلقائيًا في كل السياسات القائمة والمستقبلية
-- (عبر has_role نفسها — لا حاجة لتعديل أي سياسة)، ويزيد عليها:
-- منح وسحب دور super_admin حكر على حاملته فقط.
-- آمن لإعادة التنفيذ.
-- ============================================================

-- 1) القيمة الجديدة في نوع الأدوار
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) هل المستخدم مديرة عليا؟ (مقارنة نصية — آمنة قبل أول استخدام للقيمة)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'super_admin'
  );
$$;

-- 3) الوراثة: أي فحص لدور admin ينجح تلقائيًا للمديرة العليا.
--    كل سياسات "Admins manage ..." في النظام تستدعي هذه الدالة، فتشملها فورًا.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role
           OR (_role = 'admin'::public.app_role AND role::text = 'super_admin'))
  );
$$;

-- 4) حماية الهرم: المديرة العادية تدير كل الأدوار عدا super_admin،
--    والمديرة العليا تدير الجميع بمن فيهن مثيلاتها.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND (role::text <> 'super_admin' OR public.is_super_admin(auth.uid()))
  );

SELECT 'super_admin role ready' AS status;
