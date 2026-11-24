/* وِنس floating companion — entirely local, with no API or network calls. */
const STORAGE_KEY = 'wens-local-v1';
const CHANNEL_NAME = 'wens-state';
const PET_POSITION_KEY = 'wens-pet-position-v1';
const PRAYER_NAMES = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const REQUIRED_PRAYER_INDEXES = [0, 2, 3, 4, 5];
const MAX_TRACKED_EVENTS = 200;

const defaultPetState = {
  settings: {
    petVisible: true,
    petAvatar: 'orb',
    petSize: 'normal',
    petRoaming: false,
    petInteractionSounds: undefined,
    petIdleFade: true,
    petIdleOpacity: 0.15,
    petIdleDelaySeconds: 2,
    petPopupSize: 'normal',
    petCursorEyes: true,
    themeId: 'midnight-magenta',
    accentId: 'amber',
    themeAccent: 'default',
    latitude: 30.0444,
    longitude: 31.2357,
    timeZone: 'Africa/Cairo',
    fajrOffset: 0,
    maghribOffset: 0,
    ishaOffset: 0,
    wuduLeadMinutes: 15,
    prePrayerLeads: [15],
    suhoorLeadMinutes: 45,
    calcMethod: 'egypt',
    asrHanafi: false,
    quietDefault: false,
    strictOffline: false,
    reducedMotion: false,
    notifications: {
      prePrayerEnabled: true,
      prayerAtTimeEnabled: true,
      fastingEnabled: false,
      focusCompletionEnabled: true,
      quietHours: null
    }
  },
  accountability: { days: {}, lastReminderAt: null },
  prayerBacklog: { autoTrack: true, trackingStartedAt: null, items: [] },
  localContext: {
    weather: { temperatureC: null, humidityPct: null, condition: '', updatedAt: null },
    economy: { usdEgp: null, gold21Egp: null, inflationPct: null, marketStatus: '', note: '', updatedAt: null },
    history: []
  },
  workTimer: { running: false, startedAt: null, accumulatedMs: 0 },
  workSessions: [],
  fasting: { today: false }
};

let state = loadState();
let petMode = 'idle';
let modeTimeout;
let toastTimeout;
let channel;
let idleFadeTimer = null;
let isCompanionHovered = false;
let tasbihActive = false;
let tasbihCount = 0;
let tasbihCycle = 0;
let lastRoamIntent = null;
let onMovedActive = false;
let eyeResetTimer = null;
let lastHydratedWorshipDate = '';
let petLoopTimer = null;
let blinkNextTimer = null;
let blinkClearTimer = null;
let lastNextPrayerRemainingMs = Number.POSITIVE_INFINITY;

const TASBIH_PHRASES = ['سبحان الله', 'الحمد لله', 'الله أكبر'];
const clockFormatter = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' });

function setTextIfChanged(el, value) {
  if (!el) return false;
  const next = String(value ?? '');
  if (el.textContent === next) return false;
  el.textContent = next;
  return true;
}

function setDisplayIfChanged(el, nextDisplay) {
  if (!el) return false;
  if (el.style.display === nextDisplay) return false;
  el.style.display = nextDisplay;
  return true;
}

function setHiddenIfChanged(el, hidden) {
  if (!el) return false;
  const want = Boolean(hidden);
  if (el.hidden === want) return false;
  el.hidden = want;
  return true;
}

function setDisabledIfChanged(el, disabled) {
  if (!el) return false;
  const want = Boolean(disabled);
  if (el.disabled === want) return false;
  el.disabled = want;
  return true;
}

function setClassIfChanged(el, cls, active) {
  if (!el) return false;
  const want = Boolean(active);
  if (el.classList.contains(cls) === want) return false;
  el.classList.toggle(cls, want);
  return true;
}

function setDatasetIfChanged(el, key, value) {
  if (!el) return false;
  const next = String(value ?? '');
  if (el.dataset[key] === next) return false;
  el.dataset[key] = next;
  return true;
}

function setExclusiveClass(el, groupClasses, activeClass) {
  if (!el) return false;
  let changed = false;
  for (const cls of groupClasses) {
    if (cls !== activeClass && el.classList.contains(cls)) {
      el.classList.remove(cls);
      changed = true;
    }
  }
  if (activeClass && !el.classList.contains(activeClass)) {
    el.classList.add(activeClass);
    changed = true;
  }
  return changed;
}

function isPetSoundsEnabled() {
  return state.settings?.petInteractionSounds !== false;
}

function isPetInactive() {
  return Boolean(document.hidden || state.settings?.petVisible === false);
}

function updateHiddenPauseClass() {
  setClassIfChanged(document.body, 'is-paused-hidden', isPetInactive());
}

function stopIdleBlinkLoop() {
  if (blinkNextTimer) {
    window.clearTimeout(blinkNextTimer);
    blinkNextTimer = null;
  }
  if (blinkClearTimer) {
    window.clearTimeout(blinkClearTimer);
    blinkClearTimer = null;
  }
  const dragSurface = $('#companionDragSurface');
  if (dragSurface && dragSurface.classList.contains('pet-blink-now')) {
    dragSurface.classList.remove('pet-blink-now');
  }
}

function shouldRunIdleBlink() {
  return (
    !isPetInactive() &&
    petMode === 'idle' &&
    !state.settings?.reducedMotion &&
    !document.body.classList.contains('is-critical-alarm')
  );
}

function scheduleNextIdleBlink() {
  if (!shouldRunIdleBlink()) {
    stopIdleBlinkLoop();
    return;
  }
  if (blinkNextTimer || blinkClearTimer) return;
  const cadenceMs = 6500 + Math.floor(Math.random() * 1500);
  blinkNextTimer = window.setTimeout(() => {
    blinkNextTimer = null;
    if (!shouldRunIdleBlink()) {
      stopIdleBlinkLoop();
      return;
    }
    const dragSurface = $('#companionDragSurface');
    if (dragSurface && !isCompanionHovered) {
      dragSurface.classList.add('pet-blink-now');
      blinkClearTimer = window.setTimeout(() => {
        blinkClearTimer = null;
        dragSurface.classList.remove('pet-blink-now');
        scheduleNextIdleBlink();
      }, 240);
    } else {
      scheduleNextIdleBlink();
    }
  }, cadenceMs);
}

function syncIdleBlinkState() {
  if (shouldRunIdleBlink()) {
    scheduleNextIdleBlink();
  } else {
    stopIdleBlinkLoop();
  }
}

function getPetRenderIntervalMs() {
  const activeMode = petMode !== 'idle';
  const hasActiveAlert =
    Boolean(activeReminder) || document.body.classList.contains('is-critical-alarm');
  const hasActiveWork = Boolean(state.workTimer?.running) || tasbihActive;
  const imminentPrayer =
    Number.isFinite(lastNextPrayerRemainingMs) && lastNextPrayerRemainingMs <= 60000;
  return activeMode || hasActiveAlert || hasActiveWork || imminentPrayer ? 1000 : 5000;
}

function schedulePetLoop() {
  if (petLoopTimer) {
    window.clearTimeout(petLoopTimer);
    petLoopTimer = null;
  }
  if (isPetInactive()) return;
  const delay = getPetRenderIntervalMs();
  petLoopTimer = window.setTimeout(() => {
    petLoopTimer = null;
    if (!isPetInactive()) {
      checkCompanionEventTick();
      render();
      schedulePetLoop();
    }
  }, delay);
}

function toggleTasbihMode() {
  tasbihActive = !tasbihActive;
  if (tasbihActive) {
    tasbihCount = 0;
    tasbihCycle = 0;
    showToast(`بدأنا التسبيح: ${TASBIH_PHRASES[tasbihCycle]} 📿`);
    if (window.playCompanionSound) {
      window.playCompanionSound(state.settings?.petAvatar || 'orb', 'tap', { enabled: isPetSoundsEnabled() });
    }
  } else {
    showToast('تم إنهاء التسبيح. تقبل الله طاعتك 🤍');
  }
  render();
  schedulePetLoop();
}

function handleTasbihClick() {
  if (!tasbihActive) return false;
  tasbihCount++;
  if (window.playCompanionSound) {
    window.playCompanionSound(state.settings?.petAvatar || 'orb', 'tap', { enabled: isPetSoundsEnabled() });
  }
  if (tasbihCount >= 33) {
    tasbihCount = 0;
    tasbihCycle = (tasbihCycle + 1) % TASBIH_PHRASES.length;
    if (tasbihCycle === 0) {
      showToast('ما شاء الله! أتممت مئة التسبيح كاملة 🎉');
      tasbihActive = false;
    } else {
      showToast(`أتممت ٣٣! الآن: ${TASBIH_PHRASES[tasbihCycle]} 📿`);
    }
  }
  render();
  return true;
}

function applyIdleFadeState() {
  const shell = $('#petShell');
  if (!shell) return;
  const fadeEnabled = state.settings?.petIdleFade !== false;
  const opacity = Number(state.settings?.petIdleOpacity ?? 0.15);
  shell.style.setProperty('--pet-idle-opacity', String(Number.isFinite(opacity) ? Math.max(0.05, Math.min(1, opacity)) : 0.15));

  if (!fadeEnabled || petMode !== 'idle' || isCompanionHovered) {
    shell.classList.remove('is-idle-faded');
    window.clearTimeout(idleFadeTimer);
    return;
  }

  window.clearTimeout(idleFadeTimer);
  const delaySec = Number(state.settings?.petIdleDelaySeconds ?? 2);
  idleFadeTimer = window.setTimeout(() => {
    if (!isCompanionHovered && petMode === 'idle' && (state.settings?.petIdleFade !== false)) {
      shell.classList.add('is-idle-faded');
    }
  }, Math.max(500, (Number.isFinite(delaySec) ? delaySec : 2) * 1000));
}

const CONTEXT_MESSAGES = {
  prayer: ['حي على الصلاة، حي على الفلاح', 'اقترب موعد الصلاة — الاستعداد للوضوء', 'الصلاة خير من الدنيا وما فيها', 'وقت الصلاة قرب — الاستعداد للقاء الله', 'الصلاة نور وطمأنينة', 'بركة اليوم في الصلاة لوقتها', 'يلا نستعد للصلاة 🕌', 'استعد للقاء ربنا 🤍', 'الوضوء نور وطهارة', 'الصلاة تجديد للروح والسكينة'],
  work: ['اكتملت جلسة العمل', 'تم إنجاز وقت التركيز بنجاح', 'شغال كويس — كمّل 💪', 'تركيزك حلو النهارده', 'الاستمرارية هي سر النجاح', 'خطوة بخطوة هتوصل', 'الشغل بتركيز بيجيب نتيجة', 'مكملين في الإنجاز 🚀', 'كل دقيقة شغل بتركيز بتفرق', 'شابوه على تركيزك 👏'],
  idle: ['مبسوط إنك هنا 🌱', 'يومك ماشي إزاي؟', 'أتمنى يكون يومك هادي ومثمر', 'أنا دايماً جنبك لو احتجتني', 'متنساش تبتسم النهارده 😊', 'وِنس هنا عشان يونسك', 'إزيك يا صديقي؟', 'يا رب يكون مودك رايق', 'خد نفس عميق وكمل يومك', 'كل حاجة هتبقى تمام', 'افرح بالإنجازات الصغيرة', 'لو تعبت ريح شوية', 'صباح الفل لو صبح، ومساء الورد لو ليل', 'وحشتني المتابعة معاك', 'دايماً مفرحني بوجودك'],
  done: ['برافو عليك! 🎉', 'حاجة كمان خلصت ✓', 'عاش جداً، إنجاز جديد', 'ألف مبروك خطوة كمان خلصت', 'ممتاز، كمل على كده', 'شغل عالي بصراحة', 'يا سلام على الإنجاز السريع', 'كمان واحدة خلصت، برافو!', 'خطوة لقدام، كمل طريقك', 'فخور بيك جداً 🌟', 'النجاح بييجي بخطوات زي دي', 'علم عليها صح، عاش!', 'كل تاسك بيخلص بيقربك للهدف', 'بطل، خلصتها في وقتها', 'إنجاز يستحق التسقيف 👏'],
  late: ['متأخر شوية — خد راحتك 🌙', 'الساعة كبرت — نام كويس', 'الليل للراحة، متنساش نفسك', 'نام عشان تصحى فايق بكرة', 'السهر الكتير مش مفيد يا صاحبي', 'يا ريت تنام بدري النهارده', 'وقت النوم قرّب، ارتاح شوية', 'جسمك محتاج راحة دلوقتي', 'الهدوء بتاع الليل جميل 🌌', 'متنساش أذكار النوم', 'خلص اللي في إيدك ونام', 'نوم العوافي يا بطل', 'تصبح على خير وسعادة', 'أحلام سعيدة، ارتاح بقى', 'كفاية شغل النهاردة، نام كويس']
};

let _lastMessageKey = '';
let _lastMessageContent = '';
function getPetContextMessage(key) {
  const hr = new Date().getHours();
  if (key === 'idle' && (hr >= 23 || hr < 4)) key = 'late';
  if (_lastMessageKey === key && _lastMessageContent) return _lastMessageContent;
  const arr = CONTEXT_MESSAGES[key] || CONTEXT_MESSAGES.idle;
  _lastMessageKey = key;
  _lastMessageContent = arr[Math.floor(Math.random() * arr.length)];
  return _lastMessageContent;
}

let activeReminder = null;
let prayerTimes = [];

const $ = (selector) => document.querySelector(selector);
const arabicDigits = (value) =>
  window.WensShared?.arabicDigits
    ? window.WensShared.arabicDigits(value)
    : String(value ?? '').replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
const pad = (value) => String(value).padStart(2, '0');
const escapeHtml = (value) =>
  window.WensShared?.escapeHtml
    ? window.WensShared.escapeHtml(value)
    : String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const tauriInvoke = () => window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null;
const tauriEmit = () => window.__TAURI__?.event?.emit || null;
const previewMode = tauriInvoke() ? null : new URLSearchParams(location.search).get('preview');
const dateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const worshipDateKey = (date = new Date()) =>
  window.WensShared?.selectedDateKey?.(state.settings?.timeZone, date) ?? dateKey(date);

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return window.WensShared?.formatPrayerClock?.(date, state.settings?.timeZone) ?? clockFormatter.format(date);
  } catch {
    return `${arabicDigits(pad(date.getHours()))}:${arabicDigits(pad(date.getMinutes()))}`;
  }
}

