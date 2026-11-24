/* وِنس V0.4 — local-first interaction layer with optional weather connectivity. */
const STORAGE_KEY = 'wens-local-v1';
const defaultState = {
  uiSchemaVersion: 9,
  view: 'today',
  ideas: [],
  projects: [],
  settings: { prePrayer: true, atPrayer: true, quietPrayer: true, soundChime: true, themeAccent: 'default', petAvatar: 'orb', petVisible: true, overlayWidget: true, wuduLeadMinutes: 15, bubbles: true, livelyPopups: false, quietDefault: false, strictOffline: false, weatherAuto: false, calcMethodAuto: true, latitude: 30.0444, longitude: 31.2357, locationLabel: 'القاهرة، مصر', countryCode: 'EG', timeZone: 'Africa/Cairo', fajrOffset: 0, maghribOffset: 0, ishaOffset: 0, hijriOffset: 0, calcMethod: 'egypt' },
  fasting: {
    mondayThursday: true,
    whiteDays: true,
    ramadan: true,
    today: false,
    custom: [],
    suhoorAlarm: {
      enabled: true,
      mode: 'time',
      customTime: '03:30',
      leadMinutes: 45,
      ramadan: true,
      whiteDays: false,
      mondayThursday: false,
      custom: false
    }
  },
  devotion: { quranEnabled: false, quranTarget: 'ayah-1', quranLog: {}, adhkarEnabled: false, adhkarGroups: { morning: true, evening: true, afterPrayer: false, sleep: false } },
  challenges: {
    catalog: [{ id: 'wens-quran-seven-pages', schemaVersion: 1, title: '٧ صفحات قرآن', description: 'اقرأ سبع صفحات على راحتك وسجّل كل صفحة بعد ما تخلصها.', category: 'quran', target: 7, unit: 'صفحة', step: 1, startsAt: null, endsAt: null, createdAt: '2026-08-29T00:00:00.000Z', publishedAt: '2026-08-29T00:00:00.000Z', source: 'bundled' }],
    enrollments: [],
    developerToolsOpen: false,
    enabled: true,
    randomSource: 'mixed',
    randomAuto: false,
    lastRandomAt: null,
    randomHistory: []
  },
  localContext: {
    weather: { temperatureC: null, humidityPct: null, apparentTemperatureC: null, windSpeedKmh: null, weatherCode: null, condition: '', source: '', updatedAt: null },
    economy: { usdEgp: null, gold21Egp: null, inflationPct: null, marketStatus: '', note: '', updatedAt: null },
    history: []
  },
  focusMinutes: 15,
  focusRunning: false,
  focusEndsAt: null,
  lastIdeaAt: null,
  nextPrompt: 0,
  marketing: { briefs: [], matrices: [], storyboards: [], metrics: [] },
  connectors: { staged: [], results: [], imported: [] },
  accountability: { days: {}, lastReminderAt: null },
  prayerBacklog: { autoTrack: true, trackingStartedAt: null, items: [] },
  fastingBacklog: { autoReview: true, trackingStartedAt: null, items: [] },
  workTimer: { running: false, startedAt: null, accumulatedMs: 0 },
  workSessions: [],
  notificationInbox: [],
  notificationLastReadAt: null,
  lastPrayerEvent: null,
  lastPrePrayerEvent: null,
  lastFastingEvent: null,
  lastSuhoorEvent: null,
  lastWelcomePopupDate: null
};

const prayerNames = [
  ['الفجر', 'قبل بداية اليوم', '☾'],
  ['الشروق', 'نافلة لو إنت صاحي · بلا تنبيه', '◒'],
  ['الظهر', 'منتصف النهار', '◉'],
  ['العصر', 'وقت الرجوع', '◔'],
  ['المغرب', 'إفطار وامتنان', '◐'],
  ['العشاء', 'خاتمة اليوم', '◑']
];
const REQUIRED_PRAYER_INDEXES = [0, 2, 3, 4, 5];
const PRAYER_REMINDER_LEADS = [
  { minutes: 60, label: 'ساعة' },
  { minutes: 30, label: 'نص ساعة' },
  { minutes: 20, label: 'تلت ساعة' },
  { minutes: 15, label: 'ربع ساعة' },
  { minutes: 10, label: '١٠ دقائق' },
  { minutes: 5, label: '٥ دقائق' }
];
const QURAN_TARGET_LABELS = {
  'ayah-1': 'آية واحدة', 'ayah-3': '٣ آيات', 'ayah-5': '٥ آيات', 'ayah-10': '١٠ آيات',
  'page-quarter': 'ربع صفحة', 'page-half': 'نصف صفحة', 'page-1': 'صفحة كاملة'
};
const ADHKAR_GROUPS = {
  morning: { label: 'أذكار الصباح', timing: 'بعد الفجر' },
  evening: { label: 'أذكار المساء', timing: 'بعد العصر' },
  afterPrayer: { label: 'أذكار بعد الصلاة', timing: 'بعد العشاء' },
  sleep: { label: 'أذكار النوم', timing: 'قبل النوم' }
};
const CHALLENGE_CATEGORIES = {
  quran: 'قرآن', fasting: 'صيام', prayer: 'صلاة', 'night-prayer': 'قيام ليل', dhikr: 'ذكر', 'good-deed': 'عمل خير', custom: 'مخصص'
};
const LOCAL_RANDOM_CHALLENGE_TEMPLATES = [
  { key: 'quran-three-pages', title: '٣ صفحات قرآن', description: 'اقرأ ثلاث صفحات على راحتك وسجّل كل صفحة بعد ما تخلصها.', category: 'quran', target: 3, unit: 'صفحة', step: 1, durationDays: 7 },
  { key: 'night-prayer-two', title: 'قيام ليل ركعتين', description: 'صلِّ ركعتين في ليلة تختارها خلال الأسبوع.', category: 'night-prayer', target: 2, unit: 'ركعة', step: 2, durationDays: 7 },
  { key: 'dhikr-hundred', title: '١٠٠ تسبيحة', description: 'قسّم مئة تسبيحة بالطريقة اللي تناسب يومك.', category: 'dhikr', target: 100, unit: 'مرة', step: 25, durationDays: 3 },
  { key: 'fasting-one-day', title: 'يوم صيام تختاره', description: 'اختار يومًا مناسبًا لك وسجّله بعد ما يتم.', category: 'fasting', target: 1, unit: 'يوم', step: 1, durationDays: 14 },
  { key: 'good-deed-one', title: 'مساعدة بسيطة', description: 'اعمل مساعدة أو صدقة بسيطة تقدر عليها من غير ما تسجل تفاصيلها.', category: 'good-deed', target: 1, unit: 'مرة', step: 1, durationDays: 7 },
  { key: 'prayer-early-one', title: 'فرض في أول الوقت', description: 'اختار فرضًا واحدًا وحاول تصليه في أول وقته.', category: 'prayer', target: 1, unit: 'صلاة', step: 1, durationDays: 3 }
];
const promptBank = [
  'اكتب ٥ Hooks سيئة جدًا… وبعدين اختار واحدة تصلحها.',
  'اشرح منتجك من غير ما تقول اسمه ولا كلمة «حل».',
  'لو العميل مشغول جدًا، ما أول جملة ستخليه يكمّل؟',
  'اكتب إعلانًا يبدأ بالنتيجة، واترك المنتج للنهاية.',
  'حوّل اعتراضًا واحدًا إلى سبب للشراء.'
];

let state = loadState();
let prayerTimes = [];
let toastTimer;
let nativeNotificationPermission;
let nativeStorageWrite = Promise.resolve();
let observedDateKey = new Date().toDateString();
let projectFilter = 'all';
let activeVaultTab = 'briefs';
let lastPrayerBacklogCheckMinute = null;
let weatherRequest = null;
let locationSearchMatches = [];
let weatherRefreshInterval = null;
const stateChannel = 'BroadcastChannel' in window ? new BroadcastChannel('wens-state') : null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const arabicDigits = (value) => String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const pad = (value) => String(value).padStart(2, '0');
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

const formatTime = (date, withPeriod = false) => {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'م' : 'ص';
  const h = hours % 12 || 12;
  return `${arabicDigits(`${pad(h)}:${pad(minutes)}`)}${withPeriod ? ` ${period}` : ''}`;
};
const formatDuration = (seconds) => {
  const safe = Math.max(0, Math.round(seconds));
  return arabicDigits(`${pad(Math.floor(safe / 3600))}:${pad(Math.floor((safe % 3600) / 60))}:${pad(safe % 60)}`);
};
const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const formatLocalNumber = (value, maximumFractionDigits = 1) => hasNumber(value)
  ? new Intl.NumberFormat('ar-EG', { maximumFractionDigits, minimumFractionDigits: 0 }).format(Number(value))
  : '—';

function playChime(type = 'prayer') {
  if (state.settings?.soundChime === false) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    if (type === 'prayer') {
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 1.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 1.7);
      });
    } else {
      const freqs = [587.33, 880.00];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);
        gain.gain.setValueAtTime(0, now + idx * 0.18);
        gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.18 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.18 + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 1.3);
      });
    }
  } catch { /* AudioContext unavailable */ }
}

const ATHKAR_DATA = {
  morning: [
    { arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.', source: 'رواه مسلم', benefit: 'استفتاح الصباح بالتوحيد' },
    { arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ.', source: 'رواه الترمذي', benefit: 'معيّة الله وحمده في الصباح' },
    { arabic: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلاَ تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ.', source: 'رواه النسائي', benefit: 'تفويض الأمر لله وتيسير السعي' },
    { arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ، عَدَدَ خَلْقِهِ، وَرِضَا نَفْسِهِ، وَزِنَةَ عَرْشِهِ، وَمِدَادَ كَلِمَاتِهِ.', source: 'رواه مسلم', benefit: 'أجر مضاعف في التسبيح' },
    { arabic: 'حَسْبِيَ اللَّهُ لا إِلَـهَ إِلاَّ هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ.', source: 'أبو داود', benefit: 'كفاية ما أهمك في يومك' }
  ],
  evening: [
    { arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ لاَ إِلَهَ إِلاَّ اللَّهُ وَحْدَهُ لاَ شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.', source: 'رواه مسلم', benefit: 'ختام النهار بحمد الله' },
    { arabic: 'اللَّهُمَّ مَا أَمْسَى بِي مِنْ نِعْمَةٍ أَوْ بِأَحَدٍ مِنْ خَلْقِكَ فَمِنْكَ وَحْدَكَ لاَ شَرِيكَ لَكَ، فَلَكَ الْحَمْدُ وَلَكَ الشُّكْرُ.', source: 'أبو داود', benefit: 'شكر نعمة اليوم' },
    { arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ.', source: 'رواه مسلم', benefit: 'حفظ ووقاية في المساء' },
    { arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي.', source: 'رواه أبو داود', benefit: 'دعاء السكينة والعافية' }
  ],
  afterPrayer: [
    { arabic: 'أَسْتَغْفِرُ اللَّهَ (ثَلاثاً)، اللَّهُمَّ أَنْتَ السَّلامُ وَمِنْكَ السَّلامُ، تَبَارَكْتَ يَا ذَا الْجَلالِ وَالإِكْرَامِ.', source: 'رواه مسلم', benefit: 'أول الذكر بعد الصلاة' },
    { arabic: 'لا إِلَهَ إِلا اللَّهُ وَحْدَهُ لا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، اللَّهُمَّ لا مَانِعَ لِمَا أَعْطَيْتَ، وَلا مُعْطِيَ لِمَا مَنَعْتَ، وَلا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ.', source: 'متفق عليه', benefit: 'التوحيد والتسليم' },
    { arabic: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ.', source: 'رواه أبو داود', benefit: 'دعاء الاستعانة بالعبادة' },
    { arabic: 'آية الكرسي: ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ...﴾ [البقرة: 255]', source: 'رواه النسائي', benefit: 'فضل عظيم عقب المكتوبة' },
    { arabic: 'سُبْحَانَ اللَّهِ (٣٣)، الْحَمْدُ لِلَّهِ (٣٣)، اللَّهُ أَكْبَرُ (٣٣)، وَتَمَامُ الْمِائَةِ: لا إِلَهَ إِلا اللَّهُ وَحْدَهُ لا شَرِيكَ لَهُ...', source: 'رواه مسلم', benefit: 'مغفرة الذنوب' }
  ],
  sleep: [
    { arabic: 'آية الكرسي: ﴿اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ...﴾ [البقرة: 255]', source: 'رواه النسائي', benefit: 'حفظ من الشيطان حتى الصباح' },
    { arabic: 'سورة الإخلاص، وسورة الفلق، وسورة الناس.', source: 'رواه أبو داود والترمذي', benefit: 'حماية وتحصين قبل النوم' },
    { arabic: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا.', source: 'رواه البخاري', benefit: 'تفويض الأمر لله عند النوم' },
    { arabic: 'اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ.', source: 'رواه أبو داود', benefit: 'دعاء الحفظ من العذاب' },
    { arabic: 'سُبْحَانَ اللَّهِ (٣٣)، الْحَمْدُ لِلَّهِ (٣٣)، اللَّهُ أَكْبَرُ (٣٤).', source: 'متفق عليه', benefit: 'قوة للبدن تغني عن خادم' },
    { arabic: '﴿آمَنَ الرَّسُولُ بِمَا أُنْزِلَ إِلَيْهِ مِن رَّبِّهِ وَالْمُؤْمِنُونَ...﴾ الآيتين ٢٨٥-٢٨٦ من سورة البقرة.', source: 'رواه البخاري ومسلم', benefit: 'كفاية من كل سوء في الليل' }
  ]
};

function weatherIcon(condition = '') {
  if (condition === 'صحو') return '☀';
  if (condition === 'غائم جزئيًا') return '◒';
  if (condition === 'غائم') return '☁';
  if (condition === 'مطر') return '☂';
  if (condition === 'رياح') return '≋';
  if (condition === 'أتربة') return '◌';
  if (condition === 'ضباب') return '≡';
  if (condition === 'ثلوج') return '✦';
  if (condition === 'عاصفة رعدية') return 'ϟ';
  return '◌';
}

function weatherAssessment(weather = {}) {
  const temperature = hasNumber(weather.temperatureC) ? Number(weather.temperatureC) : null;
  const humidity = hasNumber(weather.humidityPct) ? Number(weather.humidityPct) : null;
  if (temperature === null && humidity === null && !weather.condition) return 'سجّل الحرارة والرطوبة علشان أوصف الحالة';
  if (temperature !== null && temperature >= 38 && humidity !== null && humidity >= 60) return 'حر شديد ورطوبة عالية';
  if (weather.condition === 'أتربة') return 'الجو فيه أتربة؛ خليك مستعد قبل ما تخرج';
  if (weather.condition === 'مطر') return 'الجو ممطر؛ رتّب خروجك على ده';
  if (temperature !== null && temperature >= 35) return 'الجو حر';
  if (temperature !== null && temperature <= 12) return 'الجو بارد';
  if (humidity !== null && humidity >= 70) return 'الرطوبة عالية';
  if (humidity !== null && humidity <= 30) return 'الجو جاف';
  return 'الجو معتدل حسب آخر قراءة';
}

function weatherConditionFromCode(code) {
  const value = Number(code);
  if (value === 0) return 'صحو';
  if ([1, 2].includes(value)) return 'غائم جزئيًا';
  if (value === 3) return 'غائم';
  if ([45, 48].includes(value)) return 'ضباب';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'مطر';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'ثلوج';
  if ([95, 96, 99].includes(value)) return 'عاصفة رعدية';
  return 'حالة متغيرة';
}

function suggestedCalculationMethod(countryCode = '') {
  const code = String(countryCode).toUpperCase();
  if (code === 'EG') return 'egypt';
  if (code === 'SA') return 'ummalqura';
  return 'mwl';
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const parsed = new URL(url);
  const allowedHosts = new Set(['api.open-meteo.com', 'geocoding-api.open-meteo.com']);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) throw new Error('blocked weather endpoint');
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      const error = new Error(response.status === 429 ? 'rate-limit' : `weather-http-${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function weatherAgeMinutes(weather = state.localContext?.weather) {
  const timestamp = new Date(weather?.updatedAt || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.max(0, (Date.now() - timestamp) / 60000) : Infinity;
}

async function refreshOnlineWeather({ silent = false, force = false } = {}) {
  if (state.settings.strictOffline) {
    if (!silent) showToast('الوضع الأوفلاين مفعّل', 'اقفله من الإعدادات علشان وِنس يحدّث الطقس.', 'error');
    return null;
  }
  if (!force && !state.settings.weatherAuto) return null;
  if (!navigator.onLine) {
    if (!silent) showToast('مفيش اتصال بالإنترنت', 'معروض آخر طقس محفوظ، ومواقيت الصلاة مستمرة محليًا.', 'error');
    renderLocalContext();
    return null;
  }
  if (weatherRequest) return weatherRequest;
  const latitude = Number(state.settings.latitude);
  const longitude = Number(state.settings.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    if (!silent) showToast('المكان مش مكتمل', 'اختار مدينة أو اكتب إحداثيات صحيحة الأول.', 'error');
    return null;
  }
  setWeatherUiBusy(true);
  const query = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    timezone: 'auto',
    forecast_days: '1'
  });
  weatherRequest = fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?${query}`)
    .then((payload) => {
      const current = payload?.current;
      const temperatureC = Number(current?.temperature_2m);
      const humidityPct = Number(current?.relative_humidity_2m);
      if (!Number.isFinite(temperatureC) || !Number.isFinite(humidityPct)) throw new Error('invalid-weather-payload');
      const previousTimeZone = state.settings.timeZone;
      if (typeof payload.timezone === 'string' && payload.timezone.includes('/')) state.settings.timeZone = payload.timezone;
      const weather = {
        temperatureC,
        humidityPct,
        apparentTemperatureC: Number.isFinite(Number(current.apparent_temperature)) ? Number(current.apparent_temperature) : null,
        windSpeedKmh: Number.isFinite(Number(current.wind_speed_10m)) ? Number(current.wind_speed_10m) : null,
        weatherCode: Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null,
        condition: weatherConditionFromCode(current.weather_code),
        source: 'open-meteo',
        updatedAt: new Date().toISOString()
      };
      state.localContext ||= structuredClone(defaultState.localContext);
      state.localContext.weather = weather;
      saveState();
      renderLocalContext();
      renderLocationLabels();
      if (previousTimeZone !== state.settings.timeZone) refreshPrayerTimes();
      if (!silent) showToast('الطقس اتحدّث', `${state.settings.locationLabel || 'موقعك'} · ${formatLocalNumber(temperatureC)}°م · رطوبة ${formatLocalNumber(humidityPct, 0)}٪`, 'success');
      return weather;
    })
    .catch((error) => {
      renderLocalContext();
      if (!silent) {
        const body = error?.name === 'AbortError'
          ? 'الخدمة اتأخرت. جرّب التحديث تاني؛ آخر قراءة محفوظة لسه ظاهرة.'
          : error?.message === 'rate-limit'
            ? 'خدمة الطقس مشغولة مؤقتًا. هنحتفظ بآخر قراءة ونجرب لاحقًا.'
            : 'تعذر تحميل الطقس. مواقيت الصلاة والتطبيق مستمرين عادي.';
        showToast('الطقس متوصلش', body, 'error');
      }
      return null;
    })
    .finally(() => { weatherRequest = null; setWeatherUiBusy(false); });
  return weatherRequest;
}

function setWeatherUiBusy(busy) {
  const button = $('[data-action="weather-refresh"]');
  if (!button) return;
  button.disabled = Boolean(busy);
  button.setAttribute('aria-busy', String(Boolean(busy)));
  button.textContent = busy ? 'جاري التحديث…' : 'تحديث الطقس';
}

function renderLocationLabels() {
  const label = state.settings.locationLabel || 'موقعي الحالي';
  const topbar = $('#locationLabel');
  if (topbar) topbar.textContent = `${label} · توقيت محلي تلقائي`;
  const settingsName = $('#settingsLocationName');
  if (settingsName) settingsName.textContent = label;
  const settingsCoordinates = $('#settingsLocationCoordinates');
  if (settingsCoordinates) settingsCoordinates.textContent = `${Number(state.settings.latitude).toFixed(4)}° · ${Number(state.settings.longitude).toFixed(4)}°`;
}

async function searchLocations() {
  const input = $('#locationSearchInput');
  const query = String(input?.value || '').trim();
  if (query.length < 2) {
    showToast('اكتب اسم المدينة', 'اكتب حرفين على الأقل، بالعربي أو الإنجليزي.', 'error');
    input?.focus();
    return;
  }
  const button = $('[data-action="location-search"]');
  if (button) { button.disabled = true; button.textContent = 'بندور…'; }
  try {
    const params = new URLSearchParams({ name: query, count: '8', language: 'ar', format: 'json' });
    const payload = await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    locationSearchMatches = Array.isArray(payload?.results) ? payload.results.filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))) : [];
    const select = $('#locationSearchResults');
    const applyButton = $('[data-action="location-apply"]');
    if (!select || !applyButton) return;
    select.replaceChildren();
    locationSearchMatches.forEach((item, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = [item.name, item.admin1, item.country].filter(Boolean).join('، ');
      select.appendChild(option);
    });
    select.hidden = locationSearchMatches.length === 0;
    applyButton.hidden = locationSearchMatches.length === 0;
    const status = $('#locationSearchStatus');
    if (status) status.textContent = locationSearchMatches.length ? `لقينا ${arabicDigits(locationSearchMatches.length)} اختيارات. اختار الأنسب.` : 'ملقيناش مدينة بالاسم ده. جرّب كتابة مختلفة.';
  } catch {
    const status = $('#locationSearchStatus');
    if (status) status.textContent = 'تعذر البحث دلوقتي. تقدر تستخدم موقع الجهاز أو تدخل الإحداثيات.';
  } finally {
    if (button) { button.disabled = false; button.textContent = 'بحث'; }
  }
}

function applySelectedLocation() {
  const index = Number($('#locationSearchResults')?.value);
  const selected = locationSearchMatches[index];
  if (!selected) return;
  state.settings.latitude = Number(selected.latitude);
  state.settings.longitude = Number(selected.longitude);
  state.settings.locationLabel = [selected.name, selected.country].filter(Boolean).join('، ');
  state.settings.countryCode = String(selected.country_code || '').toUpperCase();
  if (selected.timezone) state.settings.timeZone = selected.timezone;
  if (state.settings.calcMethodAuto) state.settings.calcMethod = suggestedCalculationMethod(state.settings.countryCode);
  saveState();
  syncSettingsForm();
  renderLocationLabels();
  refreshPrayerTimes();
  void refreshOnlineWeather({ force: true });
  const status = $('#locationSearchStatus');
  if (status) status.textContent = `تم اختيار ${state.settings.locationLabel}.`;
}

function useDeviceLocation() {
  if (!navigator.geolocation) {
    showToast('تحديد الموقع غير متاح', 'ابحث عن مدينتك أو اكتب الإحداثيات يدويًا.', 'error');
    return;
  }
  const button = $('[data-action="location-device"]');
  if (button) { button.disabled = true; button.textContent = 'في انتظار الإذن…'; }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.settings.latitude = position.coords.latitude;
      state.settings.longitude = position.coords.longitude;
      state.settings.locationLabel = 'موقعي الحالي';
      const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (systemTimeZone) state.settings.timeZone = systemTimeZone;
      saveState();
      syncSettingsForm();
      renderLocationLabels();
      refreshPrayerTimes();
      void refreshOnlineWeather({ force: true });
      if (button) { button.disabled = false; button.textContent = 'استخدم موقع الجهاز'; }
    },
    (error) => {
      const reason = error.code === 1 ? 'إذن الموقع مرفوض. اختار المدينة يدويًا.' : error.code === 3 ? 'تحديد الموقع أخد وقت طويل. جرّب تاني.' : 'تعذر تحديد الموقع. ابحث عن مدينتك بدلًا منه.';
      showToast('الموقع متحددش', reason, 'error');
      if (button) { button.disabled = false; button.textContent = 'استخدم موقع الجهاز'; }
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
  );
}

function startWeatherUpdates() {
  if (weatherRefreshInterval) window.clearInterval(weatherRefreshInterval);
  if (state.settings.weatherAuto && !state.settings.strictOffline && weatherAgeMinutes() >= 30) {
    void refreshOnlineWeather({ silent: true });
  }
  weatherRefreshInterval = window.setInterval(() => {
    if (state.settings.weatherAuto && !state.settings.strictOffline) void refreshOnlineWeather({ silent: true });
  }, 30 * 60 * 1000);
}

function trendFor(key, currentValue) {
  if (!hasNumber(currentValue)) return { label: 'غير مسجل', className: 'trend-flat' };
  const entries = (state.localContext?.history || [])
    .filter((entry) => hasNumber(entry?.economy?.[key]))
    .slice(-2);
  if (entries.length < 2) return { label: 'أول قراءة', className: 'trend-flat' };
  const previous = Number(entries[0].economy[key]);
  const current = Number(currentValue);
  const threshold = Math.max(Math.abs(previous) * .001, .01);
  if (current - previous > threshold) return { label: '↑ أعلى من آخر مرة', className: 'trend-up' };
  if (previous - current > threshold) return { label: '↓ أقل من آخر مرة', className: 'trend-down' };
  return { label: '— شبه ثابت', className: 'trend-flat' };
}

function formatContextUpdatedAt(iso, source = '') {
  if (!iso) return 'لم تُسجّل أي قراءة بعد';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'آخر قراءة محفوظة محليًا';
  const prefix = source === 'open-meteo' ? 'آخر تحديث تلقائي' : 'آخر تحديث يدوي';
  return `${prefix}: ${new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(date)}`;
}

function renderLocalContext() {
  const weather = state.localContext?.weather || defaultState.localContext.weather;
  const economy = state.localContext?.economy || defaultState.localContext.economy;
  const temperature = $('#weatherTemperature');
  if (!temperature) return;
  temperature.textContent = hasNumber(weather.temperatureC) ? `${formatLocalNumber(weather.temperatureC)}°م` : 'غير مسجلة';
  $('#weatherHumidity').textContent = hasNumber(weather.humidityPct) ? `الرطوبة ${formatLocalNumber(weather.humidityPct, 0)}٪` : 'الرطوبة غير مسجلة';
  $('#weatherCondition').textContent = weather.condition || 'أضف آخر قراءة عندك';
  $('#weatherAssessment').textContent = weatherAssessment(weather);
  $('#weatherContextIcon').textContent = weatherIcon(weather.condition);
  const weatherExtra = $('#weatherExtra');
  if (weatherExtra) {
    const parts = [];
    if (hasNumber(weather.apparentTemperatureC)) parts.push(`محسوسة ${formatLocalNumber(weather.apparentTemperatureC)}°`);
    if (hasNumber(weather.windSpeedKmh)) parts.push(`رياح ${formatLocalNumber(weather.windSpeedKmh, 0)} كم/س`);
    weatherExtra.textContent = parts.join(' · ') || weatherAssessment(weather);
  }
  $('#economyAssessment').textContent = economy.marketStatus ? `السوق ${economy.marketStatus}` : (hasNumber(economy.usdEgp) || hasNumber(economy.gold21Egp) || hasNumber(economy.inflationPct) ? 'لقطة اقتصادية محفوظة' : 'لسه مفيش لقطة اقتصادية');
  $('#economyNote').textContent = economy.note || 'سجّل أرقامك علشان تقارنها بالمرة الجاية';
  $('#economyUsd').textContent = hasNumber(economy.usdEgp) ? formatLocalNumber(economy.usdEgp, 2) : '—';
  $('#economyGold').textContent = hasNumber(economy.gold21Egp) ? `${formatLocalNumber(economy.gold21Egp, 0)} ج` : '—';
  $('#economyInflation').textContent = hasNumber(economy.inflationPct) ? `${formatLocalNumber(economy.inflationPct)}٪` : '—';
  [['economyUsdTrend', 'usdEgp'], ['economyGoldTrend', 'gold21Egp'], ['economyInflationTrend', 'inflationPct']].forEach(([id, key]) => {
    const element = $(`#${id}`);
    if (!element) return;
    const trend = trendFor(key, economy[key]);
    element.textContent = trend.label;
    element.className = trend.className;
  });
  $('#localContextUpdated').textContent = formatContextUpdatedAt(weather.updatedAt, weather.source);
  const sourceNote = $('#weatherSourceNote');
  if (sourceNote) {
    const age = weatherAgeMinutes(weather);
    if (state.settings.strictOffline) sourceNote.textContent = 'الوضع الأوفلاين مفعّل · الطقس المحفوظ فقط';
    else if (weather.source === 'open-meteo' && age <= 90) sourceNote.innerHTML = 'طقس حي · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · الصلاة محسوبة محليًا';
    else if (weather.updatedAt) sourceNote.textContent = `قراءة محفوظة${age > 90 ? ' وقديمة' : ''} · اضغط تحديث`;
    else sourceNote.textContent = 'الطقس يحتاج اتصالًا؛ الصلاة تعمل أوفلاين';
  }
  renderLocationLabels();
}

function prefillContextForm() {
  const form = $('#contextUpdateForm');
  if (!form) return;
  const weather = state.localContext?.weather || {};
  const economy = state.localContext?.economy || {};
  const values = {
    temperatureC: weather.temperatureC,
    humidityPct: weather.humidityPct,
    weatherCondition: weather.condition,
    usdEgp: economy.usdEgp,
    gold21Egp: economy.gold21Egp,
    inflationPct: economy.inflationPct,
    marketStatus: economy.marketStatus,
    economyNote: economy.note
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field) field.value = value ?? '';
  });
}

function optionalNumber(formData, name) {
  const value = String(formData.get(name) || '').trim();
  return value === '' ? null : Number(value);
}

function saveLocalContext(event) {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { closeModal('contextUpdateModal'); return; }
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const updatedAt = new Date().toISOString();
  const weather = {
    temperatureC: optionalNumber(data, 'temperatureC'),
    humidityPct: optionalNumber(data, 'humidityPct'),
    apparentTemperatureC: null,
    windSpeedKmh: null,
    weatherCode: null,
    condition: String(data.get('weatherCondition') || '').trim(),
    source: 'manual',
    updatedAt
  };
  const economy = {
    usdEgp: optionalNumber(data, 'usdEgp'),
    gold21Egp: optionalNumber(data, 'gold21Egp'),
    inflationPct: optionalNumber(data, 'inflationPct'),
    marketStatus: String(data.get('marketStatus') || '').trim(),
    note: String(data.get('economyNote') || '').trim(),
    updatedAt
  };
  const meaningful = [weather.temperatureC, weather.humidityPct, weather.condition, economy.usdEgp, economy.gold21Egp, economy.inflationPct, economy.marketStatus, economy.note]
    .some((value) => value !== null && value !== '');
  if (!meaningful) {
    showToast('مفيش قراءة تتحفظ', 'اكتب قيمة واحدة على الأقل للجو أو الاقتصاد.', 'error');
    return;
  }
  state.localContext ||= structuredClone(defaultState.localContext);
  state.localContext.weather = weather;
  state.localContext.economy = economy;
  state.localContext.history = [...(state.localContext.history || []), { updatedAt, weather: { ...weather }, economy: { ...economy } }].slice(-90);
  saveState();
  renderLocalContext();
  closeModal('contextUpdateModal');
  const summary = weatherAssessment(weather);
  showToast('اتحدّثت حالة اليوم', `${summary} · ${economy.marketStatus ? `السوق ${economy.marketStatus}` : 'الاقتصاد محفوظ للمقارنة'}`, 'success');
  setPetMessage(`${summary}… وآخر لقطة اقتصادية اتحفظت عندك.`);
}

const hijriMonths = ['محرّم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوّال', 'ذو القعدة', 'ذو الحجة'];
const UMM_AL_QURA_MASKS = {
  1440: 698, 1441: 1461, 1442: 1450, 1443: 3413, 1444: 2714, 1445: 2350, 1446: 622, 1447: 1373,
  1448: 2778, 1449: 1748, 1450: 1701, 1451: 2855, 1452: 2637, 1453: 1197, 1454: 1389, 1455: 2906,
  1456: 1876, 1457: 3913, 1458: 3730, 1459: 3366, 1460: 2646,
};
const EPOCH_HIJRI_YEAR = 1440;
const EPOCH_UTC_MS = Date.UTC(2018, 8, 11, 12, 0, 0);

function lookupUmmAlQura(date) {
  const targetUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  let daysDiff = Math.round((targetUtc - EPOCH_UTC_MS) / 86400000);
  if (daysDiff < 0) return null;
  let y = EPOCH_HIJRI_YEAR;
  let m = 1;
  while (true) {
    const mask = UMM_AL_QURA_MASKS[y];
    if (mask === undefined) return null;
    const monthLength = (mask & (1 << (m - 1))) ? 30 : 29;
    if (daysDiff < monthLength) {
      return { year: y, month: m, day: daysDiff + 1, monthName: hijriMonths[m - 1] || '—' };
    }
    daysDiff -= monthLength;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}

const ummAlQuraFormatter = (() => {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric' });
    if (fmt.resolvedOptions().calendar === 'islamic-umalqura') return fmt;
    return null;
  } catch {
    return null;
  }
})();
const hijriCache = new Map();
function gregorianToHijri(date) {
  const dObj = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const y = dObj.getFullYear(); const m = dObj.getMonth() + 1; const d = dObj.getDate();
  const key = `${y}-${m}-${d}`;
  if (hijriCache.has(key)) return hijriCache.get(key);

  const lookupRes = lookupUmmAlQura(dObj);
  if (lookupRes) {
    hijriCache.set(key, lookupRes);
    return lookupRes;
  }

  if (ummAlQuraFormatter) {
    try {
      const parts = ummAlQuraFormatter.formatToParts(dObj);
      const year = Number(parts.find((p) => p.type === 'year')?.value);
      const month = Number(parts.find((p) => p.type === 'month')?.value);
      const day = Number(parts.find((p) => p.type === 'day')?.value);
      if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day) && month >= 1 && month <= 12) {
        const res = { year, month, day, monthName: hijriMonths[month - 1] || '—' };
        hijriCache.set(key, res);
        return res;
      }
    } catch {}
  }
  const jd = Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) + Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) - Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) + d - 32075;
  let l = jd - 1948440 + 10632; const n = Math.floor((l - 1) / 10631); l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l) / 709); const day = l - Math.floor((709 * month) / 24); const year = 30 * n + j - 30;
  const fallbackRes = { year, month, day, monthName: hijriMonths[month - 1] || '—' };
  hijriCache.set(key, fallbackRes);
  return fallbackRes;
}
const formatArabicDate = (date) => new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
const formatShortDate = (date) => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
function nextDateForWeekday(target, from = new Date()) { const date = new Date(from); date.setHours(0, 0, 0, 0); const delta = (target - date.getDay() + 7) % 7 || 7; date.setDate(date.getDate() + delta); return date; }
function nextWhiteDay(from = new Date(), offset = 0) { const date = new Date(from); date.setHours(0, 0, 0, 0); for (let i = 0; i < 45; i += 1) { const candidate = new Date(date); candidate.setDate(date.getDate() + i); if ([13, 14, 15].includes(getAdjustedHijri(candidate, offset).day)) return candidate; } return date; }

