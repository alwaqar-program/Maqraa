import { useState, ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';

/** هل الحساب الحالي «مديرة عليا»؟ */
export function useSuperAdmin(): boolean {
  return useAuth().hasRole('super_admin');
}

/**
 * زر حذف نهائي يظهر للمديرة العليا فقط — بنافذة تأكيد.
 * القاعدة تسمح للإدارة بالحذف أصلًا؛ الإظهار هنا قرار واجهة مقصود.
 */
export function SuperDeleteButton({ title, description, onConfirm, label }: {
  title: string;
  description: ReactNode;
  onConfirm: () => Promise<void> | void;
  /** نص بجانب الأيقونة (افتراضيًا أيقونة فقط) */
  label?: string;
}) {
  const isSuper = useSuperAdmin();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isSuper) return null;
  return (
    <>
      <Button variant="ghost" size={label ? 'sm' : 'icon'} title={title}
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}>
        <Trash2 size={15} />{label && <span className="me-1">{label}</span>}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description} هذا حذف نهائي لا رجعة فيه، ويُسجَّل في سجل النشاط.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-start gap-2">
            <AlertDialogCancel disabled={busy}>تراجع</AlertDialogCancel>
            <AlertDialogAction disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async e => {
                e.preventDefault();
                setBusy(true);
                try { await onConfirm(); setOpen(false); } finally { setBusy(false); }
              }}>
              {busy ? '...' : 'حذف نهائي'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
