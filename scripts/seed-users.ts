// ============================================================
// scripts/seed-users.ts — بيئة تطوير فقط
// ينشئ حسابات تجريبية ويربطها بالصفوف المبذورة ويدرج الأدوار.
// التشغيل:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-users.ts
// ⚠️ مفتاح service-role لا يوضع في .env.local ولا في أي ملف مُتتبع في git.
// ============================================================
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('يلزم SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في متغيرات البيئة');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

type SeedUser = {
  email: string;
  password: string;
  role: 'admin' | 'teacher' | 'supervisor' | 'student' | 'report_viewer';
  /** جدول الربط وصف الهدف (اختياري) */
  link?: { table: 'teachers' | 'students' | 'supervisors'; id: string };
  fullName?: string;
};

const USERS: SeedUser[] = [
  { email: 'admin@maqraa.test', password: 'Maqraa-Admin-1448!', role: 'admin' },
  {
    email: 'teacher1@maqraa.test', password: 'Maqraa-Teacher-1!', role: 'teacher',
    link: { table: 'teachers', id: 'b0000000-0000-0000-0000-000000000001' },
  },
  {
    email: 'student1@maqraa.test', password: 'Maqraa-Student-1!', role: 'student',
    link: { table: 'students', id: 'd0000000-0000-0000-0000-000000000001' },
  },
  {
    email: 'student2@maqraa.test', password: 'Maqraa-Student-2!', role: 'student',
    link: { table: 'students', id: 'd0000000-0000-0000-0000-000000000011' }, // بلا حجز — لاختبار شاشة الحجز
  },
  { email: 'supervisor@maqraa.test', password: 'Maqraa-Super-1!', role: 'supervisor', fullName: 'مشرفة عامة (تجربة)' },
  { email: 'reports@maqraa.test', password: 'Maqraa-Report-1!', role: 'report_viewer' },
];

async function main() {
  for (const u of USERS) {
    // أنشئ المستخدم (أو اجلبه إن وُجد)
    let userId: string | undefined;
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) {
      if (!/already/i.test(error.message)) throw new Error(`${u.email}: ${error.message}`);
      const { data: list } = await admin.auth.admin.listUsers();
      userId = list.users.find((x) => x.email === u.email)?.id;
    } else {
      userId = data.user?.id;
    }
    if (!userId) throw new Error(`تعذر تحديد user_id لـ ${u.email}`);

    // الدور
    const { error: roleErr } = await admin.from('user_roles')
      .upsert({ user_id: userId, role: u.role }, { onConflict: 'user_id,role' });
    if (roleErr) throw new Error(`role ${u.email}: ${roleErr.message}`);

    // الربط بالصف
    if (u.link) {
      const { error: linkErr } = await admin.from(u.link.table)
        .update({ user_id: userId }).eq('id', u.link.id);
      if (linkErr) throw new Error(`link ${u.email}: ${linkErr.message}`);
    }
    if (u.role === 'supervisor') {
      const { error: supErr } = await admin.from('supervisors')
        .upsert({ user_id: userId, full_name: u.fullName ?? u.email, scope: 'general' }, { onConflict: 'user_id' });
      if (supErr) throw new Error(`supervisor ${u.email}: ${supErr.message}`);
    }
    console.log(`✓ ${u.role.padEnd(13)} ${u.email}`);
  }
  console.log('\nتم. جربي الدخول بأي من الحسابات أعلاه.');
}

main().catch((e) => { console.error(e); process.exit(1); });
