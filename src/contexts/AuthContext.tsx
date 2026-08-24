import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// أدوار مقرأة الوقار — لا signUp في هذا النظام إطلاقًا (الحسابات تُنشأ من الإدارة)
export type AppRole = 'super_admin' | 'admin' | 'teacher' | 'supervisor' | 'student' | 'report_viewer';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  /** الوجهة الرئيسية حسب الدور */
  homePath: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function homePathForRoles(roles: AppRole[]): string {
  if (roles.includes('admin') || roles.includes('super_admin')) return '/';
  if (roles.includes('teacher')) return '/teacher';
  if (roles.includes('supervisor')) return '/supervisor';
  if (roles.includes('student')) return '/me';
  if (roles.includes('report_viewer')) return '/reports';
  return '/login';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  // آخر مستخدم حُمِّلت أدواره — كي لا تُعاد شاشة التحميل عند تجديد التوكن
  // (العودة للتبويب تُطلق onAuthStateChange لنفس المستخدم فتفكّك الصفحة وتفقد مكانها)
  const rolesForUser = useRef<string | null>(null);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (data) {
      const rs = data.map(r => r.role as AppRole);
      // المديرة العليا ترث admin تلقائيًا — كل فحوص المسارات والقوائم تمر دون تعديلها
      if (rs.includes('super_admin') && !rs.includes('admin')) rs.unshift('admin');
      setRoles(rs);
    }
    rolesForUser.current = userId;
    setRolesLoaded(true);
  };

  useEffect(() => {
    const handleSession = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        if (rolesForUser.current !== session.user.id) {
          setRolesLoaded(false);
          const userId = session.user.id;
          setTimeout(() => fetchRoles(userId), 0);
        }
      } else {
        rolesForUser.current = null;
        setRoles([]);
        setRolesLoaded(true);
      }
      setAuthLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => handleSession(session)
    );

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole('admin');
  const homePath = homePathForRoles(roles);
  // لا يكتمل التحميل قبل معرفة الأدوار — وإلا رُفض المسار قبل وصولها
  const loading = authLoading || (!!user && !rolesLoaded);

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, signIn, signOut, hasRole, isAdmin, homePath }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
