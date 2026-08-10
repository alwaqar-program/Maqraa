import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Saves and restores the window scroll position across navigations.
 *
 * The key derives from the current URL (pathname + search) so each
 * filtered/paginated view has its own remembered scroll position.
 *
 * Usage:
 *   const { saveScroll, attemptRestore } = useScrollRestoration('applicants');
 *
 *   // Save before navigating to a detail page
 *   const onRowClick = (id) => { saveScroll(); navigate(`/applicants/${id}`); };
 *
 *   // Restore after the data finishes loading
 *   useEffect(() => { if (!loading) attemptRestore(); }, [loading]);
 *
 * After a successful restore the entry is consumed (removed from
 * sessionStorage) so a later, unrelated mount of the same page does not
 * scroll unexpectedly.
 */
export function useScrollRestoration(prefix: string) {
  const location = useLocation();
  const key = `scroll-${prefix}-${location.pathname}${location.search}`;

  const saveScroll = useCallback(() => {
    sessionStorage.setItem(key, String(window.scrollY));
  }, [key]);

  const attemptRestore = useCallback(() => {
    const saved = sessionStorage.getItem(key);
    if (saved == null) return;
    const target = parseInt(saved, 10);
    if (Number.isNaN(target)) return;
    // Wait one frame for the DOM to paint the just-loaded rows, otherwise
    // the document is still shorter than the target offset.
    requestAnimationFrame(() => {
      window.scrollTo(0, target);
      sessionStorage.removeItem(key);
    });
  }, [key]);

  return { saveScroll, attemptRestore };
}
