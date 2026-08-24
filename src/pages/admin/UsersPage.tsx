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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Shield, X, UserPlus, Copy } from 'lucide-react';
import { AppRole } from '@/contexts/AuthContext';

interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  roles: AppRole[];
}

interface LinkCandidate { id: string; full_name: string; email: string | null; }

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'مديرة النظام', teacher: 'مسمعة', supervisor: 'مشرفة',
  student: 'طالبة', report_viewer: 'مُطّلع تقارير',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<{ u: UserRow; role: AppRole } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cForm, setCForm] = useState({ role: 'teacher' as AppRole, email: '', password: '', linkId: '' });
  const [candidates, setCandidates] = useState<{ teachers: LinkCandidate[]; students: LinkCandidate[] }>({ teachers: [], students: [] });
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
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

  const fetchCandidates = useCallback(async () => {
    const [t, s] = await Promise.all([
      supabase.from('teachers').select('id, full_name, email').is('user_id', null).order('full_name'),
      supabase.from('students').select('id, full_name, email').is('user_id', null).order('full_name'),
    ]);
    setCandidates({ teachers: (t.data as LinkCandidate[]) || [], students: (s.data as LinkCandidate[]) || [] });
  }, []);
  useEffect(() => { if (createOpen) fetchCandidates(); }, [createOpen, fetchCandidates]);

  const linkList = cForm.role === 'teacher' ? candidates.teachers : cForm.role === 'student' ? candidates.students : null;

  const pickLink = (id: string) => {
    const row = linkList?.find(c => c.id === id);
    setCForm(f => ({ ...f, linkId: id, email: row?.email?.trim() || f.email }));
  };

  const createUser = async () => {
    const email = cForm.email.trim();
    if (!email) { toast({ title: 'البريد الإلكتروني مطلوب', variant: 'destructive' }); return; }
    setCreating(true);
    const body: Record<string, unknown> = { email, role: cForm.role };
    if (cForm.password.trim()) body.password = cForm.password.trim();
    if (linkList && cForm.linkId) body.link = { table: cForm.role === 'teacher' ? 'teachers' : 'students', id: cForm.linkId };
    const { data, error } = await supabase.functions.invoke('admin-create-user', { body });
    setCreating(false);
    const r = data?.results?.[0];
    if (error || !r?.ok) {
      let msg = r?.error || 'تعذر إنشاء الحساب';
      if (error) {
        msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx?.json) { try { msg = (await ctx.json()).error || msg; } catch { /* keep msg */ } }
      }
      toast({ title: 'خطأ', description: msg, variant: 'destructive' });
      return;
    }
    setCreateOpen(false);
    setCForm({ role: 'teacher', email: '', password: '', linkId: '' });
    setCreated({ email: r.email, password: r.password });
    fetchAll();
  };

  const copyCredentials = () => {
    if (!created) return;
    navigator.clipboard.writeText(`الرابط: ${window.location.origin}\nالبريد: ${created.email}\nكلمة المرور: ${created.password}`);
    toast({ title: 'نُسخت بيانات الدخول' });
  };

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
        <Button className="ms-auto gap-1" onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} /> إنشاء حساب
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        التسجيل الذاتي معطّل — إنشاء الحسابات يتم من هنا حصرًا، وإسناد الأدوار وإزالتها فوري.
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

      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) setCForm({ role: 'teacher', email: '', password: '', linkId: '' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء حساب جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={cForm.role} onValueChange={v => setCForm(f => ({ ...f, role: v as AppRole, linkId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {linkList && (
              <div className="space-y-2">
                <Label>ربط الحساب بـ{cForm.role === 'teacher' ? 'مسمعة' : 'طالبة'} (بلا حساب)</Label>
                <Select value={cForm.linkId} onValueChange={pickLink}>
                  <SelectTrigger><SelectValue placeholder="اختياري — اختاري من القائمة" /></SelectTrigger>
                  <SelectContent>
                    {linkList.length === 0 && <SelectItem value="_none" disabled>لا يوجد صفوف بلا حساب</SelectItem>}
                    {linkList.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input dir="ltr" type="email" value={cForm.email} onChange={e => setCForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <Input dir="ltr" value={cForm.password} onChange={e => setCForm(f => ({ ...f, password: e.target.value }))} placeholder="تُولَّد تلقائيًا إن تُركت فارغة" />
            </div>
          </div>
          <DialogFooter className="justify-start gap-2">
            <Button onClick={createUser} disabled={creating}>{creating ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}</Button>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={o => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>أُنشئ الحساب بنجاح</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>انسخي بيانات الدخول الآن — <span className="font-medium text-destructive">كلمة المرور لن تظهر مرة أخرى</span>.</p>
            <div className="rounded-md border p-3 space-y-1" dir="ltr">
              <p><span className="text-muted-foreground">البريد: </span><span className="font-medium">{created?.email}</span></p>
              <p><span className="text-muted-foreground">كلمة المرور: </span><span className="font-medium">{created?.password}</span></p>
            </div>
          </div>
          <DialogFooter className="justify-start gap-2">
            <Button onClick={copyCredentials} className="gap-1"><Copy size={14} /> نسخ بيانات الدخول</Button>
            <Button variant="outline" onClick={() => setCreated(null)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
