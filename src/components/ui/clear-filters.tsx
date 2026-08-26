import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FilterX } from 'lucide-react';

/** مفاتيح لا تُحسب فلترًا (تبويب أو هوية صف) */
const IGNORED = ['tab', 'form', 'student', 'row'];

/**
 * زر «مسح الفلاتر» — يظهر فقط عند وجود فلاتر فعلية في الرابط،
 * ويعرض عددها كي تعرف المستخدمة أن ما تراه مُصفّى (وأن الفلاتر تُستعاد تلقائيًا).
 */
export function ClearFilters({ className = '' }: { className?: string }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const active = [...params.keys()].filter(k => !IGNORED.includes(k));
  if (!active.length) return null;
  return (
    <Button variant="ghost" size="sm" className={`gap-1 text-muted-foreground ${className}`}
      title="إعادة الصفحة بلا أي فلتر"
      onClick={() => navigate({ pathname, search: '' }, { replace: true })}>
      <FilterX size={14} /> مسح الفلاتر ({active.length})
    </Button>
  );
}
