import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HelpCircle, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { GENERAL_STEPS, TOUR_ENABLED, TOUR_VERSION, WHATS_NEW, stepsForPath, TourStep } from '@/lib/tour-steps';

const SEEN_VERSION = 'tourSeenVersion';
const SEEN_GENERAL = 'tourSeenGeneral';

interface Rect { top: number; left: number; width: number; height: number }
interface Ctx { start: () => void; hasNew: boolean }
const TourCtx = createContext<Ctx>({ start: () => {}, hasNew: false });
export const useTour = () => useContext(TourCtx);

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** خطوة «ما الجديد» تُبنى من قائمة التحديثات */
function whatsNewStep(): TourStep {
  const body = WHATS_NEW.map(g => `${g.date}\n${g.items.map(i => `• ${i}`).join('\n')}`).join('\n\n');
  return { title: 'ما الجديد في النظام', body };
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const seenVersion = Number(localStorage.getItem(SEEN_VERSION) ?? 0);
  const hasNew = seenVersion < TOUR_VERSION;

  const start = useCallback(() => {
    const page = stepsForPath(pathname);
    const general = localStorage.getItem(SEEN_GENERAL) ? [] : GENERAL_STEPS;
    const news = Number(localStorage.getItem(SEEN_VERSION) ?? 0) < TOUR_VERSION ? [whatsNewStep()] : [];
    const list = [...news, ...general, ...page];
    setSteps(list.length ? list : [{ title: 'هذه الصفحة', body: 'لا شرح مخصص لها بعد — علامة الاستفهام تشرح الصفحات الرئيسية.' }]);
    setI(0);
  }, [pathname]);

  const end = useCallback(() => {
    localStorage.setItem(SEEN_VERSION, String(TOUR_VERSION));
    localStorage.setItem(SEEN_GENERAL, '1');
    setSteps(null); setRect(null);
  }, []);

  // أول زيارة للنظام: تبدأ الجولة تلقائيًا مرة واحدة
  useEffect(() => {
    if (TOUR_ENABLED && !localStorage.getItem(SEEN_GENERAL)) {
      const t = setTimeout(start, 900);
      return () => clearTimeout(t);
    }
  }, [start]);

  const step = steps?.[i];

  // تحديد موضع العنصر المشروح ومتابعته عند التمرير أو تغيير القياس
  useEffect(() => {
    if (!step) return;
    if (!step.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const t = setTimeout(measure, 320);          // بعد انتهاء التمرير
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [step]);

  const next = useCallback(() => {
    if (!steps) return;
    if (i + 1 >= steps.length) end(); else setI(i + 1);
  }, [steps, i, end]);
  const prev = useCallback(() => setI(v => Math.max(0, v - 1)), []);

  // لوحة المفاتيح: يسار للتالي ويمين للسابق (اتجاه القراءة العربي)، Esc للإنهاء
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); end(); }
      else if (e.key === 'ArrowLeft' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    tipRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [step, next, prev, end]);

  // موضع البطاقة: تحت العنصر إن وُجد متسع، وإلا فوقه، وإلا وسط الشاشة
  const tipStyle = useMemo((): React.CSSProperties => {
    const W = 340;
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: W };
    const below = rect.top + rect.height + 12;
    const fitsBelow = below + 190 < window.innerHeight;
    const top = fitsBelow ? below : Math.max(12, rect.top - 200);
    const left = Math.min(
      Math.max(12, rect.left + rect.width - W),      // محاذاة لحافة العنصر اليمنى (RTL)
      window.innerWidth - W - 12,
    );
    return { top, left, width: W };
  }, [rect]);

  return (
    <TourCtx.Provider value={{ start, hasNew }}>
      {children}

      {step && (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
          {/* التعتيم مع فتحة حول العنصر — أو تعتيم كامل للخطوات العامة */}
          {rect ? (
            <div className="absolute rounded-xl ring-2 ring-accent pointer-events-none"
              style={{
                top: rect.top - 6, left: rect.left - 6,
                width: rect.width + 12, height: rect.height + 12,
                boxShadow: '0 0 0 9999px hsl(20 14% 8% / 0.62)',
                transition: reducedMotion() ? 'none' : 'all .25s ease',
              }} />
          ) : (
            <div className="absolute inset-0" style={{ background: 'hsl(20 14% 8% / 0.62)' }} />
          )}

          {/* حاجز يمنع العبث بالصفحة أثناء الجولة */}
          <div className="absolute inset-0" onClick={next} />

          <div ref={tipRef} tabIndex={-1} className="absolute bg-card border rounded-xl shadow-2xl p-4 space-y-3 outline-none"
            style={tipStyle} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-lg leading-tight">{step.title}</h2>
              <button type="button" onClick={end} aria-label="إنهاء الجولة"
                className="text-muted-foreground hover:text-foreground shrink-0">
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground max-h-56 overflow-y-auto">
              {step.body}
            </p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">
                {(i + 1).toLocaleString('ar-EG')} / {steps.length.toLocaleString('ar-EG')}
              </span>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={end}>إنهاء الجولة</Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={prev} disabled={i === 0}>
                  <ChevronRight size={14} /> السابق
                </Button>
                <Button size="sm" className="gap-1" onClick={next}>
                  {i + 1 >= steps.length ? 'تم' : 'التالي'} <ChevronLeft size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </TourCtx.Provider>
  );
}

/** علامة الاستفهام — تشرح الصفحة الحالية، وعليها نقطة عند وجود خصائص جديدة */
export function HelpButton() {
  const { start, hasNew } = useTour();
  if (!TOUR_ENABLED) return null;
  return (
    <button type="button" data-tour="help" onClick={start}
      title="جولة تعريفية بهذه الصفحة"
      className="fixed top-3 left-3 z-40 w-9 h-9 rounded-full bg-card border shadow-sm
                 flex items-center justify-center text-muted-foreground
                 hover:text-accent-foreground hover:border-accent transition-colors print:hidden">
      <HelpCircle size={18} />
      {hasNew && <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-accent" />}
      <span className="sr-only">جولة تعريفية</span>
    </button>
  );
}
