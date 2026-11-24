# خطة الإغلاق النهائي لمشروع «وِنس» (Wens v1.0.0 Endgame Blueprint)

> [!CAUTION]
> **القاعدة الحاكمة:** لا ميزة خارجية جديدة، ولا توسع في Android أو LAN Sync أو `.wenspack`، حتى يُقفل إصدار **`Windows Desktop v1.0.0`** بنسبة ١٠٠٪ ويُستخدم يومياً بلا خطأ واحد.

---

## ١. الثغرات الثماني الحقيقية المكتشفة في الإصدار `0.4.7`

1. **غياب الشريط المدمج داخل `Windows Taskbar`:** الاعتماد الحالي على `overlay.html` (`560×178` مخفي افتراضياً) يفقد المستخدم الوعي الصامت المستمر بموعد الصلاة القادمة والعد التنازلي أثناء العمل.
2. **عودة المشاريع والأفكار المحذوفة بعد إعادة التشغيل (`Zombie Data Bug`):** غياب أوامر `project_update`, `project_delete`, `idea_delete` في `src-tauri/src/storage.rs` مع منع الحذف في `reconcile_legacy_snapshot` داخل `crates/core-rust/src/database.rs`.
3. **بيانات وهمية ثابتة في الواجهة (`Hardcoded Demo Data`):** أهداف وأفكار ومشاريع وحزم `.wenspack` وهمية في `apps/app-ui/src/main.tsx` (الأسطر `6018-6267` و`7175-7189`).
4. **منع جهاز Windows من السكون `Sleep` طوال ٢٤ ساعة يومياً:** استدعاء `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` كل ثانيتين في `src-tauri/src/lib.rs` (الأسطر `809-815`) طوال اليوم بدون شرط نافذة السحور الليلية.
5. **نواقص الاستخدام اليومي في `SettingsView`:** غياب مفتاح التشغيل التلقائي مع Windows (`autostart_set`)، إخفاء زر قسم «الموقع والمواقيت» بكلاس `sr-only`، غياب قائمة المدن الأوفلاين، وغياب أزرار التصدير والاستعادة للنسخة الاحتياطية.
6. **انفصام التخزين بين `localStorage` و`SQLite`:** بقاء سجلات العبادة والختمة والأذكار والقضاء وجلسات العمل ومسودات الاستوديو خارج `wens.sqlite3`.
7. **شاشات غير مكتملة في القائمة الرئيسية:** شاشة `HistoryView` تعرض أرقام اليوم فقط وجدول ترحيل تقني، وشاشة `Devices` تعرض زراً معطلاً `disabled`.
8. **تضخم `apps/app-ui/src/main.tsx` إلى `9,087` سطراً** وبقاء نافذة `WebView2` الرئيسية في الذاكرة عند الإغلاق إلى الـ Tray.

---

## ٢. مراحل التنفيذ للإغلاق النهائي (`v0.4.7` → `v1.0.0`)

- **المرحلة 0 (التطهير وإصلاح منع السكون):**
  - تقييد `set_system_keep_awake` في `src-tauri/src/lib.rs` بنافذة ٣ ساعات قبل الفجر عند تفعيل السحور فقط.
  - حذف جميع البيانات الوهمية الثابتة من `Projects` و`Modules`، وإخفاء `Devices` غير المكتملة من القائمة المرئية ونقل `Modules` إلى إعدادات المطور.
- **المرحلة 1 (`SQLite v3` كمصدر حقيقة وحيد):**
  - ترقية قاعدة البيانات إلى `SCHEMA_VERSION = 3` وإضافة جداول `daily_worship_logs`, `work_sessions`, `domain_kv_store` وحقل `goal` للمشاريع.
  - إضافة أوامر `project_update`, `project_delete`, `idea_update`, `idea_delete`, `idea_promote_to_project`, `work_session_save`, `history_range_get`, `backup_export_file`, `backup_restore_file` مع ترحيل تلقائي لبيانات `localStorage` الحالية.
- **المرحلة 2 (شريط مهام ويندوز الأصلي — `Native Win32 Taskbar Strip & Flyout`):**
  - بناء `src-tauri/src/taskbar_widget.rs` بواجهة `Win32 GDI/DirectWrite` أصلية خفيفة (`< 0.5 MB RAM`, `0% CPU`) مدمجة داخل `Shell_TrayWnd` (`الفجر 04:37 ص | بعد 08:30`) مع دعم `TaskbarCreated`, `WM_DPICHANGED`, الوضع الداكن/الفاتح، ومؤشر الوضوء والتركيز الاختياري، ونافذة `Flyout` منبثقة فوق الشريط عند الضغط.
- **المرحلة 3 (تفكيك `main.tsx` إلى شاشات معزولة):**
  - فصل الشاشات في `apps/app-ui/src/views/*` مع الحفاظ على محددات الاختبار وعقود `smoke-test.mjs`.
- **المرحلة 4 (إقفال تجربة المستخدم اليومية):**
  - قاعدة بيانات مدن عربية وعالمية أوفلاين (`cities-catalog.ts`)، معالج أول تشغيل في ٩٠ ثانية (`OnboardingWizard.tsx`)، ربط التشغيل التلقائي مع Windows، والنسخ الاحتياطي الكامل.
- **المرحلة 5 (تحسين الذاكرة والاستيقاظ من السكون):**
  - تخفيض استهلاك الذاكرة في الخلفية عند الإغلاق للـ Tray، ومعالجة قفزات الوقت بعد `Sleep / Hibernate`.
- **المرحلة 6 (بوابة الإطلاق النهائي `v1.0.0`):**
  - اجتياز جميع اختبارات `cargo test --workspace`, `prayer-regression-test.mjs`, `npm run test:vnext`, `smoke-test.mjs` وبناء وتثبيت `وِنس_1.0.0_x64-setup.exe`.
