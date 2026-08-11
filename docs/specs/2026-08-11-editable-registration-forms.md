# تحرير نماذج التسجيل من لوحة الإدارة

## السياق
نصوص نماذج التسجيل الثلاثة (تسجيل الطالبات /register، اتفاقية المسمعات /register-teacher،
قياس رضا الاستضافات) مثبتة في الكود؛ أي تعديل موسمي (خيارات المواعيد، بنود الاتفاقية،
عبارات الترحيب) يتطلب مطورًا. المطلوب: المديرة تعدلها من النظام، مع أسئلة إضافية بسيطة.

## القرار (معتمد من المالكة)
- الحقول الأساسية ثابتة؛ النصوص والخيارات قابلة للتعديل؛ أسئلة إضافية (نص/اختيار/متعدد).
- إجابات الأسئلة الإضافية أعمدة في جداول الطلبات + CSV.
- تعديل مباشر يسري فورًا (بلا معاينة/مسودات) — YAGNI: لا أنواع حقول معقدة ولا تعدد نسخ.

## البنية
1. **form_settings**(form_key PK, config jsonb): سجل لكل نموذج. قراءة عامة (anon)، كتابة admin.
   - student_register: title, welcome, times_note, pledge_text, success_body, day_options[{value,label}]
   - teacher_agreement: duration_text, maqraa_items[], teacher_items[], closing_text, min_hours, max_hours
   - hosting_feedback: prompt_label, comment_placeholder
2. **form_questions**(id, form_key, label, qtype text|select|multiselect, options[], required,
   sort_order, is_active): قراءة عامة للنشط، إدارة admin. الحذف = تعطيل (الإجابات القديمة تبقى).
3. **extra_answers jsonb** في applicants وteacher_agreements وhosting_feedback ({question_id: إجابة}).
4. الواجهة: صفحة إدارة «النماذج» (تبويب لكل نموذج) + النماذج العامة تقرأ الإعدادات مع
   قيم افتراضية = النصوص الحالية (fallback عند غياب الصف).

## التحقق
تعديل نص + إضافة سؤال اختيار من اللوحة → /register يعكسهما → إرسال طلب →
العمود الجديد يظهر في المتقدمات وفي CSV.
