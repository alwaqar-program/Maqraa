import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';
import { EXAM_TYPES, examMax, examScore, examGradeText } from '@/lib/exams';

export interface ExamFormValue {
  exam_type: string;
  date: string;
  error_count: number;
  lahn_count: number;
  segment_changes: number;
  notes: string;
}

/** حقول الاختبار — مطابقة للوقار: النوع يحدد الحد الأقصى، وخصم ربع درجة لكل خطأ ولحن ودرجتان لتغيير المقطع */
export default function ExamForm({ value, onChange, duplicate }: {
  value: ExamFormValue;
  onChange: (v: ExamFormValue) => void;
  duplicate?: boolean;
}) {
  const score = examScore(value.exam_type, value.error_count, value.lahn_count, value.segment_changes);
  const max = examMax(value.exam_type);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>نوع الاختبار</Label>
          <Select value={value.exam_type} onValueChange={v => onChange({ ...value, exam_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EXAM_TYPES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v} — من {examMax(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>التاريخ</Label>
          <Input type="date" value={value.date} onChange={e => onChange({ ...value, date: e.target.value })} />
        </div>
      </div>

      {duplicate && (
        <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/5 p-2 rounded">
          <AlertCircle size={16} />
          هذه الطالبة أدت هذا الاختبار مسبقًا في هذا الفصل. لا يمكن التكرار.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>عدد الأخطاء</Label>
          <Input type="number" min={0} value={value.error_count}
            onChange={e => onChange({ ...value, error_count: Math.max(0, parseInt(e.target.value) || 0) })} />
        </div>
        <div className="space-y-2">
          <Label>عدد اللحون</Label>
          <Input type="number" min={0} value={value.lahn_count}
            onChange={e => onChange({ ...value, lahn_count: Math.max(0, parseInt(e.target.value) || 0) })} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>تغيير المقطع (مرة واحدة كحد أقصى، خصم درجتين)</Label>
        <Input type="number" min={0} max={1} value={value.segment_changes}
          onChange={e => onChange({ ...value, segment_changes: Math.min(1, Math.max(0, parseInt(e.target.value) || 0)) })} />
      </div>

      <div className="bg-muted/50 p-3 rounded-lg grid grid-cols-3 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">مجموع الأخطاء واللحون:</span>
          <span className="font-bold mr-1">{value.error_count + value.lahn_count}</span>
        </div>
        <div>
          <span className="text-muted-foreground">الدرجة:</span>
          <span className="font-bold mr-1">{score} / {max}</span>
        </div>
        <div>
          <span className="text-muted-foreground">التقدير:</span>
          <span className="font-bold mr-1">{examGradeText(score, max)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label>ملاحظات (اختياري)</Label>
        <Textarea rows={2} value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })} />
      </div>
    </>
  );
}
