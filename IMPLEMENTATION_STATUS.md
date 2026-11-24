# حالة التنفيذ — Wens PC `v1.0.0`

تعكس هذه الصفحة الحالة الفعلية والمُتحقَّق منها لمشروع **وِنس** عند إطلاق **`Windows Desktop v1.0.0`** (مقابل البنود المؤجّلة صراحةً لما بعد `v1.0.0`).

---

## مصفوفة المكونات والجاهزية (`v1.0.0`)

| المكوّن | الحالة | التفاصيل والأدلة الفعلية |
|---|---|---|
| **الواجهة الرسمية (`apps/app-ui` → `dist-vnext`)** | مكتمل ومُعتمد لـ `v1.0.0` | واجهة `React 19 + TypeScript` متجاوبة حتى `760×600` وتكبير `200%` مع `@container`، حارس `AppErrorBoundary`، تباين WCAG AA كامل للسمات الداكنة والفاتحة (`dawn-sand`)، معالج أول تشغيل بقاعدة مدن أوفلاين (`cities-catalog.ts`)، وحظر كامل للبيانات الوهمية الثابتة |
| **صفحة «اليوم» والعبادة والقضاء والختمة** | مكتمل في `v1.0.0` | الصلوات الخمس، حالة الصيام، مهام اليوم، عداد العمل، القضاء الفائت للصلاة والصيام، متابعة الختمة وورد القرآن، الأذكار اليومية، والتقويم الهجري والأيام البيض |
| **محرك مواقيت الصلاة والقبلة (`prayer.rs` + `astronomy.ts`)** | مكتمل ومُحصّن في `v1.0.0` | 18 طريقة حساب مع دعم جميع الأسماء المستعارة (`umm_al_qura`/`makkah`، `muslim_world_league`/`mwl`، `north_america`/`isna`، إلخ)، مذهب العصر الحنفي والجمهور، حساب IANA الديناميكي للتوقيت الصيفي/الشتوي، حماية `0°` و`NaN`/`Infinity`، وبدائل خطوط العرض العليا والقطبية بترتيب مضمون للفروض الستة |
| **قاعدة البيانات (`SQLite v3` — `database.rs` + `storage.rs`)** | مكتمل ومُحصّن في `v1.0.0` | اتصال مشترك محمي (`with_database`) + تفضيلات مخزّنة مؤقتًا في RAM (`get_cached_preferences`)، وضع `WAL` + `busy_timeout(5000ms)` + معاملات `BEGIN IMMEDIATE` الذرية، ترحيل آلي من `v1/v2 → v3`، عزل وتعافٍ تلقائي للقاعدة التالفة (`.corrupt.<epoch>.bak`)، CRUD كامل للمشاريع والأفكار بلا عودة محذوفات (`Zombie Data`)، وتصدير/استعادة JSON كاملة عبر مربع حوار Windows الأصلي |
| **مُجدول التنبيهات والصوت (`lib.rs` + `AudioService`)** | مكتمل ومُحصّن في `v1.0.0` | مُجدول Rust مستقل عن النافذة مع إشعارات Windows Toast، احترام ساعات الهدوء، إعدادات تثبيت أولي آمنة (`fasting_enabled = false`, `prevent_sleep_for_suhoor = false`)، إدارة `SetThreadExecutionState` على خيط المجدول فقط، فتح `OutputStream` عند الطلب وإغلاقه عند السكون (لتجاوز فصل/توصيل السماعات)، ومعرّف جيل تشغيل لمنع تداخل المؤقتات |
| **الكبسولة الذكية (`Dynamic Island` — `overlay.*` + `island_window.rs`)** | مكتمل ومُرقّى في `v1.0.0` | مزامنة ذرية للـ Click-through وأبعاد التوسيع (`island_set_expanded_bounds`)، توجيه علوي أو سفلي، اختصار `Ctrl+Alt+I` مع تنظيف `UnregisterHotKey` عند الإغلاق، حماية كاملة من XSS في الحافظة والاجتماعات ورف التنزيلات، إيقاف المؤقتات والرسوم المتحركة عند الإخفاء توفيرًا للبطارية |
| **وحدات الكبسولة الأصلية (SMTC / Clipboard / Shelf / Privacy / Wellbeing / ICS / Radio)** | مكتمل ومُحصّن في `v1.0.0` | **SMTC:** تهيئة COM MTA مرة واحدة وإعادة استخدام `SessionManager` (أزال استنزاف الـ CPU والخيوط)؛ **Clipboard:** ذاكرة RAM فقط مع حد 64 KB واحترام علامات استثناء مديري كلمات المرور؛ **Shelf:** تقييد صارم داخل `Downloads` القانوني عبر `SHOpenFolderAndSelectItems`؛ **Privacy Dots:** قراءة `REG_QWORD` صريحة لـ `CapabilityAccessManager`؛ **Wellbeing:** حساب `wrapping_sub` آمن لتجاوز 49.7 يومًا + ترحيب العودة بعد 15 دقيقة خمول؛ **ICS:** `https://` فقط + حظر SSRF + محلل RFC 5545 كامل (`RRULE`/`TZID`)؛ **Quran Radio:** 33 محطة `https://` مع Fallback ومهلة استعادة وحظر فوري عند `Strict Offline` |
| **شريط مهام Windows الأصلي (`taskbar_widget.rs`)** | مكتمل في `v1.0.0` | ويدجت Win32 GDI أصلية داخل `Shell_TrayWnd` بدون فتح قاعدة البيانات في كل Tick، تعافٍ تلقائي من إعادة تشغيل `explorer.exe` (`WensTaskbarObserverClass` + `TaskbarCreated`)، تكيّف مع DPI والوضع الداكن/الفاتح، ونافذة منبثقة تفاعلية (`Flyout`) عند الضغط اليسار |
| **الرفيق العائم (`pet.*`)** | مكتمل ومُحصّن في `v1.0.0` | إحداثيات فيزيائية موحّدة للشاشات المتعددة والـ DPI المختلط، سحب عبر `setPointerCapture`، تتبع المؤشر بالعينين عبر متغيرات CSS، قائمة سياقية مضغوطة بلا قص حتى `360×260`، إصلاح خطأ `SyntaxError` في `companion-sounds.js`، ومزامنة مباشرة مع `SQLite v3` |
| **السجلات، التشخيص، وإعادة ضبط المصنع** | مكتمل في `v1.0.0` | سجل دوّار `2 MB` في `%APPDATA%\com.wens.offline\logs\wens.log` مع `std::panic::set_hook`، فتح مجلد السجلات من الإعدادات، نسخ تقرير تشخيص معقّم خالٍ من البيانات الخاصة، و`Factory Reset` يمسح البيانات النشطة ويحذف ملف النسخ الوقائي التلقائي من الإصدارات السابقة. يمكن تصدير نسخة يدويًا قبل المسح |
| **المشاريع، الأفكار، التركيز، الاستوديو، والسجل** | مكتمل في `v1.0.0` | CRUD كامل على `SQLite v3` مع `ConfirmModal` قبل الحذف، التقاط فكرة بـ `Ctrl+I`، مؤقت تركيز يسجل في `work_session_records`، شاشة `السجل` متعددة الأيام، ومعمل الإبداع المحلي |
| **موصلات CLI الاختيارية (`codex exec` / `agy`)** | مكتمل لـ Desktop | تشغيل غير متزامن (`spawn_blocking`) مقيّد بالنافذة الرئيسية، حظر مجلدات النظام وUNC، سقف `2 MB` للمخرجات، قراءة فقط مع Diff قبل الاعتماد، وإيقاف كامل في الوضع الصارم بدون شبكة |
| **حزم البيانات `.wenspack` (`crates/module-runtime`)** | نواة أمان مكتملة؛ الكتالوج لاحقًا | تحقق من `id`/`version`، توقيع Ed25519 قانوني على `(manifest.json + content_hash)`، حماية ضد Zip Bomb بحدود قراءة حقيقية، حظر الامتدادات التنفيذية وNTFS ADS؛ الكتالوج الرسمي مؤجل لما بعد `v1.0.0` |
| **المزامنة المحلية (`LAN Sync` — `crates/core-rust/src/lan.rs`)** | بدائيات تشفير محصّنة؛ واجهة الربط لاحقًا | ترقية إطارات `ChaCha20-Poly1305` لاستخدام Nonce عشوائي 12-byte من `OsRng` لكل إطار (v2 frame) + اشتقاق `X25519`؛ اكتشاف mDNS وواجهة ربط الأجهزة مؤجلة لما بعد `v1.0.0` |
| **تطبيق Android (`apps/android-shell`, `scripts/build-android-debug.ps1`)** | تجريبي (خارج نطاق إطلاق `v1.0.0`) | يبني APK Debug لـ `arm64-v8a` محليًا. المتبقي قبل إطلاق Android مستقل: أذونات `POST_NOTIFICATIONS`/`RECEIVE_BOOT_COMPLETED`/المنبه الدقيق، مُجدول خلفية Android (WorkManager/AlarmManager)، أيقونة مخصصة، دعم `x86_64`، وتوقيع Release Keystore |
| **التحديث التلقائي (`tauri-plugin-updater`)** | مخطّط لما بعد `v1.0.0` | موثّق بالكامل في [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) لربطه لاحقًا مع توقيع Ed25519 واحترام `Strict Offline` |

