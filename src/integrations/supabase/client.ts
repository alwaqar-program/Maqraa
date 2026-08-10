import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// قبل تعبئة .env.local نستخدم قيمًا وهمية كي تعمل الواجهة محليًا دون قاعدة —
// أي نداء فعلي سيفشل برسالة واضحة بدل انهيار التطبيق عند الإقلاع.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
if (!isSupabaseConfigured) {
  console.warn('⚠️ لم تُعبَّأ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY في .env.local — الواجهة تعمل بلا قاعدة بيانات.');
}

export const supabase = createClient<Database>(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
