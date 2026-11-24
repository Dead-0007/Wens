/* Wens prayer overlay & Dynamic Island — local calculations with zero unsolicited telemetry. */
import { QURAN_STATIONS, REMINDERS } from './island-data.js';

const STORAGE_KEY = 'wens-local-v1';
const CHANNEL_NAME = 'wens-state';
const PRAYER_NAMES = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const REQUIRED_INDEXES = [0, 2, 3, 4, 5];
const PRAYER_KEY_MAP = {
  0: 'fajr', 1: 'sunrise', 2: 'dhuhr', 3: 'asr', 4: 'maghrib', 5: 'isha',
  'الفجر': 'fajr', 'الشروق': 'sunrise', 'الظهر': 'dhuhr', 'العصر': 'asr', 'المغرب': 'maghrib', 'العشاء': 'isha'
};
const PRAYER_NAME_BY_KEY = {
  fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء'
};
const MAX_HANDLED_REMINDERS = 200;
const RADIO_LOAD_TIMEOUT_MS = 15000;

const defaultOverlayState = {
  view: 'home',
  settings: {
    overlayWidget: true,
    overlaySize: 'normal',
    wuduLeadMinutes: 15,
    latitude: 30.0444,
    longitude: 31.2357,
    timeZone: 'Africa/Cairo',
    fajrOffset: 0,
    maghribOffset: 0,
    ishaOffset: 0,
    calcMethod: 'egypt',
    asrHanafi: false,
    strictOffline: false,
    themeId: 'midnight-magenta',
    accentId: 'amber',
    waterDailyGoal: 8,
    dhikrCardsEnabled: true,
    dhikrCardsIntervalMinutes: 25,
    quranRadioEnabled: true,
    radioPauseAtPrayer: true,
    quranRadioDefaultStation: 'cairo',
    smartClipboardEnabled: true,
    shelfEnabled: true,
    downloadsWatcherEnabled: true,
    privacyDotsEnabled: true,
    meetingsIcalEnabled: true,
    meetingsIcalUrl: ''
  },
  accountability: { days: {} },
  fasting: { today: false }
};

let state = loadState();
let channel = null;
let nativeSettingsReady = false;
let nativeSettingsRevision = 0;
let calendarRequest = 0;

let radioAudio = null;
let isRadioPlaying = false;
let isRadioLoading = false;
let radioSessionToken = 0;
let radioLoadTimer = null;
let radioStallTimer = null;
let radioTriedFallback = false;
let currentStationIndex = 0;

let currentMediaSession = null;
let capsuleViewMode = 'auto'; // 'auto' | 'prayer' | 'media'
let lastAutoMediaTitle = '';

let morphTimer = null;
let morphProgressInterval = null;
let morphRemainingMs = 0;
let isMorphPaused = false;
let activeMorphMeta = { id: null, kind: '', isCriticalSuhoor: false, hasAudio: false };
let activeWhisperCategory = 'all';
let activeWhisperIndex = -1;
let eventAlertTimeout = null;
let dhikrIntervalTimer = null;
let lastDhikrIntervalMs = 0;
let renderLoopTimer = null;
let mediaPollTimer = null;
let lastNextPrayerRemainingMs = Number.POSITIVE_INFINITY;
let lastMediaSessionSig = '';
let lastMarkPrayerSig = '';

const handledReminderIds = new Map();
const clockFormatter = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' });

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const pad = (value) => String(value).padStart(2, '0');
const arabicDigits = (value) => String(value ?? '').replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const worshipDateKey = (date = new Date()) =>
  window.WensShared?.selectedDateKey?.(state.settings?.timeZone, date) ?? localDateKey(date);
const escapeHtml = (value) =>
  (window.WensShared?.escapeHtml
    ? window.WensShared.escapeHtml(value)
    : String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])));

function isSafeHttpsUrl(raw) {
  if (window.WensShared?.isSafeHttpsUrl) return window.WensShared.isSafeHttpsUrl(raw);
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const tauriInvoke = () => window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null;
const tauriListen = () => window.__TAURI__?.event?.listen || null;
const tauriEmit = () => window.__TAURI__?.event?.emit || null;

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

function setTitleIfChanged(el, value) {
  if (!el) return false;
  const next = String(value ?? '');
  if (el.title === next) return false;
  el.title = next;
  return true;
}

function setDatasetIfChanged(el, key, value) {
  if (!el) return false;
  const next = String(value ?? '');
  if (el.dataset[key] === next) return false;
  el.dataset[key] = next;
  return true;
}

function setClassIfChanged(el, cls, active) {
  if (!el) return false;
  const want = Boolean(active);
  if (el.classList.contains(cls) === want) return false;
  el.classList.toggle(cls, want);
  return true;
}

function isOverlayInactive() {
  return Boolean(document.hidden || state.settings?.overlayWidget === false);
}

function updateHiddenPauseClass() {
  setClassIfChanged(document.body, 'is-hidden-window', isOverlayInactive());
}

function syncOverlayActivityClasses() {
  const morphOpen = $('#morphCard')?.style.display === 'flex';
  const eventOpen = $('#islandEventPill')?.style.display === 'flex';
  const isAlert =
    eventOpen ||
    Boolean(morphOpen && activeMorphMeta.kind && !activeMorphMeta.kind.startsWith('whisper-'));
  const isMedia = Boolean(
    isRadioPlaying ||
      isRadioLoading ||
      (currentMediaSession?.has_session && currentMediaSession?.is_playing)
  );
  const targets = [document.body, $('.prayer-overlay')];
  for (const el of targets) {
    if (!el) continue;
    setClassIfChanged(el, 'is-active-alert', isAlert);
    setClassIfChanged(el, 'is-media-playing', isMedia);
    setClassIfChanged(el, 'is-morph-open', morphOpen);
  }
}

function getAdaptiveRenderIntervalMs() {
  const isExpanded = !document.body.classList.contains('mode-collapsed');
  const morphOpen = $('#morphCard')?.style.display === 'flex';
  const eventOpen = $('#islandEventPill')?.style.display === 'flex';
  const mediaActive = Boolean(
    isRadioPlaying ||
      isRadioLoading ||
      (currentMediaSession?.has_session && currentMediaSession?.is_playing)
  );
  const urgentCountdown =
    Number.isFinite(lastNextPrayerRemainingMs) && lastNextPrayerRemainingMs <= 60000;
  return isExpanded || morphOpen || eventOpen || mediaActive || urgentCountdown ? 1000 : 5000;
}

function scheduleRenderTick() {
  if (renderLoopTimer) {
    clearTimeout(renderLoopTimer);
    renderLoopTimer = null;
  }
  if (isOverlayInactive()) return;
  const delay = getAdaptiveRenderIntervalMs();
  renderLoopTimer = setTimeout(() => {
    renderLoopTimer = null;
    if (!isOverlayInactive()) {
      render();
      scheduleRenderTick();
    }
  }, delay);
}

function mergeState(saved) {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(defaultOverlayState)
    : JSON.parse(JSON.stringify(defaultOverlayState));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return clone;
  const savedSettings = saved.settings && typeof saved.settings === 'object' && !Array.isArray(saved.settings)
    ? saved.settings
    : {};
  const savedAcc = saved.accountability && typeof saved.accountability === 'object' && !Array.isArray(saved.accountability)
    ? saved.accountability
    : {};
  const savedDays = savedAcc.days && typeof savedAcc.days === 'object' && !Array.isArray(savedAcc.days)
    ? savedAcc.days
    : {};
  return {
    ...clone,
    ...saved,
    settings: { ...clone.settings, ...savedSettings },
    accountability: { ...clone.accountability, ...savedAcc, days: { ...savedDays } },
    fasting: { ...clone.fasting, ...(saved.fasting && typeof saved.fasting === 'object' ? saved.fasting : {}) }
  };
}

function loadState() {
  try {
    return mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return mergeState(null);
  }
}

function persistLocalSnapshot() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // QuotaExceededError or private mode — keep in-memory state working cleanly
  }
}