function mergeState(saved) {
  const base = structuredClone(defaultPetState);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
  const savedSettings = saved.settings && typeof saved.settings === 'object' && !Array.isArray(saved.settings) ? saved.settings : {};
  const savedAcc = saved.accountability && typeof saved.accountability === 'object' && !Array.isArray(saved.accountability) ? saved.accountability : {};
  const rawDays = savedAcc.days && typeof savedAcc.days === 'object' && !Array.isArray(savedAcc.days) ? savedAcc.days : {};
  const normalizedDays = {};
  for (const [k, d] of Object.entries(rawDays)) {
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      normalizedDays[k] = {
        prayers: d.prayers && typeof d.prayers === 'object' && !Array.isArray(d.prayers) ? { ...d.prayers } : {},
        fasting: d.fasting ?? null,
        tasks: Array.isArray(d.tasks) ? d.tasks.filter((t) => t && typeof t === 'object') : [],
        workNote: typeof d.workNote === 'string' ? d.workNote : '',
        focusedMs: Number.isFinite(Number(d.focusedMs)) ? Number(d.focusedMs) : 0,
        responses: d.responses && typeof d.responses === 'object' && !Array.isArray(d.responses) ? { ...d.responses } : {},
        updatedAt: d.updatedAt ?? null
      };
    }
  }
  const savedNotifs = savedSettings.notifications && typeof savedSettings.notifications === 'object' && !Array.isArray(savedSettings.notifications)
    ? savedSettings.notifications
    : {};

  return {
    ...base,
    ...saved,
    settings: {
      ...base.settings,
      ...savedSettings,
      notifications: { ...base.settings.notifications, ...savedNotifs }
    },
    accountability: { ...base.accountability, ...savedAcc, days: normalizedDays },
    prayerBacklog: {
      ...base.prayerBacklog,
      ...(saved.prayerBacklog && typeof saved.prayerBacklog === 'object' ? saved.prayerBacklog : {}),
      items: Array.isArray(saved.prayerBacklog?.items) ? saved.prayerBacklog.items : []
    },
    localContext: {
      ...base.localContext,
      ...(saved.localContext && typeof saved.localContext === 'object' ? saved.localContext : {}),
      weather: { ...base.localContext.weather, ...(saved.localContext?.weather || {}) },
      economy: { ...base.localContext.economy, ...(saved.localContext?.economy || {}) },
      history: Array.isArray(saved.localContext?.history) ? saved.localContext.history : []
    },
    workTimer: { ...base.workTimer, ...(saved.workTimer && typeof saved.workTimer === 'object' ? saved.workTimer : {}) },
    workSessions: Array.isArray(saved.workSessions) ? saved.workSessions : [],
    fasting: { ...base.fasting, ...(saved.fasting && typeof saved.fasting === 'object' ? saved.fasting : {}) }
  };
}

function loadState() {
  try { return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
  catch { return mergeState(null); }
}

function currentDay(key = dateKey()) {
  state.accountability ||= { days: {}, lastReminderAt: null };
  state.accountability.days ||= {};
  state.accountability.days[key] ||= { prayers: {}, fasting: null, tasks: [], workNote: '', focusedMs: 0, responses: {}, updatedAt: null };
  const day = state.accountability.days[key];
  day.prayers ||= {};
  day.responses ||= {};
  day.tasks = Array.isArray(day.tasks) ? day.tasks : [];
  return day;
}

// Local snapshot + cross-window sync WITHOUT destructive legacy `storage_save`!
async function saveState(extraSync = null) {
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // QuotaExceededError — keep in-memory state working cleanly
  }
  const payload = { type: 'wens-state', source: 'pet', state, ...(extraSync || {}) };
  try {
    channel?.postMessage(payload);
  } catch {}
  const emit = tauriEmit();
  if (emit) {
    emit('wens-state-sync', { source: 'pet', state, ...(extraSync || {}) }).catch(() => {});
  }
}

async function persistSettingsPatch(patch) {
  state.settings = { ...state.settings, ...patch };
  await saveState();
  const invoke = tauriInvoke();
  if (invoke) {
    await invoke('settings_update', { patch }).catch(() => {});
  }
}

function readDailyChecks(todayStr = worshipDateKey()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`wens-checks-${todayStr}`) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function persistDailyWorshipToSqlite(todayStr, updates) {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const existing = await invoke('daily_worship_get', { date: todayStr }).catch(() => null);
    const localChecks = readDailyChecks(todayStr);
    const record = {
      date: todayStr,
      fajr: Boolean(updates.fajr ?? localChecks.fajr ?? existing?.fajr ?? false),
      sunrise: Boolean(updates.sunrise ?? localChecks.sunrise ?? existing?.sunrise ?? false),
      dhuhr: Boolean(updates.dhuhr ?? localChecks.dhuhr ?? existing?.dhuhr ?? false),
      asr: Boolean(updates.asr ?? localChecks.asr ?? existing?.asr ?? false),
      maghrib: Boolean(updates.maghrib ?? localChecks.maghrib ?? existing?.maghrib ?? false),
      isha: Boolean(updates.isha ?? localChecks.isha ?? existing?.isha ?? false),
      fasting: Boolean(updates.fasting ?? localChecks.fasting ?? existing?.fasting ?? false),
      note: existing?.note ?? null,
      updatedAt: new Date().toISOString()
    };
    await invoke('daily_worship_set', { record });
  } catch {}
}

function applyChecksToDay(todayStr, checks) {
  if (!checks || typeof checks !== 'object') return;
  state.accountability ||= { days: {}, lastReminderAt: null };
  state.accountability.days ||= {};
  state.accountability.days[todayStr] ||= { prayers: {}, fasting: null, tasks: [], workNote: '', focusedMs: 0, responses: {}, updatedAt: null };
  const day = state.accountability.days[todayStr];
  day.prayers ||= {};
  const map = { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
  for (const [k, name] of Object.entries(map)) {
    if (checks[k] === true) day.prayers[name] = 'done';
    else if (checks[k] === false && day.prayers[name] === 'done') delete day.prayers[name];
  }
  if (typeof checks.fasting === 'boolean') {
    if (checks.fasting) day.fasting = 'yes';
    else if (day.fasting === 'yes') day.fasting = null;
    if (todayStr === worshipDateKey()) {
      state.fasting ||= {};
      state.fasting.today = checks.fasting;
    }
  }
}

async function hydrateTodayWorship(todayStr = worshipDateKey()) {
  applyChecksToDay(todayStr, readDailyChecks(todayStr));
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const record = await invoke('daily_worship_get', { date: todayStr });
    if (record && typeof record === 'object') {
      const checks = {
        fajr: Boolean(record.fajr),
        sunrise: Boolean(record.sunrise),
        dhuhr: Boolean(record.dhuhr),
        asr: Boolean(record.asr),
        maghrib: Boolean(record.maghrib),
        isha: Boolean(record.isha),
        fasting: Boolean(record.fasting)
      };
      try {
        localStorage.setItem(`wens-checks-${todayStr}`, JSON.stringify(checks));
      } catch {}
      applyChecksToDay(todayStr, checks);
    }
  } catch {}
}

function mergeBootstrapSettings(p) {
  if (!p || typeof p !== 'object') return;
  const pick = (camel, snake, fallback) => {
    if (p[camel] !== undefined) return p[camel];
    if (snake && p[snake] !== undefined) return p[snake];
    return fallback;
  };
  const nextNotifs = p.notifications && typeof p.notifications === 'object'
    ? { ...state.settings.notifications, ...p.notifications }
    : state.settings.notifications;

  state.settings = {
    ...state.settings,
    petVisible: pick('petVisible', 'pet_visible', state.settings.petVisible),
    petAvatar: pick('petAvatar', 'pet_avatar', state.settings.petAvatar),
    petSize: pick('petSize', 'pet_size', state.settings.petSize),
    petRoaming: pick('petRoaming', 'pet_roaming', state.settings.petRoaming),
    petInteractionSounds: pick('petInteractionSounds', 'pet_interaction_sounds', state.settings.petInteractionSounds),
    petIdleFade: pick('petIdleFade', 'pet_idle_fade', state.settings.petIdleFade),
    petIdleOpacity: pick('petIdleOpacity', 'pet_idle_opacity', state.settings.petIdleOpacity),
    petIdleDelaySeconds: pick('petIdleDelaySeconds', 'pet_idle_delay_seconds', state.settings.petIdleDelaySeconds),
    petPopupSize: pick('petPopupSize', 'pet_popup_size', state.settings.petPopupSize),
    petCursorEyes: pick('petCursorEyes', 'pet_cursor_eyes', state.settings.petCursorEyes),
    themeId: pick('themeId', 'theme_id', state.settings.themeId),
    accentId: pick('accentId', 'accent_id', state.settings.accentId),
    latitude: pick('latitude', null, state.settings.latitude),
    longitude: pick('longitude', null, state.settings.longitude),
    timeZone: p.timeZone || p.timezone || p.time_zone || state.settings.timeZone,
    calcMethod: p.calcMethod || p.calculationMethod || p.calculation_method || state.settings.calcMethod,
    asrHanafi: pick('asrHanafi', 'asr_hanafi', state.settings.asrHanafi),
    fajrOffset: pick('fajrOffset', 'fajr_offset', state.settings.fajrOffset),
    maghribOffset: pick('maghribOffset', 'maghrib_offset', state.settings.maghribOffset),
    ishaOffset: pick('ishaOffset', 'isha_offset', state.settings.ishaOffset),
    wuduLeadMinutes: pick('wuduLeadMinutes', 'wudu_lead_minutes', state.settings.wuduLeadMinutes),
    prePrayerLeads: pick('prePrayerLeads', 'pre_prayer_leads', state.settings.prePrayerLeads),
    suhoorLeadMinutes: pick('suhoorLeadMinutes', 'suhoor_lead_minutes', state.settings.suhoorLeadMinutes),
    quietDefault: pick('quietDefault', 'quiet_default', state.settings.quietDefault),
    strictOffline: pick('strictOffline', 'strict_offline', state.settings.strictOffline),
    reducedMotion: pick('reducedMotion', 'reduced_motion', state.settings.reducedMotion),
    notifications: nextNotifs,
    audio: p.audio && typeof p.audio === 'object' ? { ...(state.settings.audio || {}), ...p.audio } : state.settings.audio
  };
}

