import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/** مفاتيح لا تُحفظ: هوية صف أو رمز، إعادتها لاحقًا تُضلّل بدل أن تفيد */
const VOLATILE = ['student', 'row', 'token', 'id'];

const filterKey = (pathname: string) => `flt:${pathname}`;
const scrollKey = (key: string) => `scr:${key}`;

/** يستبعد المفاتيح المؤقتة من النص المحفوظ */
function persistable(search: string): string {
  const p = new URLSearchParams(search);
  VOLATILE.forEach(k => p.delete(k));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * ذاكرة الفلاتر: آخر فلاتر استخدمتها المستخدمة في كل صفحة تُعاد تلقائيًا
 * عند العودة إليها من القائمة (لا من زر الرجوع — الرابط هناك يحملها أصلًا).
 * ومسحها يدويًا يُنسي النظام إياها فلا تعود بعد أن ألغيتِها.
 */
export function FilterMemory() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const hadSearch = useRef<Record<string, boolean>>({});
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    // مغادرة الصفحة تُنسي «أنها كانت مفلترة في هذه الزيارة»،
    // فالعودة إليها لاحقًا تستعيد فلاترها بدل أن تُقرأ كمسح متعمد
    if (prevPath.current && prevPath.current !== pathname) {
      delete hadSearch.current[prevPath.current];
    }
    prevPath.current = pathname;
    const key = filterKey(pathname);
    const keep = persistable(search);
    if (keep) {
      sessionStorage.setItem(key, keep);
      hadSearch.current[pathname] = true;
      return;
    }
    // مسح متعمد بعد أن كانت هناك فلاتر في هذه الزيارة → لا نعيدها
    if (hadSearch.current[pathname]) { sessionStorage.removeItem(key); return; }
    const saved = sessionStorage.getItem(key);
    if (saved && !search) {
      hadSearch.current[pathname] = true;
      navigate({ pathname, search: saved }, { replace: true });
    }
  }, [pathname, search, navigate]);

  return null;
}

/**
 * ذاكرة موضع التمرير: الرجوع للخلف يعيدك إلى نفس المكان الذي كنت فيه،
 * والانتقال لصفحة جديدة يبدأ من أعلاها.
 */
export function ScrollMemory() {
  const location = useLocation();
  const navType = useNavigationType();

  // حفظ الموضع باستمرار لهذه الصفحة في تاريخ التنقل
  useEffect(() => {
    const save = () => {
      sessionStorage.setItem(scrollKey(location.key), String(window.scrollY));
    };
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; save(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // إغلاق التبويب أو تصغيره لا يمر بالتنظيف — نحفظ الموضع فيهما أيضًا
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
      save();   // الأهم: يُنفَّذ عند مغادرة الصفحة فيحفظ موضعها قبل الانتقال
    };
  }, [location.key]);

  // الاستعادة: بعد رسم الصفحة (المحتوى يُجلب بعد التركيب، فنحاول مرات قليلة)
  useEffect(() => {
    if (navType === 'PUSH') { window.scrollTo(0, 0); return; }
    const y = Number(sessionStorage.getItem(scrollKey(location.key)) ?? 0);
    if (!y) return;
    let tries = 0;
    const tick = () => {
      window.scrollTo(0, y);
      if (++tries < 8 && Math.abs(window.scrollY - y) > 2) setTimeout(tick, 80);
    };
    tick();
  }, [location.key, navType]);

  return null;
}
