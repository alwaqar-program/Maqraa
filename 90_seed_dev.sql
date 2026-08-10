-- ============================================================
-- 90_seed_dev.sql — مقرأة الوقار (بيئة تطوير فقط — لا يُنفَّذ في الإنتاج)
-- فصل حالي + 3 مسمعات بفتحات + 12 طالبة بحجوزات + أسبوعان من السجلات.
-- المسارات مبذورة في 02. الحسابات تُنشأ بعده عبر scripts/seed-users.ts.
-- ============================================================

-- فصل حالي
INSERT INTO public.seasons (id, name, start_date, end_date, sessions_count, status, is_current)
VALUES ('a0000000-0000-0000-0000-000000000001', 'الفصل الأول ١٤٤٨هـ',
        current_date - 21, current_date + 77, 14, 'active', true)
ON CONFLICT (id) DO NOTHING;

-- 3 مسمعات
INSERT INTO public.teachers (id, full_name, national_id, phone, meeting_link) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'المسمعة الأولى (تجربة)', '2000000001', '0500000001', 'https://zoom.us/j/111'),
  ('b0000000-0000-0000-0000-000000000002', 'المسمعة الثانية (تجربة)', '2000000002', '0500000002', 'https://zoom.us/j/222'),
  ('b0000000-0000-0000-0000-000000000003', 'المسمعة الثالثة (تجربة)', '2000000003', '0500000003', 'https://zoom.us/j/333')
ON CONFLICT (id) DO NOTHING;

-- فتحات توفر (أوقات أسبوعية، ساعة لكل فتحة) — المسمعة 1: 4 فتحات، 2: 6 فتحات، 3: فتحتان
INSERT INTO public.availability_slots (id, teacher_id, weekday, start_time, end_time)
SELECT ('c0000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       t.id, w.weekday, w.start_time, w.end_time
FROM (VALUES
  (1,  'b0000000-0000-0000-0000-000000000001', 0, time '16:00', time '17:00'),
  (2,  'b0000000-0000-0000-0000-000000000001', 0, time '17:00', time '18:00'),
  (3,  'b0000000-0000-0000-0000-000000000001', 2, time '16:00', time '17:00'),
  (4,  'b0000000-0000-0000-0000-000000000001', 2, time '17:00', time '18:00'),
  (5,  'b0000000-0000-0000-0000-000000000002', 1, time '08:00', time '09:00'),
  (6,  'b0000000-0000-0000-0000-000000000002', 1, time '09:00', time '10:00'),
  (7,  'b0000000-0000-0000-0000-000000000002', 3, time '08:00', time '09:00'),
  (8,  'b0000000-0000-0000-0000-000000000002', 3, time '09:00', time '10:00'),
  (9,  'b0000000-0000-0000-0000-000000000002', 4, time '20:00', time '21:00'),
  (10, 'b0000000-0000-0000-0000-000000000002', 4, time '21:00', time '22:00'),
  (11, 'b0000000-0000-0000-0000-000000000003', 5, time '10:00', time '11:00'),
  (12, 'b0000000-0000-0000-0000-000000000003', 5, time '11:00', time '12:00')
) AS w(n, tid, weekday, start_time, end_time)
JOIN public.teachers t ON t.id = w.tid::uuid
ON CONFLICT (id) DO NOTHING;

-- 12 طالبة موزعات على المسارات
INSERT INTO public.students (id, full_name, national_id, phone, track_id)
SELECT ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'طالبة تجربة ' || i,
       '10000000' || lpad(i::text, 2, '0'),
       '05411111' || lpad(i::text, 2, '0'),
       (SELECT id FROM public.tracks ORDER BY sort_order LIMIT 1 OFFSET (i - 1) % 5)
FROM generate_series(1, 12) i
ON CONFLICT (id) DO NOTHING;

-- تسجيلهن في الفصل الحالي
INSERT INTO public.enrollments (student_id, season_id, track_id)
SELECT st.id, 'a0000000-0000-0000-0000-000000000001', st.track_id
FROM public.students st
WHERE st.id::text LIKE 'd0000000%'
ON CONFLICT (student_id, season_id) DO NOTHING;

-- حجوزات: الطالبات 1..10 يحجزن الفتحات 1..10 (تبقى فتحتان شاغرتان و طالبتان بلا حجز)
INSERT INTO public.bookings (slot_id, student_id, season_id)
SELECT ('c0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       'a0000000-0000-0000-0000-000000000001'
FROM generate_series(1, 10) i
WHERE NOT EXISTS (
  SELECT 1 FROM public.bookings b
  WHERE b.slot_id = ('c0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid
    AND b.status = 'active'
);

-- أسبوعان من السرد الذاتي (الطالبات 1..10، كل يومين، نطاقات متنوعة)
INSERT INTO public.self_recitation_log (student_id, date, from_surah, from_verse, to_surah, to_verse)
SELECT ('d0000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid,
       current_date - d,
       ((i + d) % 100) + 1, 1,
       ((i + d) % 100) + 2, 1
FROM generate_series(1, 10) i, generate_series(0, 13, 2) d;

-- تسميع أسبوعي عند المسمعات (جلستان لكل طالبة محجوزة) بألحان متفاوتة
INSERT INTO public.teacher_recitation_log
  (student_id, teacher_id, date, from_surah, from_verse, to_surah, to_verse, lahn_jali_count, lahn_khafi_count)
SELECT b.student_id, s.teacher_id,
       current_date - w.d,
       ((row_number() OVER ()) % 90)::int + 1, 1,
       ((row_number() OVER ()) % 90)::int + 3, 1,
       (row_number() OVER ()) % 3,
       (row_number() OVER ()) % 5
FROM public.bookings b
JOIN public.availability_slots s ON s.id = b.slot_id
CROSS JOIN (VALUES (2), (9)) AS w(d)
WHERE b.status = 'active';

-- حضور الجلستين (طالبة 9 غائبة 3 مرات لاختبار تنبيه الغياب)
INSERT INTO public.session_attendance (booking_id, student_id, teacher_id, date, status)
SELECT b.id, b.student_id, s.teacher_id, current_date - w.d,
       CASE WHEN b.student_id = 'd0000000-0000-0000-0000-000000000009' THEN 'absent' ELSE 'present' END
FROM public.bookings b
JOIN public.availability_slots s ON s.id = b.slot_id
CROSS JOIN (VALUES (2), (9)) AS w(d)
WHERE b.status = 'active'
ON CONFLICT (student_id, date) DO NOTHING;
INSERT INTO public.session_attendance (booking_id, student_id, teacher_id, date, status)
SELECT b.id, b.student_id, s.teacher_id, current_date - 16, 'absent'
FROM public.bookings b JOIN public.availability_slots s ON s.id = b.slot_id
WHERE b.student_id = 'd0000000-0000-0000-0000-000000000009' AND b.status = 'active'
ON CONFLICT (student_id, date) DO NOTHING;

-- تحقق سريع
SELECT (SELECT count(*) FROM public.mushaf_reference)  AS mushaf_pages,
       (SELECT count(*) FROM public.surahs)            AS surahs,
       (SELECT count(*) FROM public.students)          AS students,
       (SELECT count(*) FROM public.bookings WHERE status='active') AS active_bookings,
       (SELECT count(*) FROM public.self_recitation_log)    AS self_logs,
       (SELECT count(*) FROM public.teacher_recitation_log) AS tasmee_logs,
       (SELECT count(*) FROM public.v_absence_alerts)  AS absence_alerts;
