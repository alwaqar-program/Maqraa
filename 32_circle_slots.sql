-- ============================================================
-- 32_circle_slots.sql — مواعيد الحلقة تُختار من أوقات المسمعة
-- الحلقة لم تعد تُدخل وقتًا يدويًا: تُبنى باختيار موعد أو أكثر من
-- أوقات توفر المسمعة (availability_slots)، وسعتها = مجموع دقائقها.
-- الموعد الواحد لا يخص إلا حلقة واحدة (UNIQUE على slot_id).
-- أعمدة circles (weekday/start_time/end_time) تبقى = أبكر موعد مختار
-- للتوافق مع بقية الصفحات (الحضور/التقارير).
-- يُنفذ بعد 31. آمن لإعادة التنفيذ.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.circle_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.availability_slots(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id)
);
CREATE INDEX IF NOT EXISTS idx_circle_slots_circle ON public.circle_slots (circle_id);
ALTER TABLE public.circle_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read circle slots" ON public.circle_slots;
CREATE POLICY "Authenticated read circle slots" ON public.circle_slots
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins manage circle slots" ON public.circle_slots;
CREATE POLICY "Admins manage circle slots" ON public.circle_slots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ربط الحلقات الموجودة بمواعيد مسمعاتها الواقعة داخل نافذتها
INSERT INTO public.circle_slots (circle_id, slot_id)
SELECT c.id, a.id
FROM public.circles c
JOIN public.availability_slots a
  ON a.teacher_id = c.teacher_id
 AND a.weekday = c.weekday
 AND a.start_time >= c.start_time
 AND a.end_time <= c.end_time
ON CONFLICT (slot_id) DO NOTHING;

-- تحقق: مواعيد كل حلقة ومجموع دقائقها
SELECT c.number, t.full_name AS teacher, count(cs.id) AS slots,
       coalesce(sum(extract(epoch FROM (a.end_time - a.start_time)) / 60), 0)::int AS capacity_minutes
FROM public.circles c
JOIN public.teachers t ON t.id = c.teacher_id
LEFT JOIN public.circle_slots cs ON cs.circle_id = c.id
LEFT JOIN public.availability_slots a ON a.id = cs.slot_id
GROUP BY c.number, t.full_name
ORDER BY c.number;