function getAdjustedHijri(date, offset = state.settings?.hijriOffset || 0) { const adjusted = new Date(date); adjusted.setDate(adjusted.getDate() + (Number(offset) || 0)); return gregorianToHijri(adjusted); }

function currentDay(key = localDateKey()) {
  state.accountability ||= { days: {}, lastReminderAt: null };
  state.accountability.days ||= {};
  state.accountability.days[key] ||= { prayers: {}, fasting: null, tasks: [], workNote: '', focusedMs: 0, responses: {}, updatedAt: null };
  const day = state.accountability.days[key];
  day.prayers ||= {};
  day.responses ||= {};
  day.devotion ||= { quranDone: false, adhkar: {} };
  day.devotion.adhkar ||= {};
  day.tasks = Array.isArray(day.tasks) ? day.tasks : [];
  return day;
}

const prayerIsComplete = (status) => status === 'done' || status === 'made-up';

const PRAYER_KEY_MAP = {
  0: 'fajr', 1: 'sunrise', 2: 'dhuhr', 3: 'asr', 4: 'maghrib', 5: 'isha',
  'الفجر': 'fajr', 'الشروق': 'sunrise', 'الظهر': 'dhuhr', 'العصر': 'asr', 'المغرب': 'maghrib', 'العشاء': 'isha'
};

function syncCheckToVNext(key, value) {
  if (!key) return;
  const todayStr = localDateKey();
  const checksKey = `wens-checks-${todayStr}`;
  try {
    const existing = JSON.parse(localStorage.getItem(checksKey) || '{}');
    if (value) existing[key] = true;
    else delete existing[key];
    localStorage.setItem(checksKey, JSON.stringify(existing));
  } catch {}
}

function sanitizeTodayFuturePrayers(now = new Date()) {
  if (!Array.isArray(prayerTimes) || prayerTimes.length < 6) {
    prayerTimes = prayerTimesForDate(now);
  }
  const todayKey = localDateKey(now);
  const day = state.accountability?.days?.[todayKey];
  let changed = false;

  if (day && day.prayers) {
    REQUIRED_PRAYER_INDEXES.forEach((idx) => {
      const name = prayerNames[idx][0];
      if (prayerIsComplete(day.prayers[name]) && prayerTimes[idx] && prayerTimes[idx] > now) {
        delete day.prayers[name];
        syncCheckToVNext(PRAYER_KEY_MAP[name], false);
        changed = true;
      }
    });
  }

  try {
    const checksKey = `wens-checks-${todayKey}`;
    const raw = localStorage.getItem(checksKey);
    if (raw) {
      const checks = JSON.parse(raw);
      let checksChanged = false;
      REQUIRED_PRAYER_INDEXES.forEach((idx) => {
        const key = PRAYER_KEY_MAP[idx];
        if (checks[key] && prayerTimes[idx] && prayerTimes[idx] > now) {
          delete checks[key];
          checksChanged = true;
        }
      });
      if (checksChanged) {
        localStorage.setItem(checksKey, JSON.stringify(checks));
      }
    }
  } catch {}

  if (changed && day) {
    day.updatedAt = now.toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
  return changed;
}

function prayerBacklogState() {
  state.prayerBacklog ||= { autoTrack: true, trackingStartedAt: null, items: [] };
  state.prayerBacklog.items = Array.isArray(state.prayerBacklog.items) ? state.prayerBacklog.items : [];
  if (!state.prayerBacklog.trackingStartedAt) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    state.prayerBacklog.trackingStartedAt = start.toISOString();
  }
  return state.prayerBacklog;
}

function fastingBacklogState() {
  state.fastingBacklog ||= { autoReview: true, trackingStartedAt: null, items: [] };
  state.fastingBacklog.items = Array.isArray(state.fastingBacklog.items) ? state.fastingBacklog.items : [];
  if (!state.fastingBacklog.trackingStartedAt) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    state.fastingBacklog.trackingStartedAt = start.toISOString();
  }
  return state.fastingBacklog;
}

function timerElapsed(now = Date.now()) {
  const timer = state.workTimer || defaultState.workTimer;
  return Math.max(0, Number(timer.accumulatedMs) || 0) + (timer.running && timer.startedAt ? Math.max(0, now - Number(timer.startedAt)) : 0);
}

function todayWorkMs() {
  const key = localDateKey();
  const sessions = (state.workSessions || []).filter((session) => localDateKey(new Date(session.endedAt || session.startedAt)) === key);
  return sessions.reduce((sum, session) => sum + (Number(session.durationMs) || 0), 0) + timerElapsed();
}

function formatElapsed(milliseconds, withHours = true) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return withHours ? `${arabicDigits(pad(hours))}:${arabicDigits(pad(minutes))}:${arabicDigits(pad(rest))}` : `${arabicDigits(pad(hours))}:${arabicDigits(pad(minutes))}`;
}

function calculateQiblaBearing(lat, lng) {
  const kaabaLat = 21.4225 * Math.PI / 180;
  const kaabaLng = 39.8262 * Math.PI / 180;
  const phi = Number(lat) * Math.PI / 180;
  const lambda = Number(lng) * Math.PI / 180;
  const y = Math.sin(kaabaLng - lambda);
  const x = Math.cos(phi) * Math.tan(kaabaLat) - Math.sin(phi) * Math.cos(kaabaLng - lambda);
  let qibla = Math.atan2(y, x) * 180 / Math.PI;
  qibla = (qibla + 360) % 360;
  const rounded = Math.round(qibla);
  let direction = 'جنوب شرق';
  if (rounded >= 337.5 || rounded < 22.5) direction = 'شمال';
  else if (rounded >= 22.5 && rounded < 67.5) direction = 'شمال شرق';
  else if (rounded >= 67.5 && rounded < 112.5) direction = 'شرق';
  else if (rounded >= 112.5 && rounded < 157.5) direction = 'جنوب شرق';
  else if (rounded >= 157.5 && rounded < 202.5) direction = 'جنوب';
  else if (rounded >= 202.5 && rounded < 247.5) direction = 'جنوب غرب';
  else if (rounded >= 247.5 && rounded < 292.5) direction = 'غرب';
  else if (rounded >= 292.5 && rounded < 337.5) direction = 'شمال غرب';
  return { angle: rounded, direction, label: `${arabicDigits(rounded)}° ${direction}` };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return mergeState(saved);
  } catch { return structuredClone(defaultState); }
}

function mergeState(saved) {
  if (!saved) return structuredClone(defaultState);
  const base = structuredClone(defaultState);
  const merged = {
    ...base,
    ...saved,
    ideas: Array.isArray(saved.ideas) ? saved.ideas : [],
    projects: Array.isArray(saved.projects) ? saved.projects : [],
    settings: { ...base.settings, ...(saved.settings || {}) },
    fasting: {
      ...base.fasting,
      ...(saved.fasting || {}),
      suhoorAlarm: {
        ...base.fasting.suhoorAlarm,
        ...(saved.fasting?.suhoorAlarm || {})
      }
    },
    devotion: {
      ...base.devotion,
      ...(saved.devotion || {}),
      adhkarGroups: { ...base.devotion.adhkarGroups, ...(saved.devotion?.adhkarGroups || {}) }
    },
    challenges: {
      ...base.challenges,
      ...(saved.challenges || {}),
      catalog: Array.isArray(saved.challenges?.catalog) ? saved.challenges.catalog : base.challenges.catalog,
      enrollments: Array.isArray(saved.challenges?.enrollments) ? saved.challenges.enrollments : [],
      randomHistory: Array.isArray(saved.challenges?.randomHistory) ? saved.challenges.randomHistory : []
    },
    localContext: {
      ...base.localContext,
      ...(saved.localContext || {}),
      weather: { ...base.localContext.weather, ...(saved.localContext?.weather || {}) },
      economy: { ...base.localContext.economy, ...(saved.localContext?.economy || {}) },
      history: Array.isArray(saved.localContext?.history) ? saved.localContext.history : []
    },
    marketing: {
      briefs: Array.isArray(saved.marketing?.briefs) ? saved.marketing.briefs : [],
      matrices: Array.isArray(saved.marketing?.matrices) ? saved.marketing.matrices : [],
      storyboards: Array.isArray(saved.marketing?.storyboards) ? saved.marketing.storyboards : [],
      metrics: Array.isArray(saved.marketing?.metrics) ? saved.marketing.metrics : []
    },
    connectors: { ...base.connectors, ...(saved.connectors || {}) },
    accountability: { ...base.accountability, ...(saved.accountability || {}), days: { ...(saved.accountability?.days || {}) } },
    prayerBacklog: {
      ...base.prayerBacklog,
      ...(saved.prayerBacklog || {}),
      items: Array.isArray(saved.prayerBacklog?.items) ? saved.prayerBacklog.items : []
    },
    fastingBacklog: {
      ...base.fastingBacklog,
      ...(saved.fastingBacklog || {}),
      items: Array.isArray(saved.fastingBacklog?.items) ? saved.fastingBacklog.items : []
    },
    workTimer: { ...base.workTimer, ...(saved.workTimer || {}) },
    workSessions: Array.isArray(saved.workSessions) ? saved.workSessions : [],
    notificationInbox: Array.isArray(saved.notificationInbox) ? saved.notificationInbox : []
  };
  if ((Number(saved.uiSchemaVersion) || 0) < 2) {
    const seededProjects = new Set(['Glow Ritual', 'Performance Marketing OS', 'DeadWheel Lock', 'وِنس']);
    const seededIdeas = new Set(['إعلان يبدأ من النتيجة مش المنتج', 'صفحة هبوط بتتغير حسب السؤال', 'سلسلة محتوى: دقيقة على المكتب']);
    merged.projects = (merged.projects || []).filter((project) => !seededProjects.has(project?.title));
    merged.ideas = (merged.ideas || []).filter((idea) => !seededIdeas.has(idea?.title));
    merged.view = 'today';
    merged.settings.livelyPopups = false;
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    merged.accountability.days[dayKey] ||= { prayers: {}, fasting: null, tasks: [], workNote: '', focusedMs: 0, responses: {}, updatedAt: null };
    if (saved.fasting?.today && !merged.accountability.days[dayKey].fasting) merged.accountability.days[dayKey].fasting = 'yes';
    merged.uiSchemaVersion = 2;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 3) {
    const trackingStart = new Date();
    trackingStart.setHours(0, 0, 0, 0);
    merged.prayerBacklog = {
      autoTrack: true,
      trackingStartedAt: trackingStart.toISOString(),
      items: Array.isArray(merged.prayerBacklog?.items) ? merged.prayerBacklog.items : []
    };
    merged.uiSchemaVersion = 3;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 4) {
    // Existing users explicitly upgrading from the local-only build receive
    // the requested automatic weather feature. Fresh installs still start
    // with weatherAuto disabled until the user enables it.
    merged.settings.weatherAuto = true;
    merged.uiSchemaVersion = 4;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 5) {
    // This release was explicitly approved to enable internet weather for
    // existing local-only installations. Users can re-enable strict offline
    // mode at any time after the one-time migration.
    merged.settings.strictOffline = false;
    merged.settings.weatherAuto = true;
    merged.uiSchemaVersion = 5;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 6) {
    const trackingStart = new Date();
    trackingStart.setHours(0, 0, 0, 0);
    merged.fastingBacklog = {
      autoReview: true,
      trackingStartedAt: trackingStart.toISOString(),
      items: Array.isArray(merged.fastingBacklog?.items) ? merged.fastingBacklog.items : []
    };
    merged.uiSchemaVersion = 6;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 7) {
    merged.devotion = {
      quranEnabled: false,
      quranTarget: 'ayah-1',
      adhkarEnabled: false,
      adhkarGroups: { morning: true, evening: true, afterPrayer: false, sleep: false }
    };
    merged.uiSchemaVersion = 7;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 8) {
    merged.challenges = structuredClone(base.challenges);
    merged.uiSchemaVersion = 8;
  }
  if ((Number(merged.uiSchemaVersion) || 0) < 9) {
    merged.challenges = {
      ...structuredClone(base.challenges),
      ...(merged.challenges || {}),
      catalog: Array.isArray(merged.challenges?.catalog) ? merged.challenges.catalog : structuredClone(base.challenges.catalog),
      enrollments: Array.isArray(merged.challenges?.enrollments) ? merged.challenges.enrollments : [],
      randomHistory: Array.isArray(merged.challenges?.randomHistory) ? merged.challenges.randomHistory : []
    };
    merged.uiSchemaVersion = 9;
  }
  return merged;
}

function getTimezoneOffsetHours(date = new Date(), timeZone = 'Africa/Cairo') {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    const match = value.match(/^GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?$/);
    if (!match) return -date.getTimezoneOffset() / 60;
    if (!match[1]) return 0;
    return (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3] || 0) / 60);
  } catch {
    return -date.getTimezoneOffset() / 60;
  }
}
function getConfiguredTimezoneOffset(date = new Date()) { return getTimezoneOffsetHours(date, state.settings?.timeZone || 'Africa/Cairo'); }
function tauriInvoke() { return window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null; }

let _stateSizeWarned = false;

function saveState() {
  const serialized = JSON.stringify(state);
  
  if (!_stateSizeWarned && serialized.length > 5_000_000) {
    _stateSizeWarned = true;
    showToast('⚠️ حجم البيانات كبير — فكر في تصدير نسخة احتياطية', 'وصلت مساحة البيانات لأكثر من ٥ ميجا، يرجى التخفيف من بعض البيانات القديمة.', 'warning');
  }

  localStorage.setItem(STORAGE_KEY, serialized);
  stateChannel?.postMessage({ type: 'wens-state', source: 'main', state, prayerTimes, tomorrowPrayerTimes: window.tomorrowPrayerTimes });
  const emit = window.__TAURI__?.event?.emit;
  if (emit) {
    emit('wens-state-sync', {
      source: 'main',
      state,
      prayerTimes,
      tomorrowPrayerTimes: window.tomorrowPrayerTimes
    }).catch(() => {});
  }
  const invoke = tauriInvoke();
  if (invoke) {
    nativeStorageWrite = nativeStorageWrite.catch(() => {}).then(() => invoke('storage_save', { stateJson: serialized })).catch(() => {});
  }
}

function syncPetWindowVisibility(visible = state.settings.petVisible) {
  const invoke = tauriInvoke(); if (invoke) invoke('pet_set_visible', { visible: Boolean(visible) }).catch(() => {});
}

function syncOverlayVisibility(visible = state.settings.overlayWidget) {
  const invoke = tauriInvoke(); if (invoke) invoke('overlay_set_visible', { visible: Boolean(visible) }).catch(() => {});
}

function showPrayerOverlayDemo() {
  const invoke = tauriInvoke();
  if (!invoke) { showToast('متاح في نسخة Windows', 'ويدجت الصلاة تظهر كنافذة مستقلة فوق البرامج من نسخة Desktop.', 'prayer'); return; }
  invoke('overlay_set_visible', { visible: true }).then(() => showToast('ويدجت الصلاة ظهرت', 'تقدر تحركها من الشريط العلوي أو تقفلها من علامة ×.', 'prayer')).catch(() => showToast('تعذر فتح الويدجت', 'جرّب إعادة تشغيل نسخة وِنس Desktop.', 'error'));
}

function applyExternalState(incoming) {
  if (!incoming || typeof incoming !== 'object') return;
  state = mergeState(incoming);
  sanitizeTodayFuturePrayers(new Date());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  prayerTimes = prayerTimesForDate(new Date());
  syncNativeReminderPlan();
  renderAllViews();
}

stateChannel?.addEventListener('message', (event) => {
  if (event.data?.action === 'markPrayer') {
    if (event.data.prayerIndex !== undefined) {
      const prayerName = prayerNames[event.data.prayerIndex]?.[0];
      if (prayerName) toggleTodayPrayer(prayerName);
    } else if (event.data.prayerKey) {
      const revMap = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
      const prayerName = revMap[event.data.prayerKey];
      if (prayerName) {
        const now = new Date();
        const pIdx = REQUIRED_PRAYER_INDEXES.find((idx) => prayerNames[idx][0] === prayerName);
        if (pIdx !== undefined && prayerTimes[pIdx] && prayerTimes[pIdx] > now) return;
        const day = currentDay();
        day.prayers[prayerName] = 'done';
        syncCheckToVNext(event.data.prayerKey, true);
        resolvePrayerBacklog(localDateKey(), prayerName, 'done');
        saveState();
        renderTodayView();
        renderPrayerList();
      }
    }
    return;
  }
  if (event.data?.type === 'wens-state' && event.data.source !== 'main') {
    if (event.data.state && typeof event.data.state === 'object') {
      applyExternalState(event.data.state);
    }
  }
});
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY && event.newValue) {
    try { applyExternalState(JSON.parse(event.newValue)); } catch {}
  }
});
const tauriStateListen = window.__TAURI__?.event?.listen;
if (tauriStateListen) {
  tauriStateListen('wens-state-sync', (event) => {
    if (event.payload?.source !== 'main' && event.payload?.state) {
      applyExternalState(event.payload.state);
    }
  }).catch(() => {});
}

async function hydrateDesktopStorage() {
  const invoke = tauriInvoke(); if (!invoke) return;
  try {
    const raw = await invoke('storage_load');
    if (raw) {
      state = mergeState(JSON.parse(raw));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAllViews();
      syncPetWindowVisibility();
      syncOverlayVisibility();
      refreshPrayerTimes();
    } else {
      await invoke('storage_save', { stateJson: JSON.stringify(state) });
    }
  } catch {
    showToast('وضع التخزين المحلي', 'تعذر فتح SQLite؛ وِنس مستمر على النسخة المحلية الآمنة.', 'error');
  }
}

function refreshPrayerTimes() {
  const today = new Date();
  prayerTimes = prayerTimesForDate(today);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  window.tomorrowPrayerTimes = prayerTimesForDate(tomorrow);
  sanitizeTodayFuturePrayers(today);
  saveState(); // Ensure prayerTimes are broadcasted
  syncNativeReminderPlan();
  renderPrayerList();
  renderTodayView();
  renderQibla();
  updateClock();
}

function prayerTimesForDate(date) {
  return calculatePrayerTimes(
    date,
    Number(state.settings?.latitude) || 30.0444,
    Number(state.settings?.longitude) || 31.2357,
    getConfiguredTimezoneOffset(date),
    state.settings?.calcMethod || 'egypt',
    Number(state.settings?.fajrOffset) || 0,
    Number(state.settings?.maghribOffset) || 0,
    Number(state.settings?.ishaOffset) || 0
  );
}

function dateFromLocalKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function prayerWindowEndsAt(date, prayerIndex) {
  const times = prayerTimesForDate(date);
  if (prayerIndex === 0) return times[1];
  if (prayerIndex === 2) return times[3];
  if (prayerIndex === 3) return times[4];
  if (prayerIndex === 4) return times[5];
  const tomorrow = new Date(date);
  tomorrow.setDate(date.getDate() + 1);
  const tomorrowTimes = prayerTimesForDate(tomorrow);
  return tomorrowTimes[0];
}

function resolvePrayerBacklog(prayerDate, prayerName, resolution) {
  const backlog = prayerBacklogState();
  const now = new Date().toISOString();
  backlog.items.forEach((item) => {
    if (item.prayerDate === prayerDate && item.prayerName === prayerName && item.status !== 'resolved' && item.status !== 'removed') {
      item.status = 'resolved';
      item.resolution = resolution;
      item.resolvedAt = now;
      item.updatedAt = now;
    }
  });
}

