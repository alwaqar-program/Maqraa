import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Settings } from 'lucide-react';

// الإعدادات القابلة للضبط — القيم تُقرأ من app_settings وتؤثر فورًا على القيود والواجهة
const SETTING_DEFS: { key: string; label: string; hint: string }[] = [
  { key: 'teacher_min_hours_per_week', label: 'الحد الأدنى لساعات المسمعة أسبوعيًا', hint: 'تنبيه في صفحة توفرها إن نزلت عنه' },
  { key: 'teacher_max_hours_per_week', label: 'الحد الأعلى لساعات المسمعة أسبوعيًا', hint: 'القاعدة ترفض مواعيد تتجاوزه' },
  { key: 'max_absences_per_season', label: 'حد الغيابات في الفصل', hint: 'يُحسب الغياب بدون عذر فقط — التجاوز يُبرز تنبيهًا للإدارة' },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('app_settings').select('key, value').then(({ data }) => {
      const v: Record<string, string> = {};
      (data || []).forEach((r: any) => { v[r.key] = r.value; });
      setValues(v);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const rows = SETTING_DEFS.map(d => ({ key: d.key, value: values[d.key] ?? '' }));
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'حُفظت الإعدادات' });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Settings className="text-accent" />
        <h1 className="text-2xl font-display">الإعدادات</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-body">ضوابط المقرأة</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : SETTING_DEFS.map(d => (
            <div key={d.key} className="space-y-1.5">
              <Label>{d.label}</Label>
              <Input type="number" min={0} className="max-w-32" value={values[d.key] ?? ''}
                onChange={e => setValues({ ...values, [d.key]: e.target.value })} />
              <p className="text-xs text-muted-foreground">{d.hint}</p>
            </div>
          ))}
          <Button onClick={save} disabled={saving || loading}>{saving ? '...' : 'حفظ'}</Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        نصاب كل مسار يُعدَّل من صفحة «المسارات»، ومدة الفصل وعدد جلساته من صفحة «الفصول».
      </p>
    </div>
  );
}
