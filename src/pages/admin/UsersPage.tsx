import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Shield, X } from 'lucide-react';
import { AppRole } from '@/contexts/AuthContext';

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: AppRole[];
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'مديرة النظام', teacher: 'مسمعة', supervisor: 'مشرفة',
  student: 'طالبة', report_viewer: 'مُطّلع تقارير',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<{ u: UserRow; role: AppRole } | null>(null);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: userRows, error }, { data: roleRows }] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('user_roles').select('user_id, role'),
    ]);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); setLoading(false); return; }
    setUsers((userRows || []).map((u: any) => ({
      ...u,
      roles: (roleRows || []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role as AppRole),
    })));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addRole = async (u: UserRow, role: AppRole) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: u.id, role });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `أُسند دور «${ROLE_LABELS[role]}» إلى ${u.email}` }); fetchAll(); }
  };

  const removeRole = async () => {
    if (!removing) return;
    const { u, role } = removing;
    setRemoving(null);
    const { error } = await supabase.from('user_roles').delete().eq('user_id', u.id).eq('role', role);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: `أُزيل دور «${ROLE_LABELS[role]}» من ${u.email}` }); fetchAll(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="text-accent" />
        <h1 className="text-2xl font-display">المستخدمون</h1>
        <Badge variant="outline">{users.length}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        التسجيل الذاتي معطّل — إنشاء الحسابات يتم من هنا حصرًا (زر الإنشاء يُفعّل بعد نشر دالة الخادم)،
        وإسناد الأدوار وإزالتها فوري.
      </p>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البريد</TableHead>
                  <TableHead>الأدوار</TableHead>
                  <TableHead>إسناد دور</TableHead>
                  <TableHead>آخر دخول</TableHead>
                  <TableHead>أُنشئ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell dir="ltr" className="font-medium">{u.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 && <span className="text-muted-foreground text-sm">بلا دور</span>}
                        {u.roles.map(r => (
                          <Badge key={r} variant={r === 'admin' ? 'default' : 'outline'} className="gap-1">
                            {ROLE_LABELS[r] ?? r}
                            <button onClick={() => setRemoving({ u, role: r })} title="إزالة الدور">
                              <X size={11} />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value="" onValueChange={v => addRole(u, v as AppRole)}>
                        <SelectTrigger className="w-36"><SelectValue placeholder="+ دور" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ROLE_LABELS) as AppRole[])
                            .filter(r => !u.roles.includes(r))
                            .map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_sign_in_at ? u.last_sign_in_at.slice(0, 16).replace('T', ' ') : 'لم يدخل'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.created_at.slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إزالة الدور</AlertDialogTitle>
            <AlertDialogDescription>
              سيُزال دور «{removing && ROLE_LABELS[removing.role]}» من {removing?.u.email} — سيفقد صلاحياته فورًا.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={removeRole}>إزالة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