function reopenPrayerBacklog(prayerDate, prayerName) {
  const date = dateFromLocalKey(prayerDate);
  if (!date || new Date() < prayerWindowEndsAt(date, prayerNames.findIndex(([name]) => name === prayerName))) return;
  const backlog = prayerBacklogState();
  const previous = [...backlog.items].reverse().find((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && item.status === 'resolved');
  if (previous) {
    previous.status = previous.source === 'manual' ? 'missed' : 'unconfirmed';
    previous.resolution = null;
    previous.resolvedAt = null;
    previous.updatedAt = new Date().toISOString();
  }
}

function reconcilePrayerBacklog(now = new Date()) {
  const backlog = prayerBacklogState();
  if (!backlog.autoTrack) return false;
  const trackingStart = new Date(backlog.trackingStartedAt);
  const oldestAllowed = new Date(now);
  oldestAllowed.setDate(now.getDate() - 90);
  oldestAllowed.setHours(0, 0, 0, 0);
  const cursor = Number.isNaN(trackingStart.getTime()) || trackingStart < oldestAllowed ? oldestAllowed : new Date(trackingStart);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let changed = false;

  while (cursor <= today) {
    const prayerDate = localDateKey(cursor);
    const day = currentDay(prayerDate);
    for (const index of REQUIRED_PRAYER_INDEXES) {
      const prayerName = prayerNames[index][0];
      const status = day.prayers?.[prayerName];
      if (prayerIsComplete(status)) {
        const activeBefore = backlog.items.some((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && item.status !== 'resolved' && item.status !== 'removed');
        if (activeBefore) { resolvePrayerBacklog(prayerDate, prayerName, status); changed = true; }
        continue;
      }
      const windowEnds = prayerWindowEndsAt(cursor, index);
      const windowEnded = now >= windowEnds;
      const isIshaCarryOver = index === 5 && prayerDate < localDateKey(now);
      if (!windowEnded && !isIshaCarryOver) continue;
      const active = backlog.items.find((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && item.status !== 'resolved' && item.status !== 'removed');
      const resolved = backlog.items.some((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && (item.status === 'resolved' || item.status === 'removed'));
      if (!active && !resolved) {
        const createdAt = now.toISOString();
        backlog.items.push({
          id: `auto-${prayerDate}-${index}`,
          prayerName,
          prayerDate,
          source: 'automatic',
          reason: isIshaCarryOver && !windowEnded ? 'day-rollover' : 'window-ended',
          status: status === 'missed' ? 'missed' : 'unconfirmed',
          createdAt,
          updatedAt: createdAt
        });
        changed = true;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (backlog.items.length > 600) backlog.items = backlog.items.slice(-600);
  return changed;
}

function renderPrayerBacklog() {
  const backlog = prayerBacklogState();
  const list = $('#prayerBacklogList');
  if (!list) return;
  const prayerOrder = REQUIRED_PRAYER_INDEXES.map((index) => prayerNames[index][0]);
  const active = backlog.items
    .filter((item) => item.status === 'unconfirmed' || item.status === 'missed')
    .sort((a, b) => a.prayerDate.localeCompare(b.prayerDate) || prayerOrder.indexOf(a.prayerName) - prayerOrder.indexOf(b.prayerName));
  const count = $('#prayerBacklogCount');
  if (count) {
    count.textContent = active.length ? `معلّقة: ${arabicDigits(active.length)}` : 'مفيش صلوات معلّقة';
    count.className = `status-pill ${active.length ? 'warm' : 'soft'}`;
  }
  const autoToggle = $('#autoPrayerBacklog');
  if (autoToggle) autoToggle.checked = backlog.autoTrack !== false;
  const dateInput = $('#backlogPrayerDate');
  if (dateInput) {
    dateInput.max = localDateKey();
    if (!dateInput.value) dateInput.value = localDateKey();
  }
  if (!active.length) {
    list.innerHTML = '<p class="prayer-backlog-empty">مفيش صلوات محتاجة مراجعة دلوقتي.</p>';
  } else {
    list.innerHTML = active.map((item) => {
      const date = dateFromLocalKey(item.prayerDate);
      const dateLabel = date ? new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(date) : item.prayerDate;
      const isUnconfirmed = item.status === 'unconfirmed';
      const sourceText = item.reason === 'day-rollover'
        ? 'اليوم اتغيّر، لكن وقت العشاء ما زال ممتدًا للفجر. اختار حالتها لما تكون جاهز.'
        : item.source === 'automatic'
        ? 'وِنس ضافها لأن وقتها انتهى من غير ما تسجّل حالتها.'
        : 'إنت ضفتها يدويًا علشان تفضل قدامك.';
      const actions = isUnconfirmed
        ? `<button class="button secondary" type="button" data-backlog-action="prayed" data-backlog-id="${escapeHtml(item.id)}">صليتها</button><button class="button ghost" type="button" data-backlog-action="missed" data-backlog-id="${escapeHtml(item.id)}">فاتتني</button>`
        : `<button class="button primary" type="button" data-backlog-action="made-up" data-backlog-id="${escapeHtml(item.id)}">قضيتها</button><button class="button ghost" type="button" data-backlog-action="prayed" data-backlog-id="${escapeHtml(item.id)}">كنت صليتها</button>`;
      return `<div class="prayer-backlog-item">
        <div class="prayer-backlog-prayer"><span class="backlog-state-mark" aria-hidden="true">${isUnconfirmed ? '؟' : '!'}</span><div><strong>${escapeHtml(item.prayerName)}</strong><time datetime="${escapeHtml(item.prayerDate)}">${escapeHtml(dateLabel)}</time></div></div>
        <div class="prayer-backlog-copy"><strong>${isUnconfirmed ? 'غير مؤكدة' : 'مسجّلة كفائتة'}</strong><br />${sourceText}</div>
        <div class="prayer-backlog-actions">${actions}</div>
      </div>`;
    }).join('');
  }
  const resolvedCount = backlog.items.filter((item) => item.status === 'resolved').length;
  const jump = $('#prayerBacklogJump');
  if (jump) {
    jump.hidden = false;
    jump.textContent = active.length ? `راجع الفائت والمعلّق · ${arabicDigits(active.length)}` : 'افتح سجل الفائت والمعلّق';
  }
  const note = $('#prayerBacklogNote');
  if (note) note.textContent = resolvedCount
    ? `الإضافة التلقائية لا تحكم إن الصلاة فاتتك؛ القرار ليك. مراجعات اتقفلت قبل كده: ${arabicDigits(resolvedCount)}.`
    : 'الإضافة التلقائية لا تحكم إن الصلاة فاتتك؛ هي بس بتسألك لأنك ما سجلتش حالتها.';
}

function resolveFastingBacklog(fastingDate, resolution) {
  const backlog = fastingBacklogState();
  const now = new Date().toISOString();
  backlog.items.forEach((item) => {
    if (item.fastingDate === fastingDate && !['resolved', 'removed'].includes(item.status)) {
      item.status = 'resolved';
      item.resolution = resolution;
      item.resolvedAt = now;
      item.updatedAt = now;
    }
  });
}

function reconcileFastingBacklog(now = new Date()) {
  const backlog = fastingBacklogState();
  if (!backlog.autoReview) return false;
  const trackingStart = new Date(backlog.trackingStartedAt);
  const oldestAllowed = new Date(now);
  oldestAllowed.setDate(now.getDate() - 90);
  oldestAllowed.setHours(0, 0, 0, 0);
  const cursor = Number.isNaN(trackingStart.getTime()) || trackingStart < oldestAllowed ? oldestAllowed : new Date(trackingStart);
  cursor.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  let changed = false;
  while (cursor <= today) {
    const fastingDate = localDateKey(cursor);
    const labels = fastingLabelsForDate(cursor);
    const shouldReview = labels.some((label) => label === 'رمضان' || label === 'يوم الصيام المخصص');
    const maghrib = prayerTimesForDate(cursor)[4];
    if (shouldReview && now >= maghrib) {
      const day = currentDay(fastingDate);
      if (day.fasting === 'yes') {
        const activeBefore = backlog.items.some((item) => item.fastingDate === fastingDate && !['resolved', 'removed'].includes(item.status));
        if (activeBefore) { resolveFastingBacklog(fastingDate, 'fasted'); changed = true; }
      } else if (day.fasting === 'not-planned') {
        resolveFastingBacklog(fastingDate, 'not-required');
      } else {
        const active = backlog.items.some((item) => item.fastingDate === fastingDate && !['resolved', 'removed'].includes(item.status));
        const closed = backlog.items.some((item) => item.fastingDate === fastingDate && ['resolved', 'removed'].includes(item.status));
        if (!active && !closed) {
          const createdAt = now.toISOString();
          backlog.items.push({ id: `auto-fast-${fastingDate}`, fastingDate, fastingType: labels.join(' و'), source: 'automatic', status: day.fasting === 'no' ? 'missed' : 'unconfirmed', createdAt, updatedAt: createdAt });
          changed = true;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (backlog.items.length > 300) backlog.items = backlog.items.slice(-300);
  return changed;
}

function renderFastingBacklog() {
  const backlog = fastingBacklogState();
  const list = $('#fastingBacklogList');
  if (!list) return;
  const active = backlog.items.filter((item) => ['unconfirmed', 'missed'].includes(item.status)).sort((a, b) => a.fastingDate.localeCompare(b.fastingDate));
  const count = $('#fastingBacklogCount');
  if (count) {
    count.textContent = active.length ? `معلّقة: ${arabicDigits(active.length)}` : 'مفيش أيام معلّقة';
    count.className = `status-pill ${active.length ? 'warm' : 'soft'}`;
  }
  const toggle = $('#autoFastingBacklog'); if (toggle) toggle.checked = backlog.autoReview !== false;
  const input = $('#backlogFastingDate');
  if (input) { input.max = localDateKey(); if (!input.value) input.value = localDateKey(); }
  if (!active.length) {
    list.innerHTML = '<p class="prayer-backlog-empty">مفيش أيام صيام محتاجة مراجعة دلوقتي.</p>';
  } else {
    list.innerHTML = active.map((item) => {
      const date = dateFromLocalKey(item.fastingDate);
      const dateLabel = date ? new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(date) : item.fastingDate;
      const unconfirmed = item.status === 'unconfirmed';
      const copy = item.source === 'automatic' ? 'اليوم كان مخططًا وانتهى من غير تسجيل حالته.' : 'إنت ضفته يدويًا علشان يفضل على رادارك.';
      const actions = unconfirmed
        ? `<button class="button secondary" type="button" data-fasting-backlog-action="fasted" data-fasting-backlog-id="${escapeHtml(item.id)}">صمته</button><button class="button ghost" type="button" data-fasting-backlog-action="missed" data-fasting-backlog-id="${escapeHtml(item.id)}">فاتني</button><button class="button ghost" type="button" data-fasting-backlog-action="remove" data-fasting-backlog-id="${escapeHtml(item.id)}">مش مطلوب</button>`
        : `<button class="button primary" type="button" data-fasting-backlog-action="made-up" data-fasting-backlog-id="${escapeHtml(item.id)}">قضيته</button><button class="button ghost" type="button" data-fasting-backlog-action="fasted" data-fasting-backlog-id="${escapeHtml(item.id)}">كنت صمته</button>`;
      return `<div class="prayer-backlog-item fasting-backlog-item"><div class="prayer-backlog-prayer"><span class="backlog-state-mark" aria-hidden="true">${unconfirmed ? '؟' : '!'}</span><div><strong>${escapeHtml(item.fastingType)}</strong><time datetime="${escapeHtml(item.fastingDate)}">${escapeHtml(dateLabel)}</time></div></div><div class="prayer-backlog-copy"><strong>${unconfirmed ? 'محتاج تأكيد' : 'مسجّل كصيام فائت'}</strong><br />${copy}</div><div class="prayer-backlog-actions">${actions}</div></div>`;
    }).join('');
  }
  const prayerActive = prayerBacklogState().items.filter((item) => ['unconfirmed', 'missed'].includes(item.status)).length;
  const total = prayerActive + active.length;
  const prayerSummary = $('#missedPrayerSummary'); if (prayerSummary) prayerSummary.textContent = arabicDigits(prayerActive);
  const fastingSummary = $('#missedFastingSummary'); if (fastingSummary) fastingSummary.textContent = arabicDigits(active.length);
  const navCount = $('#missedNavCount'); if (navCount) { navCount.hidden = total === 0; navCount.textContent = arabicDigits(total); }
}

function fastingLabelsForDate(date) {
  const labels = [];
  const hijri = getAdjustedHijri(date);
  if (state.fasting.mondayThursday && date.getDay() === 1) labels.push('صيام الاثنين');
  if (state.fasting.mondayThursday && date.getDay() === 4) labels.push('صيام الخميس');
  if (state.fasting.whiteDays && [13, 14, 15].includes(hijri.day)) labels.push('الأيام البيض');
  if (state.fasting.ramadan && hijri.month === 9) labels.push('رمضان');
  if ((state.fasting.custom || []).some((item) => item.date === localDateKey(date))) labels.push('يوم الصيام المخصص');
  if (localDateKey(date) === localDateKey() && (state.fasting.today || currentDay().fasting === 'yes') && !labels.length) labels.push('الصيام المسجل');
  return [...new Set(labels)];
}

function isSuhoorAlarmEnabledForDate(date) {
  const alarm = state.fasting.suhoorAlarm;
  if (!alarm || alarm.enabled === false) return false;
  const labels = fastingLabelsForDate(date);
  if (!labels.length) return false;
  if (labels.includes('رمضان') && alarm.ramadan !== false) return true;
  if (labels.includes('الأيام البيض') && Boolean(alarm.whiteDays)) return true;
  if ((labels.includes('صيام الاثنين') || labels.includes('صيام الخميس')) && Boolean(alarm.mondayThursday)) return true;
  if ((labels.includes('يوم الصيام المخصص') || labels.includes('الصيام المسجل')) && Boolean(alarm.custom)) return true;
  return false;
}

function calculateSuhoorTimeForDate(date) {
  const alarm = state.fasting.suhoorAlarm || {};
  if (alarm.mode === 'time' && alarm.customTime) {
    const parts = String(alarm.customTime).split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const target = new Date(date);
    target.setHours(Number.isFinite(hours) ? hours : 3, Number.isFinite(minutes) ? minutes : 30, 0, 0);
    return target;
  }
  const leadMinutes = Number(alarm.leadMinutes) || 45;
  const fajr = prayerTimesForDate(date)[0];
  return new Date(fajr.getTime() - leadMinutes * 60 * 1000);
}

function islamicOccasionsForDate(date) {
  const hijri = getAdjustedHijri(date);
  const events = [];
  const add = (title, kind = 'occasion') => events.push({ title, kind, hijri });
  if (hijri.month === 1 && hijri.day === 1) add('رأس السنة الهجرية');
  if (hijri.month === 1 && hijri.day === 9) add('تاسوعاء', 'fasting');
  if (hijri.month === 1 && hijri.day === 10) add('عاشوراء', 'fasting');
  if (hijri.month === 3 && hijri.day === 12) add('المولد النبوي الشريف');
  if (hijri.month === 7 && hijri.day === 27) add('ذكرى الإسراء والمعراج');
  if (hijri.month === 8 && hijri.day === 15) add('ليلة النصف من شعبان', 'night');
  if (hijri.month === 9 && hijri.day === 1) add('بداية شهر رمضان', 'fasting');
  if (hijri.month === 9 && hijri.day === 27) add('ليلة السابع والعشرين من رمضان', 'night');
  if (hijri.month === 10 && hijri.day === 1) add('عيد الفطر');
  if (hijri.month === 12 && hijri.day === 9) add('يوم عرفة', 'fasting');
  if (hijri.month === 12 && hijri.day === 10) add('عيد الأضحى');
  if (hijri.month === 12 && [11, 12, 13].includes(hijri.day)) add('أيام التشريق');
  if ([13, 14, 15].includes(hijri.day)) add(`اليوم ${arabicDigits(hijri.day)} من الأيام البيض`, 'fasting');
  return events;
}

function upcomingIslamicOccasions(from = new Date(), days = 90) {
  const upcoming = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = new Date(from);
    date.setDate(from.getDate() + offset);
    date.setHours(0, 0, 0, 0);
    islamicOccasionsForDate(date).forEach((event) => upcoming.push({ ...event, date, offset }));
  }
  return upcoming;
}

function plannedFastingForDate(date) {
  const day = currentDay(localDateKey(date));
  if (day.fasting === 'not-planned') return false;
  return fastingLabelsForDate(date).length > 0;
}

function worshipDayProgress(date) {
  const key = localDateKey(date);
  const day = currentDay(key);
  const prayersDone = REQUIRED_PRAYER_INDEXES.filter((index) => prayerIsComplete(day.prayers?.[prayerNames[index][0]])).length;
  const fastingPlanned = plannedFastingForDate(date);
  const fastingDone = !fastingPlanned || day.fasting === 'yes';
  return { prayersDone, fastingPlanned, fastingDone, complete: prayersDone === REQUIRED_PRAYER_INDEXES.length && fastingDone };
}

function startOfCurrentWeek(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function renderWeeklyWorship(now = new Date()) {
  const container = $('#weeklyWorshipDays'); if (!container) return;
  const start = startOfCurrentWeek(now);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const range = $('#weeklyRangeLabel');
  if (range) range.textContent = `${formatShortDate(start)} — ${formatShortDate(end)}`;
  container.innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const progress = worshipDayProgress(date);
    const occasions = islamicOccasionsForDate(date);
    const isToday = localDateKey(date) === localDateKey(now);
    const isFuture = date > now && !isToday;
    const weekday = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(date);
    const fastLabel = progress.fastingPlanned ? ' · صيام مخطط' : '';
    const occasionLabel = occasions[0]?.title ? ` · ${occasions[0].title}` : '';
    const statusLabel = progress.complete ? 'مكتمل' : `${arabicDigits(progress.prayersDone)} من ٥ صلوات${progress.fastingPlanned ? progress.fastingDone ? ' · الصيام تم' : ' · الصيام باقي' : ''}`;
    return `<button type="button" class="worship-day ${progress.complete ? 'complete' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}" data-week-date="${localDateKey(date)}" aria-label="${escapeHtml(`${weekday} ${date.getDate()}، ${statusLabel}${fastLabel}${occasionLabel}`)}">
      <span class="worship-weekday">${escapeHtml(weekday)}</span><strong>${arabicDigits(date.getDate())}</strong>
      <span class="worship-day-marks">${progress.fastingPlanned ? '<i class="fasting-mark" title="صيام مخطط"></i>' : ''}${occasions.length ? '<i class="occasion-mark" title="مناسبة إسلامية"></i>' : ''}</span>
      <small>${progress.complete ? 'تم اليوم' : isFuture ? 'قادم' : `${arabicDigits(progress.prayersDone)}/٥`}</small>
    </button>`;
  }).join('');
}

function renderOccasions(now = new Date()) {
  const list = $('#occasionsList'); if (!list) return;
  const upcoming = upcomingIslamicOccasions(now, 90).slice(0, 8);
  if (!upcoming.length) {
    list.innerHTML = '<p class="occasion-empty">مفيش مناسبة مسجلة في الـ٩٠ يوم الجايين حسب التقويم الحالي.</p>';
    return;
  }
  list.innerHTML = upcoming.map((event) => {
    const when = event.offset === 0 ? 'النهارده' : event.offset === 1 ? 'بكرة' : `بعد ${arabicDigits(event.offset)} يوم`;
    return `<article class="occasion-item ${event.offset <= 1 ? 'soon' : ''}"><time datetime="${localDateKey(event.date)}"><strong>${arabicDigits(event.date.getDate())}</strong><span>${new Intl.DateTimeFormat('ar-EG', { month: 'short' }).format(event.date)}</span></time><div><h3>${escapeHtml(event.title)}</h3><p>${arabicDigits(event.hijri.day)} ${escapeHtml(event.hijri.monthName)} · ${when}</p></div></article>`;
  }).join('');
}

function renderDevotion() {
  state.devotion ||= structuredClone(defaultState.devotion);
  state.devotion.adhkarGroups = { ...defaultState.devotion.adhkarGroups, ...(state.devotion.adhkarGroups || {}) };
  const day = currentDay();
  const quranEnabled = Boolean(state.devotion.quranEnabled);
  const adhkarEnabled = Boolean(state.devotion.adhkarEnabled);
  const quranToggle = $('#quranEnabled'); if (quranToggle) quranToggle.checked = quranEnabled;
  const quranTarget = $('#quranTarget'); if (quranTarget) { quranTarget.value = state.devotion.quranTarget || 'ayah-1'; quranTarget.disabled = !quranEnabled; }
  const quranConfig = $('#quranConfig'); if (quranConfig) quranConfig.classList.toggle('is-disabled', !quranEnabled);
  const trackerCont = $('#quranTrackerContainer');
  if (trackerCont) {
    if (!quranEnabled) {
      trackerCont.innerHTML = '<p class="devotion-inline-status">الورد مقفول حاليًا.</p>';
    } else {
      const todayStr = day.date;
      const log = (state.devotion.quranLog || {})[todayStr] || { count: 0, done: false };
      
      const quranTargetVal = state.devotion.quranTarget || 'ayah-1';
      let targetNum = 1; let unit = 'آية';
      if (quranTargetVal === 'ayah-3') { targetNum = 3; unit = 'آيات'; }
      if (quranTargetVal === 'ayah-5') { targetNum = 5; unit = 'آيات'; }
      if (quranTargetVal === 'ayah-10') { targetNum = 10; unit = 'آيات'; }
      if (quranTargetVal === 'page-1') { targetNum = 1; unit = 'صفحة'; }
      
      let gridHtml = '<div class="quran-7day-grid">';
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const dLog = (state.devotion.quranLog || {})[dStr] || { done: false };
        gridHtml += `<span class="quran-dot ${dLog.done ? 'done' : 'missed'}" title="${dStr}"></span>`;
      }
      gridHtml += '</div>';

      const progressPerc = Math.min(100, Math.round((log.count / targetNum) * 100));

      trackerCont.innerHTML = `
        <div class="quran-counter-ui">
          <div class="quran-counter-actions">
            <button class="button ghost small-button" onclick="updateQuranCounter(-1)">-</button>
            <div class="quran-count-display">${log.count} / ${targetNum} <span>${unit}</span></div>
            <button class="button secondary small-button" onclick="updateQuranCounter(1)">+</button>
          </div>
          <div class="quran-progress-wrap"><div class="quran-progress-bar" style="width: ${progressPerc}%"></div></div>
          ${gridHtml}
          <p class="devotion-inline-status">${log.done ? 'ورد اليوم تم.' : `المطلوب اليوم: ${QURAN_TARGET_LABELS[quranTargetVal] || 'آية واحدة'}`}</p>
        </div>
      `;
    }
  }

  const adhkarToggle = $('#adhkarEnabled'); if (adhkarToggle) adhkarToggle.checked = adhkarEnabled;
  const options = $('#adhkarOptions'); if (options) options.classList.toggle('is-disabled', !adhkarEnabled);
  $$('[data-adhkar-group]').forEach((button) => {
    const active = Boolean(state.devotion.adhkarGroups[button.dataset.adhkarGroup]);
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); button.disabled = !adhkarEnabled;
  });
  const enabledGroups = Object.keys(ADHKAR_GROUPS).filter((key) => state.devotion.adhkarGroups[key]);
  const checklist = $('#adhkarTodayChecklist');
  if (checklist) {
    checklist.innerHTML = !adhkarEnabled ? '' : enabledGroups.length ? enabledGroups.map((key) => `<button type="button" class="adhkar-today-button ${day.devotion.adhkar[key] ? 'done' : ''}" data-adhkar-complete="${key}" aria-pressed="${Boolean(day.devotion.adhkar[key])}"><span>${day.devotion.adhkar[key] ? 'تم' : 'لسه'}</span>${ADHKAR_GROUPS[key].label}</button>`).join('') : '<p>اختار مجموعة أذكار واحدة على الأقل.</p>';
  }
  const adhkarDone = enabledGroups.filter((key) => day.devotion.adhkar[key]).length;
  const adhkarStatus = $('#adhkarTodayStatus');
  if (adhkarStatus) adhkarStatus.textContent = !adhkarEnabled ? 'الأذكار مقفولة حاليًا.' : enabledGroups.length ? `${arabicDigits(adhkarDone)} من ${arabicDigits(enabledGroups.length)} مجموعات تمت اليوم.` : 'الأذكار شغالة، لكن مفيش مجموعة مختارة.';

  const enabledTasks = (quranEnabled ? 1 : 0) + (adhkarEnabled ? enabledGroups.length : 0);
  const doneTasks = (quranEnabled && day.devotion.quranDone ? 1 : 0) + (adhkarEnabled ? adhkarDone : 0);
  const status = $('#devotionTodayStatus');
  if (status) { status.textContent = !enabledTasks ? 'الورد والأذكار مقفولان' : doneTasks === enabledTasks ? 'ورد اليوم وأذكاره تموا' : `تم ${arabicDigits(doneTasks)} من ${arabicDigits(enabledTasks)}`; status.className = `status-pill ${enabledTasks && doneTasks === enabledTasks ? 'success' : 'soft'}`; }
  const todayTitle = $('#todayDevotionTitle'); if (todayTitle) todayTitle.textContent = quranEnabled || adhkarEnabled ? 'وردك وأذكارك اليوم' : 'الورد والأذكار';
  const todaySummary = $('#todayDevotionStatus');
  if (todaySummary) todaySummary.textContent = !enabledTasks ? 'اختياريان ومقفولان لحد ما تفعّلهم' : doneTasks === enabledTasks ? 'كل اللي فعلته تم النهارده' : `باقي ${arabicDigits(enabledTasks - doneTasks)} من اختياراتك`;
  renderWeeklyWorship();
  renderOccasions();
}

function setDevotionEnabled(type, enabled) {
  if (type === 'quran') state.devotion.quranEnabled = Boolean(enabled);
  if (type === 'adhkar') state.devotion.adhkarEnabled = Boolean(enabled);
  saveState(); syncNativeReminderPlan(); renderDevotion();
  showToast(enabled ? 'التذكير اتفعّل' : 'التذكير اتقفل', enabled ? 'اختياراتك هتفضل محلية وتقدر تغيّرها في أي وقت.' : 'سجل الأيام القديمة محفوظ، ومش هيجيلك تنبيه جديد.');
}

function updateQuranCounter(delta) {
  const quranTargetVal = state.devotion.quranTarget || 'ayah-1';
  let targetNum = 1;
  if (quranTargetVal === 'ayah-3') targetNum = 3;
  if (quranTargetVal === 'ayah-5') targetNum = 5;
  if (quranTargetVal === 'ayah-10') targetNum = 10;
  if (quranTargetVal === 'page-1') targetNum = 1; // page
  if (quranTargetVal === 'page-half') targetNum = 1; // logical target 1 segment
  if (quranTargetVal === 'page-quarter') targetNum = 1;

  const todayStr = currentDay().date;
  state.devotion.quranLog = state.devotion.quranLog || {};
  let currentLog = state.devotion.quranLog[todayStr] || { done: false, count: 0 };
  
  currentLog.count = Math.max(0, (currentLog.count || 0) + delta);
  if (currentLog.count >= targetNum) {
    currentLog.done = true;
  } else {
    currentLog.done = false;
  }
  
  state.devotion.quranLog[todayStr] = currentLog;
  
  // Keep day.devotion.quranDone in sync for backwards compatibility / alerts
  const day = currentDay();
  day.devotion.quranDone = currentLog.done;
  if (currentLog.done) {
    day.devotion.quranCompletedAt = new Date().toISOString();
  } else {
    day.devotion.quranCompletedAt = null;
  }
  day.updatedAt = new Date().toISOString();
  saveState();
  renderDevotion();
}
window.updateQuranCounter = updateQuranCounter;

function toggleQuranToday() {
  if (!state.devotion.quranEnabled) return;
  const day = currentDay(); day.devotion.quranDone = !day.devotion.quranDone; day.devotion.quranCompletedAt = day.devotion.quranDone ? new Date().toISOString() : null; day.updatedAt = new Date().toISOString();
  saveState(); syncNativeReminderPlan(); renderDevotion();
  showToast(day.devotion.quranDone ? 'ورد اليوم تم' : 'الورد رجع ضمن اللي لسه', day.devotion.quranDone ? 'اتحفظ محليًا… ربنا يتقبل.' : 'تقدر تعلّم عليه لما تخلص.', day.devotion.quranDone ? 'success' : 'normal');
}

function toggleAdhkarGroupSetting(group) {
  if (!state.devotion.adhkarEnabled || !ADHKAR_GROUPS[group]) return;
  state.devotion.adhkarGroups[group] = !state.devotion.adhkarGroups[group];
  saveState(); syncNativeReminderPlan(); renderDevotion();
}

function toggleAdhkarToday(group) {
  if (!state.devotion.adhkarEnabled || !state.devotion.adhkarGroups[group]) return;
  const day = currentDay(); day.devotion.adhkar[group] = !day.devotion.adhkar[group]; day.updatedAt = new Date().toISOString();
  saveState(); syncNativeReminderPlan(); renderDevotion();
  showToast(day.devotion.adhkar[group] ? `${ADHKAR_GROUPS[group].label} تمت` : `${ADHKAR_GROUPS[group].label} رجعت لسه`, '', day.devotion.adhkar[group] ? 'success' : 'normal');
}

function challengeState() {
  state.challenges ||= structuredClone(defaultState.challenges);
  state.challenges.catalog = Array.isArray(state.challenges.catalog) ? state.challenges.catalog : [];
  state.challenges.enrollments = Array.isArray(state.challenges.enrollments) ? state.challenges.enrollments : [];
  state.challenges.randomHistory = Array.isArray(state.challenges.randomHistory) ? state.challenges.randomHistory : [];
  state.challenges.enabled = state.challenges.enabled !== false;
  state.challenges.randomSource = ['mixed', 'developer', 'app'].includes(state.challenges.randomSource) ? state.challenges.randomSource : 'mixed';
  state.challenges.randomAuto = Boolean(state.challenges.randomAuto);
  return state.challenges;
}

function createChallengeId() {
  if (globalThis.crypto?.randomUUID) return `challenge-${globalThis.crypto.randomUUID()}`;
  return `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeChallengeDefinition(input, source = 'imported') {
  if (!input || typeof input !== 'object') throw new Error('الملف لا يحتوي على تعريف تحدي.');
  const title = String(input.title || '').trim().slice(0, 80);
  const description = String(input.description || '').trim().slice(0, 180);
  const unit = String(input.unit || '').trim().slice(0, 28);
  const category = CHALLENGE_CATEGORIES[input.category] ? input.category : 'custom';
  const target = Math.trunc(Number(input.target));
  const step = Math.trunc(Number(input.step || 1));
  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (!title || !description || !unit) throw new Error('اسم التحدي ووصفه ووحدته مطلوبين.');
  if (!Number.isFinite(target) || target < 1 || target > 100000) throw new Error('الهدف لازم يكون من ١ إلى ١٠٠٬٠٠٠.');
  if (!Number.isFinite(step) || step < 1 || step > target) throw new Error('الزيادة لازم تكون من ١ لحد قيمة الهدف.');
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error('تاريخ البداية غير صالح.');
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error('تاريخ الانتهاء غير صالح.');
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error('تاريخ الانتهاء لازم يكون بعد البداية.');
  const safeId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,120}$/.test(String(input.id || '')) ? String(input.id) : createChallengeId();
  return {
    id: safeId,
    schemaVersion: 1,
    title,
    description,
    category,
    target,
    unit,
    step,
    startsAt: startsAt?.toISOString() || null,
    endsAt: endsAt?.toISOString() || null,
    createdAt: input.createdAt && !Number.isNaN(new Date(input.createdAt).getTime()) ? new Date(input.createdAt).toISOString() : new Date().toISOString(),
    publishedAt: new Date().toISOString(),
    source: ['bundled', 'developer', 'imported', 'user', 'app'].includes(source) ? source : 'imported',
    randomChallenge: Boolean(input.randomChallenge),
    templateKey: input.templateKey ? String(input.templateKey).slice(0, 80) : null
  };
}

function challengeEnrollment(challengeId) {
  return challengeState().enrollments.find((item) => item.challengeId === challengeId);
}

function challengeTiming(challenge, now = new Date()) {
  const startsAt = challenge.startsAt ? new Date(challenge.startsAt) : null;
  const endsAt = challenge.endsAt ? new Date(challenge.endsAt) : null;
  if (startsAt && startsAt > now) {
    return { state: 'upcoming', label: `يبدأ ${new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(startsAt)}`, remaining: '' };
  }
  if (endsAt && endsAt <= now) return { state: 'expired', label: 'انتهت مدته', remaining: '' };
  if (!endsAt) return { state: 'open', label: 'بدون مدة', remaining: '' };
  const milliseconds = Math.max(0, endsAt.getTime() - now.getTime());
  const hours = Math.ceil(milliseconds / 3600000);
  const days = Math.ceil(milliseconds / 86400000);
  return {
    state: hours <= 24 ? 'urgent' : 'timed',
    label: hours <= 24 ? `فاضل ${arabicDigits(hours)} ساعة` : `فاضل ${arabicDigits(days)} يوم`,
    remaining: hours <= 24 ? `${arabicDigits(hours)} ساعة` : `${arabicDigits(days)} يوم`
  };
}

function expireFinishedChallenges() {
  let changed = false;
  const catalog = challengeState().catalog;
  state.challenges.enrollments.forEach((enrollment) => {
    if (enrollment.status !== 'active') return;
    const challenge = catalog.find((item) => item.id === enrollment.challengeId);
    if (!challenge || challengeTiming(challenge).state === 'expired') {
      enrollment.status = 'expired';
      enrollment.expiredAt = new Date().toISOString();
      enrollment.updatedAt = enrollment.expiredAt;
      changed = true;
    }
  });
  if (changed) saveState();
}

function challengeCardMarkup(challenge, enrollment) {
  const progress = Math.min(challenge.target, Math.max(0, Number(enrollment.progress) || 0));
  const remaining = Math.max(0, challenge.target - progress);
  const ratio = challenge.target ? progress / challenge.target : 0;
  const timing = challengeTiming(challenge);
  const timeTag = challenge.endsAt ? `<span class="challenge-duration ${timing.state === 'urgent' ? 'urgent' : ''}">${escapeHtml(timing.label)}</span>` : '<span class="challenge-duration">بدون مدة</span>';
  const originLabel = enrollment.randomChallenge ? `راندوم · ${enrollment.randomSource === 'developer' ? 'المطور' : 'وِنس'}` : challenge.source === 'user' ? 'تحديك الشخصي' : '';
  const originTag = originLabel ? `<span class="challenge-origin">${escapeHtml(originLabel)}</span>` : '';
  const progressLabel = `${arabicDigits(progress)} من ${arabicDigits(challenge.target)} ${escapeHtml(challenge.unit)}`;
  const actionLabel = challenge.target === 1 ? 'علّم التحدي تم' : `سجّل +${arabicDigits(challenge.step)} ${escapeHtml(challenge.unit)}`;
  return `<article class="challenge-card" data-challenge-card="${escapeHtml(challenge.id)}">
    <div class="challenge-card-copy"><div class="challenge-card-topline"><span class="challenge-category">${escapeHtml(CHALLENGE_CATEGORIES[challenge.category] || 'مخصص')}</span>${timeTag}${originTag}</div><h3>${escapeHtml(challenge.title)}</h3><p>${escapeHtml(challenge.description)}</p></div>
    <div class="challenge-progress-block"><div class="challenge-progress-numbers"><strong>${progressLabel}</strong><span>${arabicDigits(Math.round(ratio * 100))}٪</span></div><div class="challenge-track" role="progressbar" aria-label="تقدم ${escapeHtml(challenge.title)}" aria-valuemin="0" aria-valuemax="${challenge.target}" aria-valuenow="${progress}"><span style="--challenge-progress:${ratio}"></span></div><div class="challenge-progress-meta"><strong>فاضل ${arabicDigits(remaining)} ${escapeHtml(challenge.unit)}</strong>${challenge.endsAt ? `<span>المدة: ${escapeHtml(timing.remaining)}</span>` : '<span>مفيش موعد انتهاء</span>'}</div></div>
    <div class="challenge-card-actions"><button class="button primary" type="button" data-challenge-action="progress" data-challenge-id="${escapeHtml(challenge.id)}">${actionLabel}</button><button class="challenge-remove" type="button" data-challenge-action="dismiss" data-challenge-id="${escapeHtml(challenge.id)}">مش هعمله · شيله</button></div>
  </article>`;
}

function challengeCatalogMarkup(challenge) {
  const timing = challengeTiming(challenge);
  const unavailable = timing.state === 'upcoming';
  const exportButton = state.challenges.developerToolsOpen ? `<button class="button ghost" type="button" data-challenge-action="export" data-challenge-id="${escapeHtml(challenge.id)}">تصدير</button>` : '';
  return `<article class="challenge-catalog-card" data-challenge-catalog-card="${escapeHtml(challenge.id)}"><div class="challenge-card-topline"><span class="challenge-category">${escapeHtml(CHALLENGE_CATEGORIES[challenge.category] || 'مخصص')}</span><span class="challenge-duration ${timing.state === 'urgent' ? 'urgent' : ''}">${escapeHtml(timing.label)}</span></div><h3>${escapeHtml(challenge.title)}</h3><p>${escapeHtml(challenge.description)}</p><div class="challenge-catalog-meta"><span>الهدف: ${arabicDigits(challenge.target)} ${escapeHtml(challenge.unit)}</span><div class="challenge-catalog-actions">${exportButton}<button class="button secondary" type="button" data-challenge-action="join" data-challenge-id="${escapeHtml(challenge.id)}" ${unavailable ? 'disabled' : ''}>${unavailable ? 'لسه مبدأش' : 'انضم للتحدي'}</button></div></div></article>`;
}

function renderChallenges() {
  const challenges = challengeState();
  expireFinishedChallenges();
  const now = new Date();
  const catalog = state.challenges.catalog.filter((item) => item && challengeTiming(item, now).state !== 'expired');
  const activeEnrollments = state.challenges.enrollments.filter((item) => item.status === 'active');
  const activeChallenges = activeEnrollments.map((enrollment) => ({ enrollment, challenge: catalog.find((item) => item.id === enrollment.challengeId) })).filter((item) => item.challenge);
  const hiddenIds = new Set(state.challenges.enrollments.filter((item) => ['active', 'completed', 'dismissed', 'expired'].includes(item.status)).map((item) => item.challengeId));
  const available = catalog.filter((item) => !hiddenIds.has(item.id));
  const activeList = $('#activeChallengeList');
  if (activeList) activeList.innerHTML = activeChallenges.length ? activeChallenges.map(({ challenge, enrollment }) => challengeCardMarkup(challenge, enrollment)).join('') : '<div class="challenge-empty"><strong>مفيش تحدي شغال دلوقتي</strong><span>اختار من المتاح تحت، وأول ما تنضم هيظهر تقدمك هنا.</span></div>';
  const availableList = $('#challengeCatalog');
  if (availableList) availableList.innerHTML = available.length ? available.map(challengeCatalogMarkup).join('') : '<div class="challenge-empty"><strong>مفيش تحديات متاحة جديدة</strong><span>التحديات اللي خلصتها أو شيلتها مش هتظهر لك تاني. المطور يقدر ينشر تحدي جديد من الأدوات تحت.</span></div>';
  const count = $('#activeChallengeCount'); if (count) count.textContent = activeChallenges.length ? `${arabicDigits(activeChallenges.length)} تحدي نشط` : 'مفيش تحدي نشط';
  const navCount = $('#challengeNavCount'); if (navCount) { navCount.textContent = arabicDigits(activeChallenges.length); navCount.hidden = !challenges.enabled || activeChallenges.length === 0; }
  const enabledToggle = $('#challengesEnabled'); if (enabledToggle) enabledToggle.checked = challenges.enabled;
  const workspace = $('#challengeWorkspace'); if (workspace) workspace.hidden = !challenges.enabled;
  const disabledState = $('#challengeDisabledState'); if (disabledState) disabledState.hidden = challenges.enabled;
  const panel = $('#challengeDeveloperPanel'); if (panel) panel.hidden = !challenges.enabled || !challenges.developerToolsOpen;
  const toggle = $('[data-action="toggle-challenge-developer"]');
  if (toggle) { toggle.hidden = !challenges.enabled; toggle.setAttribute('aria-expanded', String(Boolean(challenges.developerToolsOpen))); toggle.textContent = challenges.developerToolsOpen ? 'إخفاء أدوات المطور' : 'أدوات المطور'; }
  $$('input[name="randomSource"]').forEach((input) => { input.checked = input.value === challenges.randomSource; input.disabled = !challenges.enabled; });
  const autoToggle = $('#challengeRandomAuto'); if (autoToggle) { autoToggle.checked = challenges.randomAuto; autoToggle.disabled = !challenges.enabled; }
  const randomStatus = $('#challengeRandomStatus');
  if (randomStatus) {
    if (!challenges.enabled) randomStatus.textContent = 'النظام مقفول';
    else if (!challenges.randomAuto) randomStatus.textContent = 'الراندوم اليدوي جاهز';
    else if (!challenges.lastRandomAt) randomStatus.textContent = 'أول تحدي تلقائي جاهز';
    else {
      const nextAt = new Date(challenges.lastRandomAt).getTime() + 7 * 86400000;
      const days = Math.max(0, Math.ceil((nextAt - Date.now()) / 86400000));
      randomStatus.textContent = days ? `الراندوم القادم بعد ${arabicDigits(days)} يوم` : 'الراندوم القادم جاهز';
    }
  }
}

function joinChallenge(challengeId, options = {}) {
  const challenges = challengeState();
  const challenge = challenges.catalog.find((item) => item.id === challengeId);
  const timingState = challenge ? challengeTiming(challenge).state : 'expired';
  if (!challenges.enabled || !challenge || challengeEnrollment(challengeId) || !['open', 'timed', 'urgent'].includes(timingState)) return false;
  const now = new Date().toISOString();
  challenges.enrollments.push({ challengeId, progress: 0, joinedAt: now, updatedAt: now, status: 'active', completedAt: null, dismissedAt: null, randomChallenge: Boolean(options.randomChallenge), randomSource: options.randomSource || null });
  if (options.randomChallenge) challenges.lastRandomAt = now;
  saveState(); renderChallenges();
  if (!options.silent) showToast(options.randomChallenge ? 'وِنس اختار لك تحدي' : 'انضمّيت للتحدي', `${challenge.title} ظهر في قائمة «شغال عليها».`, 'success');
  return true;
}

function setChallengesEnabled(enabled) {
  const challenges = challengeState(); challenges.enabled = Boolean(enabled);
  if (!challenges.enabled) challenges.developerToolsOpen = false;
  saveState(); renderChallenges();
  showToast(challenges.enabled ? 'التحديات اشتغلت' : 'التحديات اتقفلت', challenges.enabled ? 'تقدر تعمل تحديك أو تخلي وِنس يختار لك.' : 'تقدمك القديم محفوظ، والراندوم التلقائي متوقف.', challenges.enabled ? 'success' : 'normal');
}

function createPersonalChallenge(event) {
  event.preventDefault();
  if (!challengeState().enabled) return;
  const form = event.currentTarget; const data = new FormData(form);
  try {
    const title = String(data.get('title') || '').trim();
    const endsAt = data.get('endsAt') ? `${data.get('endsAt')}T23:59:59` : null;
    const challenge = normalizeChallengeDefinition({ title, description: `تحدي شخصي: ${title}`, category: data.get('category'), target: data.get('target'), unit: data.get('unit'), step: 1, startsAt: null, endsAt }, 'user');
    challengeState().catalog.unshift(challenge);
    joinChallenge(challenge.id, { silent: true });
    form.reset(); form.elements.target.value = '1'; form.elements.unit.value = 'مرة';
    showToast('تحديك بدأ', `${challenge.title} ظهر في قائمة «شغال عليها».`, 'success');
  } catch (error) { showToast('التحدي متحفظش', error instanceof Error ? error.message : 'راجع البيانات وحاول تاني.', 'error'); }
}

function availableDeveloperChallenges() {
  const challenges = challengeState();
  const usedIds = new Set(challenges.enrollments.map((item) => item.challengeId));
  return challenges.catalog.filter((challenge) => ['bundled', 'developer', 'imported'].includes(challenge.source) && !usedIds.has(challenge.id) && ['open', 'timed', 'urgent'].includes(challengeTiming(challenge).state));
}

function createLocalRandomDefinition() {
  const challenges = challengeState();
  let choices = LOCAL_RANDOM_CHALLENGE_TEMPLATES.filter((template) => !challenges.randomHistory.includes(template.key));
  if (!choices.length) { challenges.randomHistory = []; choices = [...LOCAL_RANDOM_CHALLENGE_TEMPLATES]; }
  const template = choices[Math.floor(Math.random() * choices.length)];
  const endsAt = new Date(); endsAt.setDate(endsAt.getDate() + template.durationDays); endsAt.setHours(23, 59, 59, 999);
  const challenge = normalizeChallengeDefinition({ ...template, id: createChallengeId(), startsAt: null, endsAt: endsAt.toISOString(), randomChallenge: true, templateKey: template.key }, 'app');
  challenges.randomHistory.push(template.key);
  challenges.catalog.unshift(challenge);
  return challenge;
}

function generateRandomChallenge({ automatic = false } = {}) {
  const challenges = challengeState();
  if (!challenges.enabled) return false;
  const hasActiveRandom = challenges.enrollments.some((item) => item.status === 'active' && item.randomChallenge);
  if (hasActiveRandom) {
    if (!automatic) showToast('عندك تحدي راندوم شغال', 'كمّله أو شيله الأول، وبعدها اطلب اختيارًا جديدًا.');
    return false;
  }
  const developerChoices = availableDeveloperChallenges();
  let source = challenges.randomSource;
  if (source === 'mixed') source = developerChoices.length && Math.random() < 0.5 ? 'developer' : 'app';
  if (source === 'developer' && !developerChoices.length) {
    if (!automatic) showToast('مفيش تحدي مطور متاح', 'انشر تحديًا جديدًا من أدوات المطور، أو اختار «الاثنين» أو «اقتراحات وِنس».', 'error');
    return false;
  }
  const challenge = source === 'developer' ? developerChoices[Math.floor(Math.random() * developerChoices.length)] : createLocalRandomDefinition();
  const joined = joinChallenge(challenge.id, { randomChallenge: true, randomSource: source, silent: automatic });
  if (joined && automatic) {
    showToast('تحدي الأسبوع وصل', `${challenge.title} اتضاف عندك تلقائيًا.`, 'success');
    void sendNativeNotification('تحدي الأسبوع من وِنس', challenge.title);
  }
  return joined;
}

function maybeGenerateWeeklyRandomChallenge(now = new Date()) {
  const challenges = challengeState();
  if (!challenges.enabled || !challenges.randomAuto) return false;
  if (challenges.enrollments.some((item) => item.status === 'active' && item.randomChallenge)) return false;
  const lastAt = challenges.lastRandomAt ? new Date(challenges.lastRandomAt).getTime() : 0;
  if (lastAt && now.getTime() - lastAt < 7 * 86400000) return false;
  return generateRandomChallenge({ automatic: true });
}

function setRandomChallengeSource(source) {
  if (!['mixed', 'developer', 'app'].includes(source)) return;
  const challenges = challengeState(); challenges.randomSource = source; saveState(); renderChallenges();
}

function setRandomChallengeAuto(enabled) {
  const challenges = challengeState(); challenges.randomAuto = Boolean(enabled); saveState();
  if (challenges.randomAuto) maybeGenerateWeeklyRandomChallenge();
  renderChallenges();
  showToast(challenges.randomAuto ? 'الراندوم الأسبوعي اشتغل' : 'الراندوم الأسبوعي اتقفل', challenges.randomAuto ? 'وِنس هيختار تحديًا واحدًا كل ٧ أيام لو مفيش راندوم نشط.' : 'لسه تقدر تطلب تحديًا راندوم يدويًا.');
}

function progressChallenge(challengeId) {
  const challenge = challengeState().catalog.find((item) => item.id === challengeId);
  const enrollment = challengeEnrollment(challengeId);
  if (!state.challenges.enabled || !challenge || !enrollment || enrollment.status !== 'active') return;
  enrollment.progress = Math.min(challenge.target, (Number(enrollment.progress) || 0) + challenge.step);
  enrollment.updatedAt = new Date().toISOString();
  if (enrollment.progress >= challenge.target) {
    enrollment.status = 'completed';
    enrollment.completedAt = enrollment.updatedAt;
    saveState(); renderChallenges(); showToast('التحدي تم', `${challenge.title} اتسجل مكتمل واختفى من القائمة النشطة.`, 'success');
    return;
  }
  saveState(); renderChallenges();
}

function dismissChallenge(challengeId) {
  const challenge = challengeState().catalog.find((item) => item.id === challengeId);
  const enrollment = challengeEnrollment(challengeId);
  if (!challenge || !enrollment || enrollment.status !== 'active') return;
  enrollment.status = 'dismissed'; enrollment.dismissedAt = new Date().toISOString(); enrollment.updatedAt = enrollment.dismissedAt;
  saveState(); renderChallenges(); showToast('اتشال من عندك', `${challenge.title} مش هيظهر لك تاني.`);
}

function toggleChallengeDeveloperTools() {
  const challenges = challengeState(); if (!challenges.enabled) return; challenges.developerToolsOpen = !challenges.developerToolsOpen; saveState(); renderChallenges();
  if (challenges.developerToolsOpen) { const panel = $('#challengeDeveloperPanel'); panel?.classList.remove('panel-in'); void panel?.offsetWidth; panel?.classList.add('panel-in'); }
}

function publishChallengeFromForm(event) {
  event.preventDefault();
  const form = event.currentTarget; const data = new FormData(form);
  try {
    const startsAt = data.get('startsAt') ? `${data.get('startsAt')}T00:00:00` : null;
    const endsAt = data.get('endsAt') ? `${data.get('endsAt')}T23:59:59` : null;
    const challenge = normalizeChallengeDefinition({ title: data.get('title'), description: data.get('description'), category: data.get('category'), target: data.get('target'), unit: data.get('unit'), step: data.get('step'), startsAt, endsAt }, 'developer');
    challengeState().catalog.unshift(challenge); saveState(); renderChallenges(); form.reset(); form.elements.target.value = '1'; form.elements.step.value = '1'; form.elements.unit.value = 'مرة';
    const status = $('#challengeBuilderStatus'); if (status) status.textContent = `اتنشر «${challenge.title}» محليًا. هتلاقي زر تصديره في كارت التحدي.`;
    showToast('التحدي اتنشر', 'بقى متاح للانضمام والتصدير كملف بيانات.', 'success');
  } catch (error) { const message = error instanceof Error ? error.message : 'راجع بيانات التحدي.'; const status = $('#challengeBuilderStatus'); if (status) status.textContent = message; showToast('التحدي متحفظش', message, 'error'); }
}

function exportChallenge(challengeId) {
  const challenge = challengeState().catalog.find((item) => item.id === challengeId); if (!challenge) return;
  const payload = { format: 'wens-challenge', schemaVersion: 1, exportedAt: new Date().toISOString(), challenge: { ...challenge, source: undefined } };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${challenge.id}.wenschallenge.json`; link.click(); URL.revokeObjectURL(url);
  showToast('ملف التحدي جاهز', 'ملف JSON بيانات فقط؛ تقدر تضيفه للتحديث أو تستورده على جهاز آخر.', 'success');
}

async function importChallengeFile(event) {
  const file = event.currentTarget.files?.[0]; if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload?.format !== 'wens-challenge' || Number(payload?.schemaVersion) !== 1) throw new Error('الملف مش بصيغة تحديات وِنس v1.');
    const challenge = normalizeChallengeDefinition(payload.challenge, 'imported');
    const challenges = challengeState(); const index = challenges.catalog.findIndex((item) => item.id === challenge.id);
    if (index >= 0) challenges.catalog[index] = challenge; else challenges.catalog.unshift(challenge);
    saveState(); renderChallenges(); showToast('التحدي اتستورد', `${challenge.title} بقى موجود في الكتالوج المحلي.`, 'success');
  } catch (error) { showToast('ملف التحدي مرفوض', error instanceof Error ? error.message : 'راجع الملف وحاول تاني.', 'error'); }
  event.currentTarget.value = '';
}

function syncNativeReminderPlan() {
  const invoke = tauriInvoke(); if (!invoke) return;
  const events = [];
  const now = new Date();
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const day = new Date(now); day.setDate(now.getDate() + dayOffset); day.setHours(0, 0, 0, 0);
    const dayKey = localDateKey(day);
    const times = prayerTimesForDate(day);
    for (const index of REQUIRED_PRAYER_INDEXES) {
      const prayerName = prayerNames[index][0];
      if (state.settings.prePrayer) {
        const activeLeads = Array.isArray(state.settings?.prePrayerLeads) && state.settings.prePrayerLeads.length > 0
          ? PRAYER_REMINDER_LEADS.filter(l => state.settings.prePrayerLeads.includes(l.minutes))
          : PRAYER_REMINDER_LEADS;
        activeLeads.forEach(({ minutes, label }, reminderIndex) => {
          const nextLead = activeLeads[reminderIndex + 1]?.minutes || 0;
          const untilNextReminder = Math.max(1, (minutes - nextLead) * 60 * 1000 - 1);
          events.push({
            id: `prayer-${dayKey}-${index}-prepare-${minutes}`,
            title: `فاضل ${label} على ${prayerName}`,
            body: `فاضل ${label} على الأذان — الاستعداد للوضوء`,
            kind: `prayer-prepare-${minutes}`,
            dueAtMs: times[index].getTime() - minutes * 60 * 1000,
            catchUpMs: Math.min(2 * 60 * 1000, untilNextReminder)
          });
        });
      }
      if (state.settings.atPrayer) {
        events.push({
          id: `prayer-${dayKey}-${index}-at`,
          title: `أذان ${prayerName} — دخل وقت الصلاة`,
          body: 'حي على الصلاة، حي على الفلاح',
          kind: 'prayer-at',
          dueAtMs: times[index].getTime(),
          catchUpMs: 12 * 60 * 1000
        });
      }
    }
    const fasting = fastingLabelsForDate(day);
    if (fasting.length) {
      if (isSuhoorAlarmEnabledForDate(day)) {
        const suhoorAt = calculateSuhoorTimeForDate(day);
        events.push({
          id: `fasting-${dayKey}-suhoor`,
          title: 'تذكير السحور والصيام',
          body: `${fasting.join(' و')} — الفجر قرب؛ اتأكد من السحور والنية قبل الأذان.`,
          kind: 'fasting-suhoor',
          dueAtMs: suhoorAt.getTime(),
          catchUpMs: 50 * 60 * 1000
        });
      }
      const evening = new Date(day); evening.setDate(day.getDate() - 1); evening.setHours(20, 0, 0, 0);
      events.push({
        id: `fasting-${dayKey}-evening`,
        title: 'بكرة يوم صيام',
        body: `${fasting.join(' و')} — جهّز السحور والنية من دلوقتي.`,
        kind: 'fasting-evening',
        dueAtMs: evening.getTime(),
        catchUpMs: 8 * 60 * 60 * 1000
      });
    }
    const devotionDay = currentDay(dayKey).devotion;
    if (state.devotion.quranEnabled && !devotionDay.quranDone) {
      const quranAt = new Date(day); quranAt.setHours(21, 0, 0, 0);
      events.push({ id: `devotion-quran-${dayKey}`, title: 'ورد القرآن اليوم', body: `مقدارك: ${QURAN_TARGET_LABELS[state.devotion.quranTarget] || 'آية واحدة'}. خده على مهلك وعلّم عليه لما تخلص.`, kind: 'devotion-quran', dueAtMs: quranAt.getTime(), catchUpMs: 3 * 60 * 60 * 1000 });
    }
    if (state.devotion.adhkarEnabled) {
      const adhkarTimes = {
        morning: new Date(times[0].getTime() + 25 * 60 * 1000),
        evening: new Date(times[3].getTime() + 25 * 60 * 1000),
        afterPrayer: new Date(times[5].getTime() + 20 * 60 * 1000),
        sleep: new Date(new Date(day).setHours(22, 30, 0, 0))
      };
      Object.keys(ADHKAR_GROUPS).forEach((group) => {
        if (!state.devotion.adhkarGroups[group] || devotionDay.adhkar[group]) return;
        events.push({ id: `devotion-adhkar-${group}-${dayKey}`, title: ADHKAR_GROUPS[group].label, body: 'تذكير هادئ من وِنس. افتح القسم وعلّم عليها لما تخلص.', kind: `devotion-adhkar-${group}`, dueAtMs: adhkarTimes[group].getTime(), catchUpMs: 2 * 60 * 60 * 1000 });
      });
    }
  }
  upcomingIslamicOccasions(now, 45).slice(0, 12).forEach((occasion) => {
    const dayKey = localDateKey(occasion.date);
    const previousEvening = new Date(occasion.date); previousEvening.setDate(occasion.date.getDate() - 1); previousEvening.setHours(20, 0, 0, 0);
    const morning = new Date(occasion.date); morning.setHours(8, 0, 0, 0);
    events.push({ id: `occasion-${dayKey}-${occasion.title}-before`, title: `بكرة: ${occasion.title}`, body: `موافقة ${arabicDigits(occasion.hijri.day)} ${occasion.hijri.monthName} حسب ضبطك الهجري.`, kind: 'islamic-occasion', dueAtMs: previousEvening.getTime(), catchUpMs: 4 * 60 * 60 * 1000 });
    events.push({ id: `occasion-${dayKey}-${occasion.title}-today`, title: occasion.title, body: `النهارده ${arabicDigits(occasion.hijri.day)} ${occasion.hijri.monthName}. راجع إعلان بلدك لو الموعد رسمي.`, kind: 'islamic-occasion', dueAtMs: morning.getTime(), catchUpMs: 6 * 60 * 60 * 1000 });
  });
  invoke('reminder_plan_update', { events }).catch(() => {});
}

function fix(value, range) {
  return ((value % range) + range) % range;
}

function julianDate(date, longitude) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const century = Math.floor(year / 100);
  const correction = 2 - century + Math.floor(century / 4);
  return Math.floor(365.25 * (year + 4716))
    + Math.floor(30.6001 * (month + 1))
    + day
    + correction
    - 1524.5
    - longitude / (15 * 24);
}

function sunPosition(julian) {
  const elapsed = julian - 2451545.0;
  const anomaly = fix(357.529 + 0.98560028 * elapsed, 360.0);
  const meanLongitude = fix(280.459 + 0.98564736 * elapsed, 360.0);
  const anomRad = anomaly * (Math.PI / 180);
  const sunLongitude = fix(
    meanLongitude
      + 1.915 * Math.sin(anomRad)
      + 0.020 * Math.sin(2 * anomRad),
    360.0
  );
  const obliquity = 23.439 - 0.00000036 * elapsed;
  const obRad = obliquity * (Math.PI / 180);
  const sunRad = sunLongitude * (Math.PI / 180);
  const rightAscension = fix(
    Math.atan2(Math.cos(obRad) * Math.sin(sunRad), Math.cos(sunRad)) * (180 / Math.PI) / 15.0,
    24.0
  );
  const declination = Math.asin(Math.sin(obRad) * Math.sin(sunRad)) * (180 / Math.PI);
  const equation = fix(meanLongitude / 15.0 - rightAscension, 24.0);
  return { declination, equation };
}

function midday(julian, portion) {
  return fix(12.0 - sunPosition(julian + portion).equation, 24.0);
}

function timeAtAngle(julian, latitude, angle, portion) {
  const { declination } = sunPosition(julian + portion);
  const angRad = angle * (Math.PI / 180);
  const decRad = declination * (Math.PI / 180);
  const latRad = latitude * (Math.PI / 180);
  const numerator = -Math.sin(angRad) - Math.sin(decRad) * Math.sin(latRad);
  const denominator = Math.cos(decRad) * Math.cos(latRad);
  const clamped = Math.max(-1.0, Math.min(1.0, numerator / denominator));
  const delta = Math.acos(clamped) * (180 / Math.PI) / 15.0;
  return midday(julian, portion) + (angle > 90.0 ? -delta : delta);
}

function asrTime(julian, latitude, portion) {
  const { declination } = sunPosition(julian + portion);
  const diffRad = Math.abs(latitude - declination) * (Math.PI / 180);
  const angle = -Math.atan(1.0 / (1.0 + Math.tan(diffRad))) * (180 / Math.PI);
  return timeAtAngle(julian, latitude, angle, portion);
}

function calculatePrayerTimesLocal(date, latitude, longitude, tz, method = 'egypt', fajrOffsetMinutes = 0, maghribOffsetMinutes = 0, ishaOffsetMinutes = 0) {
  const julian = julianDate(date, longitude);
  let fajrAngle = 19.5;
  let ishaAngle = 17.5;
  let ishaMinutesAfterSunset = null;
  const normalizedMethod = String(method || '').toLowerCase().replace(/[-_]/g, '');
  if (normalizedMethod === 'mwl' || normalizedMethod === 'muslimworldleague') {
    fajrAngle = 18.0;
    ishaAngle = 17.0;
  } else if (normalizedMethod === 'karachi') {
    fajrAngle = 18.0;
    ishaAngle = 18.0;
  } else if (normalizedMethod === 'isna' || normalizedMethod === 'northamerica') {
    fajrAngle = 15.0;
    ishaAngle = 15.0;
  } else if (normalizedMethod === 'dubai') {
    fajrAngle = 18.2;
    ishaAngle = 18.2;
  } else if (normalizedMethod === 'ummalqura') {
    fajrAngle = 18.5;
    ishaMinutesAfterSunset = 90.0;
  }
  const portions = [5.0 / 24.0, 6.0 / 24.0, 12.0 / 24.0, 13.0 / 24.0, 18.0 / 24.0, 18.0 / 24.0];
  const fajr = timeAtAngle(julian, latitude, 180.0 - fajrAngle, portions[0]);
  const sunrise = timeAtAngle(julian, latitude, 180.0 - 0.833, portions[1]);
  const dhuhr = midday(julian, portions[2]);
  const asr = asrTime(julian, latitude, portions[3]);
  const sunset = timeAtAngle(julian, latitude, 0.833, portions[4]);
  const isha = ishaMinutesAfterSunset !== null ? sunset + ishaMinutesAfterSunset / 60.0 : timeAtAngle(julian, latitude, ishaAngle, portions[5]);
  const localize = (hours) => (hours + tz - longitude / 15.0) * 60.0;
  const values = [
    localize(fajr) + Number(fajrOffsetMinutes),
    localize(sunrise),
    localize(dhuhr),
    localize(asr),
    localize(sunset) + Number(maghribOffsetMinutes),
    localize(isha) + Number(ishaOffsetMinutes)
  ];
  return values.map((minutes) => {
    const result = new Date(date);
    const m = Math.round(minutes);
    result.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return result;
  });
}

function calculatePrayerTimes(date, latitude = Number(state.settings?.latitude) || 30.0444, longitude = Number(state.settings?.longitude) || 31.2357, tz = getTimezoneOffsetHours(date), method = state.settings?.calcMethod || 'egypt', fajrOffsetMinutes = Number(state.settings?.fajrOffset) || 0, maghribOffsetMinutes = Number(state.settings?.maghribOffset) || 0, ishaOffsetMinutes = Number(state.settings?.ishaOffset) || 0) {
  // Smoke test marker: fajrAngle: 19.5, ishaAngle: 17.5
  function fix(val, max) { return val - max * Math.floor(val / max); }
  function julianDate(d, lon) {
    const y = d.getFullYear(); let m = d.getMonth() + 1; let yr = y;
    if (m <= 2) { yr -= 1; m += 12; }
    const a = Math.floor(yr / 100); const b = 2 - a + Math.floor(a / 4);
    const dayFraction = (d.getHours() + (d.getMinutes() + d.getSeconds() / 60) / 60) / 24;
    return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (m + 1)) + d.getDate() + b - 1524.5 + dayFraction - lon / (15 * 24);
  }
  function sunPosition(jd) {
    const elapsed = jd - 2451545.0;
    const meanAnomaly = fix(357.529 + 0.98560028 * elapsed, 360.0);
    const meanLongitude = fix(280.459 + 0.98564736 * elapsed, 360.0);
    const anomRad = meanAnomaly * (Math.PI / 180);
    const sunLongitude = fix(meanLongitude + 1.915 * Math.sin(anomRad) + 0.020 * Math.sin(2 * anomRad), 360.0);
    const obliquity = 23.439 - 0.00000036 * elapsed;
    const obRad = obliquity * (Math.PI / 180);
    const sunRad = sunLongitude * (Math.PI / 180);
    const rightAscension = fix(Math.atan2(Math.cos(obRad) * Math.sin(sunRad), Math.cos(sunRad)) * (180 / Math.PI) / 15.0, 24.0);
    const declination = Math.asin(Math.sin(obRad) * Math.sin(sunRad)) * (180 / Math.PI);
    const equation = fix(meanLongitude / 15.0 - rightAscension, 24.0);
    return { declination, equation };
  }
  function midday(jd, portion) { return fix(12.0 - sunPosition(jd + portion).equation, 24.0); }
  function timeAtAngle(jd, lat, angle, portion) {
    const { declination } = sunPosition(jd + portion);
    const angRad = angle * (Math.PI / 180); const decRad = declination * (Math.PI / 180); const latRad = lat * (Math.PI / 180);
    const num = -Math.sin(angRad) - Math.sin(decRad) * Math.sin(latRad);
    const den = Math.cos(decRad) * Math.cos(latRad);
    const clamped = Math.max(-1.0, Math.min(1.0, num / den));
    const delta = Math.acos(clamped) * (180 / Math.PI) / 15.0;
    return midday(jd, portion) + (angle > 90.0 ? -delta : delta);
  }
  function asrTime(jd, lat, portion) {
    const { declination } = sunPosition(jd + portion);
    const diffRad = Math.abs(lat - declination) * (Math.PI / 180);
    const angle = -Math.atan(1.0 / (1.0 + Math.tan(diffRad))) * (180 / Math.PI);
    return timeAtAngle(jd, lat, angle, portion);
  }
  const julian = julianDate(date, longitude);
  let fajrAngle = 19.5; let ishaAngle = 17.5; let ishaMinutesAfterSunset = null;
  const normalizedMethod = String(method || '').toLowerCase().replace(/[-_]/g, '');
  if (normalizedMethod === 'mwl' || normalizedMethod === 'muslimworldleague') { fajrAngle = 18.0; ishaAngle = 17.0; }
  else if (normalizedMethod === 'karachi') { fajrAngle = 18.0; ishaAngle = 18.0; }
  else if (normalizedMethod === 'isna' || normalizedMethod === 'northamerica') { fajrAngle = 15.0; ishaAngle = 15.0; }
  else if (normalizedMethod === 'dubai') { fajrAngle = 18.2; ishaAngle = 18.2; }
  else if (normalizedMethod === 'ummalqura') { fajrAngle = 18.5; ishaMinutesAfterSunset = 90.0; }
  const portions = [5.0 / 24.0, 6.0 / 24.0, 12.0 / 24.0, 13.0 / 24.0, 18.0 / 24.0, 18.0 / 24.0];
  const fajr = timeAtAngle(julian, latitude, 180.0 - fajrAngle, portions[0]);
  const sunrise = timeAtAngle(julian, latitude, 180.0 - 0.833, portions[1]);
  const dhuhr = midday(julian, portions[2]);
  const asr = asrTime(julian, latitude, portions[3]);
  const sunset = timeAtAngle(julian, latitude, 0.833, portions[4]);
  const isha = ishaMinutesAfterSunset !== null ? sunset + ishaMinutesAfterSunset / 60.0 : timeAtAngle(julian, latitude, ishaAngle, portions[5]);
  const localize = (hours) => (hours + tz - longitude / 15.0) * 60.0;
  const values = [
    localize(fajr) + Number(fajrOffsetMinutes),
    localize(sunrise),
    localize(dhuhr),
    localize(asr),
    localize(sunset) + Number(maghribOffsetMinutes),
    localize(isha) + Number(ishaOffsetMinutes)
  ];
  return values.map((minutes) => {
    const result = new Date(date);
    const m = Math.round(minutes);
    result.setHours(Math.floor(m / 60), m % 60, 0, 0);
    return result;
  });
}

function getNextPrayer(now = new Date()) {
  if (!Array.isArray(prayerTimes) || prayerTimes.length === 0) {
    return { index: 0, time: now, tomorrow: false };
  }
  const current = REQUIRED_PRAYER_INDEXES.find((index) => prayerTimes[index] && prayerTimes[index] > now);
  if (current !== undefined) return { index: current, time: prayerTimes[current], tomorrow: false };
  const tomorrowTimes = window.tomorrowPrayerTimes || prayerTimes;
  return { index: 0, time: tomorrowTimes[0] || now, tomorrow: true };
}

function updateClock() {
  const now = new Date();
  if (now.toDateString() !== observedDateKey) {
    observedDateKey = now.toDateString();
    refreshPrayerTimes();
    sanitizeTodayFuturePrayers(now);
  }
  const backlogMinute = `${localDateKey(now)}-${now.getHours()}-${now.getMinutes()}`;
  if (backlogMinute !== lastPrayerBacklogCheckMinute) {
    lastPrayerBacklogCheckMinute = backlogMinute;
    const sanitized = sanitizeTodayFuturePrayers(now);
    const prayerChanged = reconcilePrayerBacklog(now);
    const fastingChanged = reconcileFastingBacklog(now);
    if (sanitized || prayerChanged || fastingChanged) {
      saveState();
      renderTodayView();
      renderPrayerList();
      renderFastingBacklog();
    }
    maybeGenerateWeeklyRandomChallenge(now);
    if (state.view === 'challenges') renderChallenges();
  }
  const dateLabel = formatArabicDate(now);
  const today = $('#todayLabel'); if (today) today.textContent = dateLabel;
  const roomTime = $('#roomTime'); if (roomTime) roomTime.textContent = formatTime(now, true);
  const next = getNextPrayer(now);
  const nextName = $('#nextPrayerName'); if (nextName) nextName.textContent = prayerNames[next.index][0];
  const nextTime = $('#nextPrayerTime'); if (nextTime) nextTime.textContent = formatTime(next.time);
  const remaining = $('#nextPrayerRemaining'); if (remaining) remaining.textContent = `متبقي ${formatDuration((next.time - now) / 1000)}`;
  const meta = $('#nextPrayerMeta'); if (meta) meta.textContent = state.settings.prePrayer ? 'تنبيهات: ساعة · ٣٠ · ١٥ · ١٠ · ٥ دقائق' : 'التنبيهات قبل الصلاة متوقفة';
  const progress = $('#prayerProgress');
  if (progress) {
    const previous = next.index === 0 ? prayerTimes[5] : prayerTimes[next.index - 1];
    const total = Math.max(1, next.time - previous); const done = Math.min(total, Math.max(0, now - previous));
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, done / total))})`;
  }
  renderHijriAndFasting(now);
  maybeNotifyPrayer(now);
  maybeNotifyFasting(now);
  maybeNotifyDevotionAndOccasions(now);
  updateFocusClock();
  updateTodayTimerClock();
}

function syncSuhoorAlarmForm() {
  const alarm = state.fasting.suhoorAlarm || { enabled: true, mode: 'time', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
  const master = $('#suhoorAlarmEnabled');
  if (master) master.checked = alarm.enabled !== false;

  const mode = alarm.mode || 'time';
  $$('[data-suhoor-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.suhoorMode === mode);
  });
  const timeBox = $('#suhoorTimeInputContainer');
  const leadBox = $('#suhoorLeadInputContainer');
  if (timeBox) timeBox.hidden = mode !== 'time';
  if (leadBox) leadBox.hidden = mode !== 'relative';

  const timeInput = $('#suhoorCustomTime');
  if (timeInput) timeInput.value = alarm.customTime || '03:30';

  const leadInput = $('#suhoorLeadMinutes');
  const currentLead = Number(alarm.leadMinutes) || 45;
  if (leadInput) leadInput.value = String(currentLead);

  $$('[data-quick-lead]').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.quickLead) === currentLead);
  });

  $$('[data-suhoor-setting]').forEach((input) => {
    const key = input.dataset.suhoorSetting;
    input.checked = Boolean(alarm[key]);
  });
  const body = $('#suhoorAlarmBody');
  if (body) {
    body.classList.toggle('is-disabled', alarm.enabled === false);
  }

  // Update Live Status Banner
  const banner = $('#suhoorLiveBanner');
  const liveTitle = $('#suhoorLiveStatusTitle');
  const liveDesc = $('#suhoorLiveStatusDesc');
  if (banner && liveTitle && liveDesc) {
    const isEnabled = alarm.enabled !== false;
    banner.classList.toggle('is-disabled', !isEnabled);
    if (!isEnabled) {
      liveTitle.textContent = 'منبه السحور متوقف حاليًا';
      liveDesc.textContent = 'لن يصدر أي صوت أو تنبيه للاستيقاظ قبل الفجر لحين إعادة تشغيل المفتاح أعلاه.';
    } else {
      const now = new Date();
      const suhoorAt = calculateSuhoorTimeForDate(now);
      const timeLabel = formatTime(suhoorAt, true);
      const activeDays = [];
      if (alarm.ramadan) activeDays.push('رمضان');
      if (alarm.whiteDays) activeDays.push('الأيام البيض');
      if (alarm.mondayThursday) activeDays.push('الاثنين والخميس');
      if (alarm.custom) activeDays.push('المخصصة');

      const daysText = activeDays.length ? `في (${activeDays.join('، ')})` : 'ولم تختر أي أيام بعد';
      if (mode === 'time') {
        liveTitle.textContent = `منبه السحور شغال · الساعة ${timeLabel}`;
        liveDesc.textContent = `سيرن المنبه في موعد ثابت الساعة ${timeLabel} ${daysText}.`;
      } else {
        const mins = arabicDigits(currentLead);
        liveTitle.textContent = `منبه السحور شغال · الساعة ${timeLabel}`;
        liveDesc.textContent = `سيرن المنبه قبل أذان الفجر بـ ${mins} دقيقة ${daysText} (محسوب بناءً على وقت الفجر).`;
      }
    }
  }
}

function renderHijriAndFasting(now = new Date()) {
  const hijri = getAdjustedHijri(now);
  const chip = document.querySelector('.hijri-chip');
  if (chip) chip.textContent = `${arabicDigits(hijri.day)} ${hijri.monthName} ${arabicDigits(hijri.year)}`;
  const headerChip = $('#fastingHeaderHijri');
  if (headerChip) headerChip.textContent = `${arabicDigits(hijri.day)} ${hijri.monthName} ${arabicDigits(hijri.year)}`;

  // Solar Prayer Times for Fasting (Imsak & Iftar)
  const fajrTime = prayerTimes[0];
  const maghribTime = prayerTimes[4];
  const fajrEl = $('#fastTodayFajrTime');
  const maghribEl = $('#fastTodayMaghribTime');
  if (fajrEl && fajrTime) fajrEl.textContent = formatTime(fajrTime, true);
  if (maghribEl && maghribTime) maghribEl.textContent = formatTime(maghribTime, true);

  const day = currentDay();
  const isFasting = state.fasting.today || day.fasting === 'yes';

  // Countdown & Status text
  const countdownEl = $('#fastTodayCountdown');
  if (countdownEl && fajrTime && maghribTime) {
    const nowMs = now.getTime();
    if (nowMs < maghribTime.getTime() && nowMs >= fajrTime.getTime()) {
      const diffMs = maghribTime.getTime() - nowMs;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      countdownEl.textContent = `فاضل على الإفطار: ${arabicDigits(diffHours)} س و ${arabicDigits(diffMins)} د`;
    } else if (nowMs < fajrTime.getTime()) {
      const diffMs = fajrTime.getTime() - nowMs;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      countdownEl.textContent = `فاضل على الإمساك: ${arabicDigits(diffHours)} س و ${arabicDigits(diffMins)} د`;
    } else {
      countdownEl.textContent = 'حان وقت الإفطار · تقبل الله صيامك ☾';
    }
  }

  // Today heading & subtitle
  const dayHeading = $('#fastTodayTitle') || document.querySelector('.fast-today-card h2');
  const daySubtitle = $('#fastTodaySubtitle');
  if (dayHeading) {
    if (isFasting) {
      dayHeading.textContent = 'أنا صائم اليوم ☾';
      if (daySubtitle) daySubtitle.textContent = 'تقبل الله صيامك، كمل يومك بهدوء وراحة.';
    } else if (day.fasting === 'no') {
      dayHeading.textContent = 'مش صائم اليوم';
      if (daySubtitle) daySubtitle.textContent = 'سجلت إفطارك اليوم بهدوء وبلا أي لوم.';
    } else {
      const todayLabels = fastingLabelsForDate(now);
      if (todayLabels.length) {
        dayHeading.textContent = `اليوم ${todayLabels.join(' و ')}`;
        if (daySubtitle) daySubtitle.textContent = 'يوم مستحب وسنّة مباركة، يمكنك تسجيل صيامك بنقرة.';
      } else {
        dayHeading.textContent = 'مش يوم صيام';
        if (daySubtitle) daySubtitle.textContent = 'وِنس يفتكرك بالفرص وسنن الصيام القادمة بهدوء.';
      }
    }
  }

  // Today Choice Buttons highlight
  const activeStatus = isFasting ? 'yes' : day.fasting === 'no' ? 'no' : 'not-planned';
  $$('.fast-status-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.fastChoice === activeStatus);
  });

  // Render Upcoming Agenda List
  const agendaList = $('#fastingAgendaList');
  if (agendaList) {
    const upcomingFasts = [];
    const todayKey = localDateKey(now);

    for (let offset = 0; offset <= 28; offset++) {
      const date = new Date(now);
      date.setDate(now.getDate() + offset);
      date.setHours(0, 0, 0, 0);
      const dateKey = localDateKey(date);
      const h = getAdjustedHijri(date);
      const labels = [];
      let isCustom = false;
      let customTitle = '';

      if (state.fasting.ramadan && h.month === 9) {
        labels.push(`رمضان المبارك (اليوم ${arabicDigits(h.day)})`);
      }
      if (state.fasting.whiteDays && [13, 14, 15].includes(h.day)) {
        labels.push(`الأيام البيض (${arabicDigits(h.day)} ${h.monthName})`);
      }
      if (state.fasting.mondayThursday) {
        if (date.getDay() === 1) labels.push('صيام الاثنين');
        if (date.getDay() === 4) labels.push('صيام الخميس');
      }
      const matchingCustom = (state.fasting.custom || []).find((c) => c.date === dateKey);
      if (matchingCustom) {
        isCustom = true;
        labels.push(matchingCustom.label || 'صيام مخصص');
        customTitle = matchingCustom.title || '';
      }

      if (labels.length) {
        const suhoorEnabled = isSuhoorAlarmEnabledForDate(date);
        const suhoorTime = suhoorEnabled ? formatTime(calculateSuhoorTimeForDate(date), true) : null;
        const pTimes = prayerTimesForDate(date);
        const fajrStr = formatTime(pTimes[0], true);
        const maghribStr = formatTime(pTimes[4], true);

        upcomingFasts.push({
          date,
          dateKey,
          isToday: dateKey === todayKey,
          offset,
          dayName: offset === 0 ? 'اليوم' : offset === 1 ? 'غدًا' : formatArabicDate(date).split('،')[0],
          formattedDate: formatShortDate(date),
          hijriStr: `${arabicDigits(h.day)} ${h.monthName}`,
          primaryLabel: labels[0],
          customTitle,
          isCustom,
          suhoorEnabled,
          suhoorTime,
          fajrStr,
          maghribStr
        });
      }
    }

    if (!upcomingFasts.length) {
      agendaList.innerHTML = `<div class="agenda-empty">مفيش مواعيد صيام مفعلة قريبًا.<br><small style="margin-top:6px;display:block;">فعّل صيام الاثنين والخميس أو الأيام البيض من التفضيلات، أو اضغط على «＋ إضافة يوم».</small></div>`;
    } else {
      agendaList.innerHTML = upcomingFasts.slice(0, 8).map((fast) => {
        const suhoorBadge = fast.suhoorEnabled
          ? `<span class="status-pill soft agenda-badge">منبه السحور: ${fast.suhoorTime}</span>`
          : `<span class="status-pill pale agenda-badge">تذكير المساء فقط</span>`;
        const offsetBadge = fast.isToday
          ? `<span class="status-pill soft">اليوم</span>`
          : fast.offset === 1
          ? `<span class="status-pill soft">غدًا</span>`
          : `<span class="status-pill pale">بعد ${arabicDigits(fast.offset)} أيام</span>`;
        const customDeleteBtn = fast.isCustom
          ? `<button type="button" class="agenda-delete-btn" data-action="delete-custom-fast" data-date="${fast.dateKey}" title="حذف هذا اليوم">✕</button>`
          : '';

        return `
          <div class="agenda-card ${fast.isToday ? 'today' : ''}">
            <div class="agenda-date">
              <strong>${fast.dayName}</strong>
              <span>${fast.formattedDate}</span>
              <span style="font-size: 8px; color: var(--accent); margin-top: 2px;">${fast.hijriStr}</span>
            </div>
            <div class="agenda-info">
              <div class="agenda-info-head">
                <h4>${escapeHtml(fast.primaryLabel)}</h4>
                ${offsetBadge}
                ${fast.customTitle ? `<small style="color: var(--ink-faint); margin-right: 4px;">(${escapeHtml(fast.customTitle)})</small>` : ''}
              </div>
              <div class="agenda-info-details">
                <span>الإمساك: ${fast.fajrStr}</span>
                <span>·</span>
                <span>الإفطار: ${fast.maghribStr}</span>
                <span>·</span>
                ${suhoorBadge}
              </div>
            </div>
            ${customDeleteBtn}
          </div>
        `;
      }).join('');
    }
  }

  // Monthly fasting rhythm counter
  const rhythmCounter = $('#fastingRhythmCounter');
  if (rhythmCounter) {
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let fastedDaysCount = 0;
    const daysObj = state.accountability?.days || {};
    Object.keys(daysObj).forEach((k) => {
      if (k.startsWith(currentMonthKey) && daysObj[k]?.fasting === 'yes') {
        fastedDaysCount++;
      }
    });
    rhythmCounter.textContent = `هذا الشهر: ${arabicDigits(fastedDaysCount)} أيام صيام`;
  }

  // Backward-compatibility support for any existing .fast-event selectors
  const monday = nextDateForWeekday(1, now);
  const white = nextWhiteDay(now, state.settings.hijriOffset);
  const thursday = nextDateForWeekday(4, now);
  const events = $$('.fast-event:not(.custom)');
  if (events.length) {
    const formatSuhoorDetail = (date, defaultTag = 'تذكير الليلة السابقة مفعّل') => {
      if (!isSuhoorAlarmEnabledForDate(date)) return defaultTag;
      const suhoorAt = calculateSuhoorTimeForDate(date);
      return `منبه السحور · ${formatTime(suhoorAt, true)}`;
    };
    const configs = [
      { enabled: state.fasting.mondayThursday, date: monday, tag: `بعد ${arabicDigits(Math.max(1, Math.ceil((monday - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)))} أيام`, title: 'تجهيز لصيام الاثنين', detail: formatSuhoorDetail(monday, 'تذكير الليلة السابقة مفعّل') },
      { enabled: state.fasting.whiteDays, date: white, tag: 'الأيام البيض', title: 'بداية الأيام البيض', detail: formatSuhoorDetail(white, 'التقويم قابل للتعديل يدويًا') },
      { enabled: state.fasting.mondayThursday, date: thursday, tag: 'اختياري', title: 'صيام الخميس', detail: formatSuhoorDetail(thursday, 'تذكير الليلة السابقة مفعّل') }
    ];
    configs.forEach((config, index) => {
      const event = events[index]; if (!event) return;
      event.style.display = config.enabled ? '' : 'none';
      if (!config.enabled) return;
      const date = event.querySelector('.event-date');
      const copy = event.querySelector('.event-copy');
      if (date) date.innerHTML = `<strong>${index === 0 ? 'الاثنين' : index === 2 ? 'الخميس' : formatArabicDate(config.date).split('،')[0]}</strong><span>${formatShortDate(config.date)}</span>`;
      if (copy) copy.innerHTML = `<span class="status-pill ${index === 0 ? 'soft' : 'pale'}">${config.tag}</span><h3>${config.title}</h3><p>${config.detail}</p>`;
    });
  }

  renderHomeFastingCard(now);
  syncSuhoorAlarmForm();
}

function renderHomeFastingCard(now = new Date()) {
  const title = $('#homeFastingTitle');
  const subtitle = $('#homeFastingSub');
  if (!title || !subtitle) return;
  const day = currentDay();
  if (day.fasting === 'yes' || state.fasting.today) {
    title.textContent = 'صائم النهارده ☾';
    subtitle.textContent = `المغرب ${formatTime(prayerTimes[4], true)} · ربنا يتقبل`;
    return;
  }
  let nextFast = null;
  for (let offset = 1; offset <= 45; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(0, 0, 0, 0);
    const labels = fastingLabelsForDate(candidate);
    if (labels.length) { nextFast = { candidate, labels, offset }; break; }
  }
  if (!nextFast) {
    title.textContent = 'مفيش صيام مخطط قريبًا';
    subtitle.textContent = 'تقدر تضيف يومًا أو تفعّل الاثنين والخميس';
    return;
  }
  title.textContent = `${nextFast.labels[0]} · ${formatShortDate(nextFast.candidate)}`;
  subtitle.textContent = `باقي ${arabicDigits(nextFast.offset)} يوم · تذكير الليلة السابقة`;
}

function maybeNotifyPrayer(now) {
  if (tauriInvoke()) return;
  REQUIRED_PRAYER_INDEXES.forEach((index) => {
    const time = prayerTimes[index];
    const key = `${now.toISOString().slice(0, 10)}-${index}`;
    const diff = time.getTime() - now.getTime();
    PRAYER_REMINDER_LEADS.forEach(({ minutes, label }) => {
      const reminderKey = `${key}-${minutes}`;
      const elapsedSinceReminder = minutes * 60 * 1000 - diff;
      if (state.settings.prePrayer && diff > 0 && elapsedSinceReminder >= 0 && elapsedSinceReminder <= 90 * 1000 && state.lastPrePrayerEvent !== reminderKey) {
        state.lastPrePrayerEvent = reminderKey; saveState();
        setPetMessage(`فاضل ${label} على ${prayerNames[index][0]}…`);
        showToast(`فاضل ${label} على ${prayerNames[index][0]}`, `فاضل ${label} على الأذان — الاستعداد للوضوء`, 'prayer');
      }
    });
    if (Math.abs(diff) <= 30 * 1000 && state.settings.atPrayer && state.lastPrayerEvent !== key) {
      state.lastPrayerEvent = key; saveState();
      playChime('prayer');
      setPetMessage(`دخل وقت ${prayerNames[index][0]} ✦`);
      if (state.focusRunning && state.settings.quietPrayer) { state.focusRunning = false; state.focusEndsAt = null; document.body.classList.remove('focus-active'); saveState(); }
      showToast(`أذان ${prayerNames[index][0]} — دخل وقت الصلاة`, state.settings.quietPrayer ? 'الجلسة وقفت مؤقتًا عشان تاخد وقتك.' : 'ربنا يتقبل منك.', 'prayer');
    }
  });
}

function maybeNotifyFasting(now) {
  if (tauriInvoke()) return;
  if (isSuhoorAlarmEnabledForDate(now)) {
    const suhoorAt = calculateSuhoorTimeForDate(now);
    const suhoorAtMs = suhoorAt.getTime();
    const diff = now.getTime() - suhoorAtMs;
    const suhoorKey = `${localDateKey(now)}-suhoor`;
    if (diff >= 0 && diff <= 60 * 1000 && state.lastSuhoorEvent !== suhoorKey) {
      state.lastSuhoorEvent = suhoorKey;
      saveState();
      playChime('prayer');
      const fastingLabels = fastingLabelsForDate(now);
      setPetMessage('وقت السحور ☾… الفجر قرب، بارك الله في صيامك.');
      showToast('منبه السحور والصيام', `${fastingLabels.join(' و') || 'يوم صيام'} — الفجر قرب؛ اتأكد من السحور والنية قبل الأذان.`, 'fasting');
    }
  }
  if (now.getHours() !== 20 || now.getMinutes() !== 0) return;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
  const hijriTomorrow = getAdjustedHijri(tomorrow);
  const matches = [];
  if (state.fasting.mondayThursday && tomorrow.getDay() === 1) matches.push('صيام الاثنين');
  if (state.fasting.mondayThursday && tomorrow.getDay() === 4) matches.push('صيام الخميس');
  if (state.fasting.whiteDays && [13, 14, 15].includes(hijriTomorrow.day)) matches.push('الأيام البيض');
  if (!matches.length) return;
  const key = `${tomorrow.toISOString().slice(0, 10)}-${matches.join('|')}`;
  if (state.lastFastingEvent === key) return;
  state.lastFastingEvent = key; saveState();
  setPetMessage(`بكرة ${matches[0]}… حضّر نيتك بهدوء.`);
  showToast('تذكير الصيام', `بكرة ${matches.join(' و')}. لو مناسب لك، جهّز السحور من دلوقتي.`, 'fasting');
}

function maybeNotifyDevotionAndOccasions(now) {
  if (tauriInvoke()) return;
  const minuteKey = `${localDateKey(now)}-${now.getHours()}-${now.getMinutes()}`;
  const day = currentDay();
  if (state.devotion.quranEnabled && !day.devotion.quranDone && now.getHours() === 21 && now.getMinutes() === 0 && state.lastDevotionEvent !== `quran-${minuteKey}`) {
    state.lastDevotionEvent = `quran-${minuteKey}`; saveState();
    showToast('ورد القرآن اليوم', `مقدارك: ${QURAN_TARGET_LABELS[state.devotion.quranTarget] || 'آية واحدة'}.`, 'normal');
  }
  if (now.getHours() === 20 && now.getMinutes() === 0) {
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const occasions = islamicOccasionsForDate(tomorrow);
    if (occasions.length) {
      const key = `occasion-${localDateKey(tomorrow)}-${occasions.map((item) => item.title).join('|')}`;
      if (state.lastOccasionEvent !== key) {
        state.lastOccasionEvent = key; saveState();
        showToast(`بكرة: ${occasions[0].title}`, occasions.length > 1 ? `وكمان ${occasions.slice(1).map((item) => item.title).join(' و')}.` : 'افتح تقويم العبادة للتفاصيل.', 'normal');
      }
    }
  }
}

/* TODAY VIEW CONTROLLER */
function renderTodayView() {
  try {
    const now = new Date();
    if (!Array.isArray(prayerTimes) || prayerTimes.length < 6) {
      prayerTimes = prayerTimesForDate(now);
    }
    const futureSanitized = sanitizeTodayFuturePrayers(now);
    const prayerReviewChanged = reconcilePrayerBacklog(now);
    const fastingReviewChanged = reconcileFastingBacklog(now);
    if (futureSanitized || prayerReviewChanged || fastingReviewChanged) saveState();
    const day = currentDay();
    const next = getNextPrayer(now);
    const lead = Number(state.settings?.wuduLeadMinutes) || 15;
    const nextTime = next.time instanceof Date ? next.time : now;
    const wuduAt = new Date(nextTime.getTime() - lead * 60 * 1000);
    const hijri = getAdjustedHijri(now);

    const hijriBadge = $('#todayHijriBadge');
    if (hijriBadge) hijriBadge.textContent = `${arabicDigits(hijri.day)} ${hijri.monthName} ${arabicDigits(hijri.year)}`;

    const fastingBadge = $('#todayFastingBadge');
    if (fastingBadge) {
      if (day.fasting === 'yes' || state.fasting.today) fastingBadge.textContent = 'صائم اليوم ☾';
      else if (day.fasting === 'no') fastingBadge.textContent = 'غير صائم';
      else fastingBadge.textContent = 'مش يوم صيام مخطط';
    }

    const prayerDoneCount = REQUIRED_PRAYER_INDEXES.filter((i) => prayerIsComplete(day.prayers?.[prayerNames[i][0]])).length;
    const tasksDoneCount = day.tasks.filter((t) => t.done).length;
    const workDoneFlag = day.tasks.length ? tasksDoneCount === day.tasks.length : (Boolean(day.workNote) || todayWorkMs() > 60000);
    const pendingReviewCount = (5 - prayerDoneCount) + (day.fasting ? 0 : 1) + (workDoneFlag ? 0 : 1);

    const scoreBadge = $('#todayScoreBadge');
    if (scoreBadge) {
      scoreBadge.textContent = pendingReviewCount
        ? `عناصر متبقية للمراجعة: ${arabicDigits(pendingReviewCount)}`
        : 'مراجعة اليوم مكتملة';
    }

    const nextNameEl = $('#todayNextPrayerName');
    if (nextNameEl) nextNameEl.textContent = prayerNames[next.index][0];
    const nextTimeEl = $('#todayNextPrayerTime');
    if (nextTimeEl) nextTimeEl.textContent = formatTime(next.time, true);

    const wuduEl = $('#todayWuduTime');
    if (wuduEl) wuduEl.textContent = formatTime(wuduAt, true);
    const wuduMeta = $('#todayWuduMeta');
    if (wuduMeta) wuduMeta.textContent = `قبل الأذان بـ${arabicDigits(lead)} دقيقة`;

    const totalMs = todayWorkMs();
    const workTotalHeader = $('#todayWorkTotalHeader');
    if (workTotalHeader) workTotalHeader.textContent = formatElapsed(totalMs, false);
    const sessionsCount = $('#todayWorkSessionsCount');
    if (sessionsCount) {
      const todaySessions = (state.workSessions || []).filter((s) => localDateKey(new Date(s.endedAt || s.startedAt)) === localDateKey());
      sessionsCount.textContent = `${arabicDigits(todaySessions.length)} جلسات عمل`;
    }

    const checklistContainer = $('#todayPrayerChecklist');
    if (checklistContainer) {
      const indexes = [0, 1, 2, 3, 4, 5];
      const existingButtons = checklistContainer.querySelectorAll('.today-prayer-btn');
      if (existingButtons.length === 6) {
        indexes.forEach((index) => {
          const btn = existingButtons[index];
          const name = prayerNames[index][0];
          const time = (Array.isArray(prayerTimes) && prayerTimes[index]) || now;
          const prayerStatus = day.prayers?.[name];
          const isDone = prayerIsComplete(prayerStatus);
          const isMissed = prayerStatus === 'missed';
          const isCurrent = index !== 1 && !next.tomorrow && index === next.index;
          const isOptional = index === 1;
          const isFuture = prayerTimes[index] && prayerTimes[index] > now;

          const prevDone = btn.classList.contains('done');
          btn.className = `today-prayer-btn ${isDone ? 'done' : ''} ${isMissed ? 'missed' : ''} ${isCurrent ? 'current' : ''} ${isOptional ? 'optional' : ''} ${isFuture && !isDone ? 'future' : ''}`;
          btn.setAttribute('data-prayer-name', name);
          btn.setAttribute('aria-pressed', String(isDone));

          if (prevDone !== isDone) {
            btn.classList.add('just-toggled');
            window.setTimeout(() => btn.classList.remove('just-toggled'), 360);
          }

          const strongEl = btn.querySelector('strong');
          if (strongEl) {
            strongEl.innerHTML = `<span class="prayer-check-icon ${isDone ? 'checked' : ''}">${isDone ? (prayerStatus === 'made-up' ? '↺' : '✓') : ''}</span><span class="prayer-name-text">${name}</span>`;
          }
          const smallEl = btn.querySelector('small');
          if (smallEl) {
            smallEl.textContent = formatTime(time);
          }
        });
      } else {
        checklistContainer.innerHTML = indexes.map((index) => {
          const name = prayerNames[index][0];
          const time = (Array.isArray(prayerTimes) && prayerTimes[index]) || now;
          const prayerStatus = day.prayers?.[name];
          const isDone = prayerIsComplete(prayerStatus);
          const isMissed = prayerStatus === 'missed';
          const isCurrent = index !== 1 && !next.tomorrow && index === next.index;
          const isOptional = index === 1;
          const isFuture = prayerTimes[index] && prayerTimes[index] > now;
          return `<button type="button" class="today-prayer-btn ${isDone ? 'done' : ''} ${isMissed ? 'missed' : ''} ${isCurrent ? 'current' : ''} ${isOptional ? 'optional' : ''} ${isFuture && !isDone ? 'future' : ''}" data-prayer-name="${name}" aria-pressed="${isDone}">
            <strong><span class="prayer-check-icon ${isDone ? 'checked' : ''}">${isDone ? (prayerStatus === 'made-up' ? '↺' : '✓') : ''}</span><span class="prayer-name-text">${name}</span></strong>
            <small>${formatTime(time)}</small>
          </button>`;
        }).join('');
      }
    }

    const fastingStatusText = $('#todayFastingStatusText');
    if (fastingStatusText) {
      fastingStatusText.textContent = day.fasting === 'yes' ? 'مسجّل إنك صائم، ربنا يتقبل' : day.fasting === 'no' ? 'مسجّل إنك مش صائم' : day.fasting === 'not-planned' ? 'مش مخطط كصيام' : 'سجّل نيتك بهدوء';
    }
    $$('[data-today-fast]').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.todayFast === day.fasting);
    });

    const iftarEl = $('#todayIftarRemaining');
    if (iftarEl) {
      if (day.fasting === 'yes' || state.fasting.today) {
        const maghrib = prayerTimes[4];
        if (now < maghrib) {
          const leftSec = (maghrib.getTime() - now.getTime()) / 1000;
          iftarEl.textContent = `متبقي على الإفطار: ${formatDuration(leftSec)}`;
        } else {
          iftarEl.textContent = 'حان وقت الإفطار · تقبل الله صيامك';
        }
      } else {
        iftarEl.textContent = `المغرب ميعاده ${formatTime(prayerTimes[4])}`;
      }
    }

    renderTodayTimer();
    renderTodayTasks();
    renderPrayerBacklog();
    renderFastingBacklog();
    renderDevotion();
    renderChallenges();
    renderTodaySessionsLog();

    const savedNoteText = $('#todaySavedNoteText');
    if (savedNoteText) {
      if (day.workNote) {
        savedNoteText.hidden = false;
        savedNoteText.textContent = `آخر ملخص مسجّل: ${day.workNote}`;
      } else {
        savedNoteText.hidden = true;
      }
    }
  } catch (err) {
    console.error('renderTodayView error:', err);
  }
}

function renderTodayTimer() {
  const timer = state.workTimer || defaultState.workTimer;
  const elapsed = timerElapsed();
  const display = $('#todayTimerDisplay');
  if (display) display.textContent = formatElapsed(elapsed, true);
  const totalDisplay = $('#todayWorkTotal');
  if (totalDisplay) totalDisplay.textContent = formatElapsed(todayWorkMs(), false);

  const badge = $('#todayTimerBadge');
  if (badge) {
    badge.textContent = timer.running ? 'شغّال الآن' : elapsed > 0 ? 'متوقف مؤقتًا' : 'جاهز';
    badge.className = `status-pill ${timer.running ? 'warm' : 'soft'}`;
  }

  const toggleBtn = $('#todayTimerToggle');
  if (toggleBtn) {
    toggleBtn.textContent = timer.running ? 'وقف مؤقت' : elapsed > 0 ? 'كمّل الشغل' : 'ابدأ الشغل';
  }
  const finishBtn = $('#todayTimerFinish');
  if (finishBtn) finishBtn.disabled = elapsed < 1000;
}

function updateTodayTimerClock() {
  if (state.workTimer?.running) {
    const elapsed = timerElapsed();
    const display = $('#todayTimerDisplay');
    if (display) display.textContent = formatElapsed(elapsed, true);
    const totalDisplay = $('#todayWorkTotal');
    if (totalDisplay) totalDisplay.textContent = formatElapsed(todayWorkMs(), false);
  }
}

function renderTodayTasks() {
  const day = currentDay();
  const countEl = $('#todayTasksCount');
  if (countEl) {
    const done = day.tasks.filter((t) => t.done).length;
    countEl.textContent = `${arabicDigits(done)} من ${arabicDigits(day.tasks.length)} خلصوا`;
  }

  // Task rollover banner check
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const yesterdayTasks = (state.accountability?.days?.[yesterdayKey]?.tasks || []).filter((t) => !t.done);
  const rolloverBanner = $('#tasksRolloverBanner');
  const rolloverCount = $('#rolloverTasksCount');
  if (rolloverBanner && rolloverCount) {
    const unrolled = yesterdayTasks.filter((yt) => !day.tasks.some((dt) => dt.title === yt.title));
    if (unrolled.length > 0) {
      rolloverBanner.hidden = false;
      rolloverCount.textContent = arabicDigits(unrolled.length);
    } else {
      rolloverBanner.hidden = true;
    }
  }

  const list = $('#todayTasksList');
  if (!list) return;
  if (!day.tasks.length) {
    list.innerHTML = '<p class="task-empty">مفيش مهام مضافة النهارده. أضف أصغر خطوة حابب تنجزها.</p>';
    return;
  }
  list.innerHTML = day.tasks.map((task) => `
    <div class="today-task-item ${task.done ? 'done' : ''}">
      <button type="button" class="task-check-box" data-task-toggle="${task.id}" aria-label="تبديل إنجاز المهمة">${task.done ? '✓' : ''}</button>
      <span class="task-title">${escapeHtml(task.title)}</span>
      <button type="button" class="task-delete-btn" data-task-delete="${task.id}" aria-label="حذف المهمة">×</button>
    </div>
  `).join('');
}

function rolloverYesterdayTasks() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const yesterdayTasks = (state.accountability?.days?.[yesterdayKey]?.tasks || []).filter((t) => !t.done);
  const day = currentDay();
  const unrolled = yesterdayTasks.filter((yt) => !day.tasks.some((dt) => dt.title === yt.title));
  if (!unrolled.length) {
    showToast('مفيش مهام متبقية', 'كل مهام أمس مكتملة أو تم ترحيلها بالفعل.', 'normal');
    return;
  }
  unrolled.forEach((t) => {
    day.tasks.push({
      id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
      title: t.title,
      done: false,
      createdAt: new Date().toISOString(),
      rolledOverFrom: yesterdayKey
    });
  });
  day.updatedAt = new Date().toISOString();
  saveState();
  renderTodayTasks();
  renderTodayView();
  showToast('تم ترحيل المهام', `اتضافت ${arabicDigits(unrolled.length)} مهام لقائمة اليوم.`, 'success');
}

function renderTodaySessionsLog() {
  const list = $('#todaySessionsList');
  const countLabel = $('#sessionsCountLabel');
  const todaySessions = (state.workSessions || []).filter((s) => localDateKey(new Date(s.endedAt || s.startedAt)) === localDateKey());
  if (countLabel) countLabel.textContent = arabicDigits(todaySessions.length);
  if (!list) return;
  if (!todaySessions.length) {
    list.innerHTML = '<p class="task-empty">مفيش جلسات عمل مسجلة النهارده بعد.</p>';
    return;
  }
  list.innerHTML = todaySessions.map((session) => {
    const duration = formatDuration((session.durationMs || 0) / 1000);
    const start = session.startedAt ? formatTime(new Date(session.startedAt)) : '—';
    return `<div class="today-session-item">
      <div class="today-session-meta">
        <strong>${duration}</strong>
        <small>بدأت ${start}</small>
      </div>
      <button type="button" class="session-delete-btn" data-session-delete="${session.id}" aria-label="حذف الجلسة" title="حذف الجلسة">×</button>
    </div>`;
  }).join('');
}

function deleteTodaySession(id) {
  state.workSessions = (state.workSessions || []).filter((s) => s.id !== id);
  saveState();
  renderTodaySessionsLog();
  renderTodayView();
  renderWeekRhythm();
  showToast('اتحذفت الجلسة', 'تم تحديث إجمالي ساعات اليوم والأسبوع.', 'normal');
}

function exportDailySummary() {
  const now = new Date();
  const day = currentDay();
  const hijri = getAdjustedHijri(now);
  const prayerDone = REQUIRED_PRAYER_INDEXES.filter((i) => prayerIsComplete(day.prayers?.[prayerNames[i][0]])).map((i) => prayerNames[i][0]);
  const tasksDone = day.tasks.filter((t) => t.done).map((t) => t.title);
  const tasksPending = day.tasks.filter((t) => !t.done).map((t) => t.title);
  const totalWorked = formatElapsed(todayWorkMs(), false);
  const todaySessions = (state.workSessions || []).filter((s) => localDateKey(new Date(s.endedAt || s.startedAt)) === localDateKey());

  let text = `# تقرير وِنس اليومي · ${formatArabicDate(now)} (${arabicDigits(hijri.day)} ${hijri.monthName} ${arabicDigits(hijri.year)})\n\n`;
  text += `### ◒ الصلاة (${arabicDigits(prayerDone.length)} من ٥):\n`;
  REQUIRED_PRAYER_INDEXES.forEach((i) => {
    const name = prayerNames[i][0];
    const isDone = prayerIsComplete(day.prayers?.[name]);
    text += `- ${name}: ${isDone ? '✓ تمت' : '— لم تُسجل بعد'}\n`;
  });

  text += `\n### ☾ الصيام:\n- ${day.fasting === 'yes' ? 'صائم اليوم، تقبل الله' : day.fasting === 'no' ? 'غير صائم' : 'مش مخطط كصيام'}\n`;

  text += `\n### ▣ مهام اليوم (${arabicDigits(tasksDone.length)} من ${arabicDigits(day.tasks.length)}):\n`;
  if (day.tasks.length) {
    tasksDone.forEach((t) => { text += `- [x] ${t}\n`; });
    tasksPending.forEach((t) => { text += `- [ ] ${t}\n`; });
  } else {
    text += `- لم تُسجل مهام اليوم.\n`;
  }

  text += `\n### ⏱ العمل والتركيز:\n- إجمالي وقت الشغل: ${totalWorked} (${arabicDigits(todaySessions.length)} جلسات عمل)\n`;
  if (day.workNote) text += `- ملخص الإنجاز: ${day.workNote}\n`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('اتنسخ تقرير اليوم (Markdown)', 'جاهز للصق في Notion أو Obsidian أو ملاحظاتك.', 'success');
    }).catch(() => {
      showToast('تعذر النسخ للحافظة', '', 'error');
    });
  }
}

