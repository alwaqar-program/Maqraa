import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileEdit, Plus, Trash2, ExternalLink, ArrowUp, ArrowDown, ImageUp } from 'lucide-react';
import { FORM_DEFAULTS, FormKey, FormQuestion, DayOption, headerUrl } from '@/lib/form-settings';
import headerDefault from '@/assets/header.png';
import { useUrlState } from '@/lib/use-url-state';
import { WEEKDAYS } from '@/lib/schedule';

const FORM_LABELS: Record<FormKey, { label: string; url: string }> = {
  student_register: { label: 'تسجيل الطالبات', url: '/register' },
  teacher_agreement: { label: 'اتفاقية المسمعات', url: '/register-teacher' },
  hosting_feedback: { label: 'قياس رضا الاستضافات', url: '' },
};
const QTYPE_LABELS = { text: 'نص حر', select: 'اختيار واحد', multiselect: 'اختيار متعدد' };

export default function FormsAdminPage() {
  const [tab, setTab] = useUrlState('form', 'student_register');
  const key = tab as FormKey;
  const [config, setConfig] = useState<any>(FORM_DEFAULTS[key]);
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: row }, { data: qs }] = await Promise.all([
      supabase.from('form_settings').select('config').eq('form_key', key).maybeSingle(),
      supabase.from('form_questions').select('*').eq('form_key', key).order('sort_order'),
    ]);
    setConfig({ ...FORM_DEFAULTS[key], ...((row?.config as object) ?? {}) });
    setQuestions((qs || []) as FormQuestion[]);
  }, [key]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('form_settings')
      .upsert({ form_key: key, config, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast({ title: 'خطأ', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'حُفظ — التعديل ساري فورًا على الرابط العام' });
  };

  // ---------- صورة الترويسة ----------
  const uploadHeader = async (file: File) => {
    const path = `${key}-header-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage.from('form-assets').upload(path, file);
    if (upErr) { toast({ title: 'تعذر رفع الصورة', description: upErr.message, variant: 'destructive' }); return; }
    const newConfig = { ...config, header_path: path };
    setConfig(newConfig);
    const { error } = await supabase.from('form_settings')
      .upsert({ form_key: key, config: newConfig, updated_at: new Date().toISOString() });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else toast({ title: 'حُدّثت صورة الترويسة — سارية فورًا' });
  };
  const resetHeader = async () => {
    const newConfig = { ...config, header_path: undefined };
    delete newConfig.header_path;
    setConfig(newConfig);
    const { error } = await supabase.from('form_settings')
      .upsert({ form_key: key, config: newConfig, updated_at: new Date().toISOString() });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else toast({ title: 'عادت الصورة الافتراضية' });
  };

  // ---------- الأسئلة الإضافية ----------
  const addQuestion = async () => {
    const { error } = await supabase.from('form_questions').insert({
      form_key: key, label: 'سؤال جديد', qtype: 'text',
      sort_order: (questions[questions.length - 1]?.sort_order ?? 0) + 1,
    });
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };
  const updateQuestion = async (q: FormQuestion, patch: Partial<FormQuestion>) => {
    const { error } = await supabase.from('form_questions').update(patch).eq('id', q.id);
    if (error) toast({ title: 'خطأ', description: error.message, variant: 'destructive' });
    else fetchAll();
  };
  const move = async (i: number, dir: -1 | 1) => {
    const other = questions[i + dir];
    if (!other) return;
    const q = questions[i];
    await supabase.from('form_questions').update({ sort_order: other.sort_order }).eq('id', q.id);
    await supabase.from('form_questions').update({ sort_order: q.sort_order }).eq('id', other.id);
    fetchAll();
  };

  // ---------- محررات مساعدة ----------
  const TextField = ({ label, k, rows }: { label: string; k: string; rows?: number }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {rows ? (
        <Textarea rows={rows} value={config[k] ?? ''} onChange={e => setConfig({ ...config, [k]: e.target.value })} />
      ) : (
        <Input value={config[k] ?? ''} onChange={e => setConfig({ ...config, [k]: e.target.value })} />
      )}
    </div>
  );
  const ListField = ({ label, k }: { label: string; k: string }) => (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-muted-foreground text-xs">(سطر لكل بند)</span></Label>
      <Textarea rows={5} value={((config[k] as string[]) ?? []).join('\n')}
        onChange={e => setConfig({ ...config, [k]: e.target.value.split('\n').filter(l => l.trim()) })} />
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileEdit className="text-accent" />
          <h1 className="text-2xl font-display">النماذج</h1>
        </div>
        {FORM_LABELS[key].url && (
          <Button variant="outline" size="sm" className="gap-1" asChild>
            <a href={FORM_LABELS[key].url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> فتح النموذج
            </a>
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList>
          {(Object.keys(FORM_LABELS) as FormKey[]).map(k => (
            <TabsTrigger key={k} value={k}>{FORM_LABELS[k].label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* حالة الرابط */}
      {key !== 'hosting_feedback' && (
        <Card className={config.is_open === false ? 'border-destructive/50' : 'border-success/40'}>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {config.is_open === false ? '🔒 الرابط مقفل — لا يقبل النظام أي طلب جديد' : '🟢 الرابط مفتوح — يستقبل الطلبات'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  القفل مُنفَذ في قاعدة البيانات أيضًا، لا واجهةً فقط. لا تنسي «حفظ النصوص» بعد التغيير.
                </p>
              </div>
              <Switch checked={config.is_open !== false}
                onCheckedChange={v => setConfig({ ...config, is_open: v })} />
            </div>
            {config.is_open === false && (
              <div className="space-y-1.5">
                <Label>الرسالة التي تظهر بدل النموذج</Label>
                <Textarea rows={2} value={config.closed_message ?? ''}
                  onChange={e => setConfig({ ...config, closed_message: e.target.value })} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* صورة الترويسة */}
      {key !== 'hosting_feedback' && (
        <Card>
          <CardHeader><CardTitle className="text-base font-body">صورة الترويسة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <img src={headerUrl(config) ?? headerDefault} alt="ترويسة النموذج"
              className="w-full rounded-xl border" />
            <div className="flex gap-2">
              <label className="inline-flex items-center gap-1 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-accent">
                <ImageUp size={15} /> رفع صورة جديدة
                <input type="file" hidden accept="image/png,image/jpeg,image/webp"
                  onChange={e => e.target.files?.[0] && uploadHeader(e.target.files[0])} />
              </label>
              {config.header_path && (
                <Button variant="ghost" size="sm" onClick={resetHeader}>الرجوع للافتراضية</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">يُفضل عرض 2000px تقريبًا بصيغة PNG — تسري فورًا بعد الرفع.</p>
          </CardContent>
        </Card>
      )}

      {/* نصوص النموذج */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">نصوص النموذج</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {key === 'student_register' && (
            <>
              <TextField label="عنوان النموذج" k="title" />
              <TextField label="عبارة الترحيب" k="welcome" rows={2} />
              <TextField label="عبارة المواعيد" k="times_note" rows={2} />
              <div className="space-y-1.5">
                <Label>خيارات المواعيد المعروضة</Label>
                {((config.day_options as DayOption[]) ?? []).map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={String(d.value)} onValueChange={v => {
                      const next = [...config.day_options]; next[i] = { ...d, value: Number(v) };
                      setConfig({ ...config, day_options: next });
                    }}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((w, wi) => <SelectItem key={wi} value={String(wi)}>{w}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={d.label} onChange={e => {
                      const next = [...config.day_options]; next[i] = { ...d, label: e.target.value };
                      setConfig({ ...config, day_options: next });
                    }} />
                    <button type="button" className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfig({ ...config, day_options: config.day_options.filter((_: any, j: number) => j !== i) })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => setConfig({ ...config, day_options: [...(config.day_options ?? []), { value: 0, label: 'الأحد ٥–٧ صباحًا' }] })}>
                  <Plus size={14} /> إضافة خيار
                </Button>
              </div>
              <TextField label="نص التعهد" k="pledge_text" rows={2} />
              <TextField label="عبارة المقترحات" k="suggestions_note" rows={2} />
              <TextField label="رسالة النجاح بعد الإرسال" k="success_body" rows={2} />
            </>
          )}

          {key === 'teacher_agreement' && (
            <>
              <TextField label="مدة التعاون" k="duration_text" rows={2} />
              <ListField label="التزامات المقرأة" k="maqraa_items" />
              <ListField label="التزامات المسمعات" k="teacher_items" />
              <TextField label="الخاتمة" k="closing_text" />
              <TextField label="عبارة التوقيع" k="signature_hint" />
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <div className="space-y-1.5">
                  <Label>الحد الأدنى للساعات</Label>
                  <Input type="number" min={0} value={config.min_hours}
                    onChange={e => setConfig({ ...config, min_hours: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>الحد الأعلى للساعات</Label>
                  <Input type="number" min={1} value={config.max_hours}
                    onChange={e => setConfig({ ...config, max_hours: Number(e.target.value) })} />
                </div>
              </div>
            </>
          )}

          {key === 'hosting_feedback' && (
            <>
              <TextField label="عنوان قياس الرضا" k="prompt_label" />
              <TextField label="نص خانة الملاحظات" k="comment_placeholder" />
            </>
          )}

          <Button onClick={save} disabled={saving}>{saving ? '...' : 'حفظ النصوص'}</Button>
        </CardContent>
      </Card>

      {/* الأسئلة الإضافية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-body flex items-center justify-between">
            <span>الأسئلة الإضافية</span>
            <Button size="sm" variant="outline" className="gap-1" onClick={addQuestion}>
              <Plus size={14} /> سؤال جديد
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-2">
              لا أسئلة إضافية — النموذج بحقوله الأساسية فقط.
            </p>
          )}
          {questions.map((q, i) => (
            <div key={q.id} className={`border rounded-lg p-3 space-y-3 ${!q.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <Input defaultValue={q.label} onBlur={e => e.target.value !== q.label && updateQuestion(q, { label: e.target.value })} />
                <Select value={q.qtype} onValueChange={v => updateQuestion(q, { qtype: v as any })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(QTYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp size={15} /></button>
                <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown size={15} /></button>
              </div>
              {q.qtype !== 'text' && (
                <div className="space-y-1">
                  <Label className="text-xs">الخيارات (سطر لكل خيار)</Label>
                  <Textarea rows={3} defaultValue={q.options.join('\n')}
                    onBlur={e => updateQuestion(q, { options: e.target.value.split('\n').filter(l => l.trim()) })} />
                </div>
              )}
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <Switch checked={q.required} onCheckedChange={v => updateQuestion(q, { required: v })} />
                  إلزامي
                </label>
                <label className="flex items-center gap-1.5">
                  <Switch checked={q.is_active} onCheckedChange={v => updateQuestion(q, { is_active: v })} />
                  ظاهر في النموذج
                </label>
                {!q.is_active && <Badge variant="outline">معطّل — إجاباته السابقة محفوظة</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
