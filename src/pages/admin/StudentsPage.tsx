import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SortableHead } from '@/components/ui/sortable-head';
import { useTableSort, sortRows, SortType } from '@/lib/use-table-sort';
import { useUrlState } from '@/lib/use-url-state';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Users, Search } from 'lucide-react';

interface Student {
  id: string;
  full_name: string;
  national_id: string;
  phone: string | null;
  email: string | null;
  track_id: string | null;
  track_name?: string;
  is_active: boolean;
  user_id: string | null;
  khatmat?: number;
}
interface Track { id: string; name: string; }

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useUrlState('q');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState({ full_name: '', national_id: '', phone: '', email: '', track_id: '' });
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: rows, error }, { data: trackRows }, { data: tasmee }, { data: sard }] = await Promise.all([
      supabase.from('students').select('*, tracks(name)').order('full_name'),
      supabase.from('tracks').select('id, name').eq('is_active', true).order('sort_order'),
      supabase.from('teacher_recitation_log').select('student_id, pages').eq('is_deleted', false),
      supabase.from('self_recitation_log').select('student_id, pages').eq('is_deleted', false),
    ]);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    // الختمات = مجموع صفحات (التسميع + السرد) ÷ 604
    const pagesBy: Record<string, number> = {};
    [...(tasmee || []), ...(sard || [])].forEach((l: any) => {
      pagesBy[l.student_id] = (pagesBy[l.student_id] ?? 0) + Number(l.pages || 0);
    });
    setStudents((rows || []).map((r: any) => ({
      ...r, track_name: r.tracks?.name,
      khatmat: Math.floor((pagesBy[r.id] ?? 0) / 604),
    })));
    setTracks(trackRows || []);
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ full_name: '', national_id: '', phone: '', email: '', track_id: '' });
    setDialogOpen(true);
  };
  const openEdit = (s: Student) => {
    setEditing(s);
    setForm({
      full_name: s.full_name, national_id: s.national_id,
      phone: s.phone ?? '', email: s.email ?? '', track_id: s.track_id ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.national_id.trim()) {
      toast({ title: 'الاسم ورقم الهوية مطلوبان', variant: 'destructive' }); return;
    }
    const payload = {
      full_name: form.full_name, national_id: form.national_id,
      phone: form.phone || null, email: form.email || null,
      track_id: form.track_id || null,
    };
    const q = editing
      ? supabase.from('students').update(payload).eq('id', editing.id)
      : supabase.from('students').insert(payload);
    const { error } = await q;
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'تم تحديث الطالبة' : 'تمت إضافة الطالبة' });
    setDialogOpen(false);
    fetchAll();
  };

  const toggleActive = async (s: Student) => {
    const { error } = await supabase.from('students').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const SORTS: Record<string, { get: (r: Student) => unknown; type: SortType }> = {
    name: { get: r => r.full_name, type: 'text' },
    nid: { get: r => r.national_id, type: 'text' },
    phone: { get: r => r.phone, type: 'text' },
    track: { get: r => r.track_name, type: 'text' },
    account: { get: r => !!r.user_id, type: 'boolean' },
    active: { get: r => r.is_active, type: 'boolean' },
    khatmat: { get: r => r.khatmat, type: 'number' },
  };
  let filtered = students.filter(s =>
    !search || s.full_name.includes(search) || s.national_id.includes(search) || (s.phone ?? '').includes(search)
  );
  if (sortKey && SORTS[sortKey]) filtered = sortRows(filtered, SORTS[sortKey].get, sortDir, SORTS[sortKey].type);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="text-accent" />
          <h1 className="text-2xl font-display">الطالبات</h1>
          <Badge variant="outline">{students.length}</Badge>
        </div>
        <Button onClick={openCreate}><Plus size={16} className="ml-1" /> طالبة جديدة</Button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute right-3 top-3 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث بالاسم أو الهوية أو الجوال" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="الاسم" sortKey="name" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الهوية" sortKey="nid" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الجوال" sortKey="phone" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="المسار" sortKey="track" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="الختمات" sortKey="khatmat" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="حساب دخول" sortKey="account" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <SortableHead label="نشطة" sortKey="active" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}
                    className={(s.khatmat ?? 0) >= 1 ? 'bg-accent/15 hover:bg-accent/25' : undefined}>
                    <TableCell className="font-medium">
                      <Link to={`/students/${s.id}`} className="hover:text-info hover:underline">{s.full_name}</Link>
                    </TableCell>
                    <TableCell dir="ltr">{s.national_id}</TableCell>
                    <TableCell dir="ltr">{s.phone ?? '—'}</TableCell>
                    <TableCell>{s.track_name ?? '—'}</TableCell>
                    <TableCell>
                      {(s.khatmat ?? 0) >= 1
                        ? <Badge className="bg-accent text-accent-foreground gap-1">🌿 {s.khatmat === 1 ? 'ختمة' : `${s.khatmat} ختمات`}</Badge>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      {s.user_id ? <Badge variant="outline" className="text-success border-success">مفعّل</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">بلا حساب</Badge>}
                    </TableCell>
                    <TableCell><Switch checked={s.is_active} onCheckedChange={() => toggleActive(s)} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil size={16} /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'تعديل الطالبة' : 'طالبة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم الرباعي</Label>
              <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الهوية</Label>
                <Input dir="ltr" value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الجوال</Label>
                <Input dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>البريد</Label>
                <Input dir="ltr" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>المسار</Label>
                <Select value={form.track_id} onValueChange={v => setForm({ ...form, track_id: v })}>
                  <SelectTrigger><SelectValue placeholder="اختاري المسار" /></SelectTrigger>
                  <SelectContent>
                    {tracks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>{editing ? 'حفظ التعديل' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