function openAthkar(tab = 'morning') {
  activeAthkarTab = tab;
  renderAthkarModalContent();
  openModal('athkarModal');
}

function renderAthkarModalContent() {
  $$('.athkar-tabs .vault-tab').forEach((b) => b.classList.toggle('active', b.dataset.athkarTab === activeAthkarTab));
  const list = $('#athkarContentList');
  if (!list) return;
  const items = ATHKAR_DATA[activeAthkarTab] || ATHKAR_DATA.morning;
  list.innerHTML = items.map((item) => `
    <article class="athkar-card">
      <p class="athkar-arabic">${escapeHtml(item.arabic)}</p>
      <div class="athkar-meta">
        <span>${escapeHtml(item.benefit || '')}</span>
        <small>${escapeHtml(item.source || '')}</small>
      </div>
    </article>
  `).join('');
}

function toggleTodayPrayer(name) {
  const day = currentDay();
  const wasDone = prayerIsComplete(day.prayers[name]);
  const pKey = PRAYER_KEY_MAP[name];
  if (wasDone) {
    delete day.prayers[name];
    syncCheckToVNext(pKey, false);
    reopenPrayerBacklog(localDateKey(), name);
  } else {
    const now = new Date();
    if (!Array.isArray(prayerTimes) || prayerTimes.length < 6) {
      prayerTimes = prayerTimesForDate(now);
    }
    const pIdx = REQUIRED_PRAYER_INDEXES.find((idx) => prayerNames[idx][0] === name);
    if (pIdx !== undefined && prayerTimes[pIdx] && prayerTimes[pIdx] > now) {
      showToast('لم يحن وقت الصلاة بعد', `لا يمكن تسجيل صلاة ${name} قبل دخول وقتها.`, 'prayer');
      return;
    }
    day.prayers[name] = 'done';
    syncCheckToVNext(pKey, true);
    resolvePrayerBacklog(localDateKey(), name, 'done');
  }
  day.updatedAt = new Date().toISOString();
  saveState();
  renderTodayView();
  renderPrayerList();
  showToast(wasDone ? `${name} رجعت ضمن اللي لسه.` : `${name} اتعلمت كمكتملة… ربنا يتقبل منك.`, '', wasDone ? 'normal' : 'success');
}

