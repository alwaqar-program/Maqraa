import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Construction } from 'lucide-react';

/** صفحة مؤقتة تُستبدل تباعًا في مراحل البناء 3–6 */
export default function Placeholder({ title }: { title: string }) {
  return (
    <Card className="max-w-xl mx-auto mt-10">
      <CardHeader className="text-center">
        <Construction className="mx-auto text-muted-foreground" size={32} />
        <CardTitle className="font-display">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        هذه الصفحة قيد البناء ضمن مراحل تنفيذ مقرأة الوقار.
      </CardContent>
    </Card>
  );
}