---

## حالة البناء والجودة لـ `v1.0.0`

- **بناء محمول (Portable):** إزالة مسار `D:/cargo-target-wens` الثابت من `.cargo/config.toml` ليُبنى المشروع افتراضيًا في `target/` على أي جهاز أو CI، مع اكتشاف تلقائي للكاش المحلي في `run-tauri.mjs` فقط عند وجوده وعدم تعيين `CARGO_TARGET_DIR`.
- **ملف الإصدار التنفيذي المضغوط (`[profile.release]`):** `strip = "symbols"`, `lto = "thin"`, `opt-level = "s"`, `codegen-units = 1`، مع ربط وحيد لـ `Microsoft.Windows.Common-Controls v6` (`0` تحذيرات دمج `.rsrc`).
  - حجم `wens-desktop.exe`: **`13.17 MB`** (`13,172,736` بايت، بانخفاض **`65.8%`** عن النسخة السابقة `38.50 MB`).
  - حجم مثبّت NSIS (`release\وِنس_1.0.0_x64-setup.exe`): **`8.25 MB`** (`8,250,438` بايت، `7.87 MiB`).
- **التوقيع الرقمي (Authenticode):** تم توفير سكربت [`scripts/sign-release.ps1`](scripts/sign-release.ps1) لدعم التوقيع بشهادة `.pfx` محلية أو مخزن شهادات Windows أو **Azure Trusted Signing** مع ختم زمني `SHA-256 RFC3161` والتحقق التلقائي عبر `Get-AuthenticodeSignature`. (الإصدارات المجتمعية غير الموقّعة موثّق لها إفصاح SmartScreen صريح في [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).)
- **الخصوصية والترخيص:** توثّق [`PRIVACY.md`](PRIVACY.md) سياسة الخصوصية. كود وِنس بترخيص [`MIT`](LICENSE)، وخط `Amiri Quran` المستخدم في الكبسولة بترخيص [`SIL OFL 1.1`](fonts/OFL.txt). راجع [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) لبقية المكوّنات.
