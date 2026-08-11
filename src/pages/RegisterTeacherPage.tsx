import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2 } from 'lucide-react';
import logoImg from '@/assets/logo-maqraa.png';

const hijriToday = () => {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch { return ''; }
};

/** اتفاقية المسمعات في مقرأة الوقار — الاسم يعد بمثابة توقيع */
export default function RegisterTeacherPage() {
  const [fullName, setFullName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [agreedTimes, setAgreedTimes] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('teacher_agreements').insert({
      full_name: fullName.trim(),
      agreement_date: date,
      agreed_times: agreedTimes.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast({ title: 'تعذر إرسال الاتفاقية', description: error.message, variant: 'destructive' }); return; }
    setDone(true);
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <CheckCircle2 size={48} className="mx-auto text-success" />
            <h1 className="text-2xl font-display">وُقّعت الاتفاقية 🌿</h1>
            <p className="text-muted-foreground">شكرًا لك — ستتواصل معك إدارة المقرأة.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <img src={logoImg} alt="شعار مقرأة الوقار" className="mx-auto w-24 object-contain" />
          <h1 className="text-2xl font-display">اتفاقية المسمعات في مقرأة الوقار</h1>
        </div>

        {/* بنود الاتفاقية */}
        <Card>
          <CardContent className="pt-6 space-y-4 leading-relaxed text-[15px]">
            <p className="text-center text-2xl font-display">﷽</p>
            <p>
              بعون الله وتوفيقه في يوم {hijriToday()}، تم الاتفاق بين <b>(مقرأة الوقار)</b> و<b>(المسمعات)</b> على ما يلي:
            </p>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">مدة التعاون مع المقرأة</h3>
              <p>٦ أشهر، تبدأ من تاريخ الاتفاق مع المسمعة.</p>
            </div>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">تلتزم (مقرأة الوقار) تجاه (المسمعات) بـ:</h3>
              <ul className="space-y-1.5 pr-1">
                <li>✦ الأخلاق الحسنة والثقة والشفافية.</li>
                <li>✦ إتاحة الفرصة لخدمة كتاب الله وحملته، وما يترتب على ذلك من عظيم الثواب.</li>
                <li>✦ إطلاع المسمعات على منهج المقرأة وتقديم التوجيه والمعلومات اللازمة لسير العمل، ومتابعة الإشكالات الواردة والسعي في معالجتها دوريًا.</li>
                <li>✦ منح المسمعة ساعات تطوعية موثقة في منصة التطوع.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-display text-lg text-primary mb-1">كما تلتزم (المسمعات) تجاه (مقرأة الوقار) بـ:</h3>
              <ul className="space-y-1.5 pr-1">
                <li>✦ مراعاة الضوابط الشرعية في كل ما يعد ضمن نطاق المقرأة، والتحلي بأخلاق حامل القرآن وتمثّل القدوة الحسنة للطالبات.</li>
                <li>✦ حرص المسمعة على الرفق والتيسير والعدل بين الطالبات.</li>
                <li>✦ الالتزام بالتسميع للطالبات وفق الطريقة المتبعة في المقرأة، مع التدوين في ملف المتابعة.</li>
                <li>✦ الالتزام بالتسميع للطالبات وفق المواعيد المتفق عليها، بما لا يقل عن ٥ ساعات أسبوعيًا.</li>
                <li>✦ تبليغ المشرفة حال وجود طارئ يحول دون الالتزام بالموعد المحدد واتخاذ الإجراء المناسب (الاتفاق على موعد آخر مع الطالبات / توكيل من تنوب بالتسميع بالتنسيق مع المشرفة).</li>
                <li>✦ التحلي بالمرونة والتعاون فيما يحقق مصلحة للمقرأة والطالبات.</li>
              </ul>
            </div>
            <p className="text-center">هذا وصلى الله وسلم على نبينا محمد.</p>
          </CardContent>
        </Card>

        {/* التوقيع */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم المسمعة <span className="text-destructive">*</span></Label>
                <Input id="name" required value={fullName} onChange={e => setFullName(e.target.value)} />
                <p className="text-xs text-muted-foreground">يعد بمثابة توقيع للموافقة على البنود أعلاه.</p>
              </div>
              <div className="space-y-2 max-w-48">
                <Label htmlFor="date">تاريخ الاتفاقية</Label>
                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="times">المواعيد المتفق عليها للتسميع</Label>
                <Textarea id="times" rows={2} placeholder="مثال: الأحد والثلاثاء من ٤ إلى ٦ مساءً"
                  value={agreedTimes} onChange={e => setAgreedTimes(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving || !fullName.trim()}>
                {saving ? '...' : 'أوافق على البنود وأوقّع'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