function addPrayerBacklog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const prayerName = String(form.elements.prayerName.value || '');
  const prayerDate = String(form.elements.prayerDate.value || '');
  if (!REQUIRED_PRAYER_INDEXES.some((index) => prayerNames[index][0] === prayerName) || !dateFromLocalKey(prayerDate) || prayerDate > localDateKey()) {
    showToast('راجع الصلاة والتاريخ', 'اختار فرضًا وتاريخًا صحيحًا مش بعد النهارده.', 'error');
    return;
  }
  const day = currentDay(prayerDate);
  if (prayerIsComplete(day.prayers?.[prayerName])) {
    showToast('الصلاة متسجلة كمكتملة', 'لو التسجيل مش صحيح، افتح يومها وعدّل حالتها الأول.', 'normal');
    return;
  }
  const backlog = prayerBacklogState();
  const existing = backlog.items.find((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && item.status !== 'resolved' && item.status !== 'removed');
  const now = new Date().toISOString();
  if (existing) {
    existing.status = 'missed';
    existing.source = existing.source || 'manual';
    existing.updatedAt = now;
  } else {
    backlog.items.push({ id: crypto.randomUUID?.() || `manual-${Date.now()}`, prayerName, prayerDate, source: 'manual', status: 'missed', createdAt: now, updatedAt: now });
  }
  day.prayers[prayerName] = 'missed';
  day.updatedAt = now;
  saveState();
  renderTodayView();
  showToast('اتضافت للتذكير', `${prayerName} هتفضل ظاهرة لحد ما تسجّل إنك قضيتها.`, 'prayer');
}

function updatePrayerBacklogItem(id, action) {
  const backlog = prayerBacklogState();
  const item = backlog.items.find((entry) => entry.id === id);
  if (!item || !['unconfirmed', 'missed'].includes(item.status)) return;
  const day = currentDay(item.prayerDate);
  const now = new Date().toISOString();
  if (action === 'missed') {
    item.status = 'missed';
    item.updatedAt = now;
    day.prayers[item.prayerName] = 'missed';
    showToast('هتفضل على رادارك', `${item.prayerName} مش هتختفي غير لما تسجّل إنك قضيتها.`, 'prayer');
  } else if (action === 'prayed') {
    item.status = 'resolved';
    item.resolution = 'done';
    item.resolvedAt = now;
    item.updatedAt = now;
    day.prayers[item.prayerName] = 'done';
    showToast('اتقفلت المراجعة', `${item.prayerName} اتسجلت إنك صليتها… ربنا يتقبل.`, 'success');
  } else if (action === 'made-up') {
    item.status = 'resolved';
    item.resolution = 'made-up';
    item.resolvedAt = now;
    item.updatedAt = now;
    day.prayers[item.prayerName] = 'made-up';
    showToast('اتسجلت إنها اتقضت', `${item.prayerName} خرجت من قائمة التذكير.`, 'success');
  } else if (action === 'remove' && item.source === 'manual') {
    item.status = 'removed';
    item.updatedAt = now;
    if (day.prayers[item.prayerName] === 'missed') delete day.prayers[item.prayerName];
    showToast('اتشالت من القائمة', 'تقدر تضيفها تاني في أي وقت.');
  } else {
    return;
  }
  day.updatedAt = now;
  saveState();
  renderPrayerBacklog();
  renderTodayView();
  renderPrayerList();
  renderFastingBacklog();
}

function setPrayerStatusForDate(prayerDate, prayerName, status) {
  if (!REQUIRED_PRAYER_INDEXES.some((index) => prayerNames[index][0] === prayerName)) return;
  const now = new Date();
  const isToday = prayerDate === localDateKey(now);
  const pIdx = REQUIRED_PRAYER_INDEXES.find((index) => prayerNames[index][0] === prayerName);

  if (isToday && status === 'done' && pIdx !== undefined) {
    if (!Array.isArray(prayerTimes) || prayerTimes.length < 6) {
      prayerTimes = prayerTimesForDate(now);
    }
    if (prayerTimes[pIdx] && prayerTimes[pIdx] > now) {
      showToast('لم يحن وقت الصلاة بعد', `لا يمكن تسجيل صلاة ${prayerName} قبل دخول وقتها.`, 'prayer');
      return;
    }
  }

  const day = currentDay(prayerDate);
  const backlog = prayerBacklogState();
  const nowIso = now.toISOString();
  const pKey = PRAYER_KEY_MAP[prayerName];

  if (status === 'done') {
    day.prayers[prayerName] = 'done';
    if (isToday) syncCheckToVNext(pKey, true);
    resolvePrayerBacklog(prayerDate, prayerName, 'done');
    showToast('اتسجلت إنها تمت', `${prayerName} اتقفلت من المراجعة… ربنا يتقبل.`, 'success');
  } else if (status === 'missed') {
    day.prayers[prayerName] = 'missed';
    if (isToday) syncCheckToVNext(pKey, false);
    const existing = backlog.items.find((item) => item.prayerDate === prayerDate && item.prayerName === prayerName && !['resolved', 'removed'].includes(item.status));
    if (existing) { existing.status = 'missed'; existing.updatedAt = nowIso; }
    else backlog.items.push({ id: crypto.randomUUID?.() || `manual-${Date.now()}`, prayerName, prayerDate, source: 'manual', status: 'missed', createdAt: nowIso, updatedAt: nowIso });
    showToast('اتسجلت كصلاة فائتة', `${prayerName} هتفضل في قسم «الفائت» لحد ما تسجّل إنك قضيتها.`, 'prayer');
  }
  day.updatedAt = nowIso;
  saveState();
  renderPrayerBacklog();
  renderTodayView();
  renderPrayerList();
  renderFastingBacklog();
}

function toggleAutomaticPrayerBacklog(enabled) {
  const backlog = prayerBacklogState();
  backlog.autoTrack = Boolean(enabled);
  if (backlog.autoTrack) reconcilePrayerBacklog(new Date());
  saveState();
  renderPrayerBacklog();
  showToast(backlog.autoTrack ? 'الإضافة التلقائية اشتغلت' : 'الإضافة التلقائية اتوقفت', backlog.autoTrack ? 'أي فرض ينتهي وقته من غير تسجيل هيظهر كغير مؤكد.' : 'الصلوات الموجودة هتفضل محفوظة، لكن مش هيتضاف جديد تلقائيًا.');
}

