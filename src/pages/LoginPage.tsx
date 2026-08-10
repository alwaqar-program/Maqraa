import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { isSupabaseConfigured } from '@/integrations/supabase/client';
import logoImg from '@/assets/logo-maqraa.svg';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      toast({ title: 'قاعدة البيانات غير مربوطة', description: 'عبّئي .env.local بمعلومات مشروع Supabase ثم أعيدي تشغيل الخادم', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      toast({ title: 'تم تسجيل الدخول بنجاح' });
      navigate('/', { replace: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر تسجيل الدخول';
      toast({ title: 'خطأ', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* غلاف المصحف: رأس بني بعلامة ذهبية — توقيع هوية المقرأة */}
        <Card className="overflow-hidden border-border/50 shadow-lg">
          <CardHeader className="book-cover relative text-center space-y-3 pb-6 pt-10">
            <span className="ribbon left-8" aria-hidden="true" />
            <img src={logoImg} alt="شعار مقرأة الوقار" className="mx-auto w-20 h-20 object-contain drop-shadow" />
            <div>
              <h1 className="text-3xl font-display text-sidebar-foreground">مقرأة الوقار</h1>
              <p className="text-sm text-sidebar-primary mt-1 font-display">«كان عمله ديمة»</p>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required dir="ltr" minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '...' : 'تسجيل الدخول'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          برنامج استمرارية خاتمات الوقار في تعاهد القرآن الكريم
        </p>
      </div>
    </div>
  );
}
