import { useSearchParams } from 'react-router-dom';

export type SortDir = 'asc' | 'desc';
export type SortType = 'text' | 'number' | 'date' | 'boolean';

// Collator for Arabic-aware text sorting (أ، ب، ت …) with numeric handling.
const collator = new Intl.Collator('ar', { sensitivity: 'base', numeric: true });

/**
 * Column sorting backed by the URL (?sort=<key>&dir=asc|desc), so the chosen
 * sort survives navigating into a row's detail page and back — exactly like
 * the page filters. Clicking a header cycles: asc → desc → cleared (default).
 *
 * When no `sort` param is present the page keeps its own default ordering.
 */
export function useTableSort() {
  const [params, setParams] = useSearchParams();
  const sortKey = params.get('sort');
  const sortDir: SortDir = params.get('dir') === 'desc' ? 'desc' : 'asc';

  const toggleSort = (key: string) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      const curKey = p.get('sort');
      const curDir = p.get('dir') === 'desc' ? 'desc' : 'asc';
      if (curKey !== key) {
        p.set('sort', key); p.set('dir', 'asc');
      } else if (curDir === 'asc') {
        p.set('sort', key); p.set('dir', 'desc');
      } else {
        p.delete('sort'); p.delete('dir'); // third click → back to default order
      }
      p.delete('page'); // sorting changes the order, so reset pagination
      return p;
    }, { replace: true });
  };

  return { sortKey, sortDir, toggleSort };
}

/**
 * Returns a new array sorted by `accessor`. Blank/null values always sort last
 * regardless of direction. Pass through unchanged when there is no active key.
 */
export function sortRows<T>(
  rows: T[],
  accessor: (r: T) => unknown,
  dir: SortDir,
  type: SortType
): T[] {
  const factor = dir === 'desc' ? -1 : 1;
  return [...rows].sort((x, y) => {
    const a = accessor(x);
    const b = accessor(y);
    const aBlank = a == null || a === '';
    const bBlank = b == null || b === '';
    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;
    let cmp: number;
    switch (type) {
      case 'number': cmp = Number(a) - Number(b); break;
      case 'date': cmp = new Date(a as string).getTime() - new Date(b as string).getTime(); break;
      case 'boolean': cmp = (a ? 1 : 0) - (b ? 1 : 0); break;
      default: cmp = collator.compare(String(a), String(b));
    }
    return factor * cmp;
  });
}