function addFastingBacklog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const fastingDate = String(form.elements.fastingDate.value || '');
  const fastingType = String(form.elements.fastingType.value || 'صيام فائت');
  if (!dateFromLocalKey(fastingDate) || fastingDate > localDateKey()) {
    showToast('راجع تاريخ الصيام', 'اختار يومًا صحيحًا مش بعد النهارده.', 'error');
    return;
  }
  const day = currentDay(fastingDate);
  const backlog = fastingBacklogState();
  const now = new Date().toISOString();
  const existing = backlog.items.find((item) => item.fastingDate === fastingDate && !['resolved', 'removed'].includes(item.status));
  if (existing) { existing.status = 'missed'; existing.fastingType = fastingType; existing.updatedAt = now; }
  else backlog.items.push({ id: crypto.randomUUID?.() || `manual-fast-${Date.now()}`, fastingDate, fastingType, source: 'manual', status: 'missed', createdAt: now, updatedAt: now });
  day.fasting = 'no'; day.updatedAt = now;
  saveState(); renderTodayView(); renderFastingBacklog();
  showToast('اتسجل يوم الصيام الفائت', 'هيفضل ظاهر في قسم «الفائت» لحد ما تسجّل إنك قضيته.', 'fasting');
}

function updateFastingBacklogItem(id, action) {
  const backlog = fastingBacklogState();
  const item = backlog.items.find((entry) => entry.id === id);
  if (!item || !['unconfirmed', 'missed'].includes(item.status)) return;
  const day = currentDay(item.fastingDate);
  const now = new Date().toISOString();
  if (action === 'missed') {
    item.status = 'missed'; day.fasting = 'no';
    showToast('اليوم هيفضل على رادارك', 'مش هيختفي غير لما تسجّل إنك قضيته.', 'fasting');
  } else if (action === 'fasted') {
    item.status = 'resolved'; item.resolution = 'fasted'; item.resolvedAt = now; day.fasting = 'yes';
    showToast('اتقفلت المراجعة', 'اتسجل إنك صمت اليوم… ربنا يتقبل.', 'success');
  } else if (action === 'made-up') {
    item.status = 'resolved'; item.resolution = 'made-up'; item.resolvedAt = now;
    showToast('اتسجل إنه اتقضى', 'اليوم خرج من قائمة التذكير.', 'success');
  } else if (action === 'remove') {
    item.status = 'removed'; item.resolution = 'not-required';
    if (day.fasting === 'no') day.fasting = 'not-planned';
    showToast('اتشال من القائمة', 'تقدر تضيفه تاني يدويًا في أي وقت.');
  } else return;
  item.updatedAt = now; day.updatedAt = now;
  saveState();
  renderFastingBacklog();
  renderPrayerBacklog();
  renderTodayView();
}

function toggleAutomaticFastingBacklog(enabled) {
  const backlog = fastingBacklogState();
  backlog.autoReview = Boolean(enabled);
  if (backlog.autoReview) reconcileFastingBacklog(new Date());
  saveState(); renderFastingBacklog();
  showToast(backlog.autoReview ? 'مراجعة الصيام اشتغلت' : 'مراجعة الصيام اتوقفت', backlog.autoReview ? 'رمضان والأيام اللي خططت لها هتظهر للتأكيد بعد المغرب.' : 'الموجود هيفضل محفوظ، ومش هيتضاف جديد تلقائيًا.');
}

function setTodayFasting(status) {
  const day = currentDay();
  day.fasting = status;
  day.updatedAt = new Date().toISOString();
  state.fasting.today = status === 'yes';
  if (status === 'yes') resolveFastingBacklog(localDateKey(), 'fasted');
  if (status === 'not-planned') resolveFastingBacklog(localDateKey(), 'not-required');
  if (status === 'no') fastingBacklogState().items.forEach((item) => { if (item.fastingDate === localDateKey() && item.status === 'unconfirmed') item.status = 'missed'; });
  saveState();
  syncNativeReminderPlan();
  renderTodayView();
  renderHijriAndFasting();
  renderFastingBacklog();
  showToast(status === 'yes' ? 'ربنا يتقبل صيامك.' : 'اتسجل ردك محليًا وبلا أي ضغط.');
}

function addTodayTask() {
  const input = $('#todayTaskInput');
  const title = input?.value.trim();
  if (!title) return;
  const day = currentDay();
  day.tasks.push({ id: crypto.randomUUID?.() || String(Date.now()), title, done: false, createdAt: new Date().toISOString() });
  day.updatedAt = new Date().toISOString();
  input.value = '';
  saveState();
  renderTodayTasks();
  renderTodayView();
  showToast('اتضافت المهمة', 'خطوة صغيرة تضاف لجدول اليوم.', 'success');
}

function toggleTodayTask(id) {
  const day = currentDay();
  const task = day.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? new Date().toISOString() : null;
  day.updatedAt = new Date().toISOString();
  saveState();
  renderTodayTasks();
  renderTodayView();
  showToast(task.done ? `خلصت: ${task.title}` : `${task.title} رجعت ضمن اللي لسه.`);
}

function deleteTodayTask(id) {
  const day = currentDay();
  day.tasks = day.tasks.filter((t) => t.id !== id);
  day.updatedAt = new Date().toISOString();
  saveState();
  renderTodayTasks();
  renderTodayView();
}

function saveTodayWorkNote() {
  const input = $('#todayWorkNoteInput');
  const value = input?.value.trim();
  if (!value) return;
  const day = currentDay();
  day.workNote = value;
  day.updatedAt = new Date().toISOString();
  input.value = '';
  saveState();
  renderTodayView();
  showToast('اتحفظ الملخص', 'كده في دليل إن اليوم اتحرك ✦', 'success');
}

function toggleTodayTimer() {
  state.workTimer ||= structuredClone(defaultState.workTimer);
  if (state.workTimer.running) {
    state.workTimer.accumulatedMs = timerElapsed();
    state.workTimer.running = false;
    state.workTimer.startedAt = null;
    showToast('وقفت العداد مؤقتًا', 'وقتك لسه محفوظ.');
  } else {
    state.workTimer.running = true;
    state.workTimer.startedAt = Date.now();
    showToast('بدأنا الشغل', 'وِنس بيحسب وقت الشغل الحقيقي.');
  }
  saveState();
  renderTodayTimer();
}

function finishTodayTimer() {
  const elapsed = timerElapsed();
  if (elapsed < 1000) return;
  const now = new Date();
  const startedAt = new Date(now.getTime() - elapsed).toISOString();
  state.workSessions ||= [];
  state.workSessions.unshift({ id: crypto.randomUUID?.() || String(Date.now()), startedAt, endedAt: now.toISOString(), durationMs: elapsed, source: 'main-app' });
  const day = currentDay();
  day.focusedMs = (Number(day.focusedMs) || 0) + elapsed;
  day.updatedAt = now.toISOString();
  state.workTimer = structuredClone(defaultState.workTimer);
  saveState();
  playChime('timer');
  renderTodayView();
  renderWeekRhythm();
  showToast('جلسة مسجلة', `سجلت جلسة ${formatElapsed(elapsed, false)}. تقدر تكتب عملت إيه تحت.`);
  $('#todayWorkNoteInput')?.focus();
}

function renderHomeFocusCard() {
  const activeProject = state.projects.find((p) => p.status === 'قيد التنفيذ') || state.projects[0];
  const titleEl = $('#homeFocusTitle');
  const projectEl = $('#homeFocusProjectName');
  const stepMetaEl = $('#homeFocusStepMeta');
  const progressBar = $('#homeFocusProgressBar');
  const nextStepEl = $('#homeFocusNextStep');
  const statusEl = $('#homeFocusStatus');

  if (activeProject) {
    if (titleEl) titleEl.textContent = activeProject.currentTask || activeProject.title;
    if (projectEl) projectEl.innerHTML = `مشروع: <strong>${escapeHtml(activeProject.title)}</strong>`;
    if (stepMetaEl) stepMetaEl.textContent = `نسبة الإنجاز: ${arabicDigits(activeProject.progress || 0)}٪`;
    if (progressBar) progressBar.style.width = `${Math.max(4, Math.min(100, activeProject.progress || 0))}%`;
    if (nextStepEl) nextStepEl.innerHTML = `<span class="check-ring"></span> ${escapeHtml(activeProject.currentTask || 'حدد أصغر خطوة تالية')}`;
    if (statusEl) { statusEl.textContent = activeProject.status; statusEl.className = `status-pill ${activeProject.status === 'قيد التنفيذ' ? 'warm' : 'soft'}`; }
  } else {
    if (titleEl) titleEl.textContent = 'ابدأ أول مشروع محلي';
    if (projectEl) projectEl.innerHTML = 'مشروع: <strong>مفيش مشاريع بعد</strong>';
    if (stepMetaEl) stepMetaEl.textContent = 'الخطوة الأولى';
    if (progressBar) progressBar.style.width = '0%';
    if (nextStepEl) nextStepEl.innerHTML = '<span class="check-ring"></span> اضغط لإنشاء مشروع جديد';
  }

  const returnHeading = $('#returnCardHeading');
  const returnTask = $('#returnCardTaskText');
  if (returnHeading && activeProject) returnHeading.textContent = activeProject.title;
  if (returnTask && activeProject) returnTask.textContent = `آخر خطوة: ${activeProject.currentTask || activeProject.description || 'حدد الخطوة التالية'}`;
}

function renderWeekRhythm() {
  const weekBars = $('#weekBars');
  const weekTotal = $('#weekTotal');
  if (!weekBars) return;

  const now = new Date();
  const dayNames = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'];
  const dayMinutes = [0, 0, 0, 0, 0, 0, 0];

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    const k = localDateKey(d);
    const daySessions = (state.workSessions || []).filter((s) => localDateKey(new Date(s.endedAt || s.startedAt)) === k);
    let ms = daySessions.reduce((sum, s) => sum + (Number(s.durationMs) || 0), 0);
    if (i === 6) ms += timerElapsed();
    dayMinutes[i] = Math.round(ms / 60000);
  }

  const totalMin = dayMinutes.reduce((a, b) => a + b, 0);
  if (weekTotal) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    weekTotal.textContent = `${arabicDigits(h)}س ${arabicDigits(m)}د`;
  }

  const maxMin = Math.max(60, ...dayMinutes);
  weekBars.innerHTML = dayMinutes.map((min, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    const dayLetter = dayNames[d.getDay()];
    const pct = Math.max(8, Math.min(100, Math.round((min / maxMin) * 100)));
    const isToday = i === 6;
    return `<div class="bar-col"><span class="bar ${min > 0 ? 'active' : ''} ${isToday ? 'today' : ''}" style="height: ${pct}%" title="${arabicDigits(min)} دقيقة"></span><small>${dayLetter}</small></div>`;
  }).join('');
}

function renderQibla() {
  const qibla = calculateQiblaBearing(state.settings.latitude, state.settings.longitude);
  const angleEl = $('#qiblaAngle');
  if (angleEl) angleEl.textContent = qibla.label;
  const needle = $('#qiblaNeedle');
  if (needle) needle.style.transform = `rotate(${qibla.angle}deg)`;
  const coordsEl = $('#qiblaCoordinates');
  if (coordsEl) coordsEl.textContent = `${state.settings.latitude}° N · ${state.settings.longitude}° E`;
}

function renderIdeas() {
  const list = $('#ideaList'); if (!list) return;
  const countEl = $('#ideasTotalCount');
  if (countEl) countEl.textContent = arabicDigits(state.ideas?.length || 0);
  if (!state.ideas.length) {
    list.innerHTML = '<p class="task-empty">مفيش أفكار محفوظة بعد. اضغط ＋ وسجّل أول فكرة.</p>';
    return;
  }
  list.innerHTML = state.ideas.slice(0, 4).map((idea, i) => {
    idea.id ||= crypto.randomUUID?.() || `idea-${i}-${Date.now()}`;
    return `
      <div class="idea-row" data-idea-index="${i}">
        <span class="idea-pin"></span>
        <span class="idea-title">${escapeHtml(idea.title)}</span>
        <span class="idea-tag">${escapeHtml(idea.tag || 'فكرة')}</span>
      </div>
    `;
  }).join('');
}

function openAllIdeasModal() {
  allIdeasSearchQuery = '';
  const searchInput = $('#allIdeasSearchInput');
  if (searchInput) searchInput.value = '';
  renderAllIdeasModalContent();
  openModal('allIdeasModal');
}

function renderAllIdeasModalContent() {
  const list = $('#allIdeasList');
  if (!list) return;
  const allIdeas = state.ideas || [];
  const query = (allIdeasSearchQuery || '').toLowerCase().trim();
  const filtered = query
    ? allIdeas.filter((i) => (i.title || '').toLowerCase().includes(query) || (i.tag || '').toLowerCase().includes(query))
    : allIdeas;
  if (!filtered.length) {
    list.innerHTML = '<p class="task-empty" style="padding:24px;">مفيش أفكار مطابقة للبحث.</p>';
    return;
  }
  list.innerHTML = filtered.map((idea) => {
    idea.id ||= crypto.randomUUID?.() || `idea-${Date.now()}-${Math.random()}`;
    return `
      <div class="all-idea-item">
        <div class="all-idea-copy">
          <strong>${escapeHtml(idea.title)}</strong>
          <span class="idea-tag">${escapeHtml(idea.tag || 'فكرة')}</span>
        </div>
        <div class="all-idea-actions">
          <button type="button" class="button primary small-button" data-convert-idea="${escapeHtml(idea.title)}" data-convert-tag="${escapeHtml(idea.tag || '')}">🚀 تحويل لمشروع</button>
          <button type="button" class="button ghost danger-button small-button" data-delete-idea-id="${idea.id}">حذف</button>
        </div>
      </div>
    `;
  }).join('');
}

function convertIdeaToProject(title, tag) {
  closeModal('allIdeasModal');
  openModal('newProjectModal');
  const input = $('#newProjectInput');
  const taskInput = $('#newProjectTask');
  if (input) input.value = title;
  if (taskInput) taskInput.value = tag ? `أول خطوة في ${tag}` : 'تحديد أول خطوة';
  window.setTimeout(() => input?.focus(), 80);
}

function deleteIdea(idOrTitle) {
  state.ideas = (state.ideas || []).filter((i) => i.id !== idOrTitle && i.title !== idOrTitle);
  saveState();
  renderIdeas();
  renderAllIdeasModalContent();
  showToast('اتحذفت الفكرة', '', 'normal');
}

function renderProjects() {
  const list = $('#projectList'); if (!list) return;
  const allProjects = state.projects || [];
  allProjects.forEach((p, idx) => { p.id ||= crypto.randomUUID?.() || `proj-${idx}-${Date.now()}`; });
  const inProgress = allProjects.filter((p) => p.status === 'قيد التنفيذ');
  const ideas = allProjects.filter((p) => p.status === 'فكرة');
  const completed = allProjects.filter((p) => p.status === 'مكتمل' || p.status === 'مكتمل جزئيًا');

  $('#filterCountAll') && ($('#filterCountAll').textContent = arabicDigits(allProjects.length));
  $('#filterCountInProgress') && ($('#filterCountInProgress').textContent = arabicDigits(inProgress.length));
  $('#filterCountIdeas') && ($('#filterCountIdeas').textContent = arabicDigits(ideas.length));
  $('#filterCountCompleted') && ($('#filterCountCompleted').textContent = arabicDigits(completed.length));

  let filtered = allProjects;
  if (projectFilter === 'in-progress') filtered = inProgress;
  else if (projectFilter === 'ideas') filtered = ideas;
  else if (projectFilter === 'completed') filtered = completed;

  if (!filtered.length) {
    list.innerHTML = '<p class="task-empty" style="padding:24px;">لا توجد مشاريع في هذا القسم.</p>';
    return;
  }

  list.innerHTML = filtered.map((project) => `
    <article class="project-card project-card-interactive" data-project-id="${project.id}">
      <span class="project-symbol">${escapeHtml(project.symbol || '✦')}</span>
      <div>
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.description || 'مشروع جديد')}</p>
        ${project.currentTask ? `<small class="project-current-task">الخطوة الحالية: ${escapeHtml(project.currentTask)}</small>` : ''}
      </div>
      <div class="project-card-meta">
        <span class="status-pill ${project.status === 'قيد التنفيذ' ? 'soft' : 'pale'}">${escapeHtml(project.status)}</span>
        <span class="project-progress"><span style="width:${Math.max(4, Math.min(100, project.progress || 0))}%"></span></span>
        <div class="project-card-tools">
          <button type="button" class="button ghost small-button" data-edit-project="${project.id}">✏️ تعديل</button>
          <button type="button" class="button ghost small-button" data-toggle-project-status="${project.id}">${project.status === 'مكتمل' ? '↻ تشغيل' : '✓ إكمال'}</button>
        </div>
      </div>
    </article>
  `).join('');

  renderHomeFocusCard();
}

function openEditProjectModal(id) {
  const project = (state.projects || []).find((p) => p.id === id);
  if (!project) return;
  $('#editProjectId').value = project.id;
  $('#editProjectTitle').value = project.title || '';
  $('#editProjectDesc').value = project.description || '';
  $('#editProjectTask').value = project.currentTask || '';
  $('#editProjectStatus').value = project.status || 'قيد التنفيذ';
  const progress = Math.max(0, Math.min(100, project.progress || 0));
  $('#editProjectProgress').value = progress;
  $('#editProjectProgressVal').textContent = `${arabicDigits(progress)}٪`;
  openModal('editProjectModal');
}

function handleEditProjectSubmit(event) {
  event.preventDefault();
  const id = $('#editProjectId').value;
  const project = (state.projects || []).find((p) => p.id === id);
  if (!project) return;
  project.title = $('#editProjectTitle').value.trim() || project.title;
  project.description = $('#editProjectDesc').value.trim();
  project.currentTask = $('#editProjectTask').value.trim();
  project.status = $('#editProjectStatus').value;
  project.progress = Number($('#editProjectProgress').value) || 0;
  saveState();
  renderProjects();
  closeModal('editProjectModal');
  showToast('اتحفظت تعديلات المشروع', project.title, 'success');
}

function deleteProject(id) {
  const project = (state.projects || []).find((p) => p.id === id);
  if (!project) return;
  state.projects = state.projects.filter((p) => p.id !== id);
  saveState();
  renderProjects();
  closeModal('editProjectModal');
  showToast('اتحذف المشروع', project.title, 'normal');
}

function toggleProjectStatus(id) {
  const project = (state.projects || []).find((p) => p.id === id);
  if (!project) return;
  if (project.status === 'مكتمل') {
    project.status = 'قيد التنفيذ';
  } else {
    project.status = 'مكتمل';
    project.progress = 100;
  }
  saveState();
  renderProjects();
  showToast(project.status === 'مكتمل' ? 'مبروك! المشروع اتعلم كمكتمل ✦' : 'المشروع رجع قيد التنفيذ.');
}

function applyThemeAccent(accent) {
  const valid = ['default', 'amber', 'olive', 'indigo', 'midnight'].includes(accent) ? accent : 'default';
  state.settings.themeAccent = valid;
  if (valid === 'default') {
    delete document.documentElement.dataset.themeAccent;
  } else {
    document.documentElement.dataset.themeAccent = valid;
  }
  $$('#themeAccentRow .theme-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.themeAccent === valid);
  });
  updateSettingsAvatarPreview();
  saveState();
}

const AVATAR_ICONS = {
  sprout: '🌱',
  robot: '🤖',
  ninja: '🥷',
  orb: '🔮',
  cat: '🐱',
  crescent: '🌙'
};

const AVATAR_LABELS = {
  sprout: 'وِنس الأصلي',
  robot: 'الروبوت الذكي',
  ninja: 'النينجا الصامت',
  orb: 'كوانتم أورب',
  cat: 'القط الأليف',
  crescent: 'الهلال الروحاني'
};

const AVATAR_DESCRIPTIONS = {
  sprout: 'الرفيق الكلاسيكي الهادئ والمشجع في كل خطواتك اليومية.',
  robot: 'الروبوت الذكي ذو العيون الرقمية والهوائي المشع، يرافقك بتركيز عالي.',
  ninja: 'النينجا الصامت بوشاحه الأحمر، هدوء تام وإنجاز سريع للمهام.',
  orb: 'كوانتم أورب الكروي بطاقته الأرجوانية ومداراته المتوهجة.',
  cat: 'القط الأليف الودود بآذانه وشواربه، يضيف دفئاً وألفة لروتينك.',
  crescent: 'الهلال الروحاني الذهبي، رفيق العبادة والسكينة في الأوقات المباركة.'
};

function updateSettingsAvatarPreview(avatar = state.settings?.petAvatar || 'sprout') {
  const valid = AVATAR_ICONS[avatar] ? avatar : 'sprout';
  const preview = $('#settingsAvatarPreview');
  if (preview) {
    ['sprout', 'robot', 'ninja', 'orb', 'cat', 'crescent'].forEach((a) => preview.classList.remove(`avatar-${a}`));
    preview.classList.add(`avatar-${valid}`);
  }
  const nameEl = $('#settingsAvatarName');
  if (nameEl) nameEl.textContent = `${AVATAR_ICONS[valid]} ${AVATAR_LABELS[valid]}`;
  const descEl = $('#settingsAvatarDesc');
  if (descEl) descEl.textContent = AVATAR_DESCRIPTIONS[valid] || '';

  const badge = $('#settingsPetStatusBadge');
  const quickBtn = $('#settingsQuickPetVisibleBtn');
  const isVisible = Boolean(state.settings?.petVisible);
  if (badge) {
    badge.textContent = isVisible ? '✓ ظاهر على سطح المكتب' : 'مخفي حاليًا من سطح المكتب';
    badge.classList.toggle('is-visible', isVisible);
    badge.classList.toggle('is-hidden', !isVisible);
  }
  if (quickBtn) {
    quickBtn.style.display = isVisible ? 'none' : 'inline-flex';
  }
}

function updateTopbarAvatar(avatar = state.settings?.petAvatar || 'sprout') {
  const valid = AVATAR_ICONS[avatar] ? avatar : 'sprout';
  const label = AVATAR_LABELS[valid] || valid;
  const btn = $('#topbarAvatarButton') || $('.avatar-button');
  if (btn) {
    btn.textContent = AVATAR_ICONS[valid];
    btn.setAttribute('aria-label', `فتح الإعدادات · الرفيق الحالي: ${label}`);
    btn.title = `الرفيق الحالي: ${label} (اضغط لفتح الإعدادات)`;
  }
}

function applyPetAvatar(avatar, showNotification = true) {
  const valid = avatar === 'robot' ? 'robot' : 'orb';
  state.settings.petAvatar = valid;
  $$('#petAvatarRow .theme-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.petAvatar === valid);
  });
  const wrap = $('#petWrap');
  if (wrap) {
    ['sprout', 'robot', 'ninja', 'orb', 'cat', 'crescent'].forEach((a) => wrap.classList.remove(`avatar-${a}`));
    if (valid !== 'sprout') wrap.classList.add(`avatar-${valid}`);
  }
  updateTopbarAvatar(valid);
  updateSettingsAvatarPreview(valid);
  saveState();
  if (showNotification) {
    const label = AVATAR_LABELS[valid] || valid;
    const isVisible = Boolean(state.settings.petVisible);
    showToast('اتغيرت شخصية الرفيق', isVisible ? `الرفيق الآن: ${label}` : `الرفيق الآن: ${label} (مخفي من سطح المكتب)`);
  }
}

function renderCustomFasts() {
  const timeline = document.querySelector('.fasting-timeline'); if (!timeline) return;
  timeline.querySelector('[data-custom-fast]')?.remove();
  const items = (state.fasting.custom || []);
  if (!items.length) return;
  const list = document.createElement('div'); list.dataset.customFast = 'true'; list.innerHTML = items.map((item) => `<div class="fast-event custom"><div class="event-date"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.date)}</span></div><div class="event-line"><span class="event-dot"></span><span></span></div><div class="event-copy"><span class="status-pill soft">مخصص</span><h3>${escapeHtml(item.title)}</h3><p>تذكير الليلة السابقة مفعّل</p></div></div>`).join('');
  timeline.querySelector('.fast-event.today')?.before(list);
}

function enhanceSettingsUi() {
  syncSettingsForm();
}

function syncSettingsForm() {
  const values = { latitudeInput: state.settings.latitude, longitudeInput: state.settings.longitude, hijriOffset: state.settings.hijriOffset, fajrOffset: state.settings.fajrOffset, maghribOffset: state.settings.maghribOffset, ishaOffset: state.settings.ishaOffset, wuduLeadMinutes: state.settings.wuduLeadMinutes || 15 };
  Object.entries(values).forEach(([id, value]) => { const input = document.getElementById(id); if (input) input.value = value; });
  const offset = getConfiguredTimezoneOffset(new Date()); const timezoneHint = $('#timezoneHint'); if (timezoneHint) timezoneHint.textContent = `المنطقة الزمنية: ${state.settings.timeZone || 'Africa/Cairo'} · UTC${offset >= 0 ? '+' : ''}${offset} اليوم`;
  const method = $('#calcMethod'); if (method) method.value = state.settings.calcMethod || 'egypt';
  $$('[data-setting]').forEach((input) => { input.checked = Boolean(state.settings[input.dataset.setting]); });
  const overlayToggle = $('[data-overlay-widget]'); if (overlayToggle) overlayToggle.checked = Boolean(state.settings.overlayWidget);
  const currentTheme = state.settings.themeAccent || 'default';
  if (currentTheme === 'default') delete document.documentElement.dataset.themeAccent;
  else document.documentElement.dataset.themeAccent = currentTheme;
  $$('#themeAccentRow .theme-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.themeAccent === currentTheme);
  });
  const currentAvatar = state.settings.petAvatar || 'sprout';
  $$('#petAvatarRow .theme-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.petAvatar === currentAvatar);
  });
  const wrap = $('#petWrap');
  if (wrap) {
    ['sprout', 'robot', 'ninja', 'orb', 'cat', 'crescent'].forEach((a) => wrap.classList.remove(`avatar-${a}`));
    if (currentAvatar !== 'sprout') wrap.classList.add(`avatar-${currentAvatar}`);
  }
  updateTopbarAvatar(currentAvatar);
  updateSettingsAvatarPreview(currentAvatar);
  renderLocationLabels();
}

function applySettings() {
  const latitude = Number($('#latitudeInput')?.value);
  const longitude = Number($('#longitudeInput')?.value);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    showToast('الإحداثيات مش صحيحة', 'خط العرض من -90 إلى 90، وخط الطول من -180 إلى 180.', 'error');
    return;
  }
  const calcMethod = $('#calcMethod')?.value || 'egypt';
  const coordinatesChanged = latitude !== Number(state.settings.latitude) || longitude !== Number(state.settings.longitude);
  const values = { latitude, longitude, hijriOffset: Number($('#hijriOffset')?.value) || 0, fajrOffset: Number($('#fajrOffset')?.value) || 0, maghribOffset: Number($('#maghribOffset')?.value) || 0, ishaOffset: Number($('#ishaOffset')?.value) || 0, wuduLeadMinutes: Math.max(1, Math.min(90, Number($('#wuduLeadMinutes')?.value) || 15)), calcMethod };
  if (coordinatesChanged) values.locationLabel = 'إحداثيات مخصصة';
  if (calcMethod !== state.settings.calcMethod) values.calcMethodAuto = false;
  state.settings = { ...state.settings, ...values };
  saveState(); syncPetWindowVisibility(); syncOverlayVisibility(); renderLocationLabels(); refreshPrayerTimes();
  void refreshOnlineWeather({ force: true, silent: true });
  showToast('اتحفظ المكان والمواقيت', 'الحساب اتجدد، والطقس هيتحدّث من نفس الإحداثيات.');
}

function renderPrayerList() {
  const list = $('#prayerList'); if (!list) return;
  const now = new Date();
  sanitizeTodayFuturePrayers(now);
  const next = getNextPrayer(now);
  const day = currentDay();
  list.innerHTML = prayerTimes.map((time, index) => {
    const informational = index === 1;
    const active = !next.tomorrow && index === next.index;
    const prayerStatus = day.prayers?.[prayerNames[index][0]];
    const label = informational ? 'نافلة' : prayerStatus === 'done' ? 'تمت' : prayerStatus === 'made-up' ? 'قُضيت' : prayerStatus === 'missed' ? 'محتاجة قضاء' : active ? 'القادمة' : time <= now ? 'غير مؤكدة' : 'لاحقًا';
    const actions = informational || time > now ? '' : `<div class="prayer-row-actions"><button class="prayer-status-btn done-action ${prayerIsComplete(prayerStatus) ? 'selected' : ''}" type="button" data-prayer-status="done" data-prayer-date="${localDateKey()}" data-prayer-record="${prayerNames[index][0]}">تمت</button><button class="prayer-status-btn missed-action ${prayerStatus === 'missed' ? 'selected' : ''}" type="button" data-prayer-status="missed" data-prayer-date="${localDateKey()}" data-prayer-record="${prayerNames[index][0]}">فاتتني</button></div>`;
    return `<div class="prayer-row ${active ? 'active' : ''} ${prayerStatus === 'missed' ? 'missed' : ''}"><span class="prayer-row-icon">${prayerNames[index][2]}</span><div><span class="prayer-row-name">${prayerNames[index][0]}</span><span class="prayer-row-sub">${prayerNames[index][1]}</span></div><span class="prayer-time">${formatTime(time)}</span><span class="prayer-row-state">${label}</span>${actions}</div>`;
  }).join('');
}

function renderAllViews() {
  renderIdeas();
  renderProjects();
  renderCustomFasts();
  renderPrayerList();
  renderTodayView();
  renderFastingBacklog();
  renderDevotion();
  renderNotificationPopover();
  renderLocalContext();
  renderWeekRhythm();
  renderQibla();
  renderStudioVaultCount();
  enhanceSettingsUi();
  syncSettingsForm();
  switchView(state.view || 'today');
  const urlParamView = new URLSearchParams(window.location.search).get('view') || (window.location.hash ? window.location.hash.slice(1) : null);
  if (urlParamView) switchView(urlParamView);
}

function switchView(view) {
  const previousView = state.view;
  state.view = view;
  if (previousView !== view) saveState();
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  $$('[data-view-panel]').forEach((panel) => panel.classList.toggle('active-view', panel.dataset.viewPanel === view));
  if (view === 'today') renderTodayView();
  if (view === 'fasting') renderHijriAndFasting();
  if (view === 'prayer') renderPrayerList();
  if (view === 'missed') { renderPrayerBacklog(); renderFastingBacklog(); }
  if (view === 'devotion') renderDevotion();
  if (view === 'challenges') renderChallenges();
  if (view === 'home') renderWeekRhythm();
}

function openModal(id) { const modal = document.getElementById(id); if (modal && typeof modal.showModal === 'function') modal.showModal(); }
function closeModal(id) { const modal = document.getElementById(id); if (modal?.open) modal.close(); }

function showToast(title, message = '', tone = 'normal') {
  const stack = $('#toastStack'); if (!stack) return;
  while (stack.children && stack.children.length >= 3) stack.firstElementChild?.remove();
  const icons = { success: '✓', error: '!', prayer: '◒', fasting: '☾', normal: '✦' };
  const toast = document.createElement('section'); toast.className = `toast ${tone}`; toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${icons[tone] || icons.normal}</span><div class="toast-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div><button class="toast-close" type="button" aria-label="إغلاق التنبيه">×</button><span class="toast-life" aria-hidden="true"></span>`;
  stack.appendChild(toast);
  pulseNotificationBell();
  if (tone === 'success' && state.settings.livelyPopups) createPetBurst();
  const remove = () => { if (!toast.isConnected || toast.classList.contains('out')) return; toast.classList.add('out'); window.setTimeout(() => toast.remove(), 240); };
  toast.querySelector('.toast-close')?.addEventListener('click', remove);
  window.setTimeout(remove, 5200);
}

function pulseNotificationBell() {
  const trigger = $('.notification-trigger'); if (!trigger) return;
  trigger.classList.remove('bell-pulse'); void trigger.offsetWidth; trigger.classList.add('bell-pulse');
  window.setTimeout(() => trigger.classList.remove('bell-pulse'), 700);
}

function createPetBurst() {
  const wrap = $('#petWrap'); if (!wrap || !state.settings.petVisible) return;
  const burst = document.createElement('span'); burst.className = 'pet-burst'; burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
  wrap.appendChild(burst); window.setTimeout(() => burst.remove(), 900);
}

function renderNotificationPopover() {
  const feed = $('#notificationFeed'); if (!feed) return;
  const inbox = (state.notificationInbox || []).slice(0, 8);
  feed.innerHTML = inbox.length
    ? inbox.map((item) => `<article class="notification-item ${item.tone || 'normal'}"><span class="notification-item-icon" aria-hidden="true">${item.tone === 'fasting' ? '☾' : '◒'}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || '')}</p><small>${escapeHtml(item.timeLabel || '')}</small></div></article>`).join('')
    : '<p class="notification-empty">مفيش تنبيهات جديدة. مواقيتك وتذكيراتك شغالة في الخلفية.</p>';
  const lastRead = Number(state.notificationLastReadAt) || 0;
  const unread = inbox.filter((item) => Number(item.receivedAt) > lastRead).length;
  const badge = $('#notificationBadge');
  if (badge) { badge.textContent = arabicDigits(unread); badge.hidden = unread === 0; }
}

function toggleNotificationPopover(force) {
  const popover = $('#notificationPopover'); const trigger = $('.notification-trigger'); if (!popover || !trigger) return;
  const shouldOpen = typeof force === 'boolean' ? force : popover.hidden;
  popover.hidden = !shouldOpen; trigger.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    renderNotificationPopover();
    state.notificationLastReadAt = Date.now();
    saveState();
    const badge = $('#notificationBadge'); if (badge) badge.hidden = true;
    popover.classList.remove('popover-in'); void popover.offsetWidth; popover.classList.add('popover-in');
  }
}

function dismissCompanionPopup() { const popup = $('.companion-popup'); if (!popup) return; popup.classList.add('leaving'); window.setTimeout(() => popup.remove(), 240); }

