# Android shell

هذا المجلد هو نقطة دخول Android في الـmonorepo. النواة المشتركة موجودة في
`crates/core-rust` والواجهة المشتركة في `apps/app-ui`.

تم توليد مشروع Tauri/Gradle فعلي داخل `src-tauri/gen/android` وبُني APK تجريبي
لـ`arm64-v8a` محليًا. الواجهة والأصول تأتي من `dist/`، والنواة Rust المشتركة
تُبنى لنفس المعمارية. البناء Debug متعمد ولا يستخدم Code Signing.

يحتوي Shell على تكاملات النظام التالية، مع إبقاء قواعد المنتج في النواة:

- Background Scheduler للتنبيهات المحلية.
- Home-screen Widget للصلاة القادمة وموعد الوضوء.
- Persistent interactive notification للـChecklist والـTimer.
- فقاعة اختيارية بعد موافقة `SYSTEM_ALERT_WINDOW` الصريحة.
- Android Keystore لهوية الجهاز ومفاتيح الاقتران.

لا توضع قواعد المنتج في Kotlin؛ تستدعي هذه الطبقة `wens-core` حتى تظل النتائج
متكافئة مع Windows.