function readDailyChecks(dateStr = worshipDateKey()) {
  try {
    const parsed = JSON.parse(localStorage.getItem(`wens-checks-${dateStr}`) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeDailyChecks(dateStr, updates) {
  const existing = readDailyChecks(dateStr);
  const merged = { ...existing };
  for (const [k, v] of Object.entries(updates)) {
    if (v) merged[k] = true;
    else delete merged[k];
  }
  try {
    localStorage.setItem(`wens-checks-${dateStr}`, JSON.stringify(merged));
  } catch {}
  return merged;
}

function applyDailyChecksToState(dateStr, checks) {
  if (!checks || typeof checks !== 'object') return;
  state.accountability ||= { days: {} };
  state.accountability.days ||= {};
  state.accountability.days[dateStr] ||= { prayers: {}, tasks: [] };
  const day = state.accountability.days[dateStr];
  day.prayers ||= {};
  for (const [key, name] of Object.entries(PRAYER_NAME_BY_KEY)) {
    if (checks[key]) {
      day.prayers[name] = 'done';
    } else if (Object.prototype.hasOwnProperty.call(checks, key) && checks[key] === false) {
      delete day.prayers[name];
    }
  }
  if (typeof checks.fasting === 'boolean') {
    day.fasting = checks.fasting ? 'yes' : null;
    if (dateStr === worshipDateKey()) {
      state.fasting ||= {};
      state.fasting.today = checks.fasting;
    }
  }
}

async function hydrateTodayWorship(dateStr = worshipDateKey()) {
  const localChecks = readDailyChecks(dateStr);
  applyDailyChecksToState(dateStr, localChecks);
  const invoke = tauriInvoke();
  if (!invoke) return;
  try {
    const record = await invoke('daily_worship_get', { date: dateStr });
    if (record && typeof record === 'object') {
      const mergedChecks = {
        fajr: Boolean(record.fajr),
        sunrise: Boolean(record.sunrise),
        dhuhr: Boolean(record.dhuhr),
        asr: Boolean(record.asr),
        maghrib: Boolean(record.maghrib),
        isha: Boolean(record.isha),
        fasting: Boolean(record.fasting)
      };
      writeDailyChecks(dateStr, mergedChecks);
      applyDailyChecksToState(dateStr, mergedChecks);
    }
  } catch {}
}

async function persistDailyWorship(dateStr, updates, broadcastPayload = {}) {
  const mergedChecks = writeDailyChecks(dateStr, updates);
  applyDailyChecksToState(dateStr, updates);
  persistLocalSnapshot();

  const invoke = tauriInvoke();
  if (invoke) {
    try {
      const existing = await invoke('daily_worship_get', { date: dateStr }).catch(() => null);
      const record = {
        date: dateStr,
        fajr: Boolean(updates.fajr ?? mergedChecks.fajr ?? existing?.fajr ?? false),
        sunrise: Boolean(updates.sunrise ?? mergedChecks.sunrise ?? existing?.sunrise ?? false),
        dhuhr: Boolean(updates.dhuhr ?? mergedChecks.dhuhr ?? existing?.dhuhr ?? false),
        asr: Boolean(updates.asr ?? mergedChecks.asr ?? existing?.asr ?? false),
        maghrib: Boolean(updates.maghrib ?? mergedChecks.maghrib ?? existing?.maghrib ?? false),
        isha: Boolean(updates.isha ?? mergedChecks.isha ?? existing?.isha ?? false),
        fasting: Boolean(updates.fasting ?? mergedChecks.fasting ?? existing?.fasting ?? false),
        note: existing?.note ?? null,
        updatedAt: new Date().toISOString()
      };
      await invoke('daily_worship_set', { record });
    } catch {}
  }

  try {
    channel?.postMessage({
      type: 'wens-state',
      source: 'overlay',
      date: dateStr,
      checks: mergedChecks,
      ...broadcastPayload
    });
  } catch {}

  const emit = tauriEmit();
  if (emit) {
    emit('wens-state-sync', {
      source: 'overlay',
      date: dateStr,
      checks: mergedChecks,
      ...broadcastPayload
    }).catch(() => {});
    if (broadcastPayload.action === 'markPrayer' && broadcastPayload.prayerName) {
      emit('wens-prayer-completed', {
        source: 'overlay',
        date: dateStr,
        prayerKey: broadcastPayload.prayerKey,
        prayerName: broadcastPayload.prayerName,
        prayerIndex: broadcastPayload.prayerIndex
      }).catch(() => {});
    }
  }
}

async function persistSettingsPatch(patch) {
  state.settings = { ...state.settings, ...patch };
  persistLocalSnapshot();
  const invoke = tauriInvoke();
  if (invoke) {
    await invoke('settings_update', { patch }).catch(() => {});
  }
}

function applySettingsFromPayload(p) {
  if (!p || typeof p !== 'object') return;
  const previous = state.settings;
  const prevStrictOffline = Boolean(state.settings?.strictOffline);
  const prevRadioEnabled = state.settings?.quranRadioEnabled !== false;
  const prevDefaultStation = state.settings?.quranRadioDefaultStation || 'cairo';

  const pick = (camel, snake, fallback) => {
    if (p[camel] !== undefined) return p[camel];
    if (snake && p[snake] !== undefined) return p[snake];
    return fallback;
  };

  state.settings = {
    ...state.settings,
    overlayWidget: pick('overlayWidget', 'overlay_widget', state.settings.overlayWidget),
    overlaySize: pick('overlaySize', 'overlay_size', state.settings.overlaySize),
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
    strictOffline: pick('strictOffline', 'strict_offline', state.settings.strictOffline),
    waterDailyGoal: pick('waterDailyGoal', 'water_daily_goal', state.settings.waterDailyGoal),
    dhikrCardsEnabled: pick('dhikrCardsEnabled', 'dhikr_cards_enabled', state.settings.dhikrCardsEnabled),
    dhikrCardsIntervalMinutes: pick('dhikrCardsIntervalMinutes', 'dhikr_cards_interval_minutes', state.settings.dhikrCardsIntervalMinutes),
    quranRadioEnabled: pick('quranRadioEnabled', 'quran_radio_enabled', state.settings.quranRadioEnabled),
    radioPauseAtPrayer: pick('radioPauseAtPrayer', 'radio_pause_at_prayer', state.settings.radioPauseAtPrayer),
    quranRadioDefaultStation: pick('quranRadioDefaultStation', 'quran_radio_default_station', state.settings.quranRadioDefaultStation),
    smartClipboardEnabled: pick('smartClipboardEnabled', 'smart_clipboard_enabled', state.settings.smartClipboardEnabled),
    shelfEnabled: pick('shelfEnabled', 'shelf_enabled', state.settings.shelfEnabled),
    downloadsWatcherEnabled: pick('downloadsWatcherEnabled', 'downloads_watcher_enabled', state.settings.downloadsWatcherEnabled),
    privacyDotsEnabled: pick('privacyDotsEnabled', 'privacy_dots_enabled', state.settings.privacyDotsEnabled),
    meetingsIcalEnabled: pick('meetingsIcalEnabled', 'meetings_ical_enabled', state.settings.meetingsIcalEnabled),
    meetingsIcalUrl: pick('meetingsIcalUrl', 'meetings_ical_url', state.settings.meetingsIcalUrl),
    locationLabel: p.cityName || p.city_name || p.locationLabel || p.location_label || state.settings.locationLabel
  };

  applyOverlayVisualSettings();
  syncRadioDefaultStation(prevDefaultStation !== state.settings.quranRadioDefaultStation);
  syncRadioAvailability();
  scheduleDhikrCardsRotation();

  if (state.settings.strictOffline && (!prevStrictOffline || isRadioPlaying || isRadioLoading)) {
    stopRadio('تم إيقاف الإذاعة لتفعيل الوضع غير المتصل', 'is-offline');
  }
  if (state.settings.quranRadioEnabled === false && (prevRadioEnabled || isRadioPlaying || isRadioLoading)) {
    stopRadio('إذاعة القرآن معطّلة من الإعدادات', 'is-offline');
  }
  if (state.settings.overlayWidget === false && (isRadioPlaying || isRadioLoading)) {
    stopRadio('');
  }
  if (previous.strictOffline !== state.settings.strictOffline ||
      previous.meetingsIcalEnabled !== state.settings.meetingsIcalEnabled ||
      previous.meetingsIcalUrl !== state.settings.meetingsIcalUrl) {
    calendarRequest += 1;
    const list = $('#meetingsList');
    if (list) renderEmptyMessage(list, 'meeting-empty', state.settings.strictOffline
      ? 'الوضع غير المتصل مفعّل — التقويم متوقف محلياً'
      : 'اضغط تحديث لعرض اجتماعاتك');
  }

  if (state.settings.locationLabel) {
    const src = $('#overlaySource');
    if (src) src.textContent = `محسوبة محليًا · ${state.settings.locationLabel}`;
  }

  updateHiddenPauseClass();
  window.prayerTimes = null;
  window.tomorrowPrayerTimes = null;
  render();
  updateWaterDisplay();
}

function applyOverlayVisualSettings() {
  const theme = state.settings?.themeId || 'midnight-magenta';
  const accent = state.settings?.accentId || 'amber';
  const size = ['compact', 'normal', 'large'].includes(state.settings?.overlaySize)
    ? state.settings.overlaySize
    : 'normal';
  setDatasetIfChanged(document.documentElement, 'theme', theme);
  setDatasetIfChanged(document.documentElement, 'accent', accent);
  setDatasetIfChanged(document.documentElement, 'overlaySize', size);
  setDatasetIfChanged(document.body, 'overlaySize', size);
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
      if (!Number.isFinite(ratio) || Math.abs(ratio) > 1.0) {
        return { valid: false, ratio };
      }
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

    // Ensure strictly ascending times if high-latitude fallback was triggered
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
  const todayKey = worshipDateKey(now);
  const first = window.prayerTimes?.[0];
  const validFirst = first instanceof Date && !Number.isNaN(first.getTime());
  const needsRefresh =
    !Array.isArray(window.prayerTimes) ||
    window.prayerTimes.length < 6 ||
    !validFirst ||
    worshipDateKey(first) !== todayKey;
  if (needsRefresh) {
    window.prayerTimes = calculatePrayerTimes(now);
    window.tomorrowPrayerTimes = calculatePrayerTimes(now, 1);
  }
}

export function upcomingPrayers(now = new Date()) {
  ensurePrayerTimes(now);
  const entries = [];
  let current = null;
  if (Array.isArray(window.prayerTimes)) {
    for (const index of REQUIRED_INDEXES) {
      const t = window.prayerTimes[index];
      if (!(t instanceof Date) || Number.isNaN(t.getTime())) continue;
      if (t <= now) current = { name: PRAYER_NAMES[index], time: t, index };
      else entries.push({ name: PRAYER_NAMES[index], time: t, index });
    }
  }
  if (Array.isArray(window.tomorrowPrayerTimes)) {
    for (const index of REQUIRED_INDEXES) {
      const t = window.tomorrowPrayerTimes[index];
      if (!(t instanceof Date) || Number.isNaN(t.getTime())) continue;
      if (t <= now) {
        if (!current) current = { name: PRAYER_NAMES[index], time: t, index };
      } else {
        entries.push({ name: PRAYER_NAMES[index], time: t, index });
      }
    }
  }
  if (!entries[0] || !entries[1]) {
    window.prayerTimes = calculatePrayerTimes(now);
    window.tomorrowPrayerTimes = calculatePrayerTimes(now, 1);
    entries.length = 0;
    for (const index of REQUIRED_INDEXES) {
      const t = window.prayerTimes[index];
      if (t > now) entries.push({ name: PRAYER_NAMES[index], time: t, index });
    }
    for (const index of REQUIRED_INDEXES) {
      const t = window.tomorrowPrayerTimes[index];
      if (t > now) entries.push({ name: PRAYER_NAMES[index], time: t, index });
    }
  }
  return { current, next: entries[0], following: entries[1] };
}

function formatClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  try {
    return window.WensShared?.formatPrayerClock?.(date, state.settings?.timeZone) ?? clockFormatter.format(date);
  } catch {
    return `${arabicDigits(pad(date.getHours()))}:${arabicDigits(pad(date.getMinutes()))}`;
  }
}

function formatRemaining(milliseconds) {
  const safeMs = Number.isFinite(milliseconds) ? milliseconds : 0;
  const totalSeconds = Math.max(0, Math.ceil(safeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return arabicDigits(hours > 0 ? `${hours}س ${pad(minutes)}د` : `${minutes}د ${pad(seconds)}ث`);
}

// -------------------------------------------------------------
// Dynamic Island Collapse, Expand & Click-Through Sync
// -------------------------------------------------------------

let lastWindowSyncKey = '';

function notifyExpandedBounds(invoke, widthLogical, heightLogical) {
  if (!invoke) return;
  try {
    const w = Math.max(140, Math.round(Number(widthLogical) || 184));
    const h = Math.max(26, Math.round(Number(heightLogical) || 28));
    invoke('island_set_expanded_bounds', { widthLogical: w, heightLogical: h }).catch(() => {});
  } catch {}
}

function measureCardHeight(bar) {
  const card = $('#morphCard');
  const barH = bar ? Math.ceil(bar.getBoundingClientRect().height || bar.offsetHeight || 28) : 28;
  if (!card || card.style.display === 'none') return 198;
  const cardRect = card.getBoundingClientRect();
  const cardH = Math.ceil(Math.max(cardRect.height, card.offsetHeight, card.scrollHeight));
  // 2px top inset + 4px gap + 10px bottom inset/shadow clearance = 16px
  return Math.max(168, Math.min(440, barH + cardH + 16));
}

function measureFullHeight(bar) {
  const hub = $('#islandCard');
  const barH = bar ? Math.ceil(bar.getBoundingClientRect().height || bar.offsetHeight || 28) : 28;
  if (!hub) return 286;
  let contentH = 0;
  for (const child of hub.children) {
    const cs = getComputedStyle(child);
    if (cs.display === 'none') continue;
    const mt = parseFloat(cs.marginTop) || 0;
    const mb = parseFloat(cs.marginBottom) || 0;
    if (child.classList.contains('tab-pane')) {
      const pt = parseFloat(cs.paddingTop) || 0;
      const pb = parseFloat(cs.paddingBottom) || 0;
      const inner = Array.from(child.children).reduce((sum, innerEl) => {
        if (getComputedStyle(innerEl).display === 'none') return sum;
        const r = innerEl.getBoundingClientRect();
        return sum + Math.max(r.height, innerEl.scrollHeight, innerEl.offsetHeight);
      }, 0);
      contentH += mt + pt + inner + pb + mb;
    } else {
      const r = child.getBoundingClientRect();
      contentH += mt + Math.max(r.height, child.offsetHeight, child.scrollHeight) + mb;
    }
  }
  // +2px card border + 16px vertical inset/gap/shadow clearance = 18px
  return Math.max(220, Math.min(460, Math.ceil(barH + contentH + 18)));
}

function syncWindowDimensions(force = false) {
  if (state.settings?.overlayWidget === false) return;
  const invoke = tauriInvoke();
  if (!invoke) return;
  const isCollapsed = document.body.classList.contains('mode-collapsed');
  const morphVisible = $('#morphCard')?.style.display === 'flex';
  document.body.classList.toggle('has-morph', Boolean(isCollapsed && morphVisible));
  const bar = $('#islandBar');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const barW = bar ? Math.ceil(Math.max(barRect?.width || 0, bar.offsetWidth, bar.scrollWidth)) : 200;
  const barH = bar ? Math.ceil(Math.max(barRect?.height || 0, bar.offsetHeight)) : 28;

  if (!isCollapsed) {
    const tabs = $('.island-tabs');
    const tabsW = tabs ? Math.ceil(tabs.scrollWidth) + 20 : 484;
    const width = Math.max(484, Math.min(556, Math.ceil(Math.max(tabsW, barW + 24) / 2) * 2));
    const height = Math.ceil(measureFullHeight(bar) / 2) * 2;
    const key = `full:${width}x${height}:bar${barW}`;
    if (!force && lastWindowSyncKey === key) return;
    lastWindowSyncKey = key;
    notifyExpandedBounds(invoke, Math.max(width, barW + 16), height);
    invoke('island_set_click_through', { enable: false }).catch(() => {});
    invoke('island_set_size', { width, height }).catch(() => {
      invoke('island_set_expanded', { expanded: true, mode: 'full' }).catch(() => {});
    });
  } else if (morphVisible) {
    const width = Math.max(356, Math.min(460, Math.ceil((barW + 24) / 2) * 2));
    const height = Math.ceil(measureCardHeight(bar) / 2) * 2;
    const key = `card:${width}x${height}:bar${barW}`;
    if (!force && lastWindowSyncKey === key) return;
    lastWindowSyncKey = key;
    notifyExpandedBounds(invoke, Math.max(width, barW + 16), height);
    invoke('island_set_click_through', { enable: false }).catch(() => {});
    invoke('island_set_size', { width, height }).catch(() => {
      invoke('island_set_expanded', { expanded: true, mode: 'card' }).catch(() => {});
    });
  } else {
    if (bar) {
      const maxPillW = state.settings?.overlaySize === 'large' ? 346 : 316;
      const minPillH = state.settings?.overlaySize === 'compact' ? 26 : 28;
      const maxPillH = state.settings?.overlaySize === 'large' ? 36 : 32;
      const width = Math.max(152, Math.min(maxPillW, Math.ceil((barW + 4) / 2) * 2));
      const height = Math.max(minPillH, Math.min(maxPillH, barH));
      const key = `pill:${width}x${height}`;
      if (!force && lastWindowSyncKey === key) return;
      lastWindowSyncKey = key;
      notifyExpandedBounds(invoke, width, height);
      invoke('island_set_click_through', { enable: false }).catch(() => {});
      invoke('island_set_size', { width, height }).catch(() => {
        invoke('island_set_expanded', { expanded: false, mode: null }).catch(() => {});
      });
    } else {
      const key = 'pill:default';
      if (!force && lastWindowSyncKey === key) return;
      lastWindowSyncKey = key;
      notifyExpandedBounds(invoke, 184, 28);
      invoke('island_set_expanded', { expanded: false, mode: null }).catch(() => {});
    }
  }
}

function toggleIslandExpanded(force) {
  const isCurrentlyCollapsed = document.body.classList.contains('mode-collapsed');
  const shouldExpand = force !== undefined ? force : isCurrentlyCollapsed;
  if (shouldExpand) {
    hideMorphCard(false);
    document.body.classList.remove('mode-collapsed');
    const icon = $('#islandToggleIcon');
    setTextIfChanged(icon, '▲');
    // Refresh dynamic panels on expand
    render();
    updateWaterDisplay();
    refreshCalendarMeetings();
    refreshClipboardList();
    refreshShelfList();
  } else {
    document.body.classList.add('mode-collapsed');
    const icon = $('#islandToggleIcon');
    setTextIfChanged(icon, '▼');
  }
  syncOverlayActivityClasses();
  syncWindowDimensions(true);
  requestAnimationFrame(() => syncWindowDimensions());
  scheduleRenderTick();
}

// -------------------------------------------------------------
// Quran Radio & System Media Unified Integration
// -------------------------------------------------------------

function setRadioStatus(message = '', tone = '') {
  const statusEl = $('#radioStatus');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `radio-status${tone ? ` ${tone}` : ''}`;
  if (!document.body.classList.contains('mode-collapsed')) {
    requestAnimationFrame(() => syncWindowDimensions());
  }
}

function clearRadioTimers() {
  if (radioLoadTimer) {
    clearTimeout(radioLoadTimer);
    radioLoadTimer = null;
  }
  if (radioStallTimer) {
    clearTimeout(radioStallTimer);
    radioStallTimer = null;
  }
}

function broadcastRadioStarted(stationId) {
  try {
    channel?.postMessage({ type: 'wens-radio-started', source: 'overlay', stationId });
  } catch {}
  const emit = tauriEmit();
  if (emit) {
    emit('wens-radio-started', { source: 'overlay', stationId }).catch(() => {});
  }
}

function syncRadioDefaultStation(forceSelect = false) {
  const defaultId = state.settings?.quranRadioDefaultStation || 'cairo';
  const idx = QURAN_STATIONS.findIndex((s) => s.id === defaultId);
  if (idx < 0) return;
  if (forceSelect || (!isRadioPlaying && !isRadioLoading)) {
    currentStationIndex = idx;
    const select = $('#radioStationSelect');
    if (select) select.value = String(idx);
  }
}

function syncRadioAvailability() {
  const enabled = state.settings?.quranRadioEnabled !== false;
  const controls = $('#radioControlsRow');
  const select = $('#radioStationSelect');
  const disabledNote = $('#radioDisabledNote');
  const miniBtn = $('#radioMiniBtn');
  let changed = false;
  if (setDisplayIfChanged(controls, enabled ? 'flex' : 'none')) changed = true;
  if (select && select.disabled !== !enabled) select.disabled = !enabled;
  if (setDisplayIfChanged(disabledNote, enabled ? 'none' : 'block')) changed = true;
  const hasSystemMedia = Boolean(currentMediaSession?.has_session && currentMediaSession?.title);
  if (setDisplayIfChanged(miniBtn, (enabled || hasSystemMedia) ? 'grid' : 'none')) changed = true;
  return changed;
}

function syncWavesAnimation() {
  const waves = $('#capsuleWaves');
  const anyPlaying = isRadioPlaying || Boolean(currentMediaSession?.has_session && currentMediaSession?.is_playing);
  setClassIfChanged(waves, 'playing', anyPlaying);
  syncOverlayActivityClasses();
}

function updateCapsuleCenterMode(forceWindowSync = false) {
  const prayerPill = $('#islandPrayerPill');
  const mediaPill = $('#islandMediaPill');
  const eventPill = $('#islandEventPill');
  if (!prayerPill || !mediaPill || !eventPill) return false;

  let changed = false;

  // If an inline event alert is currently showing, keep it visible until dismissed
  if (eventPill.style.display === 'flex') {
    if (setDisplayIfChanged(prayerPill, 'none')) changed = true;
    if (setDisplayIfChanged(mediaPill, 'none')) changed = true;
    syncOverlayActivityClasses();
    if (changed || forceWindowSync) syncWindowDimensions();
    return changed;
  }

  const hasSystemMedia = Boolean(currentMediaSession?.has_session && currentMediaSession?.title);
  const anyMediaActive = hasSystemMedia || isRadioPlaying;

  const showMedia =
    capsuleViewMode === 'media'
      ? (hasSystemMedia || isRadioPlaying)
      : capsuleViewMode === 'prayer'
      ? false
      : anyMediaActive;

  if (showMedia) {
    if (setDisplayIfChanged(prayerPill, 'none')) changed = true;
    if (setDisplayIfChanged(mediaPill, 'flex')) changed = true;
    const appBadge = $('#capsuleMediaApp');
    const titleEl = $('#capsuleMediaTitle');
    const toggleBtn = $('#capsuleMediaToggle');

    if (isRadioPlaying) {
      const station = QURAN_STATIONS[currentStationIndex];
      if (setTextIfChanged(appBadge, '📻')) changed = true;
      if (setTextIfChanged(titleEl, station ? station.name.replace('إذاعة القرآن الكريم — ', '') : 'إذاعة القرآن')) changed = true;
      if (setTextIfChanged(toggleBtn, '⏸')) changed = true;
    } else if (hasSystemMedia) {
      const src = currentMediaSession.source_app || '';
      const iconText = src.toLowerCase().includes('spotify')
        ? '🟢'
        : src.toLowerCase().includes('youtube')
        ? '▶️'
        : '🎵';
      if (setTextIfChanged(appBadge, iconText)) changed = true;
      setTitleIfChanged(appBadge, src || 'مشغل النظام');

      const label = currentMediaSession.artist && currentMediaSession.artist !== src
        ? `${currentMediaSession.title} — ${currentMediaSession.artist}`
        : currentMediaSession.title;
      if (setTextIfChanged(titleEl, label)) changed = true;
      setTitleIfChanged(titleEl, `${currentMediaSession.title}\n${currentMediaSession.artist || ''} (${src || 'النظام'})`);

      if (setTextIfChanged(toggleBtn, currentMediaSession.is_playing ? '⏸' : '▶')) changed = true;
    }
  } else {
    if (setDisplayIfChanged(mediaPill, 'none')) changed = true;
    if (setDisplayIfChanged(prayerPill, 'flex')) changed = true;
  }
  if (syncRadioAvailability()) changed = true;
  syncOverlayActivityClasses();
  if (changed || forceWindowSync) {
    syncWindowDimensions();
  }
  return changed;
}

function stopRadio(statusMsg = '', statusTone = '') {
  radioSessionToken += 1;
  clearRadioTimers();
  isRadioLoading = false;
  if (radioAudio) {
    try {
      radioAudio.pause();
      radioAudio.removeAttribute('src');
      radioAudio.load();
    } catch {}
  }
  updateRadioUi(false, false);
  setRadioStatus(statusMsg, statusTone);
}

function ensureRadioAudio() {
  if (radioAudio) return radioAudio;
  radioAudio = new Audio();
  radioAudio.preload = 'none';
  const vol = $('#radioVolume');
  if (vol) radioAudio.volume = Math.max(0, Math.min(1, Number(vol.value) / 100));

  radioAudio.addEventListener('playing', () => {
    clearRadioTimers();
    isRadioLoading = false;
    capsuleViewMode = 'media';
    updateRadioUi(true, false);
    const station = QURAN_STATIONS[currentStationIndex];
    setRadioStatus('بث مباشر يعمل الآن', 'is-live');
    if (station) broadcastRadioStarted(station.id);
  });

  radioAudio.addEventListener('waiting', () => {
    if (!isRadioPlaying && !isRadioLoading) return;
    const token = radioSessionToken;
    setRadioStatus('جارٍ تحميل البث…', 'is-loading');
    if (!radioStallTimer) {
      radioStallTimer = setTimeout(() => {
        if (token !== radioSessionToken) return;
        handleRadioStreamFailure(token, 'انقطع البث بسبب بطء الاتصال');
      }, RADIO_LOAD_TIMEOUT_MS);
    }
  });

  radioAudio.addEventListener('stalled', () => {
    if (!isRadioPlaying && !isRadioLoading) return;
    const token = radioSessionToken;
    setRadioStatus('البث متوقف مؤقتاً — جارٍ إعادة المحاولة…', 'is-loading');
    if (!radioStallTimer) {
      radioStallTimer = setTimeout(() => {
        if (token !== radioSessionToken) return;
        handleRadioStreamFailure(token, 'تعذر استئناف البث — تحقق من الإنترنت');
      }, RADIO_LOAD_TIMEOUT_MS);
    }
  });

  radioAudio.addEventListener('ended', () => {
    const token = radioSessionToken;
    if (!isRadioPlaying && !isRadioLoading) return;
    handleRadioStreamFailure(token, 'انتهى البث — اضغط تشغيل للمحاولة مجدداً');
  });

  radioAudio.addEventListener('error', () => {
    const token = radioSessionToken;
    if (!isRadioPlaying && !isRadioLoading) return;
    handleRadioStreamFailure(token, 'تعذر تشغيل البث — تحقق من الاتصال أو جرّب محطة أخرى');
  });

  return radioAudio;
}

function handleRadioStreamFailure(token, fallbackErrorMessage) {
  if (token !== radioSessionToken) return;
  clearRadioTimers();
  const station = QURAN_STATIONS[currentStationIndex];
  if (
    station &&
    !radioTriedFallback &&
    station.fallbackUrl &&
    isSafeHttpsUrl(station.fallbackUrl)
  ) {
    radioTriedFallback = true;
    startRadioStream(station.fallbackUrl, token, 'جارٍ التبديل للبث الاحتياطي…');
    return;
  }
  stopRadio(fallbackErrorMessage, 'is-error');
  showCapsuleAlert('⚠️', 'تعذر تشغيل الإذاعة');
}

function startRadioStream(url, token, loadingLabel) {
  if (!isSafeHttpsUrl(url)) {
    stopRadio('رابط البث غير مدعوم', 'is-error');
    return;
  }
  const audio = ensureRadioAudio();
  isRadioLoading = true;
  updateRadioUi(false, true);
  setRadioStatus(loadingLabel || 'جارٍ الاتصال بالبث…', 'is-loading');

  clearRadioTimers();
  radioLoadTimer = setTimeout(() => {
    if (token !== radioSessionToken) return;
    handleRadioStreamFailure(token, 'تعذر الاتصال بالبث (انتهت المهلة ١٥ث) — تحقق من الإنترنت');
  }, RADIO_LOAD_TIMEOUT_MS);

  try {
    audio.src = url;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (token !== radioSessionToken) return;
        handleRadioStreamFailure(token, 'تعذر تشغيل البث — تحقق من الاتصال أو جرّب محطة أخرى');
      });
    }
  } catch {
    handleRadioStreamFailure(token, 'تعذر تشغيل البث');
  }
}

function playRadioStation() {
  if (tauriInvoke() && !nativeSettingsReady) {
    setRadioStatus('جارٍ تحميل إعدادات الشبكة المحلية…', 'is-offline');
    return;
  }
  if (state.settings?.quranRadioEnabled === false) {
    setRadioStatus('إذاعة القرآن معطّلة من الإعدادات', 'is-offline');
    showCapsuleAlert('⚠️', 'إذاعة القرآن معطّلة');
    return;
  }
  if (state.settings?.strictOffline) {
    setRadioStatus('الوضع غير المتصل مفعّل — لا يمكن تشغيل البث المباشر', 'is-offline');
    showCapsuleAlert('⚠️', 'الوضع غير المتصل مفعّل');
    return;
  }
  const station = QURAN_STATIONS[currentStationIndex];
  if (!station) return;
  radioSessionToken += 1;
  const token = radioSessionToken;
  radioTriedFallback = false;
  startRadioStream(station.url, token, 'جارٍ الاتصال بالبث…');
}

function updateRadioUi(playing, loading = false) {
  isRadioPlaying = Boolean(playing);
  isRadioLoading = Boolean(loading);
  const playBtn = $('#radioPlayBtn');
  if (playBtn) {
    if (playBtn.disabled) playBtn.disabled = false; // NEVER permanently lock button disabled
    setClassIfChanged(playBtn, 'is-loading', isRadioLoading);
    setTextIfChanged(
      playBtn,
      isRadioLoading
        ? '✕ إلغاء'
        : isRadioPlaying
        ? '⏸ إيقاف'
        : '▶ تشغيل'
    );
  }
  syncWavesAnimation();
  updateCapsuleCenterMode();
  scheduleRenderTick();
}

function initRadio() {
  const select = $('#radioStationSelect');
  if (!select) return;
  select.innerHTML = '';
  QURAN_STATIONS.forEach((station, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = station.name;
    select.appendChild(opt);
  });
  syncRadioDefaultStation(true);
  syncRadioAvailability();

  select.addEventListener('change', () => {
    currentStationIndex = Math.max(0, Math.min(QURAN_STATIONS.length - 1, Number(select.value) || 0));
    if (isRadioPlaying || isRadioLoading) {
      playRadioStation();
    }
  });

  const playBtn = $('#radioPlayBtn');
  const miniBtn = $('#radioMiniBtn');

  function toggleRadioPlay() {
    if (isRadioLoading || isRadioPlaying) {
      stopRadio(isRadioLoading ? 'تم إلغاء الاتصال بالبث' : '');
      return;
    }
    playRadioStation();
  }

  playBtn?.addEventListener('click', toggleRadioPlay);

  miniBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const hasSystemMedia = Boolean(currentMediaSession?.has_session && currentMediaSession?.title);
    if (hasSystemMedia || isRadioPlaying) {
      const mediaPillVisible = $('#islandMediaPill')?.style.display === 'flex';
      capsuleViewMode = mediaPillVisible ? 'prayer' : 'media';
      updateCapsuleCenterMode();
    } else if (state.settings?.quranRadioEnabled !== false) {
      toggleRadioPlay();
    }
  });

  const vol = $('#radioVolume');
  vol?.addEventListener('input', () => {
    if (radioAudio) radioAudio.volume = Math.max(0, Math.min(1, Number(vol.value) / 100));
  });
}

