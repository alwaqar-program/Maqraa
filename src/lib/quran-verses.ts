// Surah names + verse counts (Hafs/Madani mushaf, 6236 verses total).
// Names match the spellings used in mushaf_reference (18_seed_mushaf_reference.sql)
// so from_surah/to_surah stay consistent across the app.

export interface Surah {
  number: number;
  name: string;
  verses: number;
}

export const SURAHS: Surah[] = [
  { number: 1, name: 'الفاتحة', verses: 7 },
  { number: 2, name: 'البقرة', verses: 286 },
  { number: 3, name: 'آل عمران', verses: 200 },
  { number: 4, name: 'النساء', verses: 176 },
  { number: 5, name: 'المائدة', verses: 120 },
  { number: 6, name: 'الأنعام', verses: 165 },
  { number: 7, name: 'الأعراف', verses: 206 },
  { number: 8, name: 'الأنفال', verses: 75 },
  { number: 9, name: 'التوبة', verses: 129 },
  { number: 10, name: 'يونس', verses: 109 },
  { number: 11, name: 'هود', verses: 123 },
  { number: 12, name: 'يوسف', verses: 111 },
  { number: 13, name: 'الرعد', verses: 43 },
  { number: 14, name: 'إبراهيم', verses: 52 },
  { number: 15, name: 'الحجر', verses: 99 },
  { number: 16, name: 'النحل', verses: 128 },
  { number: 17, name: 'الإسراء', verses: 111 },
  { number: 18, name: 'الكهف', verses: 110 },
  { number: 19, name: 'مريم', verses: 98 },
  { number: 20, name: 'طه', verses: 135 },
  { number: 21, name: 'الأنبياء', verses: 112 },
  { number: 22, name: 'الحج', verses: 78 },
  { number: 23, name: 'المؤمنون', verses: 118 },
  { number: 24, name: 'النور', verses: 64 },
  { number: 25, name: 'الفرقان', verses: 77 },
  { number: 26, name: 'الشعراء', verses: 227 },
  { number: 27, name: 'النمل', verses: 93 },
  { number: 28, name: 'القصص', verses: 88 },
  { number: 29, name: 'العنكبوت', verses: 69 },
  { number: 30, name: 'الروم', verses: 60 },
  { number: 31, name: 'لقمان', verses: 34 },
  { number: 32, name: 'السجدة', verses: 30 },
  { number: 33, name: 'الأحزاب', verses: 73 },
  { number: 34, name: 'سبأ', verses: 54 },
  { number: 35, name: 'فاطر', verses: 45 },
  { number: 36, name: 'يس', verses: 83 },
  { number: 37, name: 'الصافات', verses: 182 },
  { number: 38, name: 'ص', verses: 88 },
  { number: 39, name: 'الزمر', verses: 75 },
  { number: 40, name: 'غافر', verses: 85 },
  { number: 41, name: 'فصلت', verses: 54 },
  { number: 42, name: 'الشورى', verses: 53 },
  { number: 43, name: 'الزخرف', verses: 89 },
  { number: 44, name: 'الدخان', verses: 59 },
  { number: 45, name: 'الجاثية', verses: 37 },
  { number: 46, name: 'الأحقاف', verses: 35 },
  { number: 47, name: 'محمد', verses: 38 },
  { number: 48, name: 'الفتح', verses: 29 },
  { number: 49, name: 'الحجرات', verses: 18 },
  { number: 50, name: 'ق', verses: 45 },
  { number: 51, name: 'الذاريات', verses: 60 },
  { number: 52, name: 'الطور', verses: 49 },
  { number: 53, name: 'النجم', verses: 62 },
  { number: 54, name: 'القمر', verses: 55 },
  { number: 55, name: 'الرحمن', verses: 78 },
  { number: 56, name: 'الواقعة', verses: 96 },
  { number: 57, name: 'الحديد', verses: 29 },
  { number: 58, name: 'المجادلة', verses: 22 },
  { number: 59, name: 'الحشر', verses: 24 },
  { number: 60, name: 'الممتحنة', verses: 13 },
  { number: 61, name: 'الصف', verses: 14 },
  { number: 62, name: 'الجمعة', verses: 11 },
  { number: 63, name: 'المنافقون', verses: 11 },
  { number: 64, name: 'التغابن', verses: 18 },
  { number: 65, name: 'الطلاق', verses: 12 },
  { number: 66, name: 'التحريم', verses: 12 },
  { number: 67, name: 'الملك', verses: 30 },
  { number: 68, name: 'القلم', verses: 52 },
  { number: 69, name: 'الحاقة', verses: 52 },
  { number: 70, name: 'المعارج', verses: 44 },
  { number: 71, name: 'نوح', verses: 28 },
  { number: 72, name: 'الجن', verses: 28 },
  { number: 73, name: 'المزمل', verses: 20 },
  { number: 74, name: 'المدثر', verses: 56 },
  { number: 75, name: 'القيامة', verses: 40 },
  { number: 76, name: 'الإنسان', verses: 31 },
  { number: 77, name: 'المرسلات', verses: 50 },
  { number: 78, name: 'النبأ', verses: 40 },
  { number: 79, name: 'النازعات', verses: 46 },
  { number: 80, name: 'عبس', verses: 42 },
  { number: 81, name: 'التكوير', verses: 29 },
  { number: 82, name: 'الإنفطار', verses: 19 },
  { number: 83, name: 'المطففين', verses: 36 },
  { number: 84, name: 'الانشقاق', verses: 25 },
  { number: 85, name: 'البروج', verses: 22 },
  { number: 86, name: 'الطارق', verses: 17 },
  { number: 87, name: 'الأعلى', verses: 19 },
  { number: 88, name: 'الغاشية', verses: 26 },
  { number: 89, name: 'الفجر', verses: 30 },
  { number: 90, name: 'البلد', verses: 20 },
  { number: 91, name: 'الشمس', verses: 15 },
  { number: 92, name: 'الليل', verses: 21 },
  { number: 93, name: 'الضحى', verses: 11 },
  { number: 94, name: 'الشرح', verses: 8 },
  { number: 95, name: 'التين', verses: 8 },
  { number: 96, name: 'العلق', verses: 19 },
  { number: 97, name: 'القدر', verses: 5 },
  { number: 98, name: 'البينة', verses: 8 },
  { number: 99, name: 'الزلزلة', verses: 8 },
  { number: 100, name: 'العاديات', verses: 11 },
  { number: 101, name: 'القارعة', verses: 11 },
  { number: 102, name: 'التكاثر', verses: 8 },
  { number: 103, name: 'العصر', verses: 3 },
  { number: 104, name: 'الهمزة', verses: 9 },
  { number: 105, name: 'الفيل', verses: 5 },
  { number: 106, name: 'قريش', verses: 4 },
  { number: 107, name: 'الماعون', verses: 7 },
  { number: 108, name: 'الكوثر', verses: 3 },
  { number: 109, name: 'الكافرون', verses: 6 },
  { number: 110, name: 'النصر', verses: 3 },
  { number: 111, name: 'المسد', verses: 5 },
  { number: 112, name: 'الإخلاص', verses: 4 },
  { number: 113, name: 'الفلق', verses: 5 },
  { number: 114, name: 'الناس', verses: 6 },
];