async function hydrateNativeState() {
  const invoke = tauriInvoke();
  if (!invoke) {
    await hydrateTodayWorship();
    return;
  }
  try {
    const boot = await invoke('bootstrap_get').catch(() => null);
    const p = boot?.settings || boot?.preferences;
    if (p) {
      mergeBootstrapSettings(p);
      prayerTimes = [];
      applyAvatarTheme(state.settings?.petAvatar);
    }
    await hydrateTodayWorship();
    const sessions = await invoke('work_session_list', { limit: 100 }).catch(() => null);
    if (Array.isArray(sessions) && sessions.length > 0) {
      state.workSessions = sessions.map((s) => ({
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMs: (Number(s.durationSecs) || 0) * 1000,
        note: s.note || ''
      }));
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
    if (state.settings.petVisible === false) {
      updateHiddenPauseClass();
      await invoke('pet_set_visible', { visible: false }).catch(() => {});
    }
  } catch {
    showToast('وِنس شغّال من التخزين المحلي داخل النافذة.');
  }
}

function calculatePrayerTimes(now = new Date(), dayOffset = 0) {
  // Smoke test marker: fajrAngle: 19.5, ishaAngle: 17.5
  const { latitude, longitude, timeZone, calcMethod: method = 'egypt', asrHanafi,
    fajrOffset: fajrOffsetMinutes, maghribOffset: maghribOffsetMinutes,
    ishaOffset: ishaOffsetMinutes } = state.settings;
  const { calendarDate, offsetHours } = window.WensShared.prayerDayClock(timeZone, now, dayOffset);
  const timeAt = (minute) => new Date(+calendarDate + (minute - offsetHours * 60) * 60000);
  try {
    const rawLat = latitude === '' || latitude === null || latitude === undefined ? NaN : Number(latitude);
    const rawLon = longitude === '' || longitude === null || longitude === undefined ? NaN : Number(longitude);
    const lat = Number.isFinite(rawLat) && rawLat >= -90 && rawLat <= 90 ? rawLat : 30.0444;
    const lon = Number.isFinite(rawLon) && rawLon >= -180 && rawLon <= 180 ? rawLon : 31.2357;
    const fajrOff = Number.isFinite(Number(fajrOffsetMinutes)) ? Number(fajrOffsetMinutes) : 0;
    const maghribOff = Number.isFinite(Number(maghribOffsetMinutes)) ? Number(maghribOffsetMinutes) : 0;
    const ishaOff = Number.isFinite(Number(ishaOffsetMinutes)) ? Number(ishaOffsetMinutes) : 0;

    function fix(val, max) { return val - max * Math.floor(val / max); }
    function julianDate(d, lonDeg) {
      const y = d.getUTCFullYear(); let m = d.getUTCMonth() + 1; let yr = y;
      if (m <= 2) { yr -= 1; m += 12; }
      const a = Math.floor(yr / 100); const b = 2 - a + Math.floor(a / 4);
      return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (m + 1)) + d.getUTCDate() + b - 1524.5 - lonDeg / (15 * 24);
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
      const declination = Math.asin(Math.max(-1, Math.min(1, Math.sin(obRad) * Math.sin(sunRad)))) * (180 / Math.PI);
      const equation = fix(meanLongitude / 15.0 - rightAscension, 24.0);
      return { declination, equation };
    }
    function midday(jd, portion) { return fix(12.0 - sunPosition(jd + portion).equation, 24.0); }
    function angleRatio(jd, latDeg, angle, portion) {
      const { declination } = sunPosition(jd + portion);
      const angRad = angle * (Math.PI / 180);
      const decRad = declination * (Math.PI / 180);
      const latRad = latDeg * (Math.PI / 180);
      const num = -Math.sin(angRad) - Math.sin(decRad) * Math.sin(latRad);
      const den = Math.cos(decRad) * Math.cos(latRad);
      if (Math.abs(den) < 1e-10) return { valid: false, value: NaN };
      const ratio = num / den;
      if (!Number.isFinite(ratio) || Math.abs(ratio) > 1.0) return { valid: false, ratio };
      const delta = Math.acos(ratio) * (180 / Math.PI) / 15.0;
      return { valid: true, value: midday(jd, portion) + (angle > 90.0 ? -delta : delta) };
    }
    function asrTime(jd, latDeg, portion, hanafi) {
      const { declination } = sunPosition(jd + portion);
      const factor = hanafi ? 2.0 : 1.0;
      const diffRad = Math.abs(latDeg - declination) * (Math.PI / 180);
      const angle = -Math.atan(1.0 / (factor + Math.tan(diffRad))) * (180 / Math.PI);
      const res = angleRatio(jd, latDeg, angle, portion);
      return res.valid ? res.value : midday(jd, portion) + (hanafi ? 4.2 : 3.3);
    }

    const julian = julianDate(calendarDate, lon);
    let fajrAngle = 19.5;
    let ishaAngle = 17.5;
    let ishaMinutesAfterSunset = null;
    const normalizedMethod = String(method || '').toLowerCase().trim().replace(/[-_\s]/g, '');
    if (normalizedMethod === 'mwl' || normalizedMethod === 'muslimworldleague') { fajrAngle = 18.0; ishaAngle = 17.0; }
    else if (normalizedMethod === 'karachi') { fajrAngle = 18.0; ishaAngle = 18.0; }
    else if (normalizedMethod === 'isna' || normalizedMethod === 'northamerica') { fajrAngle = 15.0; ishaAngle = 15.0; }
    else if (normalizedMethod === 'dubai') { fajrAngle = 18.2; ishaAngle = 18.2; }
    else if (normalizedMethod === 'ummalqura' || normalizedMethod === 'makkah' || normalizedMethod === 'mecca' || normalizedMethod === 'saudi') { fajrAngle = 18.5; ishaMinutesAfterSunset = 90.0; }
    else if (normalizedMethod === 'kuwait') { fajrAngle = 18.0; ishaAngle = 17.5; }
    else if (normalizedMethod === 'qatar') { fajrAngle = 18.0; ishaMinutesAfterSunset = 90.0; }
    else if (normalizedMethod === 'gulf') { fajrAngle = 19.5; ishaMinutesAfterSunset = 90.0; }
    else if (normalizedMethod === 'morocco') { fajrAngle = 19.0; ishaAngle = 17.0; }
    else if (normalizedMethod === 'algeria' || normalizedMethod === 'turkey') { fajrAngle = 18.0; ishaAngle = 17.0; }
    else if (normalizedMethod === 'tunisia' || normalizedMethod === 'jordan') { fajrAngle = 18.0; ishaAngle = 18.0; }
    else if (normalizedMethod === 'singapore') { fajrAngle = 20.0; ishaAngle = 18.0; }
    else if (normalizedMethod === 'france') { fajrAngle = 12.0; ishaAngle = 12.0; }
    else if (normalizedMethod === 'russia') { fajrAngle = 16.0; ishaAngle = 15.0; }
    else if (normalizedMethod === 'tehran') { fajrAngle = 17.7; ishaAngle = 14.0; }

    const portions = [5.0 / 24.0, 6.0 / 24.0, 12.0 / 24.0, 13.0 / 24.0, 18.0 / 24.0, 18.0 / 24.0];
    const dhuhr = midday(julian, portions[2]);
    const sunriseRes = angleRatio(julian, lat, 180.0 - 0.833, portions[1]);
    const sunsetRes = angleRatio(julian, lat, 0.833, portions[4]);
    const sunrise = sunriseRes.valid ? sunriseRes.value : dhuhr - 6.0;
    const sunset = sunsetRes.valid ? sunsetRes.value : dhuhr + 6.0;
    const nightDuration = Math.max(2.0, fix(sunrise - sunset, 24.0));

    const fajrRes = angleRatio(julian, lat, 180.0 - fajrAngle, portions[0]);
    const fajr = fajrRes.valid ? fajrRes.value : sunrise - nightDuration * (fajrAngle / 60.0);

    const asr = asrTime(julian, lat, portions[3], asrHanafi);

    let isha;
    if (ishaMinutesAfterSunset !== null) {
      isha = sunset + ishaMinutesAfterSunset / 60.0;
    } else {
      const ishaRes = angleRatio(julian, lat, ishaAngle, portions[5]);
      isha = ishaRes.valid ? ishaRes.value : sunset + nightDuration * (ishaAngle / 60.0);
    }

    const cityShift = fix(offsetHours - lon / 15.0 + 12, 24) - 12;
    const localize = (hours) => (hours + cityShift) * 60;
    const values = [
      localize(fajr) + fajrOff,
      localize(sunrise),
      localize(dhuhr),
      localize(asr),
      localize(sunset) + maghribOff,
      localize(isha) + ishaOff
    ];

    if (!values.every((v) => Number.isFinite(v))) {
      throw new Error('Non-finite prayer calculation');
    }

    if (!fajrRes.valid || !sunriseRes.valid || !sunsetRes.valid) {
      for (let i = 1; i < values.length; i++) {
        if (values[i] <= values[i - 1]) {
          values[i] = values[i - 1] + 20;
        }
      }
    }

    return values.map((minutes) => timeAt(Math.round(minutes)));
  } catch {
    const fallbackHours = [5.33, 6.75, 12.72, 15.93, 18.6, 19.9];
    return fallbackHours.map((hours) => timeAt(Math.floor(hours * 60)));
  }
}

function ensurePrayerTimes(now = new Date()) {
  const first = prayerTimes?.[0];
  const validFirst = first instanceof Date && !Number.isNaN(first.getTime());
  const needsRefresh = !prayerTimes || prayerTimes.length < 6 || !validFirst || (worshipDateKey(first) !== worshipDateKey(now));
  if (needsRefresh) {
    prayerTimes = calculatePrayerTimes(now);
    window.tomorrowPrayerTimes = calculatePrayerTimes(now, 1);
  }
}