// -------------------------------------------------------------
// Windows SMTC Media Controls Integration
// -------------------------------------------------------------

async function updateMediaSession(session) {
  const hasValid = Boolean(session && session.has_session && session.title);
  const nextSig = hasValid
    ? `1|${session.is_playing ? 1 : 0}|${session.title || ''}|${session.artist || ''}|${session.source_app || ''}|${session.session_count || 0}`
    : '0';
  if (nextSig === lastMediaSessionSig) {
    currentMediaSession = session || null;
    return;
  }
  lastMediaSessionSig = nextSig;
  currentMediaSession = session || null;
  const smtc = $('#smtcSection');
  const idleHint = $('#smtcIdleHint');

  if (!hasValid) {
    setDisplayIfChanged(smtc, 'none');
    setDisplayIfChanged(idleHint, 'block');
    if (capsuleViewMode === 'media' && !isRadioPlaying) {
      capsuleViewMode = 'auto';
    }
    syncWavesAnimation();
    updateCapsuleCenterMode();
    scheduleRenderTick();
    return;
  }

  setDisplayIfChanged(idleHint, 'none');

  // If a new track started playing on the system, auto-surface it in the notch pill
  if (session.is_playing && session.title !== lastAutoMediaTitle) {
    lastAutoMediaTitle = session.title;
    if (capsuleViewMode !== 'prayer') {
      capsuleViewMode = 'auto';
    }
  }

  setDisplayIfChanged(smtc, 'flex');
  setTextIfChanged($('#smtcSourceBadge'), session.source_app || 'مشغل النظام');

  setDisplayIfChanged(
    $('#smtcSwitchSessionBtn'),
    (session.session_count && session.session_count > 1) ? 'inline-block' : 'none'
  );

  setTextIfChanged($('#smtcTitle'), session.title);
  setTextIfChanged($('#smtcArtist'), session.artist || session.source_app || 'تشغيل النظام');
  setTextIfChanged($('#smtcPlayToggleBtn'), session.is_playing ? '⏸' : '▶');

  syncWavesAnimation();
  updateCapsuleCenterMode();
  scheduleRenderTick();
}

