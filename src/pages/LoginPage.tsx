import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import logoImg from '@/assets/logo.png';

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO (المرحلة 2): ربط signIn عبر AuthContext بعد إنشاء مشروع Supabase
    toast({ title: 'قيد الإنشاء', description: 'سيُفعَّل الدخول بعد ربط قاعدة البيانات (المرحلة 2)' });
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 shadow-lg">
        <CardHeader className="text-center space-y-4 pb-2">
          <img src={logoImg} alt="شعار مقرأة الوقار" className="mx-auto w-24 h-24 object-contain" />
          <div>
            <h1 className="text-2xl font-display text-foreground">مقرأة الوقار</h1>
            <p className="text-sm text-muted-foreground mt-1">برنامج استمرارية خاتمات الوقار</p>
          </div>
        </CardHeader>
        <CardContent>
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
    </div>
  );
}
