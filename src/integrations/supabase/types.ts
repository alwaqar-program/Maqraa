// ملف مؤقت — سيُستبدل بالأنواع المولدة من مشروع Supabase بعد تنفيذ الهجرات:
//   npx supabase gen types typescript --project-id <PROJECT_ID> > src/integrations/supabase/types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