async function sendMediaCommand(cmd) {
  if (isRadioPlaying && (!currentMediaSession?.has_session || !currentMediaSession?.is_playing)) {
    if (cmd === 'toggle') {
      stopRadio('');
    } else if (cmd === 'next') {
      currentStationIndex = (currentStationIndex + 1) % QURAN_STATIONS.length;
      const select = $('#radioStationSelect');
      if (select) select.value = String(currentStationIndex);
      playRadioStation();
    } else if (cmd === 'previous') {
      currentStationIndex = (currentStationIndex - 1 + QURAN_STATIONS.length) % QURAN_STATIONS.length;
      const select = $('#radioStationSelect');
      if (select) select.value = String(currentStationIndex);
      playRadioStation();
    }
    return;
  }

  const invoke = tauriInvoke();
  if (!invoke) return;
  await invoke('media_session_control', { command: cmd }).catch(() => {});
  setTimeout(() => {
    if (!isOverlayInactive()) {
      invoke('media_session_get').then(updateMediaSession).catch(() => {});
    }
  }, 220);
}

function initMediaControls() {
  const invoke = tauriInvoke();

  $('#smtcPrevBtn')?.addEventListener('click', () => sendMediaCommand('previous'));
  $('#smtcNextBtn')?.addEventListener('click', () => sendMediaCommand('next'));
  $('#smtcPlayToggleBtn')?.addEventListener('click', () => sendMediaCommand('toggle'));
  $('#smtcSwitchSessionBtn')?.addEventListener('click', () => sendMediaCommand('switch_session'));

  $('#capsuleMediaPrev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sendMediaCommand('previous');
  });
  $('#capsuleMediaToggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sendMediaCommand('toggle');
  });
  $('#capsuleMediaNext')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sendMediaCommand('next');
  });

  if (invoke) {
    if (!isOverlayInactive()) {
      invoke('media_session_get').then(updateMediaSession).catch(() => {});
    }
    const scheduleMediaPoll = () => {
      if (mediaPollTimer) clearTimeout(mediaPollTimer);
      const isExpanded = !document.body.classList.contains('mode-collapsed');
      const hasMedia = Boolean(currentMediaSession?.has_session && currentMediaSession?.is_playing);
      const delay = (isExpanded || hasMedia || isRadioPlaying) ? 2500 : 5000;
      mediaPollTimer = setTimeout(() => {
        mediaPollTimer = null;
        if (!isOverlayInactive()) {
          invoke('media_session_get').then(updateMediaSession).catch(() => {});
        }
        scheduleMediaPoll();
      }, delay);
    };
    scheduleMediaPoll();
  }
}