// value = "السورة|الآية" (label identical), the Airtable convention.
export interface VerseOption { value: string; label: string; }

let cache: VerseOption[] | null = null;

/** All «سورة|آية» options in mushaf order (6236 entries, built once). */
export function allVerseOptions(): VerseOption[] {
  if (!cache) {
    cache = [];
    for (const s of SURAHS) {
      for (let v = 1; v <= s.verses; v++) {
        const key = `${s.name}|${v}`;
        cache.push({ value: key, label: key });
      }
    }
  }
  return cache;
}

/** Split "السورة|الآية" back into its parts (null if empty/malformed). */
export function parseVerseKey(key: string): { surah: string; verse: number } | null {
  if (!key) return null;
  const idx = key.lastIndexOf('|');
  if (idx === -1) return null;
  const surah = key.slice(0, idx);
  const verse = parseInt(key.slice(idx + 1));
  if (!surah || isNaN(verse)) return null;
  return { surah, verse };
}

// ---- Global verse ordering + page derivation ----

// Cumulative verse count before each surah (index = surah number - 1).
const OFFSETS: number[] = (() => {
  const out: number[] = [];
  let acc = 0;
  for (const s of SURAHS) { out.push(acc); acc += s.verses; }
  return out;
})();

const BY_NAME = new Map(SURAHS.map(s => [s.name, s]));

/** 1-based position of (surah, verse) in mushaf order; null if unknown surah. */
export function globalVerseIndex(surahName: string, verse: number): number | null {
  const s = BY_NAME.get(surahName);
  if (!s) return null;
  return OFFSETS[s.number - 1] + verse;
}

/** Same, from a "سورة|آية" key. */
export function globalIndexOfKey(key: string): number | null {
  const ref = parseVerseKey(key);
  return ref ? globalVerseIndex(ref.surah, ref.verse) : null;
}

/**
 * The «سورة|آية» options limited to a student's chosen memorization range
 * (from the first verse of fromSurah to the last verse of toSurah).
 * Unknown surah names fall back to the full list.
 */
export function verseOptionsInRange(fromSurah: string, toSurah: string): VerseOption[] {
  const from = BY_NAME.get(fromSurah);
  const to = BY_NAME.get(toSurah);
  if (!from || !to) return allVerseOptions();
  const startG = OFFSETS[from.number - 1] + 1;                // fromSurah|1
  const endG = OFFSETS[to.number - 1] + to.verses;            // toSurah|last
  if (startG > endG) return allVerseOptions();
  // allVerseOptions() is in mushaf order, so the range is a simple slice.
  return allVerseOptions().slice(startG - 1, endG);
}

export interface MushafPageRef {
  page_number: number;
  surah_number: number;   // first surah on the page
  verse_start: number;    // its first verse there
  sort_order: number;
}

/**
 * Find the mushaf page containing a verse: the last page whose starting verse
 * (first surah + verse_start from mushaf_reference) is <= the target verse.
 * `pages` must be sorted by sort_order.
 */
export function pageOfVerse(
  pages: MushafPageRef[],
  surahName: string,
  verse: number,
): MushafPageRef | null {
  const g = globalVerseIndex(surahName, verse);
  if (g == null || pages.length === 0) return null;
  let found: MushafPageRef | null = null;
  for (const p of pages) {
    const start = OFFSETS[p.surah_number - 1] + p.verse_start;
    if (start <= g) found = p;
    else break;
  }
  return found;
}
