// أدوات إضافية فوق quran-verses.ts — مقرأة الوقار
import { SURAHS, parseVerseKey } from './quran-verses';

/** اسم السورة → رقمها */
export function surahNumberOf(name: string): number | null {
  return SURAHS.find(s => s.name === name)?.number ?? null;
}

/** رقم السورة → اسمها */
export function surahNameOf(num: number): string {
  return SURAHS.find(s => s.number === num)?.name ?? String(num);
}

/** مفتاح "سورة|آية" → صف قاعدة البيانات {from_surah:number, from_verse} */
export function keyToDb(key: string): { surah: number; verse: number } | null {
  const parsed = parseVerseKey(key);
  if (!parsed) return null;
  const num = surahNumberOf(parsed.surah);
  if (!num) return null;
  return { surah: num, verse: parsed.verse };
}

/** الفهرس العالمي (1..6236) → مفتاح "سورة|آية" */
export function indexToKey(gidx: number): string | null {
  let offset = 0;
  for (const s of SURAHS) {
    if (gidx <= offset + s.verses) return `${s.name}|${gidx - offset}`;
    offset += s.verses;
  }
  return null;
}

/** الآية التالية لمفتاح — لبدء السرد من حيث توقفت الطالبة (يلف للفاتحة بعد الناس) */
export function nextVerseKey(surahNum: number, verse: number): string {
  const s = SURAHS.find(x => x.number === surahNum);
  if (!s) return 'الفاتحة|1';
  if (verse < s.verses) return `${s.name}|${verse + 1}`;
  const next = SURAHS.find(x => x.number === surahNum + 1);
  return next ? `${next.name}|1` : 'الفاتحة|1';
}
