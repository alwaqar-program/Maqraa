-- ============================================================
-- 23_tracks_rename.sql — أسماء المسارات المعتمدة بنصابها الأسبوعي
--   خمسة أجزاء (٧ص في الأسبوع) · عشرة أجزاء (١٤ص) ·
--   عشرون جزء (٢٩ص) · ختمة (٤٣ص) — وإيقاف مسار الختمتين.
-- ============================================================
UPDATE public.tracks SET name = 'خمسة أجزاء (٧ص في الأسبوع)'   WHERE juz_count = 5;
UPDATE public.tracks SET name = 'عشرة أجزاء (١٤ص في الأسبوع)' WHERE juz_count = 10;
UPDATE public.tracks SET name = 'عشرون جزء (٢٩ص في الأسبوع)'  WHERE juz_count = 20;
UPDATE public.tracks SET name = 'ختمة (٤٣ص في الأسبوع)'       WHERE juz_count = 30;
UPDATE public.tracks SET is_active = false                     WHERE juz_count = 60;

SELECT name, juz_count, quota_pages_per_season, is_active FROM public.tracks ORDER BY sort_order;
