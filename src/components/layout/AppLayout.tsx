import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileBarChart,
  Users,
  GraduationCap,
  BookOpen,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Mic,
  ClipboardCheck,
  FileCheck,
  Shield,
  FileSignature,
  AlertTriangle,
  UserPlus,
  CalendarClock,
  CalendarCheck,
  History,
  CalendarDays,
  Route,
  CalendarRange,
  Presentation,
  MessageSquarePlus,
  Award,
  ScrollText,
  Home,
  FileEdit,
  ListOrdered,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import logoAlwaqar from '@/assets/logo-alwaqar.png';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  roles: AppRole[]; // allowlist: يظهر فقط لهذه الأدوار
}

// قوائم التنقل حسب الدور — مقرأة الوقار
const navItems: NavItem[] = [
  // الإدارة
  { label: 'لوحة المعلومات', href: '/', icon: <LayoutDashboard size={20} />, roles: ['admin'] },
  { label: 'الطالبات', href: '/students', icon: <Users size={20} />, roles: ['admin'] },
  { label: 'المسمعات', href: '/teachers', icon: <GraduationCap size={20} />, roles: ['admin'] },
  { label: 'المتقدمات', href: '/applicants', icon: <UserPlus size={20} />, roles: ['admin'] },
  { label: 'فرز الطالبات', href: '/sorting', icon: <ListOrdered size={20} />, roles: ['admin'] },
  { label: 'الحلقات', href: '/circles', icon: <CalendarClock size={20} />, roles: ['admin'] },
  { label: 'تقرير الحلقات', href: '/circles-report', icon: <CalendarCheck size={20} />, roles: ['admin', 'supervisor', 'report_viewer'] },
  { label: 'التسميع', href: '/recitation', icon: <Mic size={20} />, roles: ['admin'] },
  { label: 'الحضور', href: '/attendance', icon: <ClipboardCheck size={20} />, roles: ['admin'] },
  { label: 'الاختبارات', href: '/exams', icon: <FileCheck size={20} />, roles: ['admin'] },
  { label: 'المسارات', href: '/tracks', icon: <Route size={20} />, roles: ['admin'] },
  { label: 'الفصول', href: '/seasons', icon: <CalendarRange size={20} />, roles: ['admin'] },
  { label: 'الاستضافات', href: '/hostings', icon: <Presentation size={20} />, roles: ['admin'] },
  { label: 'التعهدات', href: '/pledges', icon: <FileSignature size={20} />, roles: ['admin'] },
  { label: 'المخالفات', href: '/violations', icon: <AlertTriangle size={20} />, roles: ['admin'] },
  { label: 'الاقتراحات', href: '/suggestions', icon: <MessageSquarePlus size={20} />, roles: ['admin'] },
  { label: 'الشهادات', href: '/certificates', icon: <Award size={20} />, roles: ['admin'] },
  { label: 'التقارير', href: '/reports', icon: <FileBarChart size={20} />, roles: ['admin', 'report_viewer'] },
  { label: 'الإحصائية الشهرية', href: '/monthly-report', icon: <CalendarDays size={20} />, roles: ['admin', 'report_viewer'] },
  { label: 'سجل النشاط', href: '/activity-log', icon: <ScrollText size={20} />, roles: ['admin'] },
  { label: 'المستخدمون', href: '/users', icon: <Shield size={20} />, roles: ['admin'] },
  { label: 'النماذج', href: '/forms', icon: <FileEdit size={20} />, roles: ['admin'] },
  { label: 'الإعدادات', href: '/settings', icon: <Settings size={20} />, roles: ['admin'] },
  // المسمعة
  { label: 'جلساتي', href: '/teacher', icon: <Home size={20} />, roles: ['teacher'] },
  { label: 'أوقات توفري', href: '/teacher/availability', icon: <CalendarClock size={20} />, roles: ['teacher'] },
  { label: 'تسجيل التسميع', href: '/teacher/tasmee', icon: <Mic size={20} />, roles: ['teacher'] },
  { label: 'الحضور', href: '/teacher/attendance', icon: <ClipboardCheck size={20} />, roles: ['teacher'] },
  { label: 'الاختبارات', href: '/teacher/exams', icon: <FileCheck size={20} />, roles: ['teacher'] },
  { label: 'طالباتي', href: '/teacher/students', icon: <Users size={20} />, roles: ['teacher'] },
  { label: 'اقتراحاتي', href: '/teacher/suggestions', icon: <MessageSquarePlus size={20} />, roles: ['teacher'] },
  // المشرفة
  { label: 'متابعة الحلقات', href: '/supervisor', icon: <LayoutDashboard size={20} />, roles: ['supervisor'] },
  { label: 'الاقتراحات', href: '/suggestions', icon: <MessageSquarePlus size={20} />, roles: ['supervisor'] },
  // الطالبة
  { label: 'رحلتي مع القرآن', href: '/me', icon: <Home size={20} />, roles: ['student'] },
  { label: 'سردي الذاتي', href: '/me/sard', icon: <BookOpen size={20} />, roles: ['student'] },
  { label: 'حلقتي', href: '/me/circle', icon: <CalendarCheck size={20} />, roles: ['student'] },
  { label: 'سجلي', href: '/me/history', icon: <History size={20} />, roles: ['student'] },
  { label: 'تعهداتي', href: '/me/pledges', icon: <FileSignature size={20} />, roles: ['student'] },
  { label: 'الاستضافات', href: '/me/hostings', icon: <Presentation size={20} />, roles: ['student'] },
  { label: 'اقتراحاتي', href: '/me/suggestions', icon: <MessageSquarePlus size={20} />, roles: ['student'] },
];