// -------------------------------------------------------------
// Wellbeing & Water Tracker
// -------------------------------------------------------------

async function updateWaterDisplay() {
  const invoke = tauriInvoke();
  const count = invoke ? await invoke('wellbeing_water_get').catch(() => 0) : 0;
  const goal = Math.max(1, Math.min(20, Number(state.settings?.waterDailyGoal) || 8));
  const label = $('#waterCountLabel');
  if (label) label.textContent = `${arabicDigits(count)} / ${arabicDigits(goal)} أكواب`;

  const container = $('#waterGlasses');
  if (container) {
    container.textContent = '';
    for (let i = 0; i < goal; i++) {
      const dot = document.createElement('div');
      dot.className = `glass-dot${i < count ? ' full' : ''}`;
      container.appendChild(dot);
    }
  }
}

// -------------------------------------------------------------
// Calendar Meetings (XSS-Safe DOM Rendering + Clean States)
// -------------------------------------------------------------

function renderEmptyMessage(container, className, text) {
  container.textContent = '';
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  container.appendChild(el);
}

async function refreshCalendarMeetings() {
  const list = $('#meetingsList');
  if (!list) return;
  const request = ++calendarRequest;

  if (state.settings?.meetingsIcalEnabled === false) {
    renderEmptyMessage(list, 'meeting-empty', 'مزامنة التقويم معطّلة من الإعدادات');
    return;
  }
  if (state.settings?.strictOffline) {
    renderEmptyMessage(list, 'meeting-empty', 'الوضع غير المتصل مفعّل — التقويم متوقف محلياً');
    return;
  }

  const invoke = tauriInvoke();
  if (!invoke || !nativeSettingsReady) {
    renderEmptyMessage(list, 'meeting-empty', 'لا توجد اجتماعات في الـ ٢٤ ساعة القادمة');
    return;
  }

  try {
    const meetings = await invoke('calendar_meetings_get');
    if (request !== calendarRequest) return;
    if (!Array.isArray(meetings) || meetings.length === 0) {
      const hint = state.settings?.meetingsIcalUrl
        ? 'لا توجد اجتماعات في الـ ٢٤ ساعة القادمة'
        : 'أضف رابط تقويم ICS من الإعدادات لعرض اجتماعاتك هنا';
      renderEmptyMessage(list, 'meeting-empty', hint);
      return;
    }

    list.textContent = '';
    meetings.forEach((m) => {
      if (!m || typeof m !== 'object') return;
      const row = document.createElement('div');
      row.className = 'meeting-item';

      const copy = document.createElement('div');
      copy.className = 'meeting-copy';

      const titleEl = document.createElement('strong');
      titleEl.className = 'meeting-title';
      titleEl.textContent = String(m.title || 'اجتماع');
      copy.appendChild(titleEl);

      const metaParts = [];
      if (m.start_time || m.end_time) {
        metaParts.push(`${String(m.start_time || '')}${m.end_time ? ` - ${String(m.end_time)}` : ''}`);
      }
      if (m.organizer) metaParts.push(String(m.organizer));
      else if (m.location) metaParts.push(String(m.location));

      if (metaParts.length > 0) {
        const metaEl = document.createElement('small');
        metaEl.className = 'meeting-meta';
        metaEl.textContent = metaParts.join(' · ');
        copy.appendChild(metaEl);
      }

      row.appendChild(copy);

      if (typeof m.meeting_link === 'string' && m.meeting_link.trim()) {
        const rawLink = m.meeting_link.trim();
        if (isSafeHttpsUrl(rawLink)) {
          const link = document.createElement('a');
          link.className = 'meeting-link-btn';
          link.href = rawLink;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'انضمام ↗';
          row.appendChild(link);
        } else {
          const plain = document.createElement('span');
          plain.className = 'meeting-link-plain';
          plain.textContent = rawLink;
          plain.title = rawLink;
          row.appendChild(plain);
        }
      }

      list.appendChild(row);
    });
  } catch (err) {
    if (request !== calendarRequest) return;
    const rawMsg = typeof err === 'string' ? err : (err?.message || 'تعذر تحميل المواعيد حالياً');
    renderEmptyMessage(list, 'meeting-empty', String(rawMsg));
  }
}

// -------------------------------------------------------------
// Smart Clipboard & Downloads Shelf (XSS-Safe DOM Rendering)
// -------------------------------------------------------------

async function refreshClipboardList() {
  const list = $('#clipboardList');
  if (!list) return;
  if (state.settings?.smartClipboardEnabled === false) {
    renderEmptyMessage(list, 'clip-empty', 'الحافظة الذكية معطّلة من الإعدادات');
    return;
  }
  const invoke = tauriInvoke();
  if (!invoke) {
    renderEmptyMessage(list, 'clip-empty', 'الحافظة فارغة حالياً');
    return;
  }
  try {
    const items = await invoke('smart_clipboard_get');
    if (!Array.isArray(items) || items.length === 0) {
      renderEmptyMessage(list, 'clip-empty', 'الحافظة فارغة حالياً');
      return;
    }
    list.textContent = '';
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const row = document.createElement('div');
      row.className = 'clip-item';
      row.title = 'اضغط لنسخ هذا العنصر';

      const previewSpan = document.createElement('span');
      previewSpan.className = 'clip-preview-text';
      previewSpan.textContent = String(item.preview ?? '');
      row.appendChild(previewSpan);

      if (item.extra) {
        const extraSpan = document.createElement('span');
        extraSpan.className = 'clip-extra';
        extraSpan.textContent = String(item.extra);
        row.appendChild(extraSpan);
      }

      row.addEventListener('click', async () => {
        try {
          await invoke('smart_clipboard_set', { text: String(item.content ?? '') });
          showCapsuleAlert('📋 تم النسخ', String(item.preview ?? ''));
        } catch {
          showCapsuleAlert('⚠️', 'تعذر النسخ إلى الحافظة');
        }
      });
      list.appendChild(row);
    });
  } catch {
    renderEmptyMessage(list, 'clip-empty', 'تعذر قراءة سجل الحافظة');
  }
}

function updateActiveDownloadsBanner(downloads) {
  const list = Array.isArray(downloads) ? downloads.filter((d) => d && d.is_downloading !== false) : [];
  const hasDownloads = list.length > 0;
  const badge = $('#downloadBadge');
  if (badge) {
    setDisplayIfChanged(badge, hasDownloads ? 'flex' : 'none');
    setClassIfChanged(badge, 'is-downloading', hasDownloads);
    if (hasDownloads) {
      setTitleIfChanged(badge, `جارٍ التنزيل: ${String(list[0].file_name || '')}`);
    }
  }
  const statusEl = $('#shelfDownloadsStatus');
  if (statusEl) {
    if (hasDownloads) {
      const firstName = String(list[0].file_name || 'ملف');
      setTextIfChanged(
        statusEl,
        list.length === 1
          ? `↓ جارٍ تنزيل: ${firstName}`
          : `↓ جارٍ تنزيل ${arabicDigits(list.length)} ملفات (${firstName})`
      );
      setDisplayIfChanged(statusEl, 'block');
    } else {
      setTextIfChanged(statusEl, '');
      setDisplayIfChanged(statusEl, 'none');
    }
  }
}

