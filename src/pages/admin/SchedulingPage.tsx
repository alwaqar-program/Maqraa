import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarClock, Unlink } from 'lucide-react';
import { WEEKDAYS, formatTime, slotHours } from '@/lib/schedule';

interface Row {
  slot_id: string;
  teacher_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  booking_id: string | null;
  student_name: string | null;
}

export default function SchedulingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<Row | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('availability_slots')
      .select('id, weekday, start_time, end_time, is_active, teachers(full_name), bookings(id, status, students(full_name))')
      .order('weekday').order('start_time');
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); setLoading(false); return; }
    setRows((data || []).map((s: any) => {
      const active = (s.bookings || []).find((b: any) => b.status === 'active');
      return {
        slot_id: s.id, teacher_name: s.teachers?.full_name ?? '—',
        weekday: s.weekday, start_time: s.start_time, end_time: s.end_time, is_active: s.is_active,
        booking_id: active?.id ?? null, student_name: active?.students?.full_name ?? null,
      };
    }));
    setLoading(false);
  }, [toast]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const release = async () => {
    if (!releasing?.booking_id) return;
    const { error } = await supabase.from('bookings').update({
      status: 'released',
      released_by: user?.email ?? 'admin',
      released_at: new Date().toISOString(),
    }).eq('id', releasing.booking_id);
    setReleasing(null);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else { toast({ title: 'أُلغي الحجز — الموعد شاغر الآن' }); fetchAll(); }
  };

  const booked = rows.filter(r => r.booking_id).length;
  const vacant = rows.filter(r => !r.booking_id && r.is_active).length;
  const totalHours = rows.filter(r => r.is_active).reduce((s, r) => s + slotHours(r.start_time, r.end_time), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="text-accent" />
        <h1 className="text-2xl font-display">الجدولة والحجوزات</h1>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        {[
          { label: 'الساعات الأسبوعية', value: totalHours },
          { label: 'مواعيد محجوزة', value: booked },
          { label: 'مواعيد شاغرة', value: vacant },
        ].map(x => (
          <Card key={x.label}><CardContent className="pt-5 text-center">
            <p className="text-3xl font-display text-primary">{x.value}</p>
            <p className="text-sm text-muted-foreground">{x.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المسمعة</TableHead>
                  <TableHead>اليوم</TableHead>
                  <TableHead>الوقت</TableHead>
                  <TableHead>الطالبة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.slot_id}>
                    <TableCell className="font-medium">{r.teacher_name}</TableCell>
                    <TableCell>{WEEKDAYS[r.weekday]}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTime(r.start_time)} – {formatTime(r.end_time)}</TableCell>
                    <TableCell>
                      {r.student_name
                        ? <Badge className="bg-accent text-accent-foreground">{r.student_name}</Badge>
                        : <Badge variant="outline">شاغرة</Badge>}
                    </TableCell>
                    <TableCell>
                      {r.booking_id && (
                        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setReleasing(r)}>
                          <Unlink size={14} /> إلغاء الحجز
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!releasing} onOpenChange={open => !open && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الحجز</AlertDialogTitle>
            <AlertDialogDescription>
              سيُلغى حجز {releasing?.student_name} من موعد {releasing && WEEKDAYS[releasing.weekday]}{' '}
              {releasing && formatTime(releasing.start_time)} ويصبح الموعد شاغرًا، وتستطيع الطالبة حجز موعد جديد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={release}>إلغاء الحجز</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