const roleLabels: Record<AppRole, string> = {
  super_admin: 'المديرة العليا',
  admin: 'إدارة المقرأة',
  teacher: 'مسمعة',
  supervisor: 'مشرفة',
  student: 'طالبة',
  report_viewer: 'مُطّلع التقارير',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut, roles } = useAuth();
  const location = useLocation();
  // على الآيباد (768–1279) تبدأ القائمة مطوية شريط أيقونات؛ وعلى الشاشات الواسعة ممددة
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches);
  const [mobileOpen, setMobileOpen] = useState(false);

  // أغلق القائمة الجوّالة عند أي تنقّل — يمنع بقاء طبقة التعتيم عالقة فوق الصفحة
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const filteredItems = navItems.filter(item => item.roles.some(r => roles.includes(r)));

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full z-50 book-cover text-sidebar-foreground flex flex-col transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
        )}
      >
        {/* علامة المصحف الذهبية — توقيع الهوية */}
        <span className="ribbon left-5" aria-hidden="true" />

        {/* Logo */}
        <div className={cn('flex items-center gap-3 p-4 border-b border-sidebar-border', collapsed && 'justify-center')}>
          <img src={logoAlwaqar} alt="شعار الوقار" className="w-9 h-9 object-contain shrink-0" />
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="font-display text-lg leading-tight">مقرأة الوقار</h2>
              <p className="text-xs text-sidebar-primary/90">«كان عمله ديمة»</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {filteredItems.map(item => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                title={collapsed ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-primary'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  collapsed && 'justify-center px-0'
                )}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className={cn('p-3 border-t border-sidebar-border', collapsed && 'flex flex-col items-center')}>
          {!collapsed && (
            <div className="mb-2 px-2">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs text-sidebar-foreground/60">
                {roles
                  .filter(r => !(r === 'admin' && roles.includes('super_admin')))
                  .map(r => roleLabels[r] || r).join('، ')}
              </p>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full"
          >
            <LogOut size={18} />
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute top-4 -left-3 w-6 h-6 rounded-full bg-card border border-border items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={14} className={cn('transition-transform', collapsed && 'rotate-180')} />
        </button>
      </aside>

      {/* Main content */}
      <main className={cn('flex-1 transition-all duration-300', collapsed ? 'md:mr-16' : 'md:mr-64')}>
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </Button>
          <img src={logoAlwaqar} alt="شعار الوقار" className="w-8 h-8 object-contain" />
          <div className="w-10" />
        </header>

        <div className="p-4 md:p-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
