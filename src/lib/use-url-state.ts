import { useSearchParams } from 'react-router-dom';

/**
 * حالة مخزنة في رابط الصفحة (?q=...) بدل useState —
 * فتُحفظ الفلاتر والبحث والتبويب عند فتح ملفٍ ما والرجوع للخلف.
 * القيمة الافتراضية لا تُكتب في الرابط.
 */
export function useUrlState(key: string, defaultValue = ''): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const set = (v: string) =>
    setParams(prev => {
      const p = new URLSearchParams(prev);
      if (!v || v === defaultValue) p.delete(key); else p.set(key, v);
      return p;
    }, { replace: true });
  return [value, set];
}
