import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mainTsxPath = resolve('apps/app-ui/src/main.tsx');
let mainTsx = readFileSync(mainTsxPath, 'utf8');

// 1. Update horizon-topbar in main.tsx
const oldTopbarRegex = /<header className="topbar horizon-topbar">[\s\S]*?<\/header>/;
const newTopbar = `<header className="topbar horizon-topbar">
          <div className="horizon-brand" onClick={() => go('today')} style={{ cursor: 'pointer' }}>
            <strong>Wens</strong>
          </div>

          {/* Top 3 Primary Destinations */}
          <nav className="horizon-nav" aria-label="أفق اليوم الرئيسي">
            <button
              className={\`horizon-nav-btn \${view === 'today' ? 'active' : ''}\`}
              onClick={() => go('today')}
              aria-current={view === 'today' ? 'page' : undefined}
            >
              <Home size={16} />
              <span>اليوم</span>
            </button>
            <button
              className={\`horizon-nav-btn \${view === 'worship' ? 'active' : ''}\`}
              onClick={() => go('worship')}
              aria-current={view === 'worship' ? 'page' : undefined}
            >
              <MoonStar size={16} />
              <span>العبادة والسجل</span>
              {getBacklogSummary(backlog).totalPendingCount > 0 && (
                <span className="horizon-nav-badge">
                  {digits(getBacklogSummary(backlog).totalPendingCount)}
                </span>
              )}
            </button>
            <button
              className={\`horizon-nav-btn \${['projects', 'work', 'ideas', 'studio'].includes(view) ? 'active' : ''}\`}
              onClick={() => go('projects')}
              aria-current={['projects', 'work', 'ideas', 'studio'].includes(view) ? 'page' : undefined}
            >
              <Lightbulb size={16} />
              <span>المشروعات والأفكار</span>
            </button>
          </nav>

          <div className="horizon-top-right">
            <button
              className="horizon-gear-btn"
              onClick={() => go('settings')}
              aria-label="الإعدادات"
              title="الإعدادات (تخصيص، أجهزة، حزم، سجل)"
            >
              <Settings size={18} />
            </button>

            {audioPlaying && (
              <button
                className="stop-audio-btn"
                onClick={handleStopAudio}
                aria-label="إيقاف الصوت فورًا"
              >
                <VolumeX size={17} />
                <span>إيقاف الصوت</span>
              </button>
            )}
          </div>
        </header>`;

if (oldTopbarRegex.test(mainTsx)) {
  mainTsx = mainTsx.replace(oldTopbarRegex, newTopbar);
  console.log('✓ Updated horizon-topbar in main.tsx');
} else {
  console.error('✗ Failed to match oldTopbarRegex in main.tsx');
}