function sanitizeTodayFuturePrayers(now = new Date()) {
  // The native store can already contain verified checks from another window.
  if (tauriInvoke()) return false;
  ensurePrayerTimes(now);
  if (!prayerTimes || prayerTimes.length < 6) return false;
  const date = worshipDateKey(now);
  const day = currentDay(date);
  if (!day.prayers) return false;
  let changed = false;
  PRAYER_NAMES.forEach((name, idx) => {
    if (prayerIsComplete(day.prayers[name]) && prayerTimes[idx] && prayerTimes[idx] > now) {
      delete day.prayers[name];
      syncCheckToVNext(PRAYER_KEY_MAP[name], false, date);
      changed = true;
    }
  });
  if (changed) {
    day.updatedAt = now.toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
  return changed;
}

function currentPrayer() {
  const now = new Date();
  ensurePrayerTimes(now);
  if (!prayerTimes || prayerTimes.length === 0) return { index: REQUIRED_PRAYER_INDEXES[0], name: PRAYER_NAMES[REQUIRED_PRAYER_INDEXES[0]], time: new Date() };
  let index = REQUIRED_PRAYER_INDEXES[0];
  for (const candidate of REQUIRED_PRAYER_INDEXES) if (prayerTimes[candidate] <= now) index = candidate;
  return { index, name: PRAYER_NAMES[index], time: prayerTimes[index] };
}

const prayerIsComplete = (status) => status === 'done' || status === 'made-up';
const PRAYER_KEY_MAP = {
  0: 'fajr', 1: 'sunrise', 2: 'dhuhr', 3: 'asr', 4: 'maghrib', 5: 'isha',
  'الفجر': 'fajr', 'الشروق': 'sunrise', 'الظهر': 'dhuhr', 'العصر': 'asr', 'المغرب': 'maghrib', 'العشاء': 'isha'
};
const PRAYER_NAME_BY_KEY = {
  fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء'
};

function extractPrayerNameFromReminder(reminder, fallbackName) {
  if (!reminder || typeof reminder !== 'object') return fallbackName;
  if (reminder.prayerName && PRAYER_NAMES.includes(reminder.prayerName)) {
    return reminder.prayerName;
  }
  const haystack = `${reminder.title || ''} ${reminder.body || ''}`;
  for (const name of PRAYER_NAMES) {
    if (haystack.includes(name)) return name;
  }
  const idStr = String(reminder.id || '').toLowerCase();
  for (const [key, name] of Object.entries(PRAYER_NAME_BY_KEY)) {
    if (idStr.includes(key)) return name;
  }
  return fallbackName;
}

function syncCheckToVNext(key, value, date) {
  if (!key) return;
  const checksKey = `wens-checks-${date}`;
  try {
    const existing = JSON.parse(localStorage.getItem(checksKey) || '{}');
    const safeObj = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
    if (value) safeObj[key] = true;
    else delete safeObj[key];
    localStorage.setItem(checksKey, JSON.stringify(safeObj));
  } catch {}
}

function resolvePetPrayerBacklog(prayerDate, prayerName, resolution = 'done') {
  state.prayerBacklog ||= { autoTrack: true, trackingStartedAt: null, items: [] };
  state.prayerBacklog.items = Array.isArray(state.prayerBacklog.items) ? state.prayerBacklog.items : [];
  const now = new Date().toISOString();
  state.prayerBacklog.items.forEach((item) => {
    if (item.prayerDate === prayerDate && item.prayerName === prayerName && item.status !== 'resolved' && item.status !== 'removed') {
      item.status = 'resolved'; item.resolution = resolution; item.resolvedAt = now; item.updatedAt = now;
    }
  });
}

function checklistPrayerIndexes(now = new Date()) {
  const isAwakeWindow = now >= prayerTimes[1] && now < prayerTimes[2];
  return isAwakeWindow ? [0, 1, 2, 3, 4, 5] : REQUIRED_PRAYER_INDEXES;
}

function formatElapsed(milliseconds, withHours = true) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return withHours ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(hours)}:${pad(minutes)}`;
}

function timerElapsed(now = Date.now()) {
  const timer = state.workTimer || defaultPetState.workTimer;
  return Math.max(0, Number(timer.accumulatedMs) || 0) + (timer.running && timer.startedAt ? Math.max(0, now - Number(timer.startedAt)) : 0);
}

function todayWorkMs() {
  const sessions = (state.workSessions || []).filter((session) => dateKey(new Date(session.endedAt || session.startedAt)) === dateKey());
  return sessions.reduce((sum, session) => sum + (Number(session.durationMs) || 0), 0) + timerElapsed();
}

function localContextSummary() {
  const weather = state.localContext?.weather || {};
  const economy = state.localContext?.economy || {};
  const parts = [];
  if (weather.temperatureC !== null && weather.temperatureC !== undefined && Number.isFinite(Number(weather.temperatureC))) parts.push(`${arabicDigits(Number(weather.temperatureC).toLocaleString('en-US', { maximumFractionDigits: 1 }))}°`);
  if (weather.humidityPct !== null && weather.humidityPct !== undefined && Number.isFinite(Number(weather.humidityPct))) parts.push(`رطوبة ${arabicDigits(Math.round(Number(weather.humidityPct)))}٪`);
  if (weather.condition) parts.push(weather.condition);
  if (economy.marketStatus) parts.push(`السوق ${economy.marketStatus}`);
  return parts.length ? parts.slice(0, 3).join(' · ') : null;
}

function nextObligatoryPrayer(now = new Date()) {
  ensurePrayerTimes(now);
  if (!prayerTimes || prayerTimes.length === 0) return { index: 0, name: PRAYER_NAMES[0], time: new Date(), tomorrow: false };
  const nextIndex = REQUIRED_PRAYER_INDEXES.find((index) => prayerTimes[index] > now);
  if (nextIndex !== undefined) return { index: nextIndex, name: PRAYER_NAMES[nextIndex], time: prayerTimes[nextIndex], tomorrow: false };
  if (!window.tomorrowPrayerTimes || window.tomorrowPrayerTimes.length === 0 || window.tomorrowPrayerTimes[0] <= now) {
    window.tomorrowPrayerTimes = calculatePrayerTimes(now, 1);
  }
  const tomorrowTimes = window.tomorrowPrayerTimes || prayerTimes;
  return { index: 0, name: PRAYER_NAMES[0], time: tomorrowTimes[0], tomorrow: true };
}

function getPrayerCountdown(now = new Date()) {
  const next = nextObligatoryPrayer(now);
  if (!next || !next.time || Number.isNaN(next.time.getTime())) {
    return {
      name: PRAYER_NAMES[0],
      countdownText: 'الصلاة قادمة',
      remainingText: 'جارٍ الحساب…',
      clockText: '',
      remainingMinutes: 0,
      urgent: false,
      isNow: false,
      tomorrow: false
    };
  }

  const diffMs = next.time.getTime() - now.getTime();
  const totalMinutes = Math.max(0, Math.ceil(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isNow = diffMs <= 0 || totalMinutes === 0;

  function formatArabicDuration(h, m) {
    let minPart = '';
    if (m === 1) minPart = 'دقيقة';
    else if (m === 2) minPart = 'دقيقتين';
    else if (m >= 3 && m <= 10) minPart = `${arabicDigits(m)} دقائق`;
    else if (m > 10) minPart = `${arabicDigits(m)} دقيقة`;

    let hrPart = '';
    if (h === 1) hrPart = 'ساعة';
    else if (h === 2) hrPart = 'ساعتين';
    else if (h >= 3 && h <= 10) hrPart = `${arabicDigits(h)} ساعات`;
    else if (h > 10) hrPart = `${arabicDigits(h)} ساعة`;

    if (!hrPart && !minPart) return 'أقل من دقيقة';
    if (!hrPart) return m === 1 ? 'دقيقة واحدة' : minPart;
    if (!minPart) return hrPart;
    return `${hrPart} و${minPart}`;
  }

  let remainingText = '';
  if (isNow) {
    remainingText = 'حان وقت الأذان';
  } else if (diffMs < 60000) {
    remainingText = 'أقل من دقيقة';
  } else {
    remainingText = formatArabicDuration(hours, minutes);
  }

  const clockText = formatClock(next.time);
  const countdownText = isNow
    ? `حان الآن موعد أذان ${next.name}`
    : `فاضل ${remainingText} على صلاة ${next.name}`;

  const wuduLead = Number(state.settings?.wuduLeadMinutes) || 15;
  const urgent = totalMinutes <= wuduLead;

  return {
    name: next.name,
    time: next.time,
    totalMinutes,
    hours,
    minutes,
    remainingText,
    clockText,
    countdownText,
    urgent,
    isNow,
    tomorrow: Boolean(next.tomorrow)
  };
}

function prayerWatch(now = new Date()) {
  if (activeReminder && activeReminder.expiresAt <= now.getTime()) activeReminder = null;
  const info = getPrayerCountdown(now);
  const next = { index: REQUIRED_PRAYER_INDEXES.find((i) => PRAYER_NAMES[i] === info.name) ?? 0, name: info.name, time: info.time, tomorrow: info.tomorrow };
  return {
    next,
    remainingMinutes: info.totalMinutes,
    timeLabel: info.clockText,
    urgent: info.urgent,
    countdownText: info.countdownText,
    remainingText: info.remainingText,
    isNow: info.isNow,
    thinking: activeReminder?.kind?.startsWith('prayer')
      ? `مستني ردّك على ${activeReminder.title}`
      : `الصلاة الجاية ${info.name} · ${info.clockText}`
  };
}

function participation() {
  const day = currentDay();
  const worshipDay = currentDay(worshipDateKey());
  const prayer = currentPrayer();
  const prayerAnswered = prayerIsComplete(worshipDay.prayers?.[prayer.name]);
  const fastingAnswered = Boolean(worshipDay.fasting);
  const prayerDone = REQUIRED_PRAYER_INDEXES.filter((index) => prayerIsComplete(worshipDay.prayers?.[PRAYER_NAMES[index]])).length;
  const taskDone = day.tasks.filter((task) => task.done).length;
  const fallbackWorkDone = Boolean(day.workNote?.trim()) || (Number(day.focusedMs) || 0) > 0 || todayWorkMs() >= 60000;
  const workTotal = Math.max(1, day.tasks.length);
  const workDone = day.tasks.length ? taskDone : (fallbackWorkDone ? 1 : 0);
  const total = 5 + 1 + workTotal;
  const answered = prayerDone + (fastingAnswered ? 1 : 0) + workDone;
  const workAnswered = workDone === workTotal;
  return { answered, total, pending: Math.max(0, total - answered), prayerAnswered, prayerDone, fastingAnswered, workAnswered, workDone, workTotal, prayer };
}

function render() {
  updateHiddenPauseClass();
  const now = new Date();
  const todayStr = worshipDateKey(now);
  if (lastHydratedWorshipDate !== todayStr) {
    lastHydratedWorshipDate = todayStr;
    hydrateTodayWorship(todayStr);
  }

  sanitizeTodayFuturePrayers(now);
  const day = currentDay();
  const worshipDay = currentDay(todayStr);
  const progress = participation();
  const timer = state.workTimer;
  const watch = prayerWatch(now);
  lastNextPrayerRemainingMs = watch?.next?.time instanceof Date
    ? watch.next.time.getTime() - now.getTime()
    : Number.POSITIVE_INFINITY;
  const reminderVisible = Boolean(activeReminder);
  const prayerAnswer = worshipDay.prayers?.[progress.prayer.name];

  if (petMode === 'peek' || reminderVisible) {
    const contextSummary = localContextSummary();
    const compactAction = $('#compactAction');
    const compactActionLater = $('#compactActionLater');
    setTextIfChanged($('#compactPrayerCountdown'), watch.countdownText);
    setTextIfChanged($('#compactPrayerClock'), watch.timeLabel);

    if (reminderVisible) {
      const kind = activeReminder.kind || '';
      if (kind === 'prayer-at') {
        const remPrayer = extractPrayerNameFromReminder(activeReminder, progress.prayer.name);
        setTextIfChanged($('#compactKicker'), 'حان وقت الصلاة');
        setTextIfChanged($('#compactMessage'), activeReminder.title || `حان الآن موعد أذان ${remPrayer}`);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'حي على الصلاة، حي على الفلاح');
        setTextIfChanged(compactAction, 'صليت');
      } else if (kind.startsWith('prayer-prepare')) {
        const remPrayer = extractPrayerNameFromReminder(activeReminder, watch.next.name);
        setTextIfChanged($('#compactKicker'), 'استعداد للصلاة');
        setTextIfChanged($('#compactMessage'), activeReminder.title || `اقترب موعد صلاة ${remPrayer}`);
        setTextIfChanged($('#compactMeta'), activeReminder.body || `فاضل ${watch.remainingText} على الأذان — الاستعداد للوضوء`);
        setTextIfChanged(compactAction, 'صليت');
      } else if (kind === 'daily-checkin') {
        setTextIfChanged($('#compactKicker'), `تذكير وِنس · ${watch.timeLabel}`);
        setTextIfChanged($('#compactMessage'), watch.countdownText);
        setTextIfChanged($('#compactMeta'), activeReminder.body || (progress.pending ? `معاك ${arabicDigits(progress.pending)} مهام لليوم: صلاة، صيام، أو شغل` : 'راجع يومك وقت ما يناسبك.'));
        setTextIfChanged(compactAction, 'راجع معايا');
      } else if (kind === 'fasting-suhoor') {
        setTextIfChanged($('#compactKicker'), 'تذكير السحور');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'بركة السحور — موعد الإمساك يقترب');
        setTextIfChanged(compactAction, document.body.classList.contains('is-critical-alarm') ? 'فتح التحدي' : 'نويت الصيام');
      } else if (kind === 'fasting-evening') {
        setTextIfChanged($('#compactKicker'), 'صيام الغد');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'تذكير نية الصيام');
        setTextIfChanged(compactAction, 'نويت الصيام');
      } else if (kind === 'fasting-iftar') {
        setTextIfChanged($('#compactKicker'), 'موعد الإفطار');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'تقبل الله صيامكم وطاعتكم');
        setTextIfChanged(compactAction, 'أفطرت والحمد لله');
      } else if (kind.startsWith('fasting')) {
        setTextIfChanged($('#compactKicker'), 'تذكير الصيام');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'صيام اليوم');
        setTextIfChanged(compactAction, 'صايم إن شاء الله');
      } else if (kind.includes('work') || kind.includes('focus')) {
        setTextIfChanged($('#compactKicker'), 'جلسة التركيز');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || `إجمالي اليوم ${formatElapsed(todayWorkMs(), false)}`);
        setTextIfChanged(compactAction, 'أنهي وسجّل');
      } else if (kind.includes('quran')) {
        setTextIfChanged($('#compactKicker'), 'ورد القرآن');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'قراءة الورد اليومي');
        setTextIfChanged(compactAction, 'قرأت الورد');
      } else if (kind.includes('adhkar')) {
        setTextIfChanged($('#compactKicker'), 'أذكار اليوم');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'أذكار اليوم');
        setTextIfChanged(compactAction, 'أنهيت الأذكار');
      } else if (kind.startsWith('test')) {
        setTextIfChanged($('#compactKicker'), 'اختبار التنبيه');
        setTextIfChanged($('#compactMessage'), activeReminder.title);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'التنبيهات تعمل بنجاح');
        setTextIfChanged(compactAction, 'تم الاختبار');
      } else {
        setTextIfChanged($('#compactKicker'), 'تذكير وِنس');
        setTextIfChanged($('#compactMessage'), activeReminder.title || watch.countdownText);
        setTextIfChanged($('#compactMeta'), activeReminder.body || 'أنا مستني ردّك هنا.');
        setTextIfChanged(compactAction, 'راجع معايا');
      }

      setTextIfChanged(compactActionLater, kind === 'daily-checkin' ? 'لاحقًا' : 'بعد ١٠ دقائق');
      setDisplayIfChanged(compactActionLater, 'inline-flex');
    } else if (watch.urgent) {
      setTextIfChanged($('#compactKicker'), watch.isNow ? 'حان وقت الصلاة' : 'استعداد للصلاة');
      setTextIfChanged(
        $('#compactMessage'),
        watch.isNow ? `حان الآن موعد أذان ${watch.next.name}` : `اقترب موعد صلاة ${watch.next.name}`
      );
      setTextIfChanged(
        $('#compactMeta'),
        watch.isNow ? 'حي على الصلاة، حي على الفلاح' : `فاضل ${watch.remainingText} على الأذان — الاستعداد للوضوء`
      );
      setTextIfChanged(compactAction, 'صليت');
      setTextIfChanged(compactActionLater, 'بعد ١٠ دقائق');
      setDisplayIfChanged(compactActionLater, 'inline-flex');
    } else if (timer.running) {
      setTextIfChanged($('#compactKicker'), 'جلسة التركيز');
      setTextIfChanged($('#compactMessage'), `شغّال بقالك ${formatElapsed(timerElapsed(), false)}`);
      setTextIfChanged($('#compactMeta'), `إجمالي اليوم ${formatElapsed(todayWorkMs(), false)} · ${watch.countdownText}`);
      setTextIfChanged(compactAction, 'أنهي وسجّل');
      setTextIfChanged(compactActionLater, 'إخفاء');
      setDisplayIfChanged(compactActionLater, 'inline-flex');
    } else {
      setTextIfChanged($('#compactKicker'), `الصلاة القادمة · ${watch.timeLabel}`);
      setTextIfChanged($('#compactMessage'), watch.countdownText);
      setTextIfChanged(
        $('#compactMeta'),
        progress.pending
          ? `معاك ${arabicDigits(progress.pending)} مهام لليوم (صلاة، صيام، شغل)`
          : (contextSummary || `الأذان القادم في تمام ${watch.timeLabel}`)
      );
      setTextIfChanged(compactAction, progress.pending ? 'راجع معايا' : 'فتح اليوم');
      setTextIfChanged(compactActionLater, 'إخفاء');
      setDisplayIfChanged(compactActionLater, 'inline-flex');
    }
  }

  let companionState = 'idle';
  const isAccomplished = !progress.pending && todayWorkMs() > 0 && day.tasks.length > 0 && day.tasks.every((t) => t.done);
  if (reminderVisible) {
    const kind = activeReminder.kind || '';
    if (kind.includes('work') || kind.includes('focus')) {
      companionState = 'focus';
    } else if (kind.startsWith('prayer')) {
      companionState = 'prayer';
    } else if (kind.startsWith('fasting')) {
      companionState = 'prayer';
    } else {
      companionState = 'review';
    }
  } else if (watch.urgent) {
    companionState = 'prayer';
  } else if (timer.running) {
    companionState = 'focus';
  } else if (isAccomplished) {
    companionState = 'celebration';
  } else if (progress.pending > 0 && (petMode === 'peek' || petMode === 'expanded')) {
    companionState = 'review';
  }

  const isCriticalAlarm = document.body.classList.contains('is-critical-alarm');
  if (isCriticalAlarm) companionState = 'critical';

  const dragSurface = $('#companionDragSurface');
  if (dragSurface) {
    setExclusiveClass(
      dragSurface,
      ['state-idle', 'state-focus', 'state-prayer', 'state-review', 'state-celebration', 'state-critical'],
      `state-${companionState}`
    );
    setClassIfChanged(dragSurface, 'is-active', Boolean(timer.running || tasbihActive));
    setClassIfChanged(dragSurface, 'is-alert', Boolean(reminderVisible || watch.urgent || isCriticalAlarm));
    setClassIfChanged(dragSurface, 'is-speaking', petMode === 'peek');
    setClassIfChanged(dragSurface, 'menu-open', petMode === 'menu');

    const hudRingFill = $('#hudRingFill');
    if (hudRingFill) {
      let progressRatio = 0;
      const ringCircumference = 326.7;
      if (timer.running) {
        const pomodoroMs = 25 * 60 * 1000;
        progressRatio = Math.min(1, (timerElapsed() % pomodoroMs) / pomodoroMs);
      } else if (watch.urgent) {
        const lead = Math.max(1, Number(state.settings?.wuduLeadMinutes) || 15);
        progressRatio = Math.min(1, Math.max(0, 1 - (watch.remainingMinutes / lead)));
      } else if (progress.total > 0) {
        progressRatio = progress.answered / progress.total;
      }
      const nextOffset = String(Math.round(ringCircumference * (1 - progressRatio) * 10) / 10);
      if (hudRingFill.style.strokeDashoffset !== nextOffset) {
        hudRingFill.style.strokeDashoffset = nextOffset;
      }
    }

    const miniPill = $('#companionMiniPill');
    const miniPillText = $('#companionMiniPillText');
    if (miniPill && miniPillText) {
      let pillClass = '';
      let pillText = '';
      if (isCriticalAlarm) {
        pillClass = 'is-critical';
        pillText = 'منبه السحور ⚠️';
      } else if (tasbihActive) {
        pillClass = 'is-focus';
        pillText = `${TASBIH_PHRASES[tasbihCycle]} (${arabicDigits(tasbihCount)}/٣٣)`;
      } else if (timer.running) {
        pillClass = 'is-focus';
        pillText = `⏱ ${formatElapsed(timerElapsed(), false)}`;
      } else if (watch.urgent) {
        pillClass = 'is-prayer';
        pillText = watch.isNow ? `حان وقت ${watch.next.name}` : `${watch.next.name} خلال ${watch.remainingText}`;
      } else if (worshipDay.fasting === 'yes') {
        pillClass = 'is-prayer';
        pillText = 'صائم اليوم 🌙';
      }
      setExclusiveClass(miniPill, ['is-focus', 'is-prayer', 'is-critical'], pillClass);
      const hasPill = pillText.trim().length > 0 && petMode === 'idle';
      setTextIfChanged(miniPillText, pillText);
      setHiddenIfChanged(miniPill, !hasPill);
      setClassIfChanged(miniPill, 'is-visible', hasPill);
    }
  }
  setClassIfChanged(document.body, 'is-reminding', reminderVisible || watch.urgent);
  setClassIfChanged(document.body, 'has-event', reminderVisible);

  // Only invoke roaming IPC on state transitions (prevents 3,600/hr idle IPC spam)
  const canRoam = Boolean(state.settings?.petRoaming) && !isPetInactive() && petMode === 'idle' && !reminderVisible && !watch.urgent && !timer.running;
  const invoke = tauriInvoke();
  if (invoke && canRoam !== lastRoamIntent) {
    lastRoamIntent = canRoam;
    if (canRoam) {
      invoke('pet_start_roaming').catch(() => {});
    } else {
      invoke('pet_stop_roaming').catch(() => {});
    }
  }

  // Only update expanded drawer DOM nodes when drawer is actually open (0 hidden DOM mutations while idle)
  if (petMode === 'expanded') {
    setTextIfChanged($('#answeredCount'), arabicDigits(progress.answered));
    setTextIfChanged($('#totalCount'), arabicDigits(progress.total));
    const progressFill = $('#progressFill');
    const nextTransform = `scaleX(${progress.total ? progress.answered / progress.total : 0})`;
    if (progressFill && progressFill.style.transform !== nextTransform) {
      progressFill.style.transform = `scaleX(${progress.total ? progress.answered / progress.total : 0})`;
    }

    const elapsedNow = timerElapsed();
    const todayWork = formatElapsed(todayWorkMs(), false);
    setTextIfChanged($('#timerReadout'), formatElapsed(elapsedNow));
    setTextIfChanged($('#todayWorkTotal'), todayWork);
    setTextIfChanged($('#timerState'), timer.running ? 'شغّال الآن' : elapsedNow > 0 ? 'متوقف مؤقتًا' : 'جاهز');
    setTextIfChanged($('#timerToggleButton'), timer.running ? 'وقف مؤقت' : elapsedNow > 0 ? 'كمّل الشغل' : 'ابدأ شغل');
    setDisabledIfChanged($('#timerFinishButton'), elapsedNow < 1000);
    setClassIfChanged($('.work-timer'), 'running', Boolean(timer.running));

    setTextIfChanged($('#prayerPrompt'), `صليت ${progress.prayer.name}؟`);
    setTextIfChanged(
      $('#prayerStatus'),
      prayerAnswer === 'done'
        ? 'اتسجلت، ربنا يتقبل منك'
        : prayerAnswer === 'made-up'
        ? 'اتسجلت إنها اتقضت'
        : prayerAnswer === 'missed'
        ? 'موجودة ضمن الصلوات المحتاجة قضاء'
        : prayerAnswer === 'later'
        ? 'تمام، هفضل مبيّنها لك لحد ما ترجع'
        : `ميعادها ${formatClock(progress.prayer.time)}`
    );
    document.querySelectorAll('[data-prayer-answer]').forEach((button) => {
      setClassIfChanged(button, 'selected', button.dataset.prayerAnswer === prayerAnswer);
    });
    const prayerChecklist = $('#prayerChecklist');
    const checklistIndexes = checklistPrayerIndexes(now);
    const prayerSignature = checklistIndexes.map((index) => `${PRAYER_NAMES[index]}:${worshipDay.prayers?.[PRAYER_NAMES[index]] || ''}:${prayerTimes[index]?.getTime() || 0}`).join('|') + `|current:${progress.prayer.name}`;
    if (prayerChecklist && prayerChecklist.dataset.signature !== prayerSignature) {
      const prayerMarkup = checklistIndexes.map((index) => {
        const name = PRAYER_NAMES[index]; const done = prayerIsComplete(worshipDay.prayers?.[name]); const current = index !== 1 && name === progress.prayer.name; const optional = index === 1;
        const time = formatClock(prayerTimes[index]);
        return `<button class="prayer-check${done ? ' done' : ''}${current ? ' current' : ''}${optional ? ' optional' : ''}" type="button" data-prayer-toggle="${escapeHtml(name)}" aria-pressed="${done}" aria-label="${done ? 'إلغاء علامة اكتمال' : 'علّم كمكتملة'}: ${escapeHtml(name)}${optional ? '، نافلة اختيارية لو أنت صاحي' : ''}"><span class="checkmark">✓</span><strong>${escapeHtml(name)}</strong><small>${optional ? 'نافلة · ' : ''}${escapeHtml(time)}</small></button>`;
      }).join('');
      prayerChecklist.innerHTML = prayerMarkup;
      prayerChecklist.dataset.signature = prayerSignature;
    }
    document.querySelectorAll('[data-fasting-answer]').forEach((button) => {
      setClassIfChanged(button, 'selected', button.dataset.fastingAnswer === worshipDay.fasting);
    });
    setTextIfChanged(
      $('#fastingStatus'),
      worshipDay.fasting === 'yes'
        ? 'اتسجل إنك صايم النهارده'
        : worshipDay.fasting === 'no'
        ? 'اتسجلت الإجابة من غير أي حكم'
        : worshipDay.fasting === 'not-planned'
        ? 'تمام، مش يوم صيام مخطط'
        : 'اختار الإجابة المناسبة لليوم'
    );
    setClassIfChanged($('#prayerQuestion'), 'answered', progress.prayerAnswered);
    setClassIfChanged($('#fastingQuestion'), 'answered', progress.fastingAnswered);
    setClassIfChanged($('#workQuestion'), 'answered', progress.workAnswered);
    setTextIfChanged(
      $('#taskProgress'),
      day.tasks.length ? `${arabicDigits(progress.workDone)} من ${arabicDigits(day.tasks.length)} خلصوا` : 'ضيف أول مهمة'
    );
    const dailyTaskList = $('#dailyTaskList');
    const taskSignature = JSON.stringify(day.tasks.map(({ id, title, done }) => [id, title, Boolean(done)]));
    if (dailyTaskList && dailyTaskList.dataset.signature !== taskSignature) {
      dailyTaskList.innerHTML = day.tasks.length
        ? day.tasks.map((task) => `<div class="daily-task${task.done ? ' done' : ''}"><button class="task-toggle" type="button" data-task-toggle="${escapeHtml(task.id)}" aria-pressed="${Boolean(task.done)}"><span class="checkmark">✓</span><span>${escapeHtml(task.title)}</span></button><button class="task-delete" type="button" data-task-delete="${escapeHtml(task.id)}" aria-label="حذف المهمة ${escapeHtml(task.title)}">×</button></div>`).join('')
        : '<p class="task-empty">اكتب اللي عايز تخلصه، وبعدها علّم عليه ✓</p>';
      dailyTaskList.dataset.signature = taskSignature;
    }
    const savedNote = $('#savedWorkNote');
    setHiddenIfChanged(savedNote, !day.workNote);
    setTextIfChanged(savedNote, day.workNote ? `آخر حاجة سجلتها: ${day.workNote}` : '');
    setTextIfChanged($('#checkinTitle'), progress.pending ? 'نراجع يومك في دقيقة؟' : 'كده يومك بقى قدامك');
    setTextIfChanged(
      $('#checkinSubtitle'),
      progress.pending
        ? `قدامك ${arabicDigits(progress.pending)} حاجات لسه؛ وكلها محفوظة عندك.`
        : `خلصت ${arabicDigits(progress.answered)} من ${arabicDigits(progress.total)} واشتغلت ${todayWork}.`
    );
  }

  applyAvatarTheme();
  const theme = state.settings?.themeId || 'midnight-magenta';
  const accent = state.settings?.accentId || 'amber';
  setDatasetIfChanged(document.documentElement, 'theme', theme);
  setDatasetIfChanged(document.documentElement, 'accent', accent);
  const legacyTheme = state.settings?.themeAccent || 'default';
  if (legacyTheme !== 'default') {
    setDatasetIfChanged(document.documentElement, 'themeAccent', legacyTheme);
  } else if (document.documentElement.dataset.themeAccent !== undefined) {
    delete document.documentElement.dataset.themeAccent;
  }
}

function applyAvatarTheme(avatar = state.settings?.petAvatar || 'orb') {
  const dragSurface = $('#companionDragSurface');
  const miniWens = $('.mini-wens');
  const allAvatarClasses = ['avatar-sprout', 'avatar-robot', 'avatar-ninja', 'avatar-orb', 'avatar-cat', 'avatar-owl', 'avatar-crescent', 'avatar-lantern'];
  const allSizeClasses = ['size-small', 'size-normal', 'size-large'];
  const activeAvatar = ['robot', 'orb', 'cat', 'owl', 'crescent', 'sprout', 'lantern'].includes(avatar) ? avatar : 'orb';
  state.settings.petAvatar = activeAvatar;
  const size = ['small', 'normal', 'large'].includes(state.settings?.petSize) ? state.settings.petSize : 'normal';
  if (dragSurface) {
    setExclusiveClass(dragSurface, allAvatarClasses, `avatar-${activeAvatar}`);
    setExclusiveClass(dragSurface, allSizeClasses, `size-${size}`);
  }
  if (miniWens) {
    setExclusiveClass(miniWens, allAvatarClasses, `avatar-${activeAvatar}`);
  }
  if (petMode === 'expanded') {
    document.querySelectorAll('[data-avatar]').forEach((btn) => {
      setClassIfChanged(btn, 'active', btn.dataset.avatar === activeAvatar);
    });
  }
}

async function checkIsNearLeft() {
  try {
    const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
    if (currentWindow?.currentMonitor && currentWindow?.outerPosition) {
      const [monitor, pos] = await Promise.all([
        currentWindow.currentMonitor(),
        currentWindow.outerPosition()
      ]);
      if (monitor && pos) {
        const distFromLeft = pos.x - monitor.position.x;
        return distFromLeft < (220 * (monitor.scaleFactor || 1));
      }
    }
  } catch {}
  try {
    const saved = JSON.parse(localStorage.getItem(PET_POSITION_KEY) || 'null');
    if (saved && Number.isFinite(saved.x)) {
      if (Number.isFinite(saved.monitorLeft)) {
        const scale = Number.isFinite(saved.scaleFactor) && saved.scaleFactor > 0 ? saved.scaleFactor : 1;
        return (saved.x - saved.monitorLeft) < (220 * scale);
      }
      // Safe on negative left-hand monitors: compare relative to current screen's left edge
      const screenLeft = Number.isFinite(window.screen?.availLeft) ? window.screen.availLeft : 0;
      const relX = saved.x - screenLeft;
      return relX >= 0 && relX < 150;
    }
  } catch {}
  return false;
}

async function setPetMode(mode, autoHideMs = 0) {
  petMode = ['idle', 'peek', 'expanded', 'menu'].includes(mode) ? mode : 'idle';
  window.clearTimeout(modeTimeout);
  document.body.classList.toggle('is-idle', petMode === 'idle');
  document.body.classList.toggle('is-peek', petMode === 'peek');
  document.body.classList.toggle('is-expanded', petMode === 'expanded');
  document.body.classList.toggle('is-menu', petMode === 'menu');
  document.body.classList.toggle('menu-open', petMode === 'menu');
  $('.expanded-view').hidden = petMode !== 'expanded';
  const idleTools = $('.idle-tools');
  if (idleTools) idleTools.classList.remove('is-visible');
  if (petMode !== 'menu') {
    const menu = $('#wensContextMenu');
    if (menu) menu.hidden = true;
  }
  if (petMode === 'peek' || petMode === 'menu') {
    const bubble = $('#eventBubble');
    const menu = $('#wensContextMenu');
    if (bubble && petMode === 'peek') {
      const pSize = ['compact', 'normal', 'large'].includes(state.settings?.petPopupSize) ? state.settings.petPopupSize : 'normal';
      bubble.classList.remove('size-compact', 'size-normal', 'size-large');
      bubble.classList.add(`size-${pSize}`);
    }
    const isNearLeft = await checkIsNearLeft();
    if (bubble) bubble.classList.toggle('align-left', isNearLeft);
    if (menu) menu.classList.toggle('align-left', isNearLeft);
    const dragSurface = $('#companionDragSurface');
    if (dragSurface) {
      dragSurface.classList.toggle('align-left', isNearLeft);
    }
  }
  applyIdleFadeState();
  const invoke = tauriInvoke();
  if (invoke) await invoke('pet_set_mode', { mode: petMode }).catch(() => {});
  render();
  syncIdleBlinkState();
  schedulePetLoop();
  if (petMode === 'peek' && autoHideMs > 0) {
    modeTimeout = window.setTimeout(() => setPetMode('idle'), autoHideMs);
  }
}

function updateContextMenuSoundState() {
  const soundsEnabled = isPetSoundsEnabled();
  const soundIcon = $('#menuSoundIcon');
  const soundLabel = $('#menuSoundLabel');
  if (soundIcon) {
    soundIcon.textContent = soundsEnabled ? '🔔' : '🔕';
  }
  if (soundLabel) {
    soundLabel.textContent = soundsEnabled ? 'كتم صوت التفاعل' : 'تشغيل صوت التفاعل';
  }
}

async function openContextMenu() {
  const menu = $('#wensContextMenu');
  if (!menu) return;

  const toast = $('#petToast');
  if (toast) {
    window.clearTimeout(toastTimeout);
    toast.hidden = true;
  }

  if (window.playCompanionSound) {
    const avatar = state.settings?.petAvatar || 'orb';
    window.playCompanionSound(avatar, 'tap', { enabled: isPetSoundsEnabled() });
  }

  updateContextMenuSoundState();
  menu.hidden = false;
  await setPetMode('menu');

  const firstItem = menu.querySelector('.context-menu-item');
  if (firstItem) {
    firstItem.focus();
  }
}

async function closeContextMenu(nextMode = 'idle') {
  const menu = $('#wensContextMenu');
  if (menu) menu.hidden = true;
  if (petMode === 'menu') {
    await setPetMode(nextMode);
  }
}

function showToast(message) {
  const toast = $('#petToast');
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

async function answerPrayer(answer) {
  const todayStr = worshipDateKey();
  const day = currentDay(todayStr);
  const prayer = currentPrayer();
  const pKey = PRAYER_KEY_MAP[prayer.name];
  day.prayers ||= {};
  day.prayers[prayer.name] = answer;
  day.responses.prayerAt = new Date().toISOString();
  day.updatedAt = new Date().toISOString();
  if (answer === 'done') {
    activeReminder = null;
    resolvePetPrayerBacklog(todayStr, prayer.name, 'done');
    syncCheckToVNext(pKey, true, todayStr);
    await persistDailyWorshipToSqlite(todayStr, pKey ? { [pKey]: true } : {});
    await saveState({ action: 'markPrayer', prayerName: prayer.name, prayerKey: pKey, date: todayStr });
    tauriEmit()?.('wens-prayer-completed', { prayerName: prayer.name, prayerKey: pKey, source: 'pet', date: todayStr }).catch(() => {});
  } else {
    syncCheckToVNext(pKey, false, todayStr);
    await persistDailyWorshipToSqlite(todayStr, pKey ? { [pKey]: false } : {});
    await saveState();
  }
  render();
  showToast(answer === 'done' ? `اتسجلت ${prayer.name}… ربنا يتقبل منك.` : `تمام، ${prayer.name} لسه على رادارك.`);
}

async function answerFasting(answer) {
  const todayStr = worshipDateKey();
  const day = currentDay(todayStr);
  const isFasting = answer === 'yes';
  day.fasting = answer;
  day.responses.fastingAt = new Date().toISOString();
  day.updatedAt = new Date().toISOString();
  state.fasting ||= {};
  state.fasting.today = isFasting;
  // Aligned with vNext worship-storage key ('fasting', NOT 'fasting_today')
  syncCheckToVNext('fasting', isFasting, todayStr);
  await persistDailyWorshipToSqlite(todayStr, { fasting: isFasting });
  await saveState({ action: 'markFasting', fastingDate: todayStr, completed: isFasting });
  render();
  showToast(isFasting ? 'ربنا يتقبل صيامك.' : 'اتسجل ردك من غير أي ضغط.');
}

async function togglePrayer(name) {
  const todayStr = worshipDateKey();
  const day = currentDay(todayStr);
  const wasDone = prayerIsComplete(day.prayers?.[name]);
  const pKey = PRAYER_KEY_MAP[name];
  if (wasDone) {
    delete day.prayers[name];
    syncCheckToVNext(pKey, false, todayStr);
    day.updatedAt = new Date().toISOString();
    await persistDailyWorshipToSqlite(todayStr, pKey ? { [pKey]: false } : {});
    await saveState();
  } else {
    const now = new Date();
    ensurePrayerTimes(now);
    const pIdx = PRAYER_NAMES.indexOf(name);
    if (pIdx >= 0 && prayerTimes[pIdx] && prayerTimes[pIdx] > now) {
      showToast(`لسه ميعاد صلاة ${name} مدخلش.`);
      return;
    }
    day.prayers[name] = 'done';
    resolvePetPrayerBacklog(todayStr, name, 'done');
    syncCheckToVNext(pKey, true, todayStr);
    day.updatedAt = new Date().toISOString();
    await persistDailyWorshipToSqlite(todayStr, pKey ? { [pKey]: true } : {});
    await saveState({ action: 'markPrayer', prayerName: name, prayerKey: pKey, date: todayStr });
    tauriEmit()?.('wens-prayer-completed', { prayerName: name, prayerKey: pKey, source: 'pet', date: todayStr }).catch(() => {});
  }
  render();
  showToast(wasDone ? `${name} رجعت ضمن اللي لسه.` : `${name} اتعلمت كمكتملة… ربنا يتقبل منك.`);
}

async function addDailyTask() {
  const input = $('#dailyTaskInput');
  const title = input.value.trim();
  if (!title) { showToast('اكتب المهمة الأول.'); input.focus(); return; }
  const day = currentDay();
  day.tasks.push({ id: crypto.randomUUID?.() || String(Date.now()), title, done: false, createdAt: new Date().toISOString(), completedAt: null });
  day.updatedAt = new Date().toISOString(); input.value = '';
  await saveState(); render(); showToast('اتضافت لقائمة النهارده.');
}

async function toggleDailyTask(id) {
  const day = currentDay(); const task = day.tasks.find((item) => item.id === id); if (!task) return;
  task.done = !task.done; task.completedAt = task.done ? new Date().toISOString() : null; day.updatedAt = new Date().toISOString();
  await saveState(); render(); showToast(task.done ? `خلصت: ${task.title}` : `${task.title} رجعت ضمن اللي لسه.`);
}

async function deleteDailyTask(id) {
  const day = currentDay(); day.tasks = day.tasks.filter((item) => item.id !== id); day.updatedAt = new Date().toISOString();
  await saveState(); render(); showToast('المهمة اتشالت من قائمة النهارده.');
}

async function saveWorkNote() {
  const input = $('#workNote');
  const value = input.value.trim();
  if (!value) { showToast('اكتب خطوة صغيرة حصلت الأول.'); input.focus(); return; }
  const day = currentDay();
  day.workNote = value; day.responses.workAt = new Date().toISOString(); day.updatedAt = new Date().toISOString();
  input.value = '';
  await saveState(); render(); showToast('اتسجلت الخطوة… كده في دليل إن اليوم اتحرك.');
}

async function toggleTimer() {
  state.workTimer ||= structuredClone(defaultPetState.workTimer);
  if (state.workTimer.running) {
    state.workTimer.accumulatedMs = timerElapsed();
    state.workTimer.running = false; state.workTimer.startedAt = null;
    showToast('وقفت العداد مؤقتًا. وقتك لسه محفوظ.');
  } else {
    state.workTimer.running = true; state.workTimer.startedAt = Date.now();
    showToast('بدأنا… وِنس بيحسب وقت الشغل الحقيقي.');
  }
  await saveState(); render(); schedulePetLoop();
}

async function finishTimer() {
  const elapsed = timerElapsed();
  if (elapsed < 1000) return;
  const now = new Date();
  const startedAt = new Date(now.getTime() - elapsed).toISOString();
  const endedAt = now.toISOString();
  const sessionId = crypto.randomUUID?.() || `pet-${now.getTime()}`;
  const noteText = ($('#workNote')?.value || '').trim() || 'جلسة تركيز من الرفيق العائم';

  state.workSessions ||= [];
  state.workSessions.unshift({ id: sessionId, startedAt, endedAt, durationMs: elapsed, note: noteText, source: 'floating-pet' });
  const day = currentDay();
  day.focusedMs = (Number(day.focusedMs) || 0) + elapsed;
  day.responses.workAt = endedAt;
  day.updatedAt = endedAt;
  state.workTimer = structuredClone(defaultPetState.workTimer);

  const invokeWork = tauriInvoke();
  if (invokeWork) {
    await invokeWork('work_session_save', {
      record: {
        id: sessionId,
        projectId: null,
        projectTitle: null,
        durationSecs: Math.max(1, Math.round(elapsed / 1000)),
        startedAt,
        endedAt,
        note: noteText
      }
    }).catch(() => {});
  }
  await saveState();
  render();
  showToast(`سجلت جلسة ${formatElapsed(elapsed, false)}. اكتب عملت إيه لو تحب.`);
  await handleIncomingReminder({
    id: `work-finish-${now.getTime()}`,
    title: 'اكتملت جلسة العمل',
    body: 'تم إنجاز وقت التركيز بنجاح',
    kind: 'work-focus'
  });
  $('#workNote')?.focus();
}

async function showMain() {
  const invoke = tauriInvoke();
  if (invoke) await invoke('show_main').catch(() => {});
}

async function hidePet() {
  await persistSettingsPatch({ petVisible: false });
  updateHiddenPauseClass();
  stopIdleBlinkLoop();
  if (petLoopTimer) {
    window.clearTimeout(petLoopTimer);
    petLoopTimer = null;
  }
  const invoke = tauriInvoke();
  if (invoke) await invoke('pet_set_visible', { visible: false }).catch(() => {});
}

async function sendPetNotification(title, body) {
  const invoke = tauriInvoke();
  if (invoke) await invoke('notification_send', { title, body }).catch(() => {});
}

const handledReminderIds = new Map();
const triggeredLocalEvents = new Set();
let lastFocusMilestoneAlert = 0;

function trackBoundedMap(map, key, val) {
  if (map.size >= MAX_TRACKED_EVENTS) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
}

function trackBoundedSet(set, key) {
  if (set.size >= MAX_TRACKED_EVENTS) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(key);
}

async function handleIncomingReminder(reminder) {
  if (!reminder || !reminder.title) return;
  if (state.settings?.petVisible === false) return;
  if (reminder.status === 'suppressed' && state.settings?.quietDefault) return;

  const nowMs = Date.now();
  const reminderId = reminder.id || `${reminder.kind || 'generic'}-${reminder.title}`;
  if (handledReminderIds.has(reminderId) && (nowMs - handledReminderIds.get(reminderId) < 60000)) {
    return;
  }
  trackBoundedMap(handledReminderIds, reminderId, nowMs);

  const isPrayer = reminder.kind === 'prayer-at';
  const isPrep = reminder.kind?.startsWith('prayer-prepare');
  const isFasting = reminder.kind?.startsWith('fasting');
  const isCheckin = reminder.kind === 'daily-checkin';

  const expiryMinutes = isPrayer ? 30 : isPrep ? 15 : isFasting ? 60 : isCheckin ? 15 : 30;
  activeReminder = {
    ...reminder,
    expiresAt: nowMs + expiryMinutes * 60 * 1000
  };

  // 1. Immediately wake up companion to 100% opacity if currently visible
  const shell = $('#petShell');
  if (shell) {
    shell.classList.remove('is-idle-faded');
  }
  window.clearTimeout(idleFadeTimer);
  const toast = $('#petToast');
  if (toast) toast.hidden = true;

  // 2. Automatically reveal speech / reminder bubble in peek mode
  const autoHideMs = (isPrayer || isFasting) ? 75000 : isCheckin ? 25000 : 45000;
  await setPetMode('peek', autoHideMs);

  // 3. Trigger arrival bounce animation on companion avatar
  const dragSurface = $('#companionDragSurface');
  if (dragSurface) {
    dragSurface.classList.remove('is-alerting');
    void dragSurface.offsetWidth;
    dragSurface.classList.add('is-alerting');
    window.setTimeout(() => dragSurface.classList.remove('is-alerting'), 1000);
  }
  document.body.classList.remove('reminder-arrival');
  void document.body.offsetWidth;
  document.body.classList.add('reminder-arrival');
  window.setTimeout(() => document.body.classList.remove('reminder-arrival'), 1000);

  // 4. Play companion alert chime
  if (window.playCompanionSound) {
    const avatar = state.settings?.petAvatar || 'orb';
    window.playCompanionSound(avatar, 'alert', { enabled: isPetSoundsEnabled() });
  }

  // 5. Render active reminder content
  render();
  schedulePetLoop();
}

async function checkCompanionEventTick() {
  if (isPetInactive()) return;
  const now = new Date();
  const nowMs = now.getTime();

  // Work / Focus milestone for Pet's local stopwatch (runs in both Tauri and browser)
  if (state.workTimer?.running) {
    const elapsedMs = timerElapsed();
    const targetMs = 25 * 60 * 1000;
    if (elapsedMs >= targetMs && (nowMs - lastFocusMilestoneAlert > 30 * 60 * 1000)) {
      lastFocusMilestoneAlert = nowMs;
      await handleIncomingReminder({
        id: `work-milestone-${nowMs}`,
        title: 'اكتملت جلسة العمل',
        body: 'تم إنجاز وقت التركيز بنجاح',
        kind: 'work-focus'
      });
    }
  }

  // Inside Tauri, Rust's ReminderScheduler is the SINGLE source of truth for prayer & fasting alerts.
  // Only run the local fallback scheduler in standalone browser preview mode!
  if (tauriInvoke()) return;

  ensurePrayerTimes(now);
  if (!prayerTimes || prayerTimes.length < 6) return;

  const currentDayKey = worshipDateKey(now);
  const notifs = state.settings?.notifications || {};

  // 1. Prayer at time (browser fallback only)
  if (notifs.prayerAtTimeEnabled !== false) {
    for (const idx of REQUIRED_PRAYER_INDEXES) {
      const pTime = prayerTimes[idx];
      if (!pTime) continue;
      const diffMs = nowMs - pTime.getTime();
      if (diffMs >= 0 && diffMs < 15 * 60 * 1000) {
        const eventKey = `prayer-at-${currentDayKey}-${idx}`;
        if (!triggeredLocalEvents.has(eventKey)) {
          trackBoundedSet(triggeredLocalEvents, eventKey);
          await handleIncomingReminder({
            id: eventKey,
            title: `حان الآن موعد أذان ${PRAYER_NAMES[idx]}`,
            body: 'حي على الصلاة، حي على الفلاح',
            kind: 'prayer-at'
          });
        }
      }
    }
  }

  // 2. Pre-prayer preparation (browser fallback only)
  const defaultLead = Number(state.settings?.wuduLeadMinutes) || 15;
  if (notifs.prePrayerEnabled !== false) {
    const rawLeads = Array.isArray(state.settings?.prePrayerLeads) && state.settings.prePrayerLeads.length > 0
      ? state.settings.prePrayerLeads
      : [defaultLead];
    const leads = Array.from(new Set(rawLeads.map(Number))).filter((m) => Number.isFinite(m) && m > 0).sort((a, b) => b - a);

    for (const idx of REQUIRED_PRAYER_INDEXES) {
      const pTime = prayerTimes[idx];
      if (!pTime) continue;
      for (const lead of leads) {
        const targetMs = pTime.getTime() - lead * 60 * 1000;
        const diffMs = nowMs - targetMs;
        if (diffMs >= 0 && diffMs < 5 * 60 * 1000) {
          const eventKey = `prayer-prep-${currentDayKey}-${idx}-${lead}`;
          if (!triggeredLocalEvents.has(eventKey)) {
            trackBoundedSet(triggeredLocalEvents, eventKey);
            const leadLabel = lead === 60 ? 'ساعة' : lead === 30 ? 'نصف ساعة' : lead === 20 ? 'ثلث ساعة' : lead === 15 ? 'ربع ساعة' : lead === 10 ? '١٠ دقائق' : lead === 5 ? '٥ دقائق' : `${arabicDigits(lead)} دقائق`;
            await handleIncomingReminder({
              id: eventKey,
              title: `اقترب موعد صلاة ${PRAYER_NAMES[idx]} (فاضل ${leadLabel})`,
              body: `فاضل ${leadLabel} على الأذان — الاستعداد للوضوء`,
              kind: `prayer-prepare-${lead}`
            });
          }
        }
      }
    }
  }

  // 3. Fasting suhoor (browser fallback only — strictly opt-in via fastingEnabled === true)
  const fajrTime = prayerTimes[0];
  if (fajrTime && notifs.fastingEnabled === true) {
    const suhoorLead = Math.max(5, Math.min(180, Number(state.settings?.suhoorLeadMinutes) || 45));
    const targetMs = fajrTime.getTime() - suhoorLead * 60 * 1000;
    const diffMs = nowMs - targetMs;
    if (diffMs >= 0 && diffMs < 30 * 60 * 1000) {
      const eventKey = `fasting-suhoor-${currentDayKey}`;
      if (!triggeredLocalEvents.has(eventKey)) {
        trackBoundedSet(triggeredLocalEvents, eventKey);
        await handleIncomingReminder({
          id: eventKey,
          title: 'حان وقت السحور',
          body: 'بركة السحور — موعد الإمساك يقترب',
          kind: 'fasting-suhoor'
        });
      }
    }
  }

  // 4. Fasting iftar (browser fallback only — never fires when day.fasting === 'no')
  const maghribTime = prayerTimes[4];
  const day = currentDay(currentDayKey);
  if (maghribTime && day.fasting !== 'no' && (day.fasting === 'yes' || notifs.fastingEnabled === true)) {
    const diffMs = nowMs - maghribTime.getTime();
    if (diffMs >= 0 && diffMs < 30 * 60 * 1000) {
      const eventKey = `fasting-iftar-${currentDayKey}`;
      if (!triggeredLocalEvents.has(eventKey)) {
        trackBoundedSet(triggeredLocalEvents, eventKey);
        await handleIncomingReminder({
          id: eventKey,
          title: 'حان موعد إفطار المغرب',
          body: 'تقبل الله صيامكم وطاعتكم',
          kind: 'fasting-iftar'
        });
      }
    }
  }
}

async function maybeRemind() {
  if (isPetInactive()) return;
  const progress = participation();
  if (!progress.pending || state.settings?.quietDefault) return;
  const last = Number(state.accountability?.lastReminderAt) || 0;
  if (last === 0) {
    state.accountability ||= {};
    state.accountability.lastReminderAt = Date.now();
    await saveState();
    return;
  }
  if (Date.now() - last < 90 * 60 * 1000) return;
  state.accountability.lastReminderAt = Date.now();
  await saveState();
  const prayerInfo = getPrayerCountdown();
  await handleIncomingReminder({
    title: prayerInfo.countdownText,
    body: `معاك ${arabicDigits(progress.pending)} مهام للمتابعة (صلاة، صيام، شغل) — افتحها وقت ما يناسبك.`,
    kind: 'daily-checkin'
  });
}

function listenNativeReminders() {
  const tListen = window.__TAURI__?.event?.listen;
  if (!tListen) return;

  tListen('wens-critical-alarm', async (event) => {
    if (state.settings?.petVisible === false) return;
    const payload = event.payload || {};
    document.body.classList.add('is-critical-alarm');
    await handleIncomingReminder({
      id: payload.id || 'suhoor-critical',
      title: payload.title || 'منبه السحور القوي ⚠️',
      body: payload.body || 'حان موعد الاستيقاظ لتناول السحور وبركة الصيام',
      kind: 'fasting-suhoor'
    });
  }).catch(() => {});

  const clearAlarm = () => {
    document.body.classList.remove('is-critical-alarm');
    if (activeReminder?.kind?.startsWith('fasting')) {
      activeReminder = null;
      render();
    }
    syncIdleBlinkState();
    schedulePetLoop();
  };
  tListen('wens-alarm-dismissed', clearAlarm).catch(() => {});
  tListen('wens-alarm-snoozed', clearAlarm).catch(() => {});

  tListen('wens-reminder', async (event) => {
    const reminder = event.payload || {};
    if (!reminder.title) return;
    await handleIncomingReminder(reminder);
  }).catch(() => {});
}
window.handleIncomingReminder = handleIncomingReminder;

async function persistPhysicalPositionSnapshot(posOverride = null) {
  try {
    const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
    if (!currentWindow) return;
    const [pos, monitor] = await Promise.all([
      posOverride ? Promise.resolve(posOverride) : currentWindow.outerPosition?.().catch(() => null),
      currentWindow.currentMonitor?.().catch(() => null)
    ]);
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      const payload = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        unit: 'physical',
        monitorLeft: Number.isFinite(monitor?.position?.x) ? monitor.position.x : undefined,
        scaleFactor: Number.isFinite(monitor?.scaleFactor) ? monitor.scaleFactor : undefined
      };
      localStorage.setItem(PET_POSITION_KEY, JSON.stringify(payload));
    }
  } catch {}
}

async function restoreAndTrackPosition() {
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const saved = JSON.parse(localStorage.getItem(PET_POSITION_KEY) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      await invoke('pet_restore_position', { x: Math.round(saved.x), y: Math.round(saved.y) });
    }
    const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
    if (currentWindow?.onMoved) {
      onMovedActive = true;
      await currentWindow.onMoved(({ payload }) => {
        if (Number.isFinite(payload?.x) && Number.isFinite(payload?.y)) {
          persistPhysicalPositionSnapshot({ x: payload.x, y: payload.y });
        }
      });
    }
  } catch {}
}

function setEyeOffset(dxPx, dyPx) {
  const dragSurface = $('#companionDragSurface');
  if (!dragSurface) return;
  dragSurface.style.setProperty('--eye-dx', `${dxPx.toFixed(2)}px`);
  dragSurface.style.setProperty('--eye-dy', `${dyPx.toFixed(2)}px`);
}

function bindEvents() {
  $('#revealPetButton').addEventListener('click', () => setPetMode(petMode === 'peek' ? 'idle' : 'peek', 25000));
  $('#compactAction').addEventListener('click', async () => {
    const text = $('#compactAction')?.textContent || '';
    const kind = activeReminder?.kind || '';
    if (document.body.classList.contains('is-critical-alarm')) {
      await showMain();
      setPetMode('idle');
      return;
    }

    if (kind.startsWith('fasting') || text.includes('الصيام') || text.includes('أفطرت')) {
      await answerFasting('yes');
      activeReminder = null;
      setPetMode('idle');
      return;
    }

    if (text.includes('صليت') || kind === 'prayer-at') {
      const todayStr = worshipDateKey();
      const day = currentDay(todayStr);
      const progress = participation();
      const targetPrayer = extractPrayerNameFromReminder(activeReminder, progress.prayer.name);
      const pKey = PRAYER_KEY_MAP[targetPrayer];
      day.prayers ||= {};
      day.prayers[targetPrayer] = 'done';
      day.responses.prayerAt = new Date().toISOString();
      day.updatedAt = new Date().toISOString();
      resolvePetPrayerBacklog(todayStr, targetPrayer, 'done');
      syncCheckToVNext(pKey, true, todayStr);
      activeReminder = null;
      await persistDailyWorshipToSqlite(todayStr, pKey ? { [pKey]: true } : {});
      await saveState({ action: 'markPrayer', prayerName: targetPrayer, prayerKey: pKey, date: todayStr });
      tauriEmit()?.('wens-prayer-completed', { prayerName: targetPrayer, prayerKey: pKey, source: 'pet', date: todayStr }).catch(() => {});
      render();
      setPetMode('idle');
      showToast(`تم تسجيل صلاة ${targetPrayer}… ربنا يتقبل منك.`);
      return;
    }

    if (kind.includes('work') || kind.includes('focus') || text.includes('أنهي وسجّل')) {
      await finishTimer();
      activeReminder = null;
      setPetMode('idle');
      return;
    }

    if (kind.includes('quran') || text.includes('الورد')) {
      activeReminder = null;
      setPetMode('idle');
      showToast('ربنا يتقبل قراءتك ويجعله في ميزان حسناتك.');
      return;
    }

    if (kind.includes('adhkar') || text.includes('الأذكار')) {
      activeReminder = null;
      setPetMode('idle');
      showToast('تقبل الله ذكرك وطاعتك.');
      return;
    }

    if (kind.startsWith('test') || text.includes('تم الاختبار')) {
      activeReminder = null;
      setPetMode('idle');
      showToast('التنبيهات تعمل بنجاح!');
      return;
    }

    if (text.includes('استعد للصلاة') || text.includes('فتح اليوم') || text.includes('راجع معايا')) {
      activeReminder = null;
      showMain();
      setPetMode('idle');
      return;
    }

    activeReminder = null;
    showMain();
    setPetMode('idle');
  });

  $('#compactBubbleClose')?.addEventListener('click', (e) => {
    e.stopPropagation();
    activeReminder = null;
    setPetMode('idle');
  });

  $('#compactActionLater')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeReminder) {
      setPetMode('idle');
      return;
    }
    const snoozed = { ...activeReminder, id: `${activeReminder.id || 'snooze'}-${Date.now()}` };
    activeReminder = null;
    setPetMode('idle');
    showToast('تمام، هفكرك تاني بعد ١٠ دقائق.');
    window.setTimeout(async () => {
      await handleIncomingReminder(snoozed);
    }, 10 * 60 * 1000);
  });

  $('#collapsePetButton').addEventListener('click', () => setPetMode('idle'));
  $('#openMainButton').addEventListener('click', showMain);
  $('#expandedOpenMainButton').addEventListener('click', showMain);
  $('#openMainFooterButton').addEventListener('click', showMain);
  $('#hidePetButton').addEventListener('click', hidePet);
  $('#expandedHidePetButton').addEventListener('click', hidePet);

  const shell = $('#petShell');
  if (shell) {
    shell.addEventListener('pointerenter', () => {
      isCompanionHovered = true;
      shell.classList.remove('is-idle-faded');
      window.clearTimeout(idleFadeTimer);
    });
    shell.addEventListener('pointerleave', () => {
      isCompanionHovered = false;
      const tools = $('.idle-tools');
      if (tools) tools.classList.remove('is-visible');
      applyIdleFadeState();
    });
    shell.addEventListener('pointerdown', () => {
      isCompanionHovered = true;
      shell.classList.remove('is-idle-faded');
      window.clearTimeout(idleFadeTimer);
    });
  }

  function attachWindowDrag(element, options = {}) {
    if (!element) return;
    let isDown = false;
    let isDragging = false;
    let activePointerId = null;
    let startScreen = { x: 0, y: 0 };
    let initialWinPhys = { x: 0, y: 0 };
    let dragScale = window.devicePixelRatio || 1;
    let rafId = null;
    let pendingPos = null;
    let dragMovePending = false;

    const onPointerMove = (event) => {
      if (!isDown) return;
      const dist = Math.hypot(event.screenX - startScreen.x, event.screenY - startScreen.y);
      if (!isDragging) {
        if (dist < 6) return;
        isDragging = true;
        element.classList.add('is-dragging');
        if (options.onDragStart) options.onDragStart(event);
      }
      if (isDragging) {
        const targetX = Math.round(initialWinPhys.x + (event.screenX - startScreen.x) * dragScale);
        const targetY = Math.round(initialWinPhys.y + (event.screenY - startScreen.y) * dragScale);
        pendingPos = { x: targetX, y: targetY };

        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            if (!pendingPos || dragMovePending) return;
            const posToSend = pendingPos;
            dragMovePending = true;
            const invoke = tauriInvoke();
            if (invoke) {
              invoke('pet_set_position', { x: posToSend.x, y: posToSend.y })
                .catch(() => {})
                .finally(() => {
                  dragMovePending = false;
                });
            } else {
              dragMovePending = false;
            }
          });
        }
      }
    };

    const finishDrag = (event) => {
      if (!isDown) return;
      isDown = false;
      if (activePointerId !== null) {
        try {
          if (element.hasPointerCapture?.(activePointerId)) {
            element.releasePointerCapture(activePointerId);
          }
        } catch {}
        activePointerId = null;
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);

      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      element.classList.remove('is-dragging');
      const wasDragging = isDragging;
      isDragging = false;

      if (wasDragging && pendingPos) {
        const invoke = tauriInvoke();
        if (invoke) {
          invoke('pet_set_position', { x: pendingPos.x, y: pendingPos.y })
            .then((safePos) => {
              // Persist strictly physical position snapshot (matches onMoved & pet_restore_position)
              if (!onMovedActive) {
                if (Array.isArray(safePos) && Number.isFinite(safePos[0]) && Number.isFinite(safePos[1])) {
                  persistPhysicalPositionSnapshot({ x: safePos[0], y: safePos[1] });
                } else {
                  persistPhysicalPositionSnapshot();
                }
              }
            })
            .catch(() => {});
        }
      }

      if (options.onEnd) options.onEnd(wasDragging, event);
    };

    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (options.ignoreSelector && event.target.closest(options.ignoreSelector)) return;
      isDown = true;
      isDragging = false;
      activePointerId = event.pointerId ?? null;
      try {
        if (activePointerId !== null && typeof element.setPointerCapture === 'function') {
          element.setPointerCapture(activePointerId);
        }
      } catch {}

      dragScale = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      startScreen = { x: event.screenX, y: event.screenY };
      initialWinPhys = { x: Math.round(window.screenX * dragScale), y: Math.round(window.screenY * dragScale) };
      pendingPos = null;
      dragMovePending = false;

      // Sync exact native physical outerPosition & monitor scaleFactor for mixed-DPI / negative multi-monitors
      const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
      if (currentWindow?.outerPosition) {
        Promise.all([
          currentWindow.outerPosition().catch(() => null),
          currentWindow.scaleFactor?.().catch(() => null)
        ]).then(([physPos, winScale]) => {
          if (!isDown) return;
          if (Number.isFinite(winScale) && winScale > 0) dragScale = winScale;
          if (physPos && Number.isFinite(physPos.x) && Number.isFinite(physPos.y) && !isDragging) {
            initialWinPhys = { x: physPos.x, y: physPos.y };
          }
        }).catch(() => {});
      }

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finishDrag);
      window.addEventListener('pointercancel', finishDrag);

      if (options.onStart) options.onStart(event);
    });
  }

  const titlebar = $('.pet-titlebar');
  if (titlebar) {
    titlebar.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return;
      const invoke = tauriInvoke();
      if (invoke) invoke('pet_start_dragging').catch(() => {});
    });
  }

  const bubbleHead = $('.compact-bubble-head');
  if (bubbleHead) {
    attachWindowDrag(bubbleHead, {
      ignoreSelector: '#compactBubbleClose'
    });
  }

  $('#eventBubble')?.addEventListener('click', (event) => {
    if (
      event.target.closest('#compactAction') ||
      event.target.closest('#compactActionLater') ||
      event.target.closest('#compactBubbleClose') ||
      event.target.closest('.compact-bubble-head')
    ) return;
    showMain();
  });

  const dragSurface = $('#companionDragSurface');
  let lastToggleTime = 0;

  function toggleCompanionToolsAndBubble() {
    const now = Date.now();
    if (now - lastToggleTime < 280) return;
    lastToggleTime = now;
    dragSurface.classList.remove('is-tapped');
    void dragSurface.offsetWidth;
    dragSurface.classList.add('is-tapped');
    window.setTimeout(() => dragSurface.classList.remove('is-tapped'), 400);

    if (window.playCompanionSound) {
      const avatar = state.settings?.petAvatar || 'orb';
      window.playCompanionSound(avatar, 'tap', { enabled: isPetSoundsEnabled() });
    }

    const nextMode = petMode === 'peek' ? 'idle' : 'peek';
    setPetMode(nextMode, 30000);
  }

  let petHasMoved = false;

  attachWindowDrag(dragSurface, {
    onDragStart: () => {
      petHasMoved = true;
    },
    onEnd: (wasDragging) => {
      if (wasDragging) {
        petHasMoved = true;
        window.setTimeout(() => { petHasMoved = false; }, 80);
      } else {
        petHasMoved = false;
      }
    }
  });

  dragSurface.addEventListener('click', async (event) => {
    if (event.button !== 0) return;
    if (petHasMoved) {
      petHasMoved = false;
      return;
    }
    if (petMode === 'menu') {
      const menu = $('#wensContextMenu');
      if (menu) menu.hidden = true;
      await setPetMode('peek', 30000);
    } else if (handleTasbihClick()) {
      // Handled by micro-tasbih
    } else {
      toggleCompanionToolsAndBubble();
    }
    petHasMoved = false;
  });

  dragSurface.addEventListener('dblclick', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    showMain();
  });

  $('#tasbihPetButton')?.addEventListener('click', toggleTasbihMode);
  $('#drinkPetButton')?.addEventListener('click', async () => {
    const invoke = tauriInvoke();
    if (invoke) {
      await invoke('wellbeing_water_increment').catch(() => {});
      showToast('💧 هنيئاً ومريئاً! شربت كوباً.');
    }
  });
  $('#menuItemQuickDrink')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    const invoke = tauriInvoke();
    if (invoke) {
      await invoke('wellbeing_water_increment').catch(() => {});
      showToast('💧 هنيئاً ومريئاً! شربت كوباً.');
    }
  });
  $('#menuItemTasbih')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    toggleTasbihMode();
  });

  // Custom context menu on right click (exempt editable inputs in expanded mode)
  window.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (petMode === 'expanded' && target && typeof target.closest === 'function' && target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) {
      return;
    }
    event.preventDefault();
    if (petMode !== 'expanded') {
      openContextMenu();
    }
  });

  // Close context menu when clicking outside
  document.addEventListener('pointerdown', (event) => {
    if (petMode === 'menu') {
      if (!event.target.closest('#wensContextMenu') && !event.target.closest('#companionDragSurface')) {
        closeContextMenu('idle');
      }
    }
  });

  // Context menu keyboard navigation (Arrow keys) and Escape dismissal
  window.addEventListener('keydown', (event) => {
    if (petMode === 'menu') {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeContextMenu('idle');
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = Array.from(document.querySelectorAll('#wensContextMenu .context-menu-item:not([disabled])'));
        if (items.length === 0) return;
        const currentIndex = items.indexOf(document.activeElement);
        let nextIndex = 0;
        if (event.key === 'ArrowDown') {
          nextIndex = currentIndex >= 0 ? (currentIndex + 1) % items.length : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        }
        items[nextIndex].focus();
      }
    }
  });

  // Wire up context menu buttons
  $('#menuItemOpenMain')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    await showMain();
  });

  $('#menuItemShowIsland')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    const invoke = tauriInvoke();
    if (invoke) {
      await invoke('settings_update', { patch: { overlayWidget: true } }).catch(() => {});
      await invoke('overlay_set_visible', { visible: true }).catch(() => {});
      showToast('تم إظهار كبسولة النوتش بأعلى الشاشة ✨');
    }
  });

  $('#menuItemDailyReview')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('expanded');
  });

  $('#menuItemToggleSound')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const currentlyEnabled = isPetSoundsEnabled();
    const newState = !currentlyEnabled;
    await persistSettingsPatch({ petInteractionSounds: newState });
    updateContextMenuSoundState();
    showToast(newState ? 'تم تشغيل أصوات التفاعل 🔔' : 'تم كتم أصوات التفاعل 🔕');
    if (newState && window.playCompanionSound) {
      const avatar = state.settings?.petAvatar || 'orb';
      window.playCompanionSound(avatar, 'tap', { enabled: true });
    }
    await closeContextMenu('idle');
  });

  $('#menuItemHidePet')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    await hidePet();
  });

  $('#menuItemQuitApp')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await closeContextMenu('idle');
    const invoke = tauriInvoke();
    if (invoke) {
      await invoke('app_exit').catch(() => {});
    } else {
      window.close();
    }
  });

  dragSurface.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleCompanionToolsAndBubble(); }
  });

  $('#timerToggleButton').addEventListener('click', toggleTimer);
  $('#timerFinishButton').addEventListener('click', finishTimer);
  $('#saveWorkNoteButton').addEventListener('click', saveWorkNote);
  $('#addDailyTaskButton').addEventListener('click', addDailyTask);
  $('#dailyTaskInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addDailyTask(); } });
  $('#prayerChecklist').addEventListener('click', (event) => { const button = event.target.closest('[data-prayer-toggle]'); if (button) togglePrayer(button.dataset.prayerToggle); });
  $('#dailyTaskList').addEventListener('click', (event) => { const toggle = event.target.closest('[data-task-toggle]'); const remove = event.target.closest('[data-task-delete]'); if (toggle) toggleDailyTask(toggle.dataset.taskToggle); else if (remove) deleteDailyTask(remove.dataset.taskDelete); });
  $('#workNote').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveWorkNote(); } });
  document.querySelectorAll('[data-prayer-answer]').forEach((button) => button.addEventListener('click', () => answerPrayer(button.dataset.prayerAnswer)));
  document.querySelectorAll('[data-fasting-answer]').forEach((button) => button.addEventListener('click', () => answerFasting(button.dataset.fastingAnswer)));
  document.querySelectorAll('[data-avatar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const avatar = btn.dataset.avatar;
      await persistSettingsPatch({ petAvatar: avatar });
      applyAvatarTheme(avatar);
      showToast(`الشخصية: ${btn.querySelector('span:last-child')?.textContent || avatar}`);
    });
  });

  document.addEventListener('visibilitychange', () => {
    updateHiddenPauseClass();
    if (!isPetInactive()) {
      render();
      syncIdleBlinkState();
      schedulePetLoop();
    } else {
      stopIdleBlinkLoop();
      if (petLoopTimer) {
        window.clearTimeout(petLoopTimer);
        petLoopTimer = null;
      }
    }
  });

  window.addEventListener('storage', (event) => {
    if (!event.key || !event.newValue) return;
    if (event.key === STORAGE_KEY) {
      try {
        const timeZone = state.settings.timeZone;
        state = mergeState(JSON.parse(event.newValue));
        if (tauriInvoke()) state.settings.timeZone = timeZone;
        prayerTimes = [];
        applyAvatarTheme(state.settings?.petAvatar);
        render();
      } catch {}
    } else if (event.key.startsWith('wens-checks-')) {
      try {
        const dKey = event.key.slice('wens-checks-'.length);
        const parsed = JSON.parse(event.newValue);
        applyChecksToDay(dKey, parsed);
        render();
      } catch {}
    }
  });

  function applyCrossWindowSyncPayload(data) {
    if (!data || typeof data !== 'object' || data.source === 'pet') return;
    if (data.state && typeof data.state === 'object') {
      const timeZone = state.settings.timeZone;
      state = mergeState(data.state);
      if (tauriInvoke()) state.settings.timeZone = timeZone;
      prayerTimes = [];
    }
    const targetDate = data.date || data.fastingDate || worshipDateKey();
    if (data.checks && typeof data.checks === 'object') {
      applyChecksToDay(targetDate, data.checks);
    }
    if (data.action === 'markPrayer') {
      const pName = data.prayerName || PRAYER_NAME_BY_KEY[data.prayerKey];
      if (pName) {
        const pKey = PRAYER_KEY_MAP[pName];
        applyChecksToDay(targetDate, pKey ? { [pKey]: true } : {});
        if (pKey) syncCheckToVNext(pKey, true, targetDate);
      }
    } else if (data.action === 'markFasting') {
      const done = Boolean(data.completed);
      applyChecksToDay(targetDate, { fasting: done });
      syncCheckToVNext('fasting', done, targetDate);
    }
    if (Array.isArray(data.prayerTimes)) {
      prayerTimes = data.prayerTimes.map((d) => new Date(d));
    }
    if (Array.isArray(data.tomorrowPrayerTimes)) {
      window.tomorrowPrayerTimes = data.tomorrowPrayerTimes.map((d) => new Date(d));
    }
    applyAvatarTheme(state.settings?.petAvatar);
    render();
  }

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', async (event) => {
      if (event.data?.type === 'wens-reminder' && event.data.reminder) {
        await handleIncomingReminder(event.data.reminder);
        return;
      }
      if (event.data?.type === 'wens-state') {
        applyCrossWindowSyncPayload(event.data);
      }
    });
  }

  const tauriListen = window.__TAURI__?.event?.listen;
  if (tauriListen) {
    tauriListen('wens-state-sync', (event) => {
      applyCrossWindowSyncPayload(event.payload);
    }).catch(() => {});

    tauriListen('wens-prayer-completed', (event) => {
      const payload = event.payload || {};
      if (payload.source === 'pet') return;
      applyCrossWindowSyncPayload({
        source: payload.source || 'main',
        action: 'markPrayer',
        prayerKey: payload.prayerKey,
        prayerName: payload.prayerName,
        date: payload.date
      });
    }).catch(() => {});

    tauriListen('wens-settings-changed', (event) => {
      if (event.payload) {
        mergeBootstrapSettings(event.payload);
        prayerTimes = [];
        if (state.settings.themeId) setDatasetIfChanged(document.documentElement, 'theme', state.settings.themeId);
        if (state.settings.accentId) setDatasetIfChanged(document.documentElement, 'accent', state.settings.accentId);
        applyAvatarTheme(state.settings?.petAvatar);
        applyIdleFadeState();
        updateHiddenPauseClass();
        render();
        syncIdleBlinkState();
        schedulePetLoop();
      }
    }).catch(() => {});

    tauriListen('wens-cursor-near', (event) => {
      if (isPetInactive() || state.settings?.petCursorEyes === false) return;
      const payload = event.payload || {};
      let eyeDx = 0;
      let eyeDy = 0;
      if (Number.isFinite(payload.dx) && Number.isFinite(payload.dy)) {
        // Physical-normalized [-1, 1] vector emitted by Rust relative to pet center
        eyeDx = Math.max(-4, Math.min(4, payload.dx * 4));
        eyeDy = Math.max(-3, Math.min(3, payload.dy * 3));
      } else if (Number.isFinite(payload.cursor_x) && Number.isFinite(payload.cursor_y)) {
        const scale = Number.isFinite(payload.scale_factor) && payload.scale_factor > 0
          ? payload.scale_factor
          : (window.devicePixelRatio || 1);
        const cx = Number.isFinite(payload.pet_center_x)
          ? payload.pet_center_x
          : (window.screenX + window.innerWidth / 2) * scale;
        const cy = Number.isFinite(payload.pet_center_y)
          ? payload.pet_center_y
          : (window.screenY + window.innerHeight / 2) * scale;
        eyeDx = Math.max(-4, Math.min(4, ((payload.cursor_x - cx) / scale) * 0.04));
        eyeDy = Math.max(-3, Math.min(3, ((payload.cursor_y - cy) / scale) * 0.04));
      }
      setEyeOffset(eyeDx, eyeDy);
      window.clearTimeout(eyeResetTimer);
      if (eyeDx !== 0 || eyeDy !== 0) {
        eyeResetTimer = window.setTimeout(() => setEyeOffset(0, 0), 1500);
      }
    }).catch(() => {});
  }

  window.addEventListener('blur', () => {
    if (petMode === 'menu') {
      closeContextMenu('idle');
    }
  });
}

async function init() {
  bindEvents();
  listenNativeReminders();
  await hydrateNativeState();
  ensurePrayerTimes(new Date());
  if (previewMode === 'peek') {
    activeReminder = { title: 'اقترب موعد صلاة العصر', body: 'فاضل ١٠ دقائق على الأذان — الاستعداد للوضوء', kind: 'prayer-prepare', expiresAt: Date.now() + 3600000 };
  }
  render();
  await setPetMode(previewMode === 'peek' ? 'peek' : 'idle');
  applyIdleFadeState();
  await restoreAndTrackPosition();
  syncIdleBlinkState();
  schedulePetLoop();
  if (!previewMode) {
    if (!state.accountability?.lastReminderAt) {
      state.accountability ||= {};
      state.accountability.lastReminderAt = Date.now();
      saveState().catch(() => {});
    }
    window.setInterval(() => {
      if (isPetInactive()) return;
      maybeRemind();
    }, 60 * 1000);
  }
}

init();
