// ============================================================
// Edge Function: admin-create-user — مقرأة الوقار
// إنشاء حسابات المستخدمات من النظام (لا signUp في هذا النظام).
// يتحقق أن المستدعي admin عبر JWT، ثم ينشئ الحساب بمفتاح service-role،
// ويربطه بصف students/teachers/supervisors ويدرج الدور.
// يدعم طلبًا مفردًا أو دفعة (bulk) لاستيراد CSV.
//
// النشر:  supabase functions deploy admin-create-user
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

type LinkTable = 'students' | 'teachers' | 'supervisors';
interface CreateUserRequest {
  email: string;
  password?: string;                 // إن غابت تُولَّد
  role: 'super_admin' | 'admin' | 'teacher' | 'supervisor' | 'student' | 'report_viewer';
  link?: { table: LinkTable; id: string };
  full_name?: string;
}
interface Payload {
  users?: CreateUserRequest[];       // دفعة
  // أو مفرد:
  email?: string;
  password?: string;
  role?: CreateUserRequest['role'];
  link?: CreateUserRequest['link'];
  full_name?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return 'Mq-' + Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // 1) تحقق هوية المستدعي من JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: authErr } = await caller.auth.getUser();
    if (authErr || !callerUser) return json({ error: 'غير مصرح: يلزم تسجيل الدخول' }, 401);

    // 2) تحقق أن المستدعي admin (بمفتاح service-role لتجاوز RLS)
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roleRows } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUser.id)
      .in('role', ['admin', 'super_admin']);
    if (!roleRows?.length) return json({ error: 'غير مصرح: هذه العملية لمديرة النظام فقط' }, 403);
    const callerIsSuper = roleRows.some((r) => r.role === 'super_admin');

    // 3) الطلبات (مفرد أو دفعة)
    const payload: Payload = await req.json();
    const requests: CreateUserRequest[] = payload.users ??
      (payload.email && payload.role
        ? [{ email: payload.email, password: payload.password, role: payload.role, link: payload.link, full_name: payload.full_name }]
        : []);
    if (requests.length === 0) return json({ error: 'لا توجد حسابات في الطلب' }, 400);
    if (requests.length > 200) return json({ error: 'الحد الأقصى 200 حساب في الدفعة الواحدة' }, 400);

    const results: Array<Record<string, unknown>> = [];
    for (const r of requests) {
      try {
        if (!r.email || !r.role) throw new Error('البريد والدور مطلوبان');
        if (r.role === 'super_admin' && !callerIsSuper) throw new Error('منح دور «مسؤولة تقنية» حكر على حاملته');
        const password = r.password || generatePassword();
        const { data, error } = await admin.auth.admin.createUser({
          email: r.email,
          password,
          email_confirm: true,
        });
        if (error) throw error;
        const userId = data.user!.id;

        const { error: roleErr } = await admin
          .from('user_roles')
          .upsert({ user_id: userId, role: r.role }, { onConflict: 'user_id,role' });
        if (roleErr) throw roleErr;

        if (r.link) {
          const { error: linkErr } = await admin
            .from(r.link.table)
            .update({ user_id: userId })
            .eq('id', r.link.id);
          if (linkErr) throw linkErr;
        }

        results.push({ email: r.email, ok: true, user_id: userId, password });
      } catch (e) {
        results.push({ email: r.email, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ results, created: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