// 2. Update Today component in main.tsx to match 02-time-horizon.png exactly
const oldTodayRegex = /export function Today\(\{[\s\S]*?^export function Worship/m;

const newTodayComponent = `export function Today({
  data,
  prayer,
  next,
  following,
  checks,
  toggle,
  completed,
  timerStarted,
  setTimerStarted,
  workTime,
  go,
  onOpenBacklog,
  pendingBacklogCount,
  minuteNow: propMinuteNow,
}: {
  data: BootstrapPayload;
  prayer: PrayerDay | null;
  next: PrayerDay['times'][number] | null;
  following: PrayerDay['times'][number] | null;
  checks: Record<string, boolean>;
  toggle: (k: string) => void;
  completed: number;
  timerStarted: number | null;
  setTimerStarted: (n: number | null) => void;
  workTime: string;
  go: (id: ViewId) => void;
  onOpenBacklog?: () => void;
  pendingBacklogCount?: number;
  minuteNow?: number;
}) {
  const current =
    data.projects.find((project) => project.status === 'قيد التنفيذ') || data.projects[0];
  const lead = Number(data.settings.wuduLeadMinutes) || 15;
  const minuteNow = propMinuteNow ?? (new Date().getHours() * 60 + new Date().getMinutes());
  const minutesUntilNext = next ? (next.minutesFromMidnight - minuteNow + 1440) % 1440 : 999;
  const inWuduWindow = minutesUntilNext <= lead && minutesUntilNext >= 0;

  // Single in-window reminder banner state
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  // Daily note state
  const todayKey = dateKey();
  const [todayNote, setTodayNote] = useState<string>(() => {
    try {
      return localStorage.getItem(\`wens-today-note-\${todayKey}\`) || '';
    } catch {
      return '';
    }
  });
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(todayNote);

  const handleSaveNote = () => {
    const trimmed = noteDraft.trim();
    setTodayNote(trimmed);
    setIsEditingNote(false);
    try {
      localStorage.setItem(\`wens-today-note-\${todayKey}\`, trimmed);
    } catch {}
  };

  // Date strings matching 02-time-horizon.png
  const now = new Date();
  const weekdayName = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(now);
  const gregorianStr = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const hijriToday = gregorianToHijri(now);
  const hijriStr = \`\${digits(hijriToday.day)} \${hijriToday.monthName} \${digits(hijriToday.year)} هـ\`;

  const prayerTimes = prayer?.times || [];
  const fajrObj = prayerTimes.find((p) => p.key === 'fajr');
  const maghribObj = prayerTimes.find((p) => p.key === 'maghrib');

  // Sun celestial arc progress (between Fajr and Maghrib)
  const fajrMins = fajrObj?.minutesFromMidnight ?? 300;
  const maghribMins = maghribObj?.minutesFromMidnight ?? 1080;
  const isDaytime = minuteNow >= fajrMins && minuteNow <= maghribMins;
  const sunProgress = isDaytime
    ? Math.max(0.04, Math.min(0.96, (minuteNow - fajrMins) / Math.max(1, maghribMins - fajrMins)))
    : 0.5;

  // Timeline nodes sequence: Fajr, Sunrise (informational), Dhuhr, Asr, Maghrib, Isha
  const fivePrayers = [
    { key: 'fajr', name: 'الفجر', isObligatory: true },
    { key: 'sunrise', name: 'الشروق', isObligatory: false },
    { key: 'dhuhr', name: 'الظهر', isObligatory: true },
    { key: 'asr', name: 'العصر', isObligatory: true },
    { key: 'maghrib', name: 'المغرب', isObligatory: true },
    { key: 'isha', name: 'العشاء', isObligatory: true },
  ].map((item) => {
    const found = prayerTimes.find((p) => p.key === item.key);
    const minutes = found?.minutesFromMidnight ?? 0;
    const isNext = item.isObligatory && next?.key === item.key;
    const isDone = item.isObligatory ? Boolean(checks[item.key]) : false;
    const isPassed = item.isObligatory && !isNext && !isDone && minuteNow > minutes;
    return {
      ...item,
      minutes,
      isNext,
      isDone,
      isPassed,
    };
  });

  const formatCountdownText = (mins: number) => {
    if (mins <= 0) return 'الآن';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return \`\${digits(h)} ساعة و \${digits(m)} دقيقة\`;
    if (h > 0) return \`\${digits(h)} ساعة\`;
    return \`\${digits(m)} دقيقة\`;
  };

  const isReminderActive =
    inWuduWindow &&
    !reminderDismissed &&
    (!snoozedUntil || Date.now() > snoozedUntil);

  const handleSnooze = () => {
    setSnoozedUntil(Date.now() + 10 * 60 * 1000);
  };

  const handleDismiss = () => {
    setReminderDismissed(true);
  };

  return (
    <div className="horizon-today-wrapper">
      {/* 1. Celestial Arc & Prayer Timeline Card matching 02-time-horizon.png */}
      <section className="horizon-timeline-card prayer-timeline-card" aria-label="أفق الصلوات الخمس اليوم">
        {/* Top bar inside card: Right date, Left reflection */}
        <div className="horizon-card-topbar">
          <div className="horizon-date-block">
            <h1 className="horizon-weekday">{weekdayName}</h1>
            <div className="horizon-hijri-date">{hijriStr}</div>
            <div className="horizon-gregorian-date">{gregorianStr}</div>
          </div>

          {/* Central Bold Countdown */}
          <div className="horizon-center-countdown">
            <span className="horizon-countdown-kicker">
              {next ? \`\${next.nameAr} بعد\` : 'الصلاة القادمة بعد'}
            </span>
            <strong className="horizon-countdown-val">
              {formatCountdownText(minutesUntilNext)}
            </strong>
            {inWuduWindow && (
              <span className="horizon-wudu-badge">
                <Droplets size={12} />
                <span>حان وقت الوضوء ({digits(lead)} دقيقة)</span>
              </span>
            )}
          </div>

          <div className="horizon-reflection-block">
            <span className="horizon-quote-line">عمل متزن ..</span>
            <strong className="horizon-quote-line bold">وقرب أعمق</strong>
          </div>
        </div>

        {/* Celestial Arc with Traveling Sun & Crescent Moon */}
        <div className="horizon-celestial-arc-wrap" aria-hidden="true">
          <svg className="horizon-celestial-svg" viewBox="0 0 1000 60" preserveAspectRatio="none">
            <path
              d="M 20,54 Q 500,6 980,54"
              className="horizon-celestial-arc-path"
            />
          </svg>
          {isDaytime && (
            <div
              className="horizon-sun-disc"
              style={{
                left: \`\${sunProgress * 100}%\`,
                bottom: \`\${Math.sin(sunProgress * Math.PI) * 36 + 6}px\`,
              }}
              title="موضع الشمس في أفق اليوم"
            />
          )}
          <span className="horizon-moon-crescent">☾</span>
        </div>

        {/* 5-Prayer + Sunrise Dots on Horizon Line */}
        <div className="horizon-five-prayers" role="region" aria-label="شريط أفق الصلوات">
          <div className="horizon-timeline-baseline" aria-hidden="true" />
          {fivePrayers.map((p) => (
            <div
              key={p.key}
              className={\`horizon-prayer-node \${p.isNext ? 'next' : ''} \${p.isDone ? 'done' : ''} \${!p.isObligatory ? 'sunrise' : ''}\`}
              onClick={() => p.isObligatory && toggle(p.key)}
              title={p.isDone ? \`تمت صلاة \${p.name}\` : p.isObligatory ? \`تسجيل صلاة \${p.name}\` : 'معلومة إرشادية'}
              role={p.isObligatory ? 'button' : undefined}
              tabIndex={p.isObligatory ? 0 : undefined}
              onKeyDown={(e) => {
                if (p.isObligatory && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  toggle(p.key);
                }
              }}
              aria-pressed={p.isObligatory ? p.isDone : undefined}
            >
              {p.isNext && <span className="prayer-vertical-beam" aria-hidden="true" />}
              <span className={\`prayer-dot \${p.isNext ? 'next' : p.isDone ? 'done' : p.isObligatory ? 'obligatory' : 'sunrise'}\`} />
              <strong className="prayer-name">{p.name}</strong>
              <span className="prayer-time">{formatMinutes(p.minutes)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2. In-Window Foreground Single Notification Banner */}
      {isReminderActive && (
        <aside className="horizon-single-reminder" role="alert" aria-label="تنبيه الاستعداد للصلاة">
          <div className="reminder-content">
            <Bell size={18} className="reminder-bell" />
            <span className="reminder-text">
              حان وقت الاستعداد لصلاة {next?.nameAr} قريباً — قوم للوضوء بهدوء
            </span>
          </div>
          <div className="reminder-actions">
            <button className="reminder-snooze-btn" onClick={handleSnooze}>
              فكرني بعد 10 دقائق
            </button>
            <button
              className="reminder-dismiss-btn"
              onClick={handleDismiss}
              aria-label="إغلاق التنبيه"
            >
              <X size={16} />
            </button>
          </div>
        </aside>
      )}

      {/* 3. Two-Zone Balanced Layout */}
      <div className="horizon-zones-grid">
        {/* Right Card: خطوة العمل الحالية */}
        <section className="horizon-work-card work-focus-zone" aria-labelledby="workStepTitle">
          <div className="zone-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={17} style={{ color: 'var(--muted)' }} />
              <strong id="workStepTitle" style={{ fontSize: '15px', color: 'var(--ink)' }}>
                خطوة العمل الحالية
              </strong>
            </div>
            <div className="horizon-project-badge">
              <span className="badge-dot" />
              <span>{current?.title || 'مشروع الموقع الجديد'}</span>
            </div>
          </div>

          <div className="horizon-work-body">
            <span className="horizon-step-kicker">الخطوة التالية:</span>
            <h2 className="horizon-step-title">
              {current?.currentTask || 'صياغة الرسالة الأولى'}
            </h2>
            <p className="horizon-step-desc">
              {current?.description || 'كتابة مسودة الرسالة لصفحة الترحيب مع توضيح القيمة باختصار.'}
            </p>
          </div>

          <div className="horizon-work-actions">
            <button className="horizon-all-steps-btn" onClick={() => go('projects')}>
              <ListTodo size={16} />
              <span>عرض جميع الخطوات</span>
            </button>
            <button
              className="horizon-focus-btn"
              onClick={() => setTimerStarted(timerStarted ? null : Date.now())}
            >
              {timerStarted ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              <span>{timerStarted ? \`إيقاف مؤقت (\${workTime})\` : 'بدء التركيز'}</span>
            </button>
          </div>
        </section>

        {/* Left Card: مراجعة اليوم */}
        <section className="horizon-review-card quiet-review-zone" aria-labelledby="todayReviewTitle">
          <div className="zone-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={17} style={{ color: 'var(--muted)' }} />
              <strong id="todayReviewTitle" style={{ fontSize: '15px', color: 'var(--ink)' }}>
                مراجعة اليوم
              </strong>
            </div>
          </div>

          <div className="horizon-review-body">
            {isEditingNote ? (
              <div className="horizon-note-input-row">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="اكتب ملاحظة مختصرة عن يومك وإنجازك..."
                  maxLength={280}
                  autoFocus
                />
                <div className="horizon-note-actions">
                  <button className="primary-button" style={{ minHeight: '34px', padding: '0 14px' }} onClick={handleSaveNote}>
                    حفظ الملاحظة
                  </button>
                  <button className="secondary-button" style={{ minHeight: '34px', padding: '0 12px' }} onClick={() => setIsEditingNote(false)}>
                    إلغاء
                  </button>
                </div>
              </div>
            ) : todayNote ? (
              <div className="horizon-saved-note-wrap">
                <p className="horizon-saved-note-text">{todayNote}</p>
                <button
                  className="secondary-button"
                  style={{ minHeight: '30px', padding: '0 10px', fontSize: '12px', marginTop: '8px' }}
                  onClick={() => {
                    setNoteDraft(todayNote);
                    setIsEditingNote(true);
                  }}
                >
                  تعديل الملاحظة
                </button>
              </div>
            ) : (
              <div className="horizon-review-empty-state">
                <FileText size={32} className="empty-state-icon" />
                <p>ستظهر هنا ملاحظاتك المختصرة في نهاية اليوم</p>
              </div>
            )}
          </div>

          <div className="horizon-review-foot">
            <button
              className="horizon-add-note-btn"
              onClick={() => setIsEditingNote(true)}
            >
              + إضافة ملاحظة اليوم
            </button>
          </div>
        </section>
      </div>

      {/* 4. Ambient Horizon Footer matching 02-time-horizon.png */}
      <footer className="horizon-ambient-footer" aria-label="تذييل أفق اليوم">
        <div className="horizon-footer-side right">
          <Leaf size={14} style={{ color: 'var(--primary)' }} />
          <span>بالنية نصنع توازناً</span>
        </div>
        <div className="horizon-footer-emblem" aria-hidden="true">
          <span className="emblem-halo" />
          <span className="emblem-disc">
            <Leaf size={15} className="emblem-leaf-svg" />
          </span>
        </div>
        <div className="horizon-footer-side left">
          <span>خطوة جيدة ... يوم أفضل</span>
        </div>
      </footer>
    </div>
  );
}

export function Worship`;

if (oldTodayRegex.test(mainTsx)) {
  mainTsx = mainTsx.replace(oldTodayRegex, newTodayComponent);
  console.log('✓ Updated Today component in main.tsx');
} else {
  console.error('✗ Failed to match oldTodayRegex in main.tsx');
}

writeFileSync(mainTsxPath, mainTsx, 'utf8');
console.log('Finished updating apps/app-ui/src/main.tsx');