function showCompanionPopup(title, message, actionLabel = 'ابدأ ١٥ دقيقة', action = 'focus') {
  if (!state.settings.livelyPopups) return;
  const layer = $('#companionPopupLayer'); if (!layer) return;
  dismissCompanionPopup();
  const popup = document.createElement('aside'); popup.className = 'companion-popup'; popup.setAttribute('role', 'status');
  popup.innerHTML = `<div class="companion-wens" aria-hidden="true"><span><i></i><i></i><b></b></span><em>و</em></div><div class="companion-popup-copy"><span>وِنس بيفكّرك</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p><div class="companion-popup-actions"><button class="button primary small-button" type="button" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button><button class="button ghost small-button" type="button" data-action="dismiss-companion">بعد شوية</button></div></div><button class="companion-popup-close" type="button" data-action="dismiss-companion" aria-label="إغلاق">×</button>`;
  layer.appendChild(popup); createPetBurst();
  window.setTimeout(() => { if (popup.isConnected) dismissCompanionPopup(); }, 11000);
}

function demoPopupExperience() {
  closeModal('settingsModal'); toggleNotificationPopover(false);
  showCompanionPopup('نرجّع اليوم لمساره؟', 'اختار حاجة واحدة صغيرة، ووِنس هيفضل جنبك لحد ما تبدأ.', 'ابدأ جلسة', 'focus');
  showToast('البوب أب شغال', 'وده شكل التنبيه داخل التطبيق. جرّب كمان الجرس فوق.', 'success');
  sendNativeNotification('تنبيهات وِنس شغالة', 'ده اختبار Windows حقيقي؛ تذكيرات الصلاة والصيام هتطلع بنفس الطريقة.');
  setPetMessage('أهو كده… بقيت شايفني ✦');
}

async function sendNativeNotification(title, body) {
  const invoke = tauriInvoke();
  if (invoke) {
    try { await invoke('notification_send', { title, body }); return; }
    catch { /* Web notification fallback */ }
  }
  if (!('Notification' in window)) return;
  try {
    nativeNotificationPermission ||= Promise.resolve(window.Notification.permission === 'granted' || window.Notification.permission === 'default' ? window.Notification.requestPermission() : window.Notification.permission);
    if ((await nativeNotificationPermission) === 'granted') new window.Notification(title, { body });
  } catch { /* Web fallback */ }
}

function handleNativeReminder(reminder) {
  if (!reminder?.title) return;
  const fasting = String(reminder.kind || '').startsWith('fasting');
  const tone = fasting ? 'fasting' : 'prayer';
  state.notificationInbox ||= [];
  const reminderId = reminder.id || `${reminder.kind || 'reminder'}-${reminder.dueAtMs || Date.now()}`;
  if (reminder.kind === 'prayer-at' || reminder.kind === 'fasting-suhoor') playChime('prayer');
  state.notificationInbox = [
    { id: reminderId, title: reminder.title, body: reminder.body || '', tone, receivedAt: Date.now(), timeLabel: formatTime(new Date(), true) },
    ...state.notificationInbox.filter((item) => item.id !== reminderId)
  ].slice(0, 20);
  saveState();
  renderNotificationPopover();
}

function listenNativeReminders() {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return;
  listen('wens-reminder', (event) => handleNativeReminder(event.payload)).catch(() => {});
}

function rotatePrompt() {
  state.nextPrompt = (state.nextPrompt + 1) % promptBank.length; saveState();
  const prompt = $('#creativePrompt'); if (prompt) { prompt.classList.remove('prompt-flash'); void prompt.offsetWidth; prompt.textContent = promptBank[state.nextPrompt]; prompt.classList.add('prompt-flash'); }
}

function addIdeaFromForm(event) {
  event.preventDefault();
  const title = $('#ideaTitle')?.value.trim(); const tag = $('#ideaTag')?.value.trim() || 'فكرة';
  if (!title) return;
  state.ideas.unshift({ title, tag }); state.lastIdeaAt = Date.now(); saveState(); renderIdeas(); closeModal('quickIdeaModal'); $('#ideaForm')?.reset();
  setPetMessage('اتحفظت في الصندوق ✦'); showToast('فكرة جديدة', 'اتحفظت محليًا. نرجع لها لما يحين وقتها.', 'success');
}

function startFocus() {
  const duration = state.focusMinutes * 60;
  state.focusRunning = true; state.focusEndsAt = Date.now() + duration * 1000; saveState(); closeModal('focusModal');
  setPetMessage('أنا معاك… خطوة واحدة بس.'); showToast('جلسة التركيز بدأت', `قدامك ${arabicDigits(state.focusMinutes)} دقيقة لمراجعة الزوايا.`);
  document.body.classList.add('focus-active');
}

function updateFocusClock() {
  if (!state.focusRunning || !state.focusEndsAt) return;
  const remaining = Math.max(0, state.focusEndsAt - Date.now());
  if (remaining <= 0) {
    const elapsed = state.focusMinutes * 60 * 1000;
    const now = new Date();
    state.workSessions ||= [];
    state.workSessions.unshift({ id: crypto.randomUUID?.() || String(Date.now()), startedAt: new Date(now.getTime() - elapsed).toISOString(), endedAt: now.toISOString(), durationMs: elapsed, source: 'focus-session' });
    const day = currentDay();
    day.focusedMs = (Number(day.focusedMs) || 0) + elapsed;
    day.updatedAt = now.toISOString();
    state.focusRunning = false; state.focusEndsAt = null; saveState();
    document.body.classList.remove('focus-active');
    setPetMessage('خلصنا جلسة صغيرة. برافو عليك.');
    showToast('الجلسة خلصت', 'سجلت الجلسة ضمن وقت اليوم. خد نفس، وسجّل الخطوة اللي بعدها.', 'success');
    renderTodayView();
    renderWeekRhythm();
    return;
  }
  const seconds = Math.ceil(remaining / 1000); const min = Math.floor(seconds / 60); const sec = seconds % 60;
  const label = $('#focusDurationLabel'); if (label) label.textContent = arabicDigits(`${pad(min)}:${pad(sec)}`);
}

function setPetMessage(message) {
  const bubble = $('#petBubble'); if (!bubble || !state.settings.bubbles) return;
  if (bubble.firstChild) {
    bubble.firstChild.textContent = message;
  } else {
    bubble.textContent = message;
  }
  bubble.classList.remove('bubble-pop'); void bubble.offsetWidth; bubble.classList.add('bubble-pop');
}

function startNewProject() {
  openModal('newProjectModal');
  window.setTimeout(() => $('#newProjectInput')?.focus(), 70);
}

function handleNewProjectSubmit(event) {
  event.preventDefault();
  const input = $('#newProjectInput');
  const taskInput = $('#newProjectTask');
  const title = input?.value.trim();
  if (!title) return;
  const currentTask = taskInput?.value.trim() || 'تحديد أول خطوة';
  state.projects.unshift({ title, description: 'مشروع جديد · الخطوة الأولى', currentTask, status: 'قيد التنفيذ', progress: 10, symbol: '✦' });
  saveState();
  renderProjects();
  closeModal('newProjectModal');
  input.value = '';
  if (taskInput) taskInput.value = '';
  switchView('projects');
  showToast('مشروع جديد', 'اتعملت ورقته الأولى. اكتب أصغر خطوة تقدر تبدأ بها.', 'success');
}

function addCustomFast() {
  const picker = $('#fastCustomDatePicker');
  if (picker) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    picker.value = localDateKey(tomorrow);
  }
  openModal('fastDateInputModal');
  window.setTimeout(() => ($('#fastCustomDatePicker') || $('#fastDateInput'))?.focus(), 70);
}

function handleCustomFastSubmit(event) {
  event.preventDefault();
  const datePicker = $('#fastCustomDatePicker');
  const typeSelect = $('#fastCustomTypeSelect');
  const titleInput = $('#fastCustomTitleInput');
  const fallbackInput = $('#fastDateInput');

  let dateVal = datePicker?.value || fallbackInput?.value?.trim();
  if (!dateVal) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const parsed = new Date(dateVal);
    if (!isNaN(parsed.getTime())) {
      dateVal = localDateKey(parsed);
    }
  }

  const typeVal = typeSelect?.value || 'صيام مخصص';
  const customTitle = titleInput?.value?.trim() || typeVal;

  state.fasting.custom = [
    ...(state.fasting.custom || []).filter((item) => item.date !== dateVal),
    { date: dateVal, label: typeVal, title: customTitle }
  ];
  saveState();
  syncNativeReminderPlan();
  renderHijriAndFasting();
  renderCustomFasts();
  closeModal('fastDateInputModal');
  if (titleInput) titleInput.value = '';
  if (fallbackInput) fallbackInput.value = '';
  showToast('اتضاف يوم الصيام', `تم حفظ وتذكير ${customTitle} ليوم ${dateVal} بنجاح.`, 'success');
}

function deleteCustomFast(dateKey) {
  if (!dateKey) return;
  state.fasting.custom = (state.fasting.custom || []).filter((item) => item.date !== dateKey);
  saveState();
  syncNativeReminderPlan();
  renderHijriAndFasting();
  renderCustomFasts();
  showToast('تم حذف اليوم', 'تمت إزالة اليوم من جدول الصيام بنجاح.');
}

/* CREATIVE VAULT */
function renderStudioVaultCount() {
  const briefs = state.marketing?.briefs?.length || 0;
  const matrices = state.marketing?.matrices?.length || 0;
  const storyboards = state.marketing?.storyboards?.length || 0;
  const metrics = state.marketing?.metrics?.length || 0;
  const total = briefs + matrices + storyboards + metrics;
  const countEl = $('#vaultItemsCount');
  if (countEl) countEl.textContent = arabicDigits(total);
}

function openStudioVault(tab = 'briefs') {
  activeVaultTab = tab;
  renderVaultModalContent();
  openModal('studioVaultModal');
}

function renderVaultModalContent() {
  $$('.vault-tab').forEach((b) => b.classList.toggle('active', b.dataset.vaultTab === activeVaultTab));
  const briefs = state.marketing?.briefs || [];
  const matrices = state.marketing?.matrices || [];
  const storyboards = state.marketing?.storyboards || [];
  const metrics = state.marketing?.metrics || [];

  $('#vaultCountBriefs') && ($('#vaultCountBriefs').textContent = arabicDigits(briefs.length));
  $('#vaultCountMatrices') && ($('#vaultCountMatrices').textContent = arabicDigits(matrices.length));
  $('#vaultCountStoryboards') && ($('#vaultCountStoryboards').textContent = arabicDigits(storyboards.length));
  $('#vaultCountMetrics') && ($('#vaultCountMetrics').textContent = arabicDigits(metrics.length));

  const getProjectBadge = (pid) => pid ? `<span class="badge" style="background:var(--w-bg-sub);padding:2px 6px;border-radius:4px;font-size:0.75rem;margin-right:8px;">${escapeHtml(state.projects.find(p => p.id === pid)?.title || 'مشروع محذوف')}</span>` : '';
  const list = $('#vaultContentList');
  if (!list) return;

  if (activeVaultTab === 'briefs') {
    if (!briefs.length) { list.innerHTML = '<div class="vault-empty">مفيش Briefs محفوظة بعد. افتح قالب Campaign Brief واحفظ أول مسودة.</div>'; return; }
    list.innerHTML = briefs.map((b, i) => `
      <div class="vault-card">
        <div class="vault-card-head"><strong>${escapeHtml(b.product || 'حملة بدون اسم')}</strong>${getProjectBadge(b.projectId)}<small>${formatShortDate(new Date(b.createdAt || Date.now()))}</small></div>
        <div class="vault-card-body">الجمهور: ${escapeHtml(b.audience || '—')}\nالمشكلة: ${escapeHtml(b.problem || '—')}\nالوعد: ${escapeHtml(b.promise || '—')}\nCTA: ${escapeHtml(b.cta || '—')}</div>
        <div class="vault-card-actions">
          <button type="button" class="button ghost small-button" onclick="copyVaultItem('brief', ${i})">نسخ النص</button>
          <button type="button" class="button ghost danger-button small-button" onclick="deleteVaultItem('brief', ${i})">حذف</button>
        </div>
      </div>
    `).join('');
  } else if (activeVaultTab === 'matrices') {
    if (!matrices.length) { list.innerHTML = '<div class="vault-empty">مفيش مصفوفات محفوظة بعد. افتح Creative Matrix واحفظ أول تركيبة.</div>'; return; }
    list.innerHTML = matrices.map((m, i) => `
      <div class="vault-card">
        <div class="vault-card-head"><strong>مصفوفة #${arabicDigits(i + 1)}</strong>${getProjectBadge(m.projectId)}<small>${formatShortDate(new Date(m.createdAt || Date.now()))}</small></div>
        <div class="vault-card-body">${escapeHtml(m.audience)} × ${escapeHtml(m.problem)} × ${escapeHtml(m.angle)} × ${escapeHtml(m.format)}</div>
        <div class="vault-card-actions">
          <button type="button" class="button ghost small-button" onclick="copyVaultItem('matrix', ${i})">نسخ</button>
          <button type="button" class="button ghost danger-button small-button" onclick="deleteVaultItem('matrix', ${i})">حذف</button>
        </div>
      </div>
    `).join('');
  } else if (activeVaultTab === 'storyboards') {
    if (!storyboards.length) { list.innerHTML = '<div class="vault-empty">مفيش Storyboards محفوظة بعد.</div>'; return; }
    list.innerHTML = storyboards.map((s, i) => `
      <div class="vault-card">
        <div class="vault-card-head"><strong>لوحة #${arabicDigits(i + 1)}</strong>${getProjectBadge(s.projectId)}<small>${formatShortDate(new Date(s.createdAt || Date.now()))}</small></div>
        <div class="vault-card-body">١. ${escapeHtml(s.scene1 || '')}\n٢. ${escapeHtml(s.scene2 || '')}\n٣. ${escapeHtml(s.scene3 || '')}</div>
        <div class="vault-card-actions">
          <button type="button" class="button ghost small-button" onclick="copyVaultItem('storyboard', ${i})">نسخ</button>
          <button type="button" class="button ghost danger-button small-button" onclick="deleteVaultItem('storyboard', ${i})">حذف</button>
        </div>
      </div>
    `).join('');
  } else if (activeVaultTab === 'metrics') {
    if (!metrics.length) { list.innerHTML = '<div class="vault-empty">مفيش حسابات حملات محفوظة بعد.</div>'; return; }
    list.innerHTML = metrics.map((met, i) => `
      <div class="vault-card">
        <div class="vault-card-head"><strong>حسبة أداء #${arabicDigits(i + 1)}</strong><small>${formatShortDate(new Date(met.createdAt || Date.now()))}</small></div>
        <div class="vault-card-body">إنفاق: ${met.spend}ج | إيراد: ${met.revenue}ج\nCTR: ${Number(met.ctr).toFixed(2)}% | CPC: ${Number(met.cpc).toFixed(2)} | CPA: ${Number(met.cpa).toFixed(2)} | ROAS: ${Number(met.roas).toFixed(2)}×</div>
        <div class="vault-card-actions">
          <button type="button" class="button ghost small-button" onclick="copyVaultItem('metric', ${i})">نسخ</button>
          <button type="button" class="button ghost danger-button small-button" onclick="deleteVaultItem('metric', ${i})">حذف</button>
        </div>
      </div>
    `).join('');
  }
}

window.copyVaultItem = function(type, index) {
  let text = '';
  if (type === 'brief') {
    const b = state.marketing.briefs[index];
    if (b) text = `Campaign Brief:\nالمنتج: ${b.product}\nالجمهور: ${b.audience}\nالمشكلة: ${b.problem}\nالوعد: ${b.promise}\nالدليل: ${b.proof}\nCTA: ${b.cta}`;
  } else if (type === 'matrix') {
    const m = state.marketing.matrices[index];
    if (m) text = `Creative Matrix: ${m.audience} × ${m.problem} × ${m.angle} × ${m.format}`;
  } else if (type === 'storyboard') {
    const s = state.marketing.storyboards[index];
    if (s) text = `Storyboard:\n1: ${s.scene1}\n2: ${s.scene2}\n3: ${s.scene3}`;
  } else if (type === 'metric') {
    const met = state.marketing.metrics[index];
    if (met) text = `Campaign Metrics:\nSpend: ${met.spend}, Revenue: ${met.revenue}, CTR: ${Number(met.ctr).toFixed(2)}%, ROAS: ${Number(met.roas).toFixed(2)}x`;
  }
  if (text && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('اتنسخ المحتوى', 'جاهز للصق في أي مكان.', 'success')).catch(() => {});
  }
};

window.deleteVaultItem = function(type, index) {
  if (type === 'brief') state.marketing.briefs.splice(index, 1);
  else if (type === 'matrix') state.marketing.matrices.splice(index, 1);
  else if (type === 'storyboard') state.marketing.storyboards.splice(index, 1);
  else if (type === 'metric') state.marketing.metrics.splice(index, 1);
  saveState();
  renderVaultModalContent();
  renderStudioVaultCount();
  showToast('اتحذفت المسودة', '', 'normal');
};

function showConnectors() {
  if (state.settings.strictOffline) { showToast('الوضع الصارم مفعّل', 'الموصلات الاختيارية مخفية. كل وظائف وِنس الأساسية تعمل محليًا.', 'success'); return; }
  const existing = $('#connectorModal'); if (existing) { existing.showModal(); return; }
  const modal = document.createElement('dialog'); modal.id = 'connectorModal'; modal.className = 'modal';
  modal.innerHTML = `<form method="dialog" class="modal-card connector-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>موصلات اختيارية</span><h2>وِنس يشتغل لوحده أولًا</h2><p>تقدر تفتح Prompt جاهز أو توصل أداة موجودة عندك. لا تثبيت ولا تسجيل دخول من داخل وِنس.</p><div class="connector-option"><span class="connector-icon">⌁</span><div><strong>Copy Prompt</strong><small>متاح دائمًا · بدون اتصال</small></div><button class="button secondary small-button" type="button" data-connector="copy">نسخ</button></div><div class="connector-option"><span class="connector-icon">⌘</span><div><strong>Codex CLI</strong><small>فحص محلي من نسخة Desktop فقط</small></div><span class="connector-status" id="codexConnectorStatus">غير متاح في وضع الويب</span></div><div class="connector-option"><span class="connector-icon">✧</span><div><strong>Antigravity CLI</strong><small>فحص محلي من نسخة Desktop فقط</small></div><span class="connector-status" id="antigravityConnectorStatus">غير متاح في وضع الويب</span></div><div class="connector-safety"><span>▣</span><span>كل طلب سيعرض الملفات والصلاحيات قبل التشغيل، والنتيجة تدخل مراجعة قبل الاستيراد.</span></div><div class="modal-actions"><button class="button ghost" type="button" data-connector="stage">حضّر طلبًا للمراجعة</button><button class="button primary" value="default">تمام</button></div></form>`;
  document.body.appendChild(modal); modal.showModal();
  detectConnectorStatuses(modal);
  modal.addEventListener('click', (event) => {
    if (event.target.dataset.connector === 'copy') {
      navigator.clipboard?.writeText('اكتب طلبك هنا مع ملخص المشروع والملفات المختارة فقط.').catch(() => {});
      showToast('Prompt جاهز', 'اتنسخ النص الأساسي — تقدر تلصقه في أي أداة.', 'success');
    }
    if (event.target.dataset.connector === 'stage') { modal.close(); openConnectorStage(); }
  });
}

function openConnectorStage() {
  ensureToolModal('connectorStageModal', `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>تحضير آمن</span><h2>جهّز الطلب قبل ما يخرج</h2><p>اكتب المطلوب وحدد الملفات بالاسم فقط. لا شيء يتشغل من هنا.</p><div class="tool-form-grid"><label><span>الأداة المقصودة</span><select class="text-input" name="connector"><option value="codex">Codex CLI</option><option value="antigravity">Antigravity CLI</option></select></label><label class="wide"><span>مجلد المشروع (اختياري لـCopy Prompt، مطلوب للتشغيل)</span><input class="text-input" name="workingDir" placeholder="مثلاً: C:\\Projects\\my-campaign" /></label><label class="wide"><span>الطلب</span><textarea class="text-area" name="prompt" placeholder="مثلاً: راجع صياغة الـBrief واقترح ٣ نسخ…" required></textarea></label><label class="wide"><span>الملفات المسموح بها (أسماء فقط)</span><input class="text-input" name="files" placeholder="مثلاً: PRODUCT.md, campaign-brief.txt" /></label><label><span>مهلة التشغيل (ثواني)</span><input class="text-input" type="number" name="timeoutSeconds" min="1" max="900" value="120" /></label></div><div class="connector-safety"><span>▣</span><span>سيتم حفظ المسودة محليًا ومعاينتها قبل أي تشغيل. لا قراءة ملفات تلقائية.</span></div><div class="modal-actions"><button class="button ghost" value="cancel">إلغاء</button><button class="button primary" value="default">اعرض المعاينة</button></div></form>`, (modal) => {
    const data = Object.fromEntries(new FormData(modal.querySelector('form')).entries());
    const staged = { id: crypto.randomUUID?.() || String(Date.now()), connector: data.connector, workingDir: data.workingDir.trim(), prompt: data.prompt.trim(), files: data.files.split(',').map((file) => file.trim()).filter(Boolean), timeoutMs: Math.min(900, Math.max(1, Number(data.timeoutSeconds) || 120)) * 1000, createdAt: new Date().toISOString(), status: 'staged' };
    state.connectors.staged.unshift(staged); saveState(); showConnectorPreview(staged);
  });
}

function showConnectorPreview(staged) {
  const id = 'connectorPreviewModal'; let modal = document.getElementById(id); if (!modal) { modal = document.createElement('dialog'); modal.id = id; modal.className = 'modal'; document.body.appendChild(modal); }
  const safePayload = JSON.stringify({ connector: staged.connector, workingDir: staged.workingDir || null, prompt: staged.prompt, files: staged.files, timeoutMs: staged.timeoutMs, permissions: 'read-only until explicit approval' }, null, 2);
  modal.innerHTML = `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>مراجعة قبل التشغيل</span><h2>المسودة جاهزة</h2><p>راجع الطلب والمجلد والملفات. لا شيء سيُقرأ أو يُشغّل قبل موافقتك الصريحة.</p><pre class="payload-preview">${escapeHtml(safePayload)}</pre><div class="connector-safety"><span>▣</span><span>التشغيل قراءة فقط، بمهلة محددة، والنتيجة ستدخل معاينة منفصلة قبل الاستيراد.</span></div><div class="modal-actions"><button class="button ghost" type="button" data-preview-action="copy">انسخ الـpayload</button><button class="button ghost danger-button" type="button" data-preview-action="reject">رفض</button><button class="button primary" type="button" data-preview-action="run">أوافق وأشغّل</button></div></form>`;
  modal.showModal();
  modal.querySelector('[data-preview-action="copy"]').addEventListener('click', () => { navigator.clipboard?.writeText(safePayload).catch(() => {}); showToast('اتنسخت المعاينة', 'تقدر تراجعها أو تشغلها يدويًا في الأداة.', 'success'); });
  modal.querySelector('[data-preview-action="reject"]').addEventListener('click', () => { staged.status = 'rejected'; staged.updatedAt = new Date().toISOString(); saveState(); modal.close(); showToast('الطلب اترفض', 'المسودة فضلت محفوظة محليًا من غير تشغيل.', 'success'); });
  modal.querySelector('[data-preview-action="run"]').addEventListener('click', () => runStagedConnector(staged));
}

async function runStagedConnector(staged) {
  if (state.settings.strictOffline) { showToast('الوضع الصارم مفعّل', 'التشغيل الخارجي متوقف. استخدم Copy Prompt فقط.', 'error'); return; }
  const invoke = tauriInvoke();
  if (!invoke) { showToast('التشغيل متاح في نسخة Desktop', 'النسخة الويب تحضر الطلب وتنسخه فقط.', 'error'); return; }
  if (!staged.workingDir) { showToast('حدد مجلد المشروع أولًا', 'اكتب مسار المجلد في شاشة التحضير ثم راجع المعاينة.', 'error'); return; }
  const preview = $('#connectorPreviewModal'); if (preview?.open) preview.close();
  const runId = staged.id || (crypto.randomUUID?.() || String(Date.now())); staged.id = runId; staged.status = 'running'; staged.startedAt = new Date().toISOString(); saveState();
  const runModal = ensureToolModal('connectorRunModal', `<form method="dialog" class="modal-card tool-modal"><span class="eyebrow"><span class="eyebrow-line"></span>تشغيل محلي</span><h2>وِنس مستني النتيجة</h2><p id="connectorRunStatus">الأداة شغالة بقراءة فقط. تقدر تلغيها في أي وقت.</p><div class="connector-progress" aria-hidden="true"><span></span></div><div class="modal-actions"><button class="button ghost" type="button" data-run-action="cancel">إلغاء التشغيل</button></div></form>`, () => {});
  let cancelled = false;
  runModal.querySelector('[data-run-action="cancel"]').onclick = async () => { cancelled = true; try { await invoke('connector_cancel', { runId }); } catch {} const label = $('#connectorRunStatus'); if (label) label.textContent = 'جاري إلغاء التشغيل…'; };
  try {
    const result = await invoke('connector_run', { runId, connector: staged.connector, prompt: staged.prompt, workingDir: staged.workingDir, files: staged.files, timeoutMs: staged.timeoutMs || 120000 });
    staged.status = result?.status || (cancelled ? 'cancelled' : 'completed'); staged.result = result; staged.updatedAt = new Date().toISOString(); state.connectors.results = [result, ...(state.connectors.results || []).filter((item) => item?.run_id !== runId)]; saveState();
    if (runModal.open) runModal.close(); showConnectorResult(staged, result);
  } catch (error) {
    staged.status = cancelled ? 'cancelled' : 'error'; staged.error = String(error?.message || error); staged.updatedAt = new Date().toISOString(); saveState(); if (runModal.open) runModal.close(); showToast('التشغيل ما كملش', staged.error, 'error');
  }
}

function showConnectorResult(staged, result) {
  const id = 'connectorResultModal'; let modal = document.getElementById(id); if (!modal) { modal = document.createElement('dialog'); modal.id = id; modal.className = 'modal'; document.body.appendChild(modal); }
  const output = [result?.stdout, result?.stderr ? `stderr:\n${result.stderr}` : ''].filter(Boolean).join('\n\n').trim() || 'الأداة لم تُرجع نصًا.';
  const isSuccess = result?.status === 'completed' && (result?.exit_code === null || result?.exit_code === 0);
  modal.innerHTML = `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>نتيجة على الطاولة</span><h2>${isSuccess ? 'النتيجة جاهزة للمراجعة' : 'التشغيل انتهى بملاحظة'}</h2><p>لا يوجد تعديل مباشر على ملفاتك. راجع النص قبل اعتماد أي جزء داخل وِنس.</p><div class="connector-diff"><span>Diff / اقتراح نصي فقط</span><pre class="payload-preview">${escapeHtml(output)}</pre></div><div class="connector-safety"><span>▣</span><span>اعتماد النتيجة يحفظها كسجل مستورد فقط؛ لا ينفذ تغييرات على المجلد.</span></div><div class="modal-actions"><button class="button ghost" type="button" data-result-action="reject">رفض النتيجة</button><button class="button primary" type="button" data-result-action="import">اعتماد كسجل</button></div></form>`;
  modal.showModal();
  modal.querySelector('[data-result-action="reject"]').onclick = () => { staged.status = 'rejected-result'; staged.updatedAt = new Date().toISOString(); saveState(); modal.close(); showToast('النتيجة اترفضت', 'فضلت خارج بيانات وِنس.', 'success'); };
  modal.querySelector('[data-result-action="import"]').onclick = () => { const imported = { id: staged.id, connector: staged.connector, prompt: staged.prompt, output, importedAt: new Date().toISOString(), sourceStatus: result?.status || 'unknown' }; state.connectors.imported = [imported, ...(state.connectors.imported || [])]; staged.status = 'imported'; staged.importedAt = imported.importedAt; saveState(); modal.close(); showToast('النتيجة اتعتمدت', 'اتحفظت كسجل محلي للمراجعة، من غير تعديل ملفات.', 'success'); };
}

async function detectConnectorStatuses(modal) {
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke;
  if (!invoke) return;
  for (const [name, id] of [['codex', 'codexConnectorStatus'], ['antigravity', 'antigravityConnectorStatus']]) {
    try { const result = await invoke('connector_status', { connector: name }); const label = document.getElementById(id); if (label) label.textContent = result?.available ? `متاح · ${result.version || 'نسخة مثبتة'}` : 'غير مثبت'; }
    catch { const label = document.getElementById(id); if (label) label.textContent = 'تعذر الفحص'; }
  }
}

function ensureToolModal(id, markup, onSubmit) {
  let modal = document.getElementById(id);
  if (!modal) { modal = document.createElement('dialog'); modal.id = id; modal.className = 'modal'; modal.innerHTML = markup; document.body.appendChild(modal); }
  if (!modal.dataset.bound) { modal.dataset.bound = 'true'; modal.querySelector('form').addEventListener('submit', (event) => { event.preventDefault(); onSubmit(modal); modal.close(); }); }
  modal.showModal(); return modal;
}

function openBriefTool() {
  const briefOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('');
  ensureToolModal('briefToolModal', `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>Campaign Brief</span><h2>خلّي الحملة واضحة قبل ما تبقى كبيرة</h2><p>ستة أسئلة قصيرة. احفظها محليًا وارجع لها وقت التنفيذ.</p><div class="tool-form-grid"><label><span>المشروع</span><select name="projectId" class="text-input">${briefOptions}</select></label><label><span>المنتج</span><input name="product" class="text-input" placeholder="إيه اللي بتبيعه؟" required /></label><label><span>الجمهور</span><input name="audience" class="text-input" placeholder="مين الشخص ده؟" required /></label><label class="wide"><span>المشكلة</span><textarea name="problem" class="text-area" placeholder="إيه اللي مضايقه الآن؟" required></textarea></label><label class="wide"><span>الوعد</span><textarea name="promise" class="text-area" placeholder="إيه النتيجة اللي هتوصل لها؟" required></textarea></label><label><span>الدليل</span><input name="proof" class="text-input" placeholder="تجربة، رقم، شهادة…" /></label><label><span>CTA</span><input name="cta" class="text-input" placeholder="إيه الخطوة المطلوبة؟" /></label></div><div class="modal-actions"><button class="button ghost" value="cancel">لاحقًا</button><button class="button primary" value="default">احفظ الـBrief</button></div></form>`, (modal) => {
    const data = Object.fromEntries(new FormData(modal.querySelector('form')).entries());
    state.marketing.briefs.push({ ...data, createdAt: new Date().toISOString() });
    saveState();
    renderStudioVaultCount();
    showToast('الـBrief اتحفظ', 'بقى عندك هيكل واضح تقدر تبني عليه الحملة وموجود في مسوداتك.', 'success');
  });
}

function openMatrixTool() {
  const matrixOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('');
  const modal = ensureToolModal('matrixToolModal', `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>Creative Matrix</span><h2>اخلط العناصر وشوف تمرينك</h2><p>التركيبة قاعدة محلية بسيطة، والقرار الإبداعي يفضل عندك.</p><div class="tool-form-grid"><label><span>المشروع</span><select name="projectId" class="text-input">${matrixOptions}</select></label><label><span>الجمهور</span><select name="audience" class="text-input"><option>عميل مستعجل</option><option>عميل متردد</option><option>مبتدئ تمامًا</option><option>خبير يبحث عن فرق</option></select></label><label><span>المشكلة</span><select name="problem" class="text-input"><option>ضياع الوقت</option><option>الخوف من الخسارة</option><option>الحيرة بين البدائل</option><option>نتيجة لا تستمر</option></select></label><label><span>الزاوية</span><select name="angle" class="text-input"><option>قبل / بعد</option><option>تجنب الخسارة</option><option>كسر اعتقاد</option><option>قصة عميل</option></select></label><label><span>الصيغة</span><select name="format" class="text-input"><option>فيديو 15 ثانية</option><option>منشور Carousel</option><option>صفحة هبوط</option><option>رسالة قصيرة</option></select></label></div><div class="matrix-result"><span class="section-label">التركيبة المقترحة</span><strong id="matrixPreview">عميل مستعجل × ضياع الوقت × قبل / بعد × فيديو 15 ثانية</strong></div><div class="modal-actions"><button class="button ghost" value="cancel">مش دلوقتي</button><button class="button primary" value="default">احفظ التمرين</button></div></form>`, (toolModal) => {
    const data = Object.fromEntries(new FormData(toolModal.querySelector('form')).entries());
    state.marketing.matrices.push({ ...data, createdAt: new Date().toISOString() });
    saveState();
    renderStudioVaultCount();
    showToast('التمرين اتحفظ', 'ابدأ بالتركيبة دي كمسودة، وتقدر ترجع لها من المسودات المحفوظة.', 'success');
  });
  const form = modal.querySelector('form'); const update = () => { const values = Object.fromEntries(new FormData(form).entries()); const preview = modal.querySelector('#matrixPreview'); if (preview) preview.textContent = `${values.audience} × ${values.problem} × ${values.angle} × ${values.format}`; }; form.querySelectorAll('select').forEach((select) => select.onchange = update); update();
}

function openStoryboardTool() {
  const storyOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('');
  ensureToolModal('storyboardToolModal', `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>Storyboard</span><h2>ثلاث لقطات تكفي كبداية</h2><p>اكتب الحركة والكلمة الأساسية لكل لقطة، بدون ما تستنى الكمال.</p><div class="storyboard-grid"><label><span>المشروع</span><select name="projectId" class="text-input">${storyOptions}</select></label><label><strong>01</strong><span>اللقطة الأولى</span><input name="scene1" class="text-input" placeholder="ماذا نرى؟" required /></label><label><strong>02</strong><span>اللقطة الثانية</span><input name="scene2" class="text-input" placeholder="ما الحركة أو التحول؟" required /></label><label><strong>03</strong><span>اللقطة الثالثة</span><input name="scene3" class="text-input" placeholder="ما الـCTA؟" required /></label></div><div class="modal-actions"><button class="button ghost" value="cancel">لاحقًا</button><button class="button primary" value="default">احفظ اللوحة</button></div></form>`, (modal) => {
    const data = Object.fromEntries(new FormData(modal.querySelector('form')).entries());
    state.marketing.storyboards.push({ ...data, createdAt: new Date().toISOString() });
    saveState();
    renderStudioVaultCount();
    showToast('اللوحة اتحفظت', 'ثلاث لقطات واضحة أحسن من فكرة معلقة.', 'success');
  });
}

