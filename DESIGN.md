# وِنس Design System

## Scene

غرفة عمل ليلية هادئة؛ ضوء شاشة بارد على مكتب حقيقي، وشريط ضوء قرمزي صغير يلفت الانتباه فقط عندما يحين وقت فعل مهم.

## Color strategy

Restrained product palette: خلفية شبه سوداء محايدة، والأساسي القرمزي/الماغنتا كضوء تركيز لا كطلاء شامل. ألوان الحالة محدودة ومقروءة.

## Tokens

```css
:root {
  --bg: oklch(0.105 0 0);
  --bg-elevated: oklch(0.145 0.012 352);
  --surface: oklch(0.175 0.014 352);
  --surface-2: oklch(0.215 0.018 350);
  --ink: oklch(0.965 0.012 352);
  --ink-muted: oklch(0.735 0.022 350);
  --ink-faint: oklch(0.565 0.022 350);
  --primary: oklch(0.555 0.17 355);
  --primary-hover: oklch(0.625 0.17 355);
  --primary-active: oklch(0.47 0.17 355);
  --accent: oklch(0.78 0.14 82);
  --success: oklch(0.73 0.15 155);
  --warning: oklch(0.78 0.14 76);
  --danger: oklch(0.66 0.16 25);
  --info: oklch(0.72 0.11 220);
  --border: oklch(0.32 0.018 350);
  --shadow-sm: 0 2px 8px oklch(0 0 0 / 0.2);
  --shadow-popover: 0 12px 32px oklch(0 0 0 / 0.34);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-state: cubic-bezier(0.45, 0, 0.55, 1);
}
```

## Typography

واجهة المنتج تستخدم `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` مع أوزان 400/500/600/700. لا نستخدم Display font للعناوين الوظيفية. العناوين ثابتة في rem حتى لا تتذبذب داخل نافذة سطح المكتب.

## Component vocabulary

- أزرار بارتفاع لا يقل عن 40px، Radius 8–12px، وحالات hover/active/focus/disabled.
- Panels بحدود خفيفة أو ظل واحد، وليس الاثنين كزينة.
- Tags بشكل pill فقط عندما تكون حالة أو فلترًا.
- Toast وBubble بحركة دخول تعتمد على transform/opacity فقط.
- Tabs وSidebar قياسيان بجانب غرفة وِنس البصرية.
- لا نستخدم gradients للنص، ولا خلفيات شبكية زخرفية، ولا بطاقات متطابقة بلا سبب.

## Motion

- دخول الفقاعات: 220ms ease-out.
- ضغط الزر: 90ms ease-state.
- تغير الحالة: 280ms ease-state.
- تنفس الشخصية: 3000ms ease-in-out.
- حركة عائمة للنجوم/الأوراق: 4000ms ease-in-out.
- `prefers-reduced-motion: reduce` يلغي الحركة المستمرة ويحتفظ بانتقالات قصيرة.
