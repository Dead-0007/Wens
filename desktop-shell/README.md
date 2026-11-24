# Desktop shell

طبقة Windows الحالية موجودة في `src-tauri` للحفاظ على مسارات التحديث وبيانات
0.3.x. هذا المجلد يجمع الأصول الخاصة بسطح المكتب التي لا تدخل في `app-ui`.

يُنقل `src-tauri` إلى `apps/desktop-shell/src-tauri` فقط بعد إصدار انتقالي يثبت
أن التحديثات القديمة لا تفقد مسار AppData أو هوية التطبيق `com.wens.offline`.

