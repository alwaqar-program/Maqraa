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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { FileEdit, Plus, Trash2, ExternalLink, ArrowUp, ArrowDown, ImageUp, Eye, Save } from 'lucide-react';
import { FORM_DEFAULTS, FormKey, FormQuestion, headerUrl } from '@/lib/form-settings';
import { useUrlState } from '@/lib/use-url-state';
import { StudentRegisterPreview, TeacherAgreementPreview, HostingFeedbackPreview } from '@/components/forms/FormPreviews';
import headerDefault from '@/assets/header.png';

const FORM_LABELS: Record<FormKey, { label: string; url: string }> = {
  student_register: { label: 'تسجيل الطالبات', url: '/register' },
  teacher_agreement: { label: 'اتفاقية المسمعات', url: '/register-teacher' },
  hosting_feedback: { label: 'قياس رضا الاستضافات', url: '' },
};
const QTYPE_LABELS = { text: 'نص حر', select: 'اختيار واحد', multiselect: 'اختيار متعدد' };

/** أسئلة المسودة: الجديدة تحمل معرفًا مؤقتًا new-... حتى تُحفظ */
type DraftQuestion = FormQuestion & { _new?: boolean };

export default function FormsAdminPage() {
  const [tab, setTab] = useUrlState('form', 'student_register');
  const key = tab as FormKey;
  const [config, setConfig] = useState<any>(FORM_DEFAULTS[key]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const [{ data: row }, { data: qs }] = await Promise.all([
      supabase.from('form_settings').select('config').eq('form_key', key).maybeSingle(),
      supabase.from('form_questions').select('*').eq('form_key', key).order('sort_order'),
    ]);
    setConfig({ ...FORM_DEFAULTS[key], ...((row?.config as object) ?? {}) });
    setQuestions((qs || []) as DraftQuestion[]);
    setDeletedIds([]);
    setDirty(false);
  }, [key]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // كل التعديلات محلية (مسودة) — لا تصل النموذج العام قبل «حفظ»
  const patchConfig = (patch: object) => { setConfig({ ...config, ...patch }); setDirty(true); };

  const patchQuestion = (id: string, patch: Partial<DraftQuestion>) => {
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));
    setDirty(true);
  };
  const addQuestion = () => {
    setQuestions([...questions, {
      id: `new-${Date.now()}`, _new: true, form_key: key, label: 'سؤال جديد',
      qtype: 'text', options: [], required: false,
      sort_order: (questions[questions.length - 1]?.sort_order ?? 0) + 1, is_active: true,
    }]);
    setDirty(true);
  };
  const removeQuestion = (q: DraftQuestion) => {
    setQuestions(questions.filter(x => x.id !== q.id));
    if (!q._new) setDeletedIds([...deletedIds, q.id]);
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next.map((q, idx) => ({ ...q, sort_order: idx + 1 })));
    setDirty(true);
  };

  /** الحفظ: يعتمد النصوص وكل تغييرات الأسئلة دفعة واحدة */
  const saveAll = async () => {
    setSaving(true);
    const { error: cfgErr } = await supabase.from('form_settings')
      .upsert({ form_key: key, config, updated_at: new Date().toISOString() });
    if (cfgErr) { toast({ title: 'خطأ في حفظ النصوص', description: cfgErr.message, variant: 'destructive' }); setSaving(false); return; }

    for (const id of deletedIds) {
      const { error } = await supabase.from('form_questions').delete().eq('id', id);
      if (error) { toast({ title: 'خطأ في حذف سؤال', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    }
    for (const q of questions) {
      const payload = {
        form_key: key, label: q.label, qtype: q.qtype,
        options: q.options.filter(o => o.trim()),
        required: q.required, sort_order: q.sort_order, is_active: q.is_active,
      };
      const { error } = q._new
        ? await supabase.from('form_questions').insert(payload)
        : await supabase.from('form_questions').update(payload).eq('id', q.id);
      if (error) { toast({ title: 'خطأ في حفظ سؤال', description: error.message, variant: 'destructive' }); setSaving(false); return; }
    }
    setSaving(false);
    toast({ title: 'اعتُمدت التعديلات — سارية الآن على الرابط العام' });
    fetchAll();
  };

  const uploadHeader = async (file: File) => {
    const path = `${key}-header-${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('form-assets').upload(path, file);
    if (error) { toast({ title: 'تعذر رفع الصورة', description: error.message, variant: 'destructive' }); return; }
    patchConfig({ header_path: path });
    toast({ title: 'رُفعت الصورة — اضغطي «حفظ» لاعتمادها' });
  };

  const activeDraftQuestions = questions.filter(q => q.is_active);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <FileEdit className="text-accent" />
          <h1 className="text-2xl font-display">النماذج</h1>
          {dirty && <Badge className="bg-warning text-warning-foreground">تعديلات غير محفوظة</Badge>}
        </div>
        <div className="flex gap-2">
          {FORM_LABELS[key].url && (
            <Button variant="outline" size="sm" className="gap-1" asChild>
              <a href={FORM_LABELS[key].url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> النموذج المنشور
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setPreviewOpen(true)}>
            <Eye size={14} /> استعراض
          </Button>
          <Button size="sm" className="gap-1" onClick={saveAll} disabled={saving || !dirty}>
            <Save size={14} /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => {
        if (dirty && !window.confirm('لديك تعديلات غير محفوظة — الانتقال سيفقدها. المتابعة؟')) return;
        setTab(v);
      }} dir="rtl">
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
                <p className="text-xs text-muted-foreground mt-0.5">القفل مُنفَذ في قاعدة البيانات أيضًا — يسري بعد «حفظ».</p>
              </div>
              <Switch checked={config.is_open !== false} onCheckedChange={v => patchConfig({ is_open: v })} />
            </div>
            {config.is_open === false && (
              <div className="space-y-1.5">
                <Label>الرسالة التي تظهر بدل النموذج</Label>
                <Textarea rows={2} value={config.closed_message ?? ''}
                  onChange={e => patchConfig({ closed_message: e.target.value })} />
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
            <img src={headerUrl(config) ?? headerDefault} alt="ترويسة النموذج" className="w-full rounded-xl border" />
            <div className="flex gap-2">
              <label className="inline-flex items-center gap-1 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:border-accent">
                <ImageUp size={15} /> رفع صورة جديدة
                <input type="file" hidden accept="image/png,image/jpeg,image/webp"
                  onChange={e => e.target.files?.[0] && uploadHeader(e.target.files[0])} />
              </label>
              {config.header_path && (
                <Button variant="ghost" size="sm" onClick={() => patchConfig({ header_path: undefined })}>
                  الرجوع للافتراضية
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* نصوص النموذج */}
      <Card>
        <CardHeader><CardTitle className="text-base font-body">نصوص النموذج</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {key === 'student_register' && (
            <>
              <Field label="عنوان النموذج" value={config.title} onChange={v => patchConfig({ title: v })} />
              <Field label="عبارة الترحيب" rows={2} value={config.welcome} onChange={v => patchConfig({ welcome: v })} />
              <Field label="عنوان قسم البيانات" value={config.section_data_title} onChange={v => patchConfig({ section_data_title: v })} />
              <Field label="عنوان قسم المسار" value={config.section_track_title} onChange={v => patchConfig({ section_track_title: v })} />
              <Field label="عنوان قسم المواعيد" value={config.section_times_title} onChange={v => patchConfig({ section_times_title: v })} />
              <Field label="عبارة المواعيد" rows={2} value={config.times_note} onChange={v => patchConfig({ times_note: v })} />
              {/* المواعيد تُقرأ مباشرة من أوقات المسمعات — لا إدخال يدوي هنا */}
              <p className="text-xs text-muted-foreground border border-dashed rounded-lg px-3 py-2.5">
                خيارات المواعيد تُقرأ تلقائيًا من أوقات توفر المسمعات (صفحة المسمعات):
                طالبة المسار المرتبط بمسمعة ترى مواعيدها فقط، والبقية يرون مواعيد المسمعات العامات.
                الموعد الدوري يظهر خيارًا واحدًا «يوميًا من ... إلى ...».
              </p>
              <Field label="عنوان قسم العهد" value={config.section_pledge_title} onChange={v => patchConfig({ section_pledge_title: v })} />
              <Field label="عنوان صندوق نظام الغياب" value={config.absence_policy_title} onChange={v => patchConfig({ absence_policy_title: v })} />
              <Field label="نص نظام الغياب (قبل التعهد — فارغ = مخفي)" rows={4}
                value={config.absence_policy} onChange={v => patchConfig({ absence_policy: v })} />
              <Field label="نص التعهد" rows={2} value={config.pledge_text} onChange={v => patchConfig({ pledge_text: v })} />
              <Field label="عنوان صندوق الملاحظات المهمة" value={config.important_notes_title} onChange={v => patchConfig({ important_notes_title: v })} />
              <Field label="نص الملاحظات المهمة (بعد التعهد — فارغ = مخفي)" rows={4}
                value={config.important_notes} onChange={v => patchConfig({ important_notes: v })} />
              <Field label="عنوان خانة المقترحات" value={config.suggestions_title} onChange={v => patchConfig({ suggestions_title: v })} />
              <Field label="عبارة المقترحات (تظهر تحت العنوان)" rows={2} value={config.suggestions_note} onChange={v => patchConfig({ suggestions_note: v })} />
              <Field label="رسالة النجاح بعد الإرسال" rows={2} value={config.success_body} onChange={v => patchConfig({ success_body: v })} />
            </>
          )}

          {key === 'teacher_agreement' && (
            <>
              <Field label="مدة التعاون" rows={2} value={config.duration_text} onChange={v => patchConfig({ duration_text: v })} />
              <ListEditor label="التزامات المقرأة" items={config.maqraa_items ?? []} onChange={v => patchConfig({ maqraa_items: v })} />
              <ListEditor label="التزامات المسمعات" items={config.teacher_items ?? []} onChange={v => patchConfig({ teacher_items: v })} />
              <Field label="الخاتمة" value={config.closing_text} onChange={v => patchConfig({ closing_text: v })} />
              <Field label="عبارة التوقيع" value={config.signature_hint} onChange={v => patchConfig({ signature_hint: v })} />
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <div className="space-y-1.5">
                  <Label>الحد الأدنى للساعات</Label>
                  <Input type="number" min={0} value={config.min_hours}
                    onChange={e => patchConfig({ min_hours: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>الحد الأعلى للساعات</Label>
                  <Input type="number" min={1} value={config.max_hours}
                    onChange={e => patchConfig({ max_hours: Number(e.target.value) })} />
                </div>
              </div>
            </>
          )}

          {key === 'hosting_feedback' && (
            <>
              <Field label="عنوان قياس الرضا" value={config.prompt_label} onChange={v => patchConfig({ prompt_label: v })} />
              <Field label="نص خانة الملاحظات" value={config.comment_placeholder} onChange={v => patchConfig({ comment_placeholder: v })} />
            </>
          )}
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
            <p className="text-muted-foreground text-sm text-center py-2">لا أسئلة إضافية — النموذج بحقوله الأساسية فقط.</p>
          )}
          {questions.map((q, i) => (
            <div key={q.id} className={`border rounded-lg p-3 space-y-3 ${!q.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2">
                <Input value={q.label} onChange={e => patchQuestion(q.id, { label: e.target.value })} />
                <Select value={q.qtype} onValueChange={v => patchQuestion(q.id, { qtype: v as any })}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(QTYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp size={15} /></button>
                <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown size={15} /></button>
                <button onClick={() => removeQuestion(q)} title="حذف" className="text-muted-foreground hover:text-destructive"><Trash2 size={15} /></button>
              </div>
              {q.qtype !== 'text' && (
                <div className="space-y-1">
                  <Label className="text-xs">الخيارات (سطر لكل خيار)</Label>
                  <Textarea rows={3} value={q.options.join('\n')}
                    onChange={e => patchQuestion(q.id, { options: e.target.value.split('\n') })} />
                </div>
              )}
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <Switch checked={q.required} onCheckedChange={v => patchQuestion(q.id, { required: v })} />
                  إلزامي
                </label>
                <label className="flex items-center gap-1.5">
                  <Switch checked={q.is_active} onCheckedChange={v => patchQuestion(q.id, { is_active: v })} />
                  ظاهر في النموذج
                </label>
                {q._new && <Badge variant="outline">جديد — لم يُحفظ</Badge>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* الاستعراض */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              استعراض {FORM_LABELS[key].label}
              {dirty && <Badge className="bg-warning text-warning-foreground">يعرض المسودة قبل الحفظ</Badge>}
            </DialogTitle>
          </DialogHeader>
          {key === 'student_register' && <StudentRegisterPreview config={config} questions={activeDraftQuestions} />}
          {key === 'teacher_agreement' && <TeacherAgreementPreview config={config} questions={activeDraftQuestions} />}
          {key === 'hosting_feedback' && <HostingFeedbackPreview config={config} questions={activeDraftQuestions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- محررات صغيرة ----------

function Field({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {rows
        ? <Textarea rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} />
        : <Input value={value ?? ''} onChange={e => onChange(e.target.value)} />}
    </div>
  );
}
function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label} <span className="text-muted-foreground text-xs">(سطر لكل بند)</span></Label>
      <Textarea rows={5} value={items.join('\n')} onChange={e => onChange(e.target.value.split('\n'))} />
    </div>
  );
}