async function refreshShelfList() {
  const list = $('#shelfItemsList');
  if (!list) return;
  if (state.settings?.shelfEnabled === false) {
    renderEmptyMessage(list, 'shelf-empty', 'رف الملفات معطّل من الإعدادات');
    return;
  }
  const invoke = tauriInvoke();
  if (!invoke) {
    renderEmptyMessage(list, 'shelf-empty', 'لا توجد ملفات على الرف بعد');
    return;
  }
  try {
    const items = await invoke('shelf_list');
    if (!Array.isArray(items) || items.length === 0) {
      renderEmptyMessage(list, 'shelf-empty', 'لا توجد ملفات على الرف بعد');
      return;
    }
    list.textContent = '';
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const chip = document.createElement('div');
      chip.className = 'shelf-chip';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'shelf-chip-label';
      nameSpan.textContent = `📄 ${String(item.file_name ?? 'ملف')}`;
      nameSpan.title = String(item.file_name ?? '');
      nameSpan.addEventListener('click', () => {
        invoke('shelf_open', { path: String(item.file_path ?? '') }).catch(() => {
          showCapsuleAlert('⚠️', 'تعذر فتح الملف');
        });
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-text-sm';
      removeBtn.dataset.id = String(item.id ?? '');
      removeBtn.setAttribute('aria-label', `إزالة ${String(item.file_name ?? '')}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await invoke('shelf_remove', { id: String(item.id ?? '') }).catch(() => {});
        refreshShelfList();
      });

      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      list.appendChild(chip);
    });
  } catch {
    renderEmptyMessage(list, 'shelf-empty', 'تعذر تحميل رف الملفات');
  }
}

// -------------------------------------------------------------
// Instant Interactive Cards (Dua / Quote / Fasting / Prayer / Dhikr)
// -------------------------------------------------------------

function buildDynamicWhisperCards() {
  const now = new Date();
  ensurePrayerTimes(now);
  const { current, next } = upcomingPrayers(now);
  const dynamicCards = [];

  if (next) {
    const leadMinutes = Math.max(1, Math.min(90, Number(state.settings?.wuduLeadMinutes) || 15));
    const wuduAt = new Date(next.time.getTime() - leadMinutes * 60000);
    const curText = current ? `الصلاة الحالية: ${current.name} · ` : '';
    dynamicCards.push({
      kind: 'prayer',
      badge: '🕌 الصلاة والأذان',
      text: `${curText}الصلاة القادمة: ${next.name} (${formatClock(next.time)}) — متبقي ${formatRemaining(next.time - now)}`,
      source: `موعد الاستعداد والوضوء: ${formatClock(wuduAt)}`,
      actionType: current ? 'mark-prayer' : null,
      prayerInfo: current
    });
  }

  const dayOfWeek = window.WensShared.prayerDayClock(state.settings.timeZone, now).calendarDate.getUTCDay();
  const todayStr = worshipDateKey(now);
  const todayChecks = readDailyChecks(todayStr);
  const isFastingToday = Boolean(
    todayChecks.fasting ||
    state.accountability?.days?.[todayStr]?.fasting === 'yes' ||
    state.fasting?.today
  );
  const maghribTime = window.prayerTimes?.[4];
  const fajrTime = window.prayerTimes?.[0];

  if (isFastingToday && maghribTime && now < maghribTime) {
    dynamicCards.push({
      kind: 'fasting',
      badge: '🌙 صائم اليوم',
      text: `تقبّل الله صيامك — متبقي على أذان المغرب والإفطار ${formatRemaining(maghribTime - now)}`,
      source: `موعد أذان المغرب: ${formatClock(maghribTime)}`
    });
  } else {
    const sunnahNote =
      dayOfWeek === 0 || dayOfWeek === 3
        ? 'غداً يوم سنة للصيام (الإثنين / الخميس) — جدد نيتك من الليلة'
        : dayOfWeek === 1 || dayOfWeek === 4
        ? 'اليوم من أيام عرض الأعمال (الإثنين / الخميس)'
        : 'صيام التطوع جُنّة ووقاية وبركة في اليوم';
    dynamicCards.push({
      kind: 'fasting',
      badge: '🌙 تذكير الصيام',
      text: sunnahNote,
      source: fajrTime ? `الفجر (السحور): ${formatClock(fajrTime)} · المغرب: ${maghribTime ? formatClock(maghribTime) : '—'}` : 'تذكير الصيام المحلي',
      actionType: !isFastingToday ? 'mark-fasting' : null
    });
  }

  return dynamicCards;
}

function getFilteredWhisperDeck(category = activeWhisperCategory) {
  const dynamic = buildDynamicWhisperCards();
  const all = [...dynamic, ...REMINDERS];
  if (!category || category === 'all') return all;
  if (category === 'quran') {
    return all.filter((item) => item.kind === 'quran' || item.kind === 'dhikr' || item.kind === 'sunnah');
  }
  return all.filter((item) => item.kind === category);
}

export function hideMorphCard(stopAudio = false) {
  const wasCriticalSuhoor = Boolean(
    activeMorphMeta.isCriticalSuhoor || activeMorphMeta.kind === 'fasting-suhoor'
  );
  const hadAudio = Boolean(activeMorphMeta.hasAudio);

  activeMorphMeta = { id: null, kind: '', isCriticalSuhoor: false, hasAudio: false };

  const card = $('#morphCard');
  if (card) card.style.display = 'none';
  if (morphTimer) {
    clearTimeout(morphTimer);
    morphTimer = null;
  }
  if (morphProgressInterval) {
    clearInterval(morphProgressInterval);
    morphProgressInterval = null;
  }

  const invoke = tauriInvoke();
  if (stopAudio && invoke) {
    if (wasCriticalSuhoor) {
      // Suhoor wake challenge CANNOT be bypassed from the overlay card:
      // Hide ONLY the overlay card and focus Main Window — NEVER call alarm_dismiss(None)!
      invoke('show_main').catch(() => {});
    } else if (hadAudio) {
      invoke('audio_stop').catch(() => {});
    }
  }
  syncOverlayActivityClasses();
  syncWindowDimensions(true);
  scheduleRenderTick();
}

function configureMorphQuickActions(options = {}) {
  const box = $('#morphQuickActions');
  const actionBtn = $('#morphActionBtn');
  const stopAudioBtn = $('#morphStopAudioBtn');
  if (!box || !actionBtn || !stopAudioBtn) return;

  let hasAny = false;
  const isSuhoor = Boolean(options.isCriticalSuhoor || options.kind === 'fasting-suhoor');

  if (options.showStopAudio && !isSuhoor) {
    stopAudioBtn.style.display = 'inline-block';
    stopAudioBtn.onclick = () => {
      hideMorphCard(true);
    };
    hasAny = true;
  } else {
    stopAudioBtn.style.display = 'none';
    stopAudioBtn.onclick = null;
  }

  if (isSuhoor) {
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = 'فتح التحدي ↗';
    actionBtn.onclick = async () => {
      const invoke = tauriInvoke();
      if (invoke) await invoke('show_main').catch(() => {});
      hideMorphCard(false);
    };
    hasAny = true;
  } else if (options.actionType === 'mark-prayer') {
    const markBtn = $('#markPrayerBtn');
    if (markBtn && !markBtn.disabled) {
      actionBtn.style.display = 'inline-block';
      actionBtn.textContent = 'صليت ✓';
      actionBtn.onclick = () => {
        markBtn.click();
        actionBtn.textContent = '✓ تم';
        setTimeout(() => hideMorphCard(true), 400);
      };
      hasAny = true;
    } else {
      actionBtn.style.display = 'none';
      actionBtn.onclick = null;
    }
  } else if (options.actionType === 'mark-fasting') {
    actionBtn.style.display = 'inline-block';
    actionBtn.textContent = 'صائم اليوم ☾';
    actionBtn.onclick = async () => {
      const todayStr = worshipDateKey();
      await persistDailyWorship(
        todayStr,
        { fasting: true },
        { action: 'markFasting', fastingDate: todayStr, completed: true }
      );
      actionBtn.textContent = '✓ تقبل الله';
      setTimeout(() => hideMorphCard(false), 500);
    };
    hasAny = true;
  } else {
    actionBtn.style.display = 'none';
    actionBtn.onclick = null;
  }

  box.style.display = hasAny ? 'flex' : 'none';
}

function showMorphCard(badge, body, source, durationMs = 10000, options = {}) {
  if (state.settings?.overlayWidget === false) return;
  const card = $('#morphCard');
  if (!card) return;

  const isCriticalSuhoor = Boolean(options.isCriticalSuhoor || options.kind === 'fasting-suhoor');
  activeMorphMeta = {
    id: options.id || null,
    kind: String(options.kind || ''),
    isCriticalSuhoor,
    hasAudio: Boolean(options.showStopAudio && !isCriticalSuhoor)
  };

  $('#morphBadge').textContent = badge || 'فائدة وِنس';
  $('#morphBody').textContent = body || '';
  $('#morphSource').textContent = source || '';
  configureMorphQuickActions({ ...options, isCriticalSuhoor });

  card.style.display = 'flex';
  syncOverlayActivityClasses();
  syncWindowDimensions(true);
  requestAnimationFrame(() => syncWindowDimensions());
  scheduleRenderTick();

  if (morphTimer) clearTimeout(morphTimer);
  if (morphProgressInterval) clearInterval(morphProgressInterval);

  morphRemainingMs = durationMs;
  const totalMs = Math.max(1000, durationMs);
  const fill = $('#morphProgressFill');
  if (fill) fill.style.width = '100%';

  morphProgressInterval = setInterval(() => {
    if (!isMorphPaused) {
      morphRemainingMs -= 100;
      const pct = Math.max(0, (morphRemainingMs / totalMs) * 100);
      if (fill) fill.style.width = `${pct}%`;
      if (morphRemainingMs <= 0) {
        hideMorphCard(false);
      }
    }
  }, 100);
}

export function cycleWhisperCard(direction = 1, categoryOverride = null) {
  if (categoryOverride !== null) {
    activeWhisperCategory = categoryOverride;
    $$('.morph-cat-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cat === activeWhisperCategory);
    });
  }

  const deck = getFilteredWhisperDeck(activeWhisperCategory);
  if (!deck || deck.length === 0) return;

  activeWhisperIndex = (activeWhisperIndex + direction + deck.length) % deck.length;
  const item = deck[activeWhisperIndex];
  const badge =
    item.badge ||
    (item.kind === 'quran'
      ? '📖 آية كريمة'
      : item.kind === 'dua'
      ? '🤲 دعاء'
      : item.kind === 'quote'
      ? '💡 كوت وحكمة'
      : item.kind === 'fasting'
      ? '🌙 تذكير الصيام'
      : item.kind === 'prayer'
      ? '🕌 الصلاة والأذان'
      : '📿 ذكر وفائدة');

  showMorphCard(badge, item.text, item.source, 11000, {
    kind: `whisper-${item.kind || 'dhikr'}`,
    actionType: item.actionType || null
  });
}

function scheduleDhikrCardsRotation() {
  if (dhikrIntervalTimer) {
    clearInterval(dhikrIntervalTimer);
    dhikrIntervalTimer = null;
  }
  if (state.settings?.dhikrCardsEnabled === false) {
    lastDhikrIntervalMs = 0;
    return;
  }
  const minutes = Math.max(1, Math.min(240, Number(state.settings?.dhikrCardsIntervalMinutes) || 25));
  const intervalMs = minutes * 60 * 1000;
  lastDhikrIntervalMs = intervalMs;
  dhikrIntervalTimer = setInterval(() => {
    if (isOverlayInactive() || state.settings?.dhikrCardsEnabled === false) return;
    if (document.body.classList.contains('mode-collapsed') && $('#morphCard')?.style.display !== 'flex') {
      cycleWhisperCard(1);
    }
  }, intervalMs);
}

function hideCapsuleAlert() {
  if (eventAlertTimeout) {
    clearTimeout(eventAlertTimeout);
    eventAlertTimeout = null;
  }
  const eventPill = $('#islandEventPill');
  setDisplayIfChanged(eventPill, 'none');
  syncOverlayActivityClasses();
  updateCapsuleCenterMode(true);
  scheduleRenderTick();
}

function showCapsuleAlert(icon, text, durationMs = 3500) {
  if (state.settings?.overlayWidget === false) return;
  const prayerPill = $('#islandPrayerPill');
  const mediaPill = $('#islandMediaPill');
  const eventPill = $('#islandEventPill');
  if (!prayerPill || !eventPill) return;

  setTextIfChanged($('#islandEventIcon'), String(icon ?? '✨'));
  setTextIfChanged($('#islandEventText'), String(text ?? ''));
  setDisplayIfChanged(prayerPill, 'none');
  setDisplayIfChanged(mediaPill, 'none');
  setDisplayIfChanged(eventPill, 'flex');
  syncOverlayActivityClasses();

  syncWindowDimensions(true);
  requestAnimationFrame(() => syncWindowDimensions());
  scheduleRenderTick();

  if (eventAlertTimeout) clearTimeout(eventAlertTimeout);
  eventAlertTimeout = setTimeout(() => {
    hideCapsuleAlert();
  }, durationMs);
}

function rememberHandledReminderId(key, nowMs) {
  if (handledReminderIds.size >= MAX_HANDLED_REMINDERS) {
    const oldestKey = handledReminderIds.keys().next().value;
    if (oldestKey !== undefined) handledReminderIds.delete(oldestKey);
  }
  handledReminderIds.set(key, nowMs);
}

// Handle incoming native reminder (Adhan / Pre-prayer / Fasting / Custom) directly in the Notch
function handleIslandReminder(reminder) {
  if (!reminder || typeof reminder !== 'object') return;
  if (state.settings?.overlayWidget === false) return;

  const nowMs = Date.now();
  const kind = String(reminder.kind || '');
  const title = String(reminder.title || 'تنبيه وِنس');
  const body = String(reminder.body || '');
  const dedupKey = reminder.id ? `id:${String(reminder.id)}` : `sig:${kind}:${title}:${body}`;

  const prevSeen = handledReminderIds.get(dedupKey);
  if (prevSeen !== undefined && nowMs - prevSeen < 60000) {
    return;
  }
  rememberHandledReminderId(dedupKey, nowMs);

  const isSuhoor = kind === 'fasting-suhoor';
  const isAdhan = kind === 'prayer-at' || title.includes('أذان');
  const isPrayerPrep = kind.startsWith('prayer-prepare') || title.includes('اقترب موعد صلاة');
  const isFasting = kind.startsWith('fasting') || title.includes('صيام') || title.includes('سحور');

  const badge = isSuhoor
    ? '⚠️ منبه السحور'
    : isAdhan
    ? '🕌 حان الآن موعد الأذان'
    : isPrayerPrep
    ? '💧 الاستعداد للصلاة'
    : isFasting
    ? '🌙 تذكير الصيام'
    : '🔔 تنبيه وِنس';

  showMorphCard(badge, title, body, isSuhoor ? 30000 : isAdhan ? 20000 : 12000, {
    id: reminder.id || null,
    kind,
    isCriticalSuhoor: isSuhoor,
    showStopAudio: !isSuhoor && (isAdhan || isPrayerPrep),
    actionType: isSuhoor ? null : isAdhan ? 'mark-prayer' : isFasting ? 'mark-fasting' : null
  });
}

window.handleIslandReminder = handleIslandReminder;

// -------------------------------------------------------------
// Main Render Function
// -------------------------------------------------------------

let lastHydratedDateKey = '';

function render() {
  try {
    applyOverlayVisualSettings();
    updateHiddenPauseClass();

    const now = new Date();
    const todayStr = worshipDateKey(now);
    if (lastHydratedDateKey !== todayStr) {
      lastHydratedDateKey = todayStr;
      hydrateTodayWorship(todayStr);
    }

    ensurePrayerTimes(now);
    let { current, next, following } = upcomingPrayers(now);
    if (!next || !following) {
      window.prayerTimes = calculatePrayerTimes(now);
      window.tomorrowPrayerTimes = calculatePrayerTimes(now, 1);
      const retry = upcomingPrayers(now);
      current = retry.current;
      next = retry.next;
      following = retry.following;
      if (!next || !following) return;
    }

    const leadMinutes = Math.max(1, Math.min(90, Number(state.settings?.wuduLeadMinutes) || 15));
    const wuduAt = new Date(next.time.getTime() - leadMinutes * 60000);
    const wuduDue = now >= wuduAt;
    const remainingMs = next.time - now;
    lastNextPrayerRemainingMs = remainingMs;
    const formattedRemaining = formatRemaining(remainingMs);

    // Collapsed capsule bindings (dirty-checked — 0 DOM mutations & 0 layout reflows when unchanged)
    const capsulePrayerName = $('#capsulePrayerName');
    const capsuleCountdown = $('#capsuleCountdown');
    let capsuleChanged = false;
    if (setTextIfChanged(capsulePrayerName, next.name)) capsuleChanged = true;
    if (setTextIfChanged(capsuleCountdown, formattedRemaining)) capsuleChanged = true;
    updateCapsuleCenterMode(capsuleChanged);

    // Keep #markPrayerBtn state synced (dirty-checked) because morph quick-actions inspect/click it even when collapsed
    if (current) {
      const currentAction = $('#currentPrayerAction');
      setDisplayIfChanged(currentAction, 'flex');
      setTextIfChanged($('#currentPrayerLabel'), current.name);

      const dayData = state.accountability?.days?.[todayStr];
      const status = dayData?.prayers?.[current.name];
      const prayerKey = PRAYER_KEY_MAP[current.index] || PRAYER_KEY_MAP[current.name];
      const checks = readDailyChecks(todayStr);
      const isCheckedInLocalStorage = Boolean(prayerKey && checks[prayerKey]);
      const isComplete = status === 'done' || status === 'made-up' || isCheckedInLocalStorage;
      const markSig = `${todayStr}|${current.index}|${current.name}|${isComplete ? 1 : 0}`;
      const btn = $('#markPrayerBtn');
      if (btn && lastMarkPrayerSig !== markSig) {
        lastMarkPrayerSig = markSig;
        if (isComplete) {
          btn.disabled = true;
          setTextIfChanged(btn, '✓ تم');
          btn.onclick = null;
        } else {
          btn.disabled = false;
          setTextIfChanged(btn, 'صليت ✓');
          btn.onclick = async () => {
            btn.disabled = true;
            setTextIfChanged(btn, '✓ تم');
            lastMarkPrayerSig = `${todayStr}|${current.index}|${current.name}|1`;
            await persistDailyWorship(
              todayStr,
              prayerKey ? { [prayerKey]: true } : {},
              {
                action: 'markPrayer',
                prayerIndex: current.index,
                prayerName: current.name,
                prayerKey
              }
            );
          };
        }
      }
    } else {
      setDisplayIfChanged($('#currentPrayerAction'), 'none');
      lastMarkPrayerSig = '';
    }

    // Expanded card bindings (skip when collapsed; toggleIslandExpanded calls render() immediately on open)
    if (!document.body.classList.contains('mode-collapsed')) {
      setTextIfChanged($('#nextPrayerName'), next.name);
      setTextIfChanged($('#nextPrayerTime'), formatClock(next.time));
      setTextIfChanged($('#nextPrayerCountdown'), `باقي ${formattedRemaining}`);

      setClassIfChanged($('#wuduMoment'), 'due', wuduDue);
      setTextIfChanged($('#wuduTime'), formatClock(wuduAt));
      setTextIfChanged(
        $('#wuduCountdown'),
        wuduDue ? 'حان وقت الاستعداد والوضوء' : `قبل الأذان بـ${arabicDigits(leadMinutes)} دقيقة`
      );

      setTextIfChanged($('#followingPrayerName'), following.name);
      setTextIfChanged($('#followingPrayerTime'), formatClock(following.time));
    }
  } catch (err) {
    console.error('[overlay render error]', err);
  }
}

// -------------------------------------------------------------
// Cross-Window Sync Helpers
// -------------------------------------------------------------

function handleExternalSyncMessage(data) {
  if (!data || typeof data !== 'object') return;
  if (data.source === 'overlay') return;

  if (data.type === 'wens-radio-started') {
    if (isRadioPlaying || isRadioLoading) {
      stopRadio('تم إيقاف الإذاعة لأن النافذة الرئيسية بدأت البث');
    }
    return;
  }

  if (data.state && typeof data.state === 'object') {
    const prevStrictOffline = Boolean(state.settings?.strictOffline);
    const nativeSettings = state.settings;
    state = mergeState(data.state);
    if (tauriInvoke()) state.settings = nativeSettings;
    if (state.settings?.strictOffline && !prevStrictOffline) {
      stopRadio('تم إيقاف الإذاعة لتفعيل الوضع غير المتصل', 'is-offline');
    }
    window.prayerTimes = null;
    window.tomorrowPrayerTimes = null;
  }

  const todayStr = data.date || data.fastingDate || worshipDateKey();
  if (data.checks && typeof data.checks === 'object') {
    applyDailyChecksToState(todayStr, data.checks);
  }
  if (data.action === 'markPrayer') {
    const pKey = data.prayerKey || PRAYER_KEY_MAP[data.prayerName];
    if (pKey) {
      writeDailyChecks(todayStr, { [pKey]: true });
      applyDailyChecksToState(todayStr, { [pKey]: true });
    }
  } else if (data.action === 'markFasting') {
    const done = Boolean(data.completed);
    writeDailyChecks(todayStr, { fasting: done });
    applyDailyChecksToState(todayStr, { fasting: done });
  }

  render();
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof BroadcastChannel === 'function') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', (event) => {
      handleExternalSyncMessage(event.data);
    });
  }

  window.addEventListener('storage', (event) => {
    if (!event.key) return;
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        handleExternalSyncMessage({ source: 'storage', state: parsed });
      } catch {}
    } else if (event.key.startsWith('wens-checks-') && event.newValue) {
      try {
        const dateStr = event.key.slice('wens-checks-'.length);
        const parsed = JSON.parse(event.newValue);
        applyDailyChecksToState(dateStr, parsed);
        render();
      } catch {}
    }
  });

  document.addEventListener('visibilitychange', () => {
    updateHiddenPauseClass();
    if (!isOverlayInactive()) {
      render();
      scheduleRenderTick();
      const invoke = tauriInvoke();
      if (invoke) {
        invoke('media_session_get').then(updateMediaSession).catch(() => {});
      }
    } else if (renderLoopTimer) {
      clearTimeout(renderLoopTimer);
      renderLoopTimer = null;
    }
  });

  const invoke = tauriInvoke();
  const listen = tauriListen();
  if (listen) {
    await listen('wens-settings-changed', (event) => {
      const p = event.payload;
      if (!p) return;
      nativeSettingsRevision += 1;
      nativeSettingsReady = true;
      applySettingsFromPayload(p);
      if (state.settings.overlayWidget === false) {
        if ($('#morphCard')?.style.display === 'flex') {
          hideMorphCard(false);
        }
        if (renderLoopTimer) {
          clearTimeout(renderLoopTimer);
          renderLoopTimer = null;
        }
      } else {
        lastWindowSyncKey = '';
        syncWindowDimensions(true);
        scheduleRenderTick();
      }
    }).catch(() => {});
  }
  if (invoke) {
    const revision = nativeSettingsRevision;
    await invoke('bootstrap_get').then((boot) => {
      const p = boot?.settings || boot?.preferences;
      if (p && revision === nativeSettingsRevision) {
        nativeSettingsReady = true;
        applySettingsFromPayload(p);
        if (state.settings.overlayWidget !== false) {
          invoke('island_set_click_through', { enable: false }).catch(() => {});
          syncWindowDimensions(true);
        }
      }
    }).catch(() => {});
    invoke('downloads_active_get').then(updateActiveDownloadsBanner).catch(() => {});
  }

  await hydrateTodayWorship();
  applyOverlayVisualSettings();
  render();
  scheduleDhikrCardsRotation();
  scheduleRenderTick();

  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!isOverlayInactive()) syncWindowDimensions();
    });
    for (const sel of ['#islandBar', '#morphCard', '#smtcSection', '.island-tabs', '.prayer-flow', '.media-container', '.wellbeing-grid', '.shelf-container']) {
      const el = $(sel);
      if (el) ro.observe(el);
    }
  }

  initRadio();
  initMediaControls();
  updateWaterDisplay();
  refreshCalendarMeetings();
  refreshClipboardList();
  refreshShelfList();

  // Tab switching
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('active'));
      $$('.tab-pane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      if (tabId === 'prayer') {
        $('#panePrayer')?.classList.add('active');
      } else if (tabId === 'media') {
        $('#paneMedia')?.classList.add('active');
      } else if (tabId === 'wellbeing') {
        $('#paneWellbeing')?.classList.add('active');
        updateWaterDisplay();
        refreshCalendarMeetings();
      } else if (tabId === 'shelf') {
        $('#paneShelf')?.classList.add('active');
        refreshClipboardList();
        refreshShelfList();
      }
      syncWindowDimensions(true);
      requestAnimationFrame(() => syncWindowDimensions());
    });
  });

  // Instant Next (‹), Retract (▲) & Close (×) on Pop-out Morph Card
  $('#morphNextBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (activeMorphMeta.isCriticalSuhoor) {
      if (invoke) invoke('show_main').catch(() => {});
      hideMorphCard(false);
      return;
    }
    cycleWhisperCard(1);
  });

  $('#morphRetractBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideMorphCard(true);
  });

  $('#morphCloseBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideMorphCard(true);
  });

  // Clicking the green pulse dot on the right of the notch shows a Quote / Dua / Reminder card on demand
  $('#brandPulse')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.body.classList.contains('mode-collapsed')) {
      toggleIslandExpanded(false);
    }
    cycleWhisperCard(1);
  });

  // Inline event pill dismiss control
  $('#islandEventDismissBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideCapsuleAlert();
  });

  // Expand / Collapse toggling + Smart Drag on center pill
  $('#islandToggleBtn')?.addEventListener('click', () => toggleIslandExpanded());
  const centerEl = $('#islandCenter');
  if (centerEl) {
    let downX = 0;
    let downY = 0;
    let dragged = false;
    centerEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      downX = e.screenX;
      downY = e.screenY;
      dragged = false;
      const onMove = (ev) => {
        if (Math.hypot(ev.screenX - downX, ev.screenY - downY) > 5) {
          dragged = true;
          window.removeEventListener('pointermove', onMove);
          if (invoke) invoke('overlay_start_dragging').catch(() => {});
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
    centerEl.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      if (!dragged) toggleIslandExpanded();
    });
  }

  // Water Drink button
  $('#drinkWaterBtn')?.addEventListener('click', async () => {
    if (invoke) {
      await invoke('wellbeing_water_increment').catch(() => {});
      updateWaterDisplay();
      showCapsuleAlert('💧', 'هنيئاً ومريئاً!');
    }
  });

  // Calendar Refresh button
  $('#refreshMeetingsBtn')?.addEventListener('click', () => {
    refreshCalendarMeetings();
  });

  // Clipboard Clear
  $('#clearClipBtn')?.addEventListener('click', async () => {
    if (invoke) {
      await invoke('smart_clipboard_clear').catch(() => {});
      refreshClipboardList();
    }
  });

  // Collapse back to small notch pill, or close the Dynamic Island if already collapsed
  const collapseToPill = (e) => {
    if (e) e.stopPropagation();
    if ($('#morphCard')?.style.display === 'flex') {
      hideMorphCard(true);
    }
    if (!document.body.classList.contains('mode-collapsed')) {
      toggleIslandExpanded(false);
    }
  };
  $('#hideOverlayButton')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if ($('#morphCard')?.style.display === 'flex') {
      hideMorphCard(true);
      return;
    }
    if (!document.body.classList.contains('mode-collapsed')) {
      toggleIslandExpanded(false);
      return;
    }
    stopRadio('');
    await persistSettingsPatch({ overlayWidget: false });
    updateHiddenPauseClass();
    if (invoke) invoke('overlay_set_visible', { visible: false }).catch(() => {});
  });
  $('#hideOverlayFooterButton')?.addEventListener('click', collapseToPill);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      collapseToPill();
    } else if (e.key === 'ArrowLeft' && $('#morphCard')?.style.display === 'flex' && !activeMorphMeta.isCriticalSuhoor) {
      cycleWhisperCard(1);
    } else if (e.key === 'ArrowRight' && $('#morphCard')?.style.display === 'flex' && !activeMorphMeta.isCriticalSuhoor) {
      cycleWhisperCard(-1);
    }
  });

  $('#openPrayerButton')?.addEventListener('click', async () => {
    if (invoke) await invoke('show_main').catch(() => {});
  });

  // Morph card hover-pause
  const morphCard = $('#morphCard');
  morphCard?.addEventListener('mouseenter', () => { isMorphPaused = true; });
  morphCard?.addEventListener('mouseleave', () => { isMorphPaused = false; });

  // Native Tauri Event Listeners
  if (listen) {
    listen('wens-reminder', (event) => {
      handleIslandReminder(event.payload);
    }).catch(() => {});

    listen('wens-critical-alarm', (event) => {
      const p = event.payload || {};
      if (isRadioPlaying || isRadioLoading) stopRadio('تم إيقاف الإذاعة للمنبّه');
      handleIslandReminder({
        id: p.id || `suhoor-critical-${worshipDateKey()}`,
        title: p.title || 'منبه السحور القوي ⚠️',
        body: p.body || 'افتح النافذة الرئيسية لإتمام تحدي الاستيقاظ',
        kind: 'fasting-suhoor'
      });
    }).catch(() => {});

    const clearAlarm = () => {
      if (activeMorphMeta.isCriticalSuhoor) {
        hideMorphCard(false);
      }
    };
    listen('wens-alarm-dismissed', clearAlarm).catch(() => {});
    listen('wens-alarm-snoozed', clearAlarm).catch(() => {});

    listen('wens-audio-playing', (event) => {
      const kind = String(event.payload?.kind || '');
      if ((isRadioPlaying || isRadioLoading) && state.settings.radioPauseAtPrayer !== false &&
          (kind.startsWith('prayer-') || kind === 'adhan-test')) {
        stopRadio('تم إيقاف الإذاعة لصوت الأذان');
      }
    }).catch(() => {});

    listen('wens-radio-started', (event) => {
      const payload = event.payload || {};
      if (payload.source !== 'overlay' && (isRadioPlaying || isRadioLoading)) {
        stopRadio('تم إيقاف الإذاعة لأن النافذة الرئيسية بدأت البث');
      }
    }).catch(() => {});

    listen('wens-state-sync', (event) => {
      handleExternalSyncMessage(event.payload);
    }).catch(() => {});

    listen('wens-prayer-completed', (event) => {
      const payload = event.payload || {};
      if (payload.source === 'overlay') return;
      handleExternalSyncMessage({
        source: payload.source || 'main',
        action: 'markPrayer',
        prayerKey: payload.prayerKey,
        prayerName: payload.prayerName,
        date: payload.date
      });
    }).catch(() => {});

    listen('wens-water-updated', () => {
      updateWaterDisplay();
    }).catch(() => {});

    listen('wens-privacy-status', (event) => {
      const p = event.payload || {};
      const dots = $('#privacyDots');
      const dotMic = $('#dotMic');
      const dotCam = $('#dotCam');
      if (dots && dotMic && dotCam) {
        const allowDots = state.settings?.privacyDotsEnabled !== false;
        const mic = allowDots && Boolean(p.mic_active);
        const cam = allowDots && Boolean(p.cam_active);
        dotMic.style.display = mic ? 'inline-block' : 'none';
        dotCam.style.display = cam ? 'inline-block' : 'none';
        dots.style.display = (mic || cam) ? 'flex' : 'none';
      }
    }).catch(() => {});

    listen('wens-download-progress', (event) => {
      updateActiveDownloadsBanner(event.payload);
    }).catch(() => {});

    listen('wens-media-update', (event) => {
      updateMediaSession(event.payload);
    }).catch(() => {});

    listen('wens-clipboard-update', (event) => {
      const item = event.payload || {};
      refreshClipboardList();
      if (item.kind === 'math' && item.extra) {
        showCapsuleAlert('🔢', `= ${String(item.extra)}`);
      } else if (item.kind === 'color' && item.extra) {
        showCapsuleAlert('🎨', String(item.extra));
      }
    }).catch(() => {});

    listen('wens-wellbeing-water', (event) => {
      const payload = event.payload || {};
      updateWaterDisplay();
      showMorphCard(String(payload.title_ar || '💧 شرب الماء'), String(payload.message_ar || ''), 'ترطيب وصحة', 10000, { kind: 'wellbeing-water' });
    }).catch(() => {});

    listen('wens-wellbeing-eyecare', (event) => {
      const payload = event.payload || {};
      showMorphCard(String(payload.title_ar || '👁️ راحة العين'), String(payload.message_ar || ''), 'صحة بصرية', 10000, { kind: 'wellbeing-eyecare' });
    }).catch(() => {});

    listen('wens-wellbeing-welcomeback', (event) => {
      const payload = event.payload || {};
      showCapsuleAlert('👋', `مرحباً بعودتك! (غبت ${arabicDigits(payload.idle_minutes ?? 0)} دقيقة)`);
    }).catch(() => {});

    listen('tauri://drag-drop', async (event) => {
      const paths = event.payload?.paths;
      if (!Array.isArray(paths) || paths.length === 0 || !invoke) return;
      for (const filePath of paths) {
        await invoke('shelf_add', { path: filePath }).catch(() => {});
      }
      await refreshShelfList();
      showCapsuleAlert('📁', `أُضيف للرف (${arabicDigits(paths.length)})`);
    }).catch(() => {});
  }

  // Show initial Quote / Dua / Reminder card shortly after launch if enabled
  setTimeout(() => {
    if (isOverlayInactive() || state.settings?.dhikrCardsEnabled === false) return;
    if (document.body.classList.contains('mode-collapsed') && $('#morphCard')?.style.display !== 'flex') {
      cycleWhisperCard(1);
    }
  }, 2500);
});