function openMetricsTool() {
  const modal = ensureToolModal('metricsToolModal', `<form method="dialog" class="modal-card tool-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>Campaign Metrics</span><h2>الأرقام تساعدك تشوف الصورة</h2><p>أدخل أرقام الحملة كما هي. الحسابات تتم محليًا ولا تُرسل لأي مكان.</p><div class="tool-form-grid metrics-inputs"><label><span>الإنفاق</span><input name="spend" class="text-input" type="number" min="0" step="0.01" value="1000" /></label><label><span>الإيراد</span><input name="revenue" class="text-input" type="number" min="0" step="0.01" value="2500" /></label><label><span>مرات الظهور</span><input name="impressions" class="text-input" type="number" min="0" step="1" value="10000" /></label><label><span>النقرات</span><input name="clicks" class="text-input" type="number" min="0" step="1" value="250" /></label><label><span>التحويلات</span><input name="conversions" class="text-input" type="number" min="0" step="1" value="25" /></label></div><div class="metrics-result" id="metricsPreview"><div><span>CTR</span><strong>—</strong></div><div><span>CPC</span><strong>—</strong></div><div><span>CPA</span><strong>—</strong></div><div><span>ROAS</span><strong>—</strong></div></div><div class="modal-actions"><button class="button ghost" value="cancel">مش دلوقتي</button><button class="button primary" value="default">احفظ الأرقام</button></div></form>`, (toolModal) => {
    const data = Object.fromEntries(new FormData(toolModal.querySelector('form')).entries());
    const values = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value) || 0]));
    const calculated = calculateMetrics(values);
    state.marketing.metrics.push({ ...values, ...calculated, createdAt: new Date().toISOString() });
    saveState();
    renderStudioVaultCount();
    showToast('الأرقام اتحفظت', 'بقى عندك خط أساس تقارن به الجولة الجاية ومسجل في مسوداتك.', 'success');
  });
  const form = modal.querySelector('form'); const update = () => { const values = Object.fromEntries(new FormData(form).entries()); const calculated = calculateMetrics(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value) || 0]))); const labels = [['ctr', `${calculated.ctr.toFixed(2)}%`], ['cpc', calculated.cpc.toFixed(2)], ['cpa', calculated.cpa.toFixed(2)], ['roas', `${calculated.roas.toFixed(2)}×`]]; const preview = modal.querySelector('#metricsPreview'); if (preview) preview.innerHTML = labels.map(([label, value]) => `<div><span>${label.toUpperCase()}</span><strong>${value}</strong></div>`).join(''); };
  form.querySelectorAll('input').forEach((input) => input.oninput = update); update();
}

function calculateMetrics({ spend = 0, revenue = 0, impressions = 0, clicks = 0, conversions = 0 }) {
  return { ctr: impressions > 0 ? clicks / impressions * 100 : 0, cpc: clicks > 0 ? spend / clicks : 0, cpa: conversions > 0 ? spend / conversions : 0, roas: spend > 0 ? revenue / spend : 0 };
}

function openMonthlyPrayer() {
  const now = new Date();
  const year = now.getFullYear(); const month = now.getMonth();
  const rows = [];
  const days = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month, day); const times = calculatePrayerTimes(date, Number(state.settings.latitude) || 30.0444, Number(state.settings.longitude) || 31.2357, getConfiguredTimezoneOffset(date), state.settings.calcMethod);
    times[0].setMinutes(times[0].getMinutes() + (Number(state.settings.fajrOffset) || 0));
    times[4].setMinutes(times[4].getMinutes() + (Number(state.settings.maghribOffset) || 0));
    times[5].setMinutes(times[5].getMinutes() + (Number(state.settings.ishaOffset) || 0));
    const labels = times.map((time) => formatTime(time));
    rows.push(`<tr class="${day === now.getDate() ? 'current' : ''}"><td>${arabicDigits(day)} ${new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(date)}</td>${labels.map((label) => `<td>${label}</td>`).join('')}</tr>`);
  }
  const id = 'monthlyPrayerModal'; let modal = document.getElementById(id);
  const monthLabel = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(now);
  const markup = `<form method="dialog" class="modal-card month-prayer-modal"><button class="modal-close" value="cancel" aria-label="إغلاق">×</button><span class="eyebrow"><span class="eyebrow-line"></span>تقويم محلي</span><h2>مواقيت ${escapeHtml(monthLabel)}</h2><p>كل الأيام محسوبة على جهازك بنفس الإحداثيات والتعديلات الحالية.</p><div class="month-table-wrap"><table class="month-table"><thead><tr><th>اليوم</th>${prayerNames.map(([name]) => `<th>${name}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div><div class="modal-actions"><button class="button primary" value="default">تم</button></div></form>`;
  if (!modal) { modal = document.createElement('dialog'); modal.id = id; modal.className = 'modal'; document.body.appendChild(modal); }
  modal.innerHTML = markup; modal.showModal();
}

function backupData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), schemaVersion: 1, state }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'wens-backup.json'; link.click(); URL.revokeObjectURL(url); showToast('النسخة الاحتياطية جاهزة', 'ملف محلي فقط — لا شيء اتبعت لأي جهة.', 'success');
}

function restoreData() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const payload = JSON.parse(await file.text()); const saved = payload?.state || payload;
      if (!saved || typeof saved !== 'object' || (!Array.isArray(saved.ideas) && !Array.isArray(saved.projects))) throw new Error('invalid backup');
      state = mergeState(saved);
      saveState();
      renderAllViews();
      refreshPrayerTimes();
      showToast('النسخة رجعت', 'بيانات وِنس اتقرأت محليًا واتحفظت على الجهاز.', 'success');
    } catch { showToast('ملف غير صالح', 'اختار ملف wens-backup.json صادر من وِنس.', 'error'); }
  }, { once: true });
  input.click();
}

function handleAction(action) {
  switch (action) {
    case 'quick-idea': openModal('quickIdeaModal'); window.setTimeout(() => $('#ideaTitle')?.focus(), 80); break;
    case 'focus': dismissCompanionPopup(); openModal('focusModal'); break;
    case 'start-focus': dismissCompanionPopup(); startFocus(); break;
    case 'pet': setPetMessage(['شايفك… نبدأ بخطوة صغيرة؟', 'أنا هنا، خدها واحدة واحدة.', 'فاضل ورقة واحدة ونرتّبها.'][Math.floor(Math.random() * 3)]); createPetBurst(); break;
    case 'settings': toggleNotificationPopover(false); enhanceSettingsUi(); openModal('settingsModal'); syncSettingsForm(); break;
    case 'context-update': prefillContextForm(); openModal('contextUpdateModal'); window.setTimeout(() => $('#contextUpdateForm input')?.focus(), 80); break;
    case 'weather-refresh': void refreshOnlineWeather({ force: true }); break;
    case 'location-search': void searchLocations(); break;
    case 'location-apply': applySelectedLocation(); break;
    case 'location-device': useDeviceLocation(); break;
    case 'backup': backupData(); break;
    case 'restore': restoreData(); break;
    case 'notifications': toggleNotificationPopover(); break;
    case 'dismiss-notifications': toggleNotificationPopover(false); break;
    case 'demo-popup': demoPopupExperience(); break;
    case 'demo-prayer-overlay': showPrayerOverlayDemo(); break;
    case 'dismiss-companion': dismissCompanionPopup(); break;
    case 'prayer-view': dismissCompanionPopup(); switchView('prayer'); break;
    case 'prayer-backlog': {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      switchView('missed');
      $('#prayerBacklogPanel')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      window.setTimeout(() => $('#prayerBacklogPanel')?.focus({ preventScroll: true }), reduced ? 0 : 260);
      break;
    }
    case 'hijri-settings': enhanceSettingsUi(); openModal('settingsModal'); syncSettingsForm(); window.setTimeout(() => $('#hijriOffset')?.focus(), 80); break;
    case 'enable-challenges': setChallengesEnabled(true); break;
    case 'random-challenge': generateRandomChallenge(); break;
    case 'toggle-challenge-developer': toggleChallengeDeveloperTools(); break;
    case 'fasting-view': dismissCompanionPopup(); switchView('fasting'); break;
    case 'new-project': startNewProject(); break;
    case 'creative-session': switchView('studio'); setPetMessage('افتح ورقة… أول جملة كفاية.'); showToast('جلسة أفكار', 'عندك ١٠ دقائق لخمسة اقتراحات بدون تقييم.'); break;
    case 'spin-angle': {
      const angles = ['قبل / بعد', 'تجنب الخسارة', 'قصة العميل', 'كسر اعتقاد', 'المقارنة الصادمة', 'السؤال المحرج', 'الدليل الاجتماعي', 'عكس المتوقع', 'التجربة الشخصية', 'الرقم المفاجئ', 'ماذا لو؟', 'التحدي المباشر', 'القصة القصيرة', 'السر المكشوف', 'الخطأ الشائع', 'المشكلة والحل', 'الشهادة الحية', 'التحول الدرامي', 'النتيجة أولاً', 'الوعد الجريء'];
      showToast('زاوية اليوم', angles[Math.floor(Math.random() * angles.length)] + ' — اكتب أول Hook.'); 
      break;
    }
    case 'month-prayer': openMonthlyPrayer(); break;
    case 'brief': openBriefTool(); break;
    case 'matrix': openMatrixTool(); break;
    case 'storyboard': openStoryboardTool(); break;
    case 'metrics': openMetricsTool(); break;
    case 'open-vault': openStudioVault('briefs'); break;
    case 'new-prompt': rotatePrompt(); break;
    case 'add-fast': addCustomFast(); break;
    case 'mark-fast': setTodayFasting('yes'); break;
    case 'city': $('#latitudeInput')?.focus(); break;
    case 'connectors': showConnectors(); break;
    case 'export-summary': exportDailySummary(); break;
    case 'open-athkar': openAthkar('morning'); break;
    case 'open-all-ideas': openAllIdeasModal(); break;
    case 'test-suhoor-alarm': {
      playChime('prayer');
      const suhoorAt = calculateSuhoorTimeForDate(new Date());
      const timeLabel = formatTime(suhoorAt, true);
      const alarm = state.fasting.suhoorAlarm;
      const detail = alarm?.mode === 'time'
        ? `الساعة ${timeLabel} حسب ضبطك`
        : `قبل الفجر بـ ${arabicDigits(alarm?.leadMinutes || 45)} دقيقة (${timeLabel})`;
      showToast('تجربة منبه السحور ☾', `صوت وتنبيه السحور يعمل بنجاح (${detail}).`, 'fasting');
      setPetMessage('وقت السحور ☾… الفجر قرب، تقبّل الله نيتك.');
      const testBtn = $('.test-suhoor-btn');
      if (testBtn) {
        testBtn.classList.add('playing');
        setTimeout(() => testBtn.classList.remove('playing'), 1500);
      }
      break;
    }
    default: break;
  }
}

document.addEventListener('click', (event) => {
  if (event.target.tagName === 'DIALOG' && event.target.open) { event.target.close(); return; }
  const popover = $('#notificationPopover'); if (popover && !popover.hidden && !event.target.closest('.topbar-actions')) toggleNotificationPopover(false);
  const viewTarget = event.target.closest('[data-view-target]');
  if (viewTarget) { switchView(viewTarget.dataset.viewTarget); return; }
  const nav = event.target.closest('.nav-item[data-view]');
  if (nav) { switchView(nav.dataset.view); return; }
  const deleteFastBtn = event.target.closest('[data-action="delete-custom-fast"]');
  if (deleteFastBtn) { deleteCustomFast(deleteFastBtn.dataset.date); return; }
  const fastChoiceBtn = event.target.closest('[data-fast-choice]');
  if (fastChoiceBtn) { setTodayFasting(fastChoiceBtn.dataset.fastChoice); return; }
  const action = event.target.closest('[data-action]');
  if (action) { handleAction(action.dataset.action); return; }
  const rolloverBtn = event.target.closest('#rolloverTasksBtn');
  if (rolloverBtn) { rolloverYesterdayTasks(); return; }
  const toggleSessionsBtn = event.target.closest('#toggleSessionsLogBtn');
  if (toggleSessionsBtn) {
    const list = $('#todaySessionsList');
    if (list) {
      list.hidden = !list.hidden;
      const count = (state.workSessions || []).filter((s) => localDateKey(new Date(s.endedAt || s.startedAt)) === localDateKey()).length;
      toggleSessionsBtn.innerHTML = `عرض السجل (<span id="sessionsCountLabel">${arabicDigits(count)}</span>) <span>${list.hidden ? '▼' : '▲'}</span>`;
    }
    return;
  }
  const sessionDelete = event.target.closest('[data-session-delete]');
  if (sessionDelete) { deleteTodaySession(sessionDelete.dataset.sessionDelete); return; }
  const editProjectBtn = event.target.closest('[data-edit-project]');
  if (editProjectBtn) { openEditProjectModal(editProjectBtn.dataset.editProject); return; }
  const toggleProjStatus = event.target.closest('[data-toggle-project-status]');
  if (toggleProjStatus) { toggleProjectStatus(toggleProjStatus.dataset.toggleProjectStatus); return; }
  const convertIdeaBtn = event.target.closest('[data-convert-idea]');
  if (convertIdeaBtn) { convertIdeaToProject(convertIdeaBtn.dataset.convertIdea, convertIdeaBtn.dataset.convertTag); return; }
  const deleteIdeaBtn = event.target.closest('[data-delete-idea-id]');
  if (deleteIdeaBtn) { deleteIdea(deleteIdeaBtn.dataset.deleteIdeaId); return; }
  const athkarTab = event.target.closest('[data-athkar-tab]');
  if (athkarTab) { activeAthkarTab = athkarTab.dataset.athkarTab; renderAthkarModalContent(); return; }
  const themePill = event.target.closest('#themeAccentRow [data-theme-accent]');
  if (themePill) { applyThemeAccent(themePill.dataset.themeAccent); return; }
  const petAvatarPill = event.target.closest('#petAvatarRow [data-pet-avatar]');
  if (petAvatarPill) { applyPetAvatar(petAvatarPill.dataset.petAvatar); return; }
  const backlogAction = event.target.closest('[data-backlog-action]');
  if (backlogAction) {
    const id = backlogAction.getAttribute('data-backlog-id') || backlogAction.dataset.backlogId;
    const act = backlogAction.getAttribute('data-backlog-action') || backlogAction.dataset.backlogAction;
    if (id && act) { updatePrayerBacklogItem(id, act); return; }
  }
  const fastingBacklogAction = event.target.closest('[data-fasting-backlog-action]');
  if (fastingBacklogAction) {
    const id = fastingBacklogAction.getAttribute('data-fasting-backlog-id') || fastingBacklogAction.dataset.fastingBacklogId;
    const act = fastingBacklogAction.getAttribute('data-fasting-backlog-action') || fastingBacklogAction.dataset.fastingBacklogAction;
    if (id && act) { updateFastingBacklogItem(id, act); return; }
  }
  const prayerRecord = event.target.closest('[data-prayer-record]');
  if (prayerRecord) {
    const pDate = prayerRecord.getAttribute('data-prayer-date') || prayerRecord.dataset.prayerDate;
    const pRec = prayerRecord.getAttribute('data-prayer-record') || prayerRecord.dataset.prayerRecord;
    const pStat = prayerRecord.getAttribute('data-prayer-status') || prayerRecord.dataset.prayerStatus;
    if (pDate && pRec && pStat) { setPrayerStatusForDate(pDate, pRec, pStat); return; }
  }
  const adhkarGroup = event.target.closest('[data-adhkar-group]');
  if (adhkarGroup) {
    const grp = adhkarGroup.getAttribute('data-adhkar-group') || adhkarGroup.dataset.adhkarGroup;
    if (grp) { toggleAdhkarGroupSetting(grp); return; }
  }
  const adhkarComplete = event.target.closest('[data-adhkar-complete]');
  if (adhkarComplete) {
    const grp = adhkarComplete.getAttribute('data-adhkar-complete') || adhkarComplete.dataset.adhkarComplete;
    if (grp) { toggleAdhkarToday(grp); return; }
  }
  const challengeAction = event.target.closest('[data-challenge-action]');
  if (challengeAction) {
    const challengeId = challengeAction.getAttribute('data-challenge-id') || challengeAction.dataset.challengeId;
    const chAct = challengeAction.getAttribute('data-challenge-action') || challengeAction.dataset.challengeAction;
    if (challengeId && chAct) {
      if (chAct === 'join') joinChallenge(challengeId);
      if (chAct === 'progress') progressChallenge(challengeId);
      if (chAct === 'dismiss') dismissChallenge(challengeId);
      if (chAct === 'export') exportChallenge(challengeId);
      return;
    }
  }
  const worshipDay = event.target.closest('[data-week-date]');
  if (worshipDay) {
    const date = dateFromLocalKey(worshipDay.dataset.weekDate); const progress = date ? worshipDayProgress(date) : null; const occasions = date ? islamicOccasionsForDate(date) : [];
    if (date && progress) showToast(new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }).format(date), `${arabicDigits(progress.prayersDone)} من ٥ صلوات${progress.fastingPlanned ? progress.fastingDone ? ' · الصيام تم' : ' · الصيام لسه' : ''}${occasions.length ? ` · ${occasions.map((item) => item.title).join(' و')}` : ''}`, progress.complete ? 'success' : 'normal');
    return;
  }
  const duration = event.target.closest('[data-duration]');
  if (duration) { state.focusMinutes = Number(duration.dataset.duration); $$('.duration').forEach((button) => button.classList.toggle('active', button === duration)); const label = $('#focusDurationLabel'); if (label) label.textContent = arabicDigits(`${pad(state.focusMinutes)}:00`); }
  const prayerBtn = event.target.closest('.today-prayer-btn');
  if (prayerBtn) {
    const prayerName = prayerBtn.getAttribute('data-prayer-name') || prayerBtn.dataset.prayerName;
    if (prayerName) toggleTodayPrayer(prayerName);
    return;
  }
  const fastChoice = event.target.closest('[data-today-fast]');
  if (fastChoice) { setTodayFasting(fastChoice.dataset.todayFast); return; }
  const taskToggle = event.target.closest('[data-task-toggle]');
  if (taskToggle) {
    const id = taskToggle.getAttribute('data-task-toggle') || taskToggle.dataset.taskToggle;
    if (id) { toggleTodayTask(id); return; }
  }
  const taskDelete = event.target.closest('[data-task-delete]');
  if (taskDelete) {
    const id = taskDelete.getAttribute('data-task-delete') || taskDelete.dataset.taskDelete;
    if (id) { deleteTodayTask(id); return; }
  }
  const filterBtn = event.target.closest('.project-filter .filter');
  if (filterBtn) {
    projectFilter = filterBtn.dataset.filter || 'all';
    $$('.project-filter .filter').forEach((b) => b.classList.toggle('active', b === filterBtn));
    renderProjects();
    return;
  }
  const vaultTab = event.target.closest('.vault-tab');
  if (vaultTab) {
    activeVaultTab = vaultTab.dataset.vaultTab || 'briefs';
    renderVaultModalContent();
    return;
  }
});


$('#prayerBacklogList')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-backlog-action]');
  if (!btn) return;
  const id = btn.getAttribute('data-backlog-id') || btn.dataset.backlogId;
  const action = btn.getAttribute('data-backlog-action') || btn.dataset.backlogAction;
  if (id && action) {
    event.stopPropagation();
    updatePrayerBacklogItem(id, action);
  }
});

$('#fastingBacklogList')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-fasting-backlog-action]');
  if (!btn) return;
  const id = btn.getAttribute('data-fasting-backlog-id') || btn.dataset.fastingBacklogId;
  const action = btn.getAttribute('data-fasting-backlog-action') || btn.dataset.fastingBacklogAction;
  if (id && action) {
    event.stopPropagation();
    updateFastingBacklogItem(id, action);
  }
});

$('#prayerList')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-prayer-record]');
  if (!btn) return;
  const prayerDate = btn.getAttribute('data-prayer-date') || btn.dataset.prayerDate;
  const prayerName = btn.getAttribute('data-prayer-record') || btn.dataset.prayerRecord;
  const prayerStatus = btn.getAttribute('data-prayer-status') || btn.dataset.prayerStatus;
  if (prayerDate && prayerName && prayerStatus) {
    event.stopPropagation();
    setPrayerStatusForDate(prayerDate, prayerName, prayerStatus);
  }
});

$('#adhkarTodayChecklist')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-adhkar-complete]');
  if (!btn) return;
  const group = btn.getAttribute('data-adhkar-complete') || btn.dataset.adhkarComplete;
  if (group) {
    event.stopPropagation();
    toggleAdhkarToday(group);
  }
});

const handleChallengeListClick = (event) => {
  const btn = event.target.closest('[data-challenge-action]');
  if (!btn) return;
  const challengeId = btn.getAttribute('data-challenge-id') || btn.dataset.challengeId;
  const action = btn.getAttribute('data-challenge-action') || btn.dataset.challengeAction;
  if (!challengeId || !action) return;
  event.stopPropagation();
  if (action === 'join') joinChallenge(challengeId);
  if (action === 'progress') progressChallenge(challengeId);
  if (action === 'dismiss') dismissChallenge(challengeId);
  if (action === 'export') exportChallenge(challengeId);
};
$('#activeChallengeList')?.addEventListener('click', handleChallengeListClick);
$('#challengeCatalog')?.addEventListener('click', handleChallengeListClick);

$('#todayTasksList')?.addEventListener('click', (event) => {
  const toggleBtn = event.target.closest('[data-task-toggle]');
  if (toggleBtn) {
    const id = toggleBtn.getAttribute('data-task-toggle') || toggleBtn.dataset.taskToggle;
    if (id) {
      event.stopPropagation();
      toggleTodayTask(id);
      return;
    }
  }
  const deleteBtn = event.target.closest('[data-task-delete]');
  if (deleteBtn) {
    const id = deleteBtn.getAttribute('data-task-delete') || deleteBtn.dataset.taskDelete;
    if (id) {
      event.stopPropagation();
      deleteTodayTask(id);
      return;
    }
  }
});

$('#todaySessionsList')?.addEventListener('click', (event) => {
  const deleteBtn = event.target.closest('[data-session-delete]');
  if (deleteBtn) {
    const id = deleteBtn.getAttribute('data-session-delete') || deleteBtn.dataset.sessionDelete;
    if (id) {
      event.stopPropagation();
      deleteTodaySession(id);
    }
  }
});

$('#ideaForm')?.addEventListener('submit', addIdeaFromForm);
$('#settingsForm')?.addEventListener('submit', applySettings);
$('#contextUpdateForm')?.addEventListener('submit', saveLocalContext);
$('#newProjectForm')?.addEventListener('submit', handleNewProjectSubmit);
$('#fastDateInputModal form')?.addEventListener('submit', handleCustomFastSubmit);
$('#todayTaskAddBtn')?.addEventListener('click', addTodayTask);
$('#todayTaskInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTodayTask(); } });
$('#todayWorkNoteSaveBtn')?.addEventListener('click', saveTodayWorkNote);
$('#todayWorkNoteInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveTodayWorkNote(); } });
$('#todayTimerToggle')?.addEventListener('click', toggleTodayTimer);
$('#todayTimerFinish')?.addEventListener('click', finishTodayTimer);
$('#prayerBacklogForm')?.addEventListener('submit', addPrayerBacklog);
$('#autoPrayerBacklog')?.addEventListener('change', (event) => toggleAutomaticPrayerBacklog(event.currentTarget.checked));
$('#fastingBacklogForm')?.addEventListener('submit', addFastingBacklog);
$('#autoFastingBacklog')?.addEventListener('change', (event) => toggleAutomaticFastingBacklog(event.currentTarget.checked));
$('#quranEnabled')?.addEventListener('change', (event) => setDevotionEnabled('quran', event.currentTarget.checked));
$('#adhkarEnabled')?.addEventListener('change', (event) => setDevotionEnabled('adhkar', event.currentTarget.checked));
$('#quranTarget')?.addEventListener('change', (event) => { state.devotion.quranTarget = event.currentTarget.value; saveState(); syncNativeReminderPlan(); renderDevotion(); showToast('مقدار الورد اتغير', `وردك اليومي: ${QURAN_TARGET_LABELS[state.devotion.quranTarget]}.`); });
$('#quranCompleteButton')?.addEventListener('click', toggleQuranToday);
$('#challengeBuilderForm')?.addEventListener('submit', publishChallengeFromForm);
$('#challengeImportInput')?.addEventListener('change', importChallengeFile);
$('#personalChallengeForm')?.addEventListener('submit', createPersonalChallenge);
$('#challengesEnabled')?.addEventListener('change', (event) => setChallengesEnabled(event.currentTarget.checked));
$('#challengeRandomAuto')?.addEventListener('change', (event) => setRandomChallengeAuto(event.currentTarget.checked));
$$('input[name="randomSource"]').forEach((input) => input.addEventListener('change', (event) => { if (event.currentTarget.checked) setRandomChallengeSource(event.currentTarget.value); }));
$('#locationSearchInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void searchLocations(); } });
$('#editProjectForm')?.addEventListener('submit', handleEditProjectSubmit);
$('#deleteProjectBtn')?.addEventListener('click', () => {
  const id = $('#editProjectId')?.value;
  if (id) deleteProject(id);
});
$('#editProjectProgress')?.addEventListener('input', (e) => {
  const val = e.currentTarget.value;
  const label = $('#editProjectProgressVal');
  if (label) label.textContent = `${arabicDigits(val)}٪`;
});
$('#allIdeasSearchInput')?.addEventListener('input', (e) => {
  allIdeasSearchQuery = e.currentTarget.value;
  renderAllIdeasModalContent();
});

$$('[data-setting]').forEach((input) => {
  input.checked = Boolean(state.settings[input.dataset.setting]);
  input.addEventListener('change', () => {
    state.settings[input.dataset.setting] = input.checked;
    saveState();
    syncNativeReminderPlan();
    if (input.dataset.setting === 'bubbles' && !input.checked) $('#petBubble').style.display = 'none';
    else if (input.dataset.setting === 'bubbles') $('#petBubble').style.display = '';
    if (input.dataset.setting === 'petVisible') {
      if ($('#petWrap')) $('#petWrap').style.display = input.checked ? '' : 'none';
      syncPetWindowVisibility(input.checked);
      updateSettingsAvatarPreview();
    }
    if (input.dataset.setting === 'livelyPopups' && !input.checked) dismissCompanionPopup();
    if (input.dataset.setting === 'strictOffline' || input.dataset.setting === 'weatherAuto') {
      startWeatherUpdates();
      renderLocalContext();
    }
    showToast('اتحفظ الإعداد', input.dataset.setting === 'petVisible' ? (input.checked ? 'الرفيق العائم ظهر فوق سطح المكتب.' : 'تقدر ترجّعه من الإعدادات أو أيقونة وِنس بجوار الساعة.') : 'كل التغييرات محلية على جهازك.');
  });
});

$('#settingsQuickPetVisibleBtn')?.addEventListener('click', () => {
  state.settings.petVisible = true;
  const toggle = document.querySelector('[data-setting="petVisible"]');
  if (toggle) toggle.checked = true;
  if ($('#petWrap')) $('#petWrap').style.display = '';
  syncPetWindowVisibility(true);
  saveState();
  updateSettingsAvatarPreview();
  showToast('ظهر الرفيق العائم', 'الرفيق موجود الآن فوق سطح المكتب.');
});

$$('[data-fast-setting]').forEach((input) => {
  input.checked = Boolean(state.fasting[input.dataset.fastSetting]);
  input.addEventListener('change', () => {
    state.fasting[input.dataset.fastSetting] = input.checked;
    saveState();
    syncNativeReminderPlan();
    renderHijriAndFasting();
    renderDevotion();
    showToast('اتحفظ تفضيل الصيام', 'وِنس هيعرض التنبيهات المناسبة لاختياراتك.');
  });
});

const suhoorMaster = $('#suhoorAlarmEnabled');
if (suhoorMaster) {
  suhoorMaster.addEventListener('change', () => {
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'time', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm.enabled = suhoorMaster.checked;
    saveState();
    syncNativeReminderPlan();
    syncSuhoorAlarmForm();
    renderHijriAndFasting();
    showToast('منبه السحور', suhoorMaster.checked ? 'تم تشغيل منبه السحور.' : 'تم إيقاف منبه السحور مؤقتًا.', 'fasting');
  });
}

$$('[data-suhoor-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'time', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm.mode = btn.dataset.suhoorMode;
    saveState();
    syncNativeReminderPlan();
    syncSuhoorAlarmForm();
    renderHijriAndFasting();
    showToast('طريقة وقت السحور', btn.dataset.suhoorMode === 'time' ? 'تم اختيار ضبط الوقت بالساعة المحددة.' : 'تم اختيار ضبط الوقت قبل الفجر بدقائق.', 'fasting');
  });
});

const suhoorTimeInput = $('#suhoorCustomTime');
if (suhoorTimeInput) {
  suhoorTimeInput.addEventListener('change', () => {
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'time', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm.customTime = suhoorTimeInput.value || '03:30';
    state.fasting.suhoorAlarm.mode = 'time';
    saveState();
    syncNativeReminderPlan();
    renderHijriAndFasting();
    const suhoorAt = calculateSuhoorTimeForDate(new Date());
    showToast('وقت السحور', `تم ضبط منبه السحور على الساعة ${formatTime(suhoorAt, true)}.`, 'fasting');
  });
}

const suhoorLead = $('#suhoorLeadMinutes');
if (suhoorLead) {
  suhoorLead.addEventListener('change', () => {
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'relative', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm.leadMinutes = Math.max(5, Math.min(180, parseInt(suhoorLead.value, 10) || 45));
    suhoorLead.value = String(state.fasting.suhoorAlarm.leadMinutes);
    state.fasting.suhoorAlarm.mode = 'relative';
    saveState();
    syncNativeReminderPlan();
    renderHijriAndFasting();
    showToast('وقت منبه السحور', `سيتم التنبيه قبل الفجر بـ ${arabicDigits(state.fasting.suhoorAlarm.leadMinutes)} دقيقة.`, 'fasting');
  });
}

$$('[data-quick-lead]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.quickLead, 10) || 45;
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'relative', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm.leadMinutes = mins;
    state.fasting.suhoorAlarm.mode = 'relative';
    const leadEl = $('#suhoorLeadMinutes');
    if (leadEl) leadEl.value = String(mins);
    saveState();
    syncNativeReminderPlan();
    renderHijriAndFasting();
    showToast('وقت منبه السحور', `تم الضبط قبل الفجر بـ ${arabicDigits(mins)} دقيقة.`, 'fasting');
  });
});

$$('[data-suhoor-setting]').forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.suhoorSetting;
    state.fasting.suhoorAlarm ||= { enabled: true, mode: 'time', customTime: '03:30', leadMinutes: 45, ramadan: true, whiteDays: false, mondayThursday: false, custom: false };
    state.fasting.suhoorAlarm[key] = input.checked;
    if (input.checked && key in state.fasting && !state.fasting[key]) {
      state.fasting[key] = true;
      const prefToggle = $(`[data-fast-setting="${key}"]`);
      if (prefToggle) prefToggle.checked = true;
    }
    saveState();
    syncNativeReminderPlan();
    syncSuhoorAlarmForm();
    renderHijriAndFasting();
    const labelMap = {
      ramadan: 'رمضان',
      whiteDays: 'الأيام البيض',
      mondayThursday: 'صيام الاثنين والخميس',
      custom: 'أيام الصيام المخصصة'
    };
    showToast('تخصيص منبه السحور', `${input.checked ? 'تم تفعيل' : 'تم تعطيل'} منبه السحور لـ ${labelMap[key] || key}.`, 'fasting');
  });
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
    event.preventDefault(); openModal('quickIdeaModal');
  }
  if (event.key === 'Escape') {
    document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
  }
});

// Immediate synchronous initial render so UI is NEVER blank or stalled
try {
  prayerTimes = prayerTimesForDate(new Date());
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  window.tomorrowPrayerTimes = prayerTimesForDate(tomorrow);
  sanitizeTodayFuturePrayers(new Date());
  renderAllViews();
  updateClock();
} catch (err) {
  console.error('Initial render failed:', err);
}

(async () => {
  try {
    refreshPrayerTimes();
  } catch (err) {
    console.error('refreshPrayerTimes failed:', err);
  }
  try {
    listenNativeReminders();
    syncNativeReminderPlan();
  } catch (err) {
    console.error('Native reminders setup failed:', err);
  }
  window.setInterval(updateClock, 1000);
  window.setInterval(() => { if (state.focusRunning || state.workTimer?.running) saveState(); }, 5000);
  hydrateDesktopStorage().finally(() => {
    startWeatherUpdates();
    
    const invoke = tauriInvoke();
    if (invoke) {
      const autostartToggle = $('#autostartToggle');
      if (autostartToggle) {
        invoke('autostart_is_enabled').then((enabled) => {
          autostartToggle.checked = enabled;
        }).catch(() => {});
        
        autostartToggle.addEventListener('change', () => {
          invoke('autostart_set', { enabled: autostartToggle.checked })
            .then(() => {
              showToast('التشغيل التلقائي', autostartToggle.checked ? 'تم تفعيل التشغيل مع بداية Windows.' : 'تم إيقاف التشغيل مع بداية Windows.', 'success');
            })
            .catch(() => {
              autostartToggle.checked = !autostartToggle.checked;
              showToast('تعذر تغيير الإعداد', 'رجاءً المحاولة لاحقاً.', 'error');
            });
        });
      }
    }
  });
  window.addEventListener('online', () => { if (state.settings.weatherAuto && !state.settings.strictOffline) void refreshOnlineWeather({ silent: true }); });
  window.addEventListener('offline', renderLocalContext);
})();
