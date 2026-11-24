import type {
  AppPreferences,
  AppPreferencesPatch,
  BootstrapPayload,
  CriticalAlarmPayload,
  DailyWorshipRecord,
  DeliveryResult,
  Idea,
  LegacyState,
  NotificationRecord,
  NotificationSummary,
  PrayerDay,
  Project,
  ReminderEvent,
  UpdateIdeaInput,
  UpdateProjectInput,
  WorkSessionRecord,
  PrivacyStatus,
  ClipboardItem,
  ShelfItem,
  DownloadItem,
  CalendarMeeting,
  MediaSessionInfo,
} from './types';
import {
  calculateMonthPrayerTable,
  getCivilClock,
  getTimeZoneOffsetHours,
  getTimeZoneOffsetMinutes,
  normalizeCalcMethod,
  sanitizeFiniteNumber,
  sanitizeLatitude,
  sanitizeLongitude,
} from './domain/astronomy';

const fallbackId = 'browser-local-device';

function nowIso(): string {
  return new Date().toISOString();
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__);
}

type StorageWarningListener = (message: string, error: unknown) => void;
const storageWarningListeners = new Set<StorageWarningListener>();
let lastStorageQuotaWarning: string | null = null;

export function onStorageQuotaWarning(listener: StorageWarningListener): () => void {
  storageWarningListeners.add(listener);
  return () => {
    storageWarningListeners.delete(listener);
  };
}

export function getLastStorageQuotaWarning(): string | null {
  return lastStorageQuotaWarning;
}

export function clearStorageQuotaWarning(): void {
  lastStorageQuotaWarning = null;
}

export function safeSetLocalStorage(key: string, value: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22 ||
        error.code === 1014);
    const msg = isQuota
      ? 'امتلأت مساحة التخزين المؤقت للمتصفح — يُنصح بتصدير نسخة احتياطية وتقليل السجل القديم.'
      : 'تعذر حفظ نسخة التخزين المؤقت محليًا.';
    lastStorageQuotaWarning = msg;
    storageWarningListeners.forEach((fn) => {
      try {
        fn(msg, error);
      } catch {
        // ignore listener failure
      }
    });
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('wens-storage-warning', { detail: { message: msg, isQuota } }));
      } catch {
        // ignore
      }
    }
    return false;
  }
}

export function safeGetLocalStorageJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const defaultPreferences: AppPreferences = {
  themeId: 'midnight-magenta',
  accentId: 'amber',
  notifications: {
    prePrayerEnabled: true,
    prayerAtTimeEnabled: true,
    fastingEnabled: false,
    focusCompletionEnabled: true,
    quietHours: null,
  },
  audio: {
    prayer: 'silent',
    fasting: 'silent',
    work: 'silent',
    volume: 80,
    backgroundPlayback: 'always',
  },
  latitude: 30.0444,
  longitude: 31.2357,
  wuduLeadMinutes: 15,
  calcMethod: 'egypt',
  petVisible: true,
  overlayWidget: true,
  overlaySize: 'normal',
  locationLabel: 'القاهرة، مصر',
  countryCode: 'EG',
  timeZone: 'Africa/Cairo',
  fajrOffset: 0,
  maghribOffset: 0,
  ishaOffset: 0,
  hijriDateOffset: 0,
  bubbles: true,
  livelyPopups: false,
  quietDefault: false,
  strictOffline: false,
  petAvatar: 'orb',
  petSize: 'normal',
  petRoaming: false,
  petInteractionSounds: false,
  petIdleFade: true,
  petIdleOpacity: 0.15,
  petIdleDelaySeconds: 2,
  petPopupSize: 'normal',
  fontSize: 'medium',
  reducedMotion: false,
  suhoorLeadMinutes: 45,
  imsakWaterLeadMinutes: 15,
  suhoorWakeChallenge: true,
  suhoorWakeCheckMinutes: 5,
  preventSleepForSuhoor: false,
  taskbarWidgetEnabled: true,
  taskbarWidgetPosition: 'tray',
  taskbarWidgetDigits: 'latin',
  taskbarShowFocusTimer: true,
  asrHanafi: false,
  onboardingCompleted: false,
  islandOrientation: 'top',
  islandSide: 'right',
  islandHideFullscreen: true,
  islandTheme: 'system',
  dhikrCardsEnabled: true,
  dhikrCardsIntervalMinutes: 25,
  dhikrEveryMinutes: 15,
  dhikrDurationSeconds: 30,
  dhikrIncludeAyah: true,
  dhikrIncludeDhikr: true,
  dhikrIncludeDua: true,
  quranRadioEnabled: true,
  quranRadioDefaultStation: 'cairo',
  radioPauseAtPrayer: true,
  mediaPillEnabled: true,
  mediaPauseAtPrayer: true,
  waterReminderEnabled: true,
  waterEveryMinutes: 45,
  waterDailyGoal: 8,
  eyeBreakEnabled: true,
  welcomeBackEnabled: true,
  morningBriefEnabled: true,
  smartClipboardEnabled: true,
  clipboardHistoryEnabled: true,
  shelfEnabled: true,
  screenshotAutoShelf: true,
  screenshotShelfMinutes: 20,
  downloadsWatcherEnabled: true,
  privacyDotsEnabled: true,
  meetingsIcalEnabled: true,
  meetingsIcalUrl: '',
  petCursorEyes: true,
  petContextProps: true,
};

function legacyState(): LegacyState {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem('wens-local-v1');
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as LegacyState) : {};
  } catch {
    return {};
  }
}

function saveLegacyState(next: LegacyState): boolean {
  return safeSetLocalStorage('wens-local-v1', JSON.stringify(next));
}

export function mergePatches(
  p1: AppPreferencesPatch | null | undefined,
  p2: AppPreferencesPatch | null | undefined
): AppPreferencesPatch {
  const safeP1 = isPlainObject(p1) ? (p1 as AppPreferencesPatch) : {};
  const safeP2 = isPlainObject(p2) ? (p2 as AppPreferencesPatch) : {};
  if (!p1) return safeP2;
  if (!p2) return safeP1;

  const cleanP1Notifs = isPlainObject(safeP1.notifications) ? safeP1.notifications : {};
  const cleanP2Notifs = isPlainObject(safeP2.notifications) ? safeP2.notifications : {};
  const hasNotifs = isPlainObject(safeP1.notifications) || isPlainObject(safeP2.notifications);

  const cleanP1Audio = isPlainObject(safeP1.audio) ? safeP1.audio : {};
  const cleanP2Audio = isPlainObject(safeP2.audio) ? safeP2.audio : {};
  const hasAudio = isPlainObject(safeP1.audio) || isPlainObject(safeP2.audio);

  const res: AppPreferencesPatch = {
    ...safeP1,
    ...safeP2,
  };

  if (hasNotifs) {
    res.notifications = {
      ...cleanP1Notifs,
      ...cleanP2Notifs,
    };
  }

  if (hasAudio) {
    res.audio = {
      ...cleanP1Audio,
      ...cleanP2Audio,
    };
  }

  return res;
}

export function deepMergePreferences(
  current: AppPreferences,
  patch: AppPreferencesPatch | Record<string, unknown> | null | undefined
): AppPreferences {
  const safeCurrent = isPlainObject(current) ? current : defaultPreferences;
  const currentNotifs = isPlainObject(safeCurrent.notifications)
    ? safeCurrent.notifications
    : defaultPreferences.notifications;
  const currentAudio = isPlainObject(safeCurrent.audio)
    ? safeCurrent.audio
    : defaultPreferences.audio;

  const patchObj = isPlainObject(patch) ? (patch as Record<string, unknown>) : {};
  const patchNotifs = isPlainObject(patchObj.notifications)
    ? (patchObj.notifications as Record<string, unknown>)
    : undefined;
  const patchAudio = isPlainObject(patchObj.audio)
    ? (patchObj.audio as Record<string, unknown>)
    : undefined;

  let mergedQuietHours = isPlainObject(currentNotifs.quietHours)
    ? {
        start: typeof currentNotifs.quietHours.start === 'string' ? currentNotifs.quietHours.start : '22:00',
        end: typeof currentNotifs.quietHours.end === 'string' ? currentNotifs.quietHours.end : '06:00',
      }
    : null;

  if (patchNotifs && 'quietHours' in patchNotifs) {
    const qh = patchNotifs.quietHours;
    if (qh === null || qh === undefined) {
      mergedQuietHours = null;
    } else if (isPlainObject(qh)) {
      mergedQuietHours = {
        start: typeof qh.start === 'string' ? qh.start : (mergedQuietHours?.start ?? '22:00'),
        end: typeof qh.end === 'string' ? qh.end : (mergedQuietHours?.end ?? '06:00'),
      };
    }
  }

  const cleanNotifs: Record<string, unknown> = {};
  if (patchNotifs) {
    for (const [k, v] of Object.entries(patchNotifs)) {
      if (v !== undefined && k !== 'quietHours') {
        cleanNotifs[k] = v;
      }
    }
  }

  const cleanAudio: Record<string, unknown> = {};
  if (patchAudio) {
    for (const [k, v] of Object.entries(patchAudio)) {
      if (v !== undefined) {
        cleanAudio[k] = v;
      }
    }
  }

  const mergedNotifications: AppPreferences['notifications'] = {
    ...defaultPreferences.notifications,
    ...currentNotifs,
    ...cleanNotifs,
    quietHours: mergedQuietHours,
  };

  const mergedAudio: AppPreferences['audio'] = {
    ...defaultPreferences.audio,
    ...currentAudio,
    ...cleanAudio,
  };

  const { notifications: _n, audio: _a, ...topLevelPatch } = patchObj;
  const cleanTopLevel: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(topLevelPatch)) {
    if (v !== undefined) {
      cleanTopLevel[k] = v;
    }
  }

  if (cleanTopLevel.calcMethod !== undefined) {
    cleanTopLevel.calcMethod = normalizeCalcMethod(String(cleanTopLevel.calcMethod));
  }

  if (cleanTopLevel.latitude !== undefined) {
    cleanTopLevel.latitude = sanitizeLatitude(cleanTopLevel.latitude, safeCurrent.latitude);
  }
  if (cleanTopLevel.longitude !== undefined) {
    cleanTopLevel.longitude = sanitizeLongitude(cleanTopLevel.longitude, safeCurrent.longitude);
  }

  if (cleanTopLevel.petAvatar !== undefined || safeCurrent.petAvatar) {
    const rawAvatar = String(
      cleanTopLevel.petAvatar !== undefined ? cleanTopLevel.petAvatar : safeCurrent.petAvatar
    );
    const validAvatars = ['orb', 'robot', 'cat', 'owl', 'crescent', 'sprout', 'lantern'];
    cleanTopLevel.petAvatar = validAvatars.includes(rawAvatar) ? rawAvatar : 'orb';
  }

  return {
    ...defaultPreferences,
    ...safeCurrent,
    ...cleanTopLevel,
    notifications: mergedNotifications,
    audio: mergedAudio,
  };
}

function sanitizeProjectRecord(item: unknown, index: number): Project | null {
  if (!isPlainObject(item)) return null;
  const ts = nowIso();
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : `legacy-project-${index}`,
    title: typeof item.title === 'string' && item.title.trim() ? item.title : 'مشروع بدون اسم',
    description: typeof item.description === 'string' ? item.description : '',
    status: typeof item.status === 'string' && item.status.trim() ? item.status : 'فكرة',
    progress: sanitizeFiniteNumber(item.progress, 0),
    symbol: typeof item.symbol === 'string' && item.symbol ? item.symbol : '✦',
    currentTask: typeof item.currentTask === 'string' ? item.currentTask : null,
    goal: typeof item.goal === 'string' ? item.goal : null,
    isCurrent: Boolean(item.isCurrent),
    deviceId: typeof item.deviceId === 'string' ? item.deviceId : fallbackId,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : ts,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ts,
    revision: sanitizeFiniteNumber(item.revision, 1),
    deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
  };
}

function sanitizeIdeaRecord(item: unknown, index: number): Idea | null {
  if (!isPlainObject(item)) return null;
  const ts = nowIso();
  return {
    id: typeof item.id === 'string' && item.id.trim() ? item.id : `legacy-idea-${index}`,
    title: typeof item.title === 'string' && item.title.trim() ? item.title : 'فكرة',
    tag: typeof item.tag === 'string' && item.tag.trim() ? item.tag : 'فكرة',
    body: typeof item.body === 'string' ? item.body : '',
    deviceId: typeof item.deviceId === 'string' ? item.deviceId : fallbackId,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : ts,
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : ts,
    revision: sanitizeFiniteNumber(item.revision, 1),
    deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
  };
}

function fallbackBootstrap(): BootstrapPayload {
  const legacy = legacyState();
  const rawSaved: Record<string, unknown> = isPlainObject(legacy.settings)
    ? { ...legacy.settings }
    : {};
  if (typeof rawSaved.hijriDateOffset !== 'number' || !Number.isFinite(rawSaved.hijriDateOffset)) {
    rawSaved.hijriDateOffset = 0;
  }
  const settings = deepMergePreferences(defaultPreferences, rawSaved as Partial<AppPreferences>);

  const rawProjects = Array.isArray(legacy.projects) ? legacy.projects : [];
  const projects: Project[] = rawProjects
    .map((item, index) => sanitizeProjectRecord(item, index))
    .filter((p): p is Project => p !== null && !p.deletedAt);

  const rawIdeas = Array.isArray(legacy.ideas) ? legacy.ideas : [];
  const ideas: Idea[] = rawIdeas
    .map((item, index) => sanitizeIdeaRecord(item, index))
    .filter((i): i is Idea => i !== null && !i.deletedAt);

  const notificationSummary: NotificationSummary = {
    nextReminder: null,
    status: settings.notifications.prayerAtTimeEnabled ? 'armed' : 'silent',
    unreadCount: 0,
    lastRecoverableError: null,
  };

  return {
    schemaVersion: 3,
    deviceId: fallbackId,
    settings,
    notificationSummary,
    projects,
    ideas,
  };
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  if (isTauriRuntime()) {
    const res = await invoke<BootstrapPayload>('bootstrap_get');
    return {
      ...res,
      settings: deepMergePreferences(defaultPreferences, res.settings),
      projects: Array.isArray(res.projects) ? res.projects.filter((p) => p && !p.deletedAt) : [],
      ideas: Array.isArray(res.ideas) ? res.ideas.filter((i) => i && !i.deletedAt) : [],
    };
  }
  try {
    const res = await invoke<BootstrapPayload>('bootstrap_get');
    return {
      ...res,
      settings: deepMergePreferences(defaultPreferences, res.settings),
      projects: Array.isArray(res.projects) ? res.projects.filter((p) => p && !p.deletedAt) : [],
      ideas: Array.isArray(res.ideas) ? res.ideas.filter((i) => i && !i.deletedAt) : [],
    };
  } catch {
    return fallbackBootstrap();
  }
}

export async function updateSettings(
  patch: AppPreferencesPatch | Record<string, unknown>
): Promise<{ settings: AppPreferences; notificationSummary: NotificationSummary }> {
  const sanitizedPatch: Record<string, unknown> = isPlainObject(patch) ? { ...patch } : {};
  if (typeof sanitizedPatch.calcMethod === 'string') {
    sanitizedPatch.calcMethod = normalizeCalcMethod(sanitizedPatch.calcMethod);
  }
  try {
    const res = await invoke<{ settings: AppPreferences; notificationSummary: NotificationSummary }>(
      'settings_update',
      { patch: sanitizedPatch }
    );
    const mergedSettings = deepMergePreferences(defaultPreferences, res.settings);
    const legacy = legacyState();
    legacy.settings = mergedSettings;
    saveLegacyState(legacy);
    return { ...res, settings: mergedSettings };
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const current = fallbackBootstrap();
    const merged = deepMergePreferences(current.settings, sanitizedPatch);
    const summary: NotificationSummary = {
      nextReminder: null,
      status: merged.notifications.prayerAtTimeEnabled ? 'armed' : 'silent',
      unreadCount: 0,
      lastRecoverableError: null,
    };
    const legacy = legacyState();
    legacy.settings = merged;
    saveLegacyState(legacy);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wens-settings-changed', { detail: merged }));
    }
    return { settings: merged, notificationSummary: summary };
  }
}

let activeTestAudio: HTMLAudioElement | null = null;

export async function updateReminderPlan(
  events: ReminderEvent[]
): Promise<NotificationSummary> {
  try {
    return await invoke<NotificationSummary>('reminder_plan_update', { events });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const currentMs = Date.now();
    const next = events.find((e) => e.dueAtMs >= currentMs) || events[0] || null;
    return {
      nextReminder: next,
      status: 'armed',
      unreadCount: 0,
      lastRecoverableError: null,
    };
  }
}

export async function listenToEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<T>(event, (ev) => handler(ev.payload));
  } catch {
    if (typeof window !== 'undefined') {
      const windowHandler = (ev: Event) => {
        const customEv = ev as CustomEvent<T>;
        handler(customEv.detail);
      };
      window.addEventListener(event, windowHandler);
      return () => {
        window.removeEventListener(event, windowHandler);
      };
    }
    return () => {};
  }
}

export async function emitEvent<T>(event: string, payload: T): Promise<void> {
  try {
    const { emit } = await import('@tauri-apps/api/event');
    await emit(event, payload);
  } catch {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(event, { detail: payload }));
    }
  }
}

export async function listNotificationHistory(limit = 50): Promise<NotificationRecord[]> {
  try {
    return await invoke<NotificationRecord[]>('notification_history_list', { limit });
  } catch {
    return [];
  }
}

export async function markNotificationsRead(ids: string[] | 'all'): Promise<void> {
  try {
    await invoke<void>('notification_mark_read', { ids });
  } catch {
    // browser fallback no-op
  }
}

export async function testNotification(
  kind: 'gentle' | 'adhan' | 'work' | 'fasting' | 'strong-alarm' | 'suhoor-alarm'
): Promise<DeliveryResult> {
  try {
    return await invoke<DeliveryResult>('notification_test', { kind });
  } catch (error) {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        if (activeTestAudio) {
          activeTestAudio.pause();
          activeTestAudio = null;
        }
        const file =
          kind === 'strong-alarm' || kind === 'suhoor-alarm' || kind === 'fasting'
            ? '/audio/strong-alarm.wav'
            : kind === 'adhan'
            ? '/audio/adhan.ogg'
            : kind === 'work'
            ? '/audio/work-chime.wav'
            : '/audio/gentle-chime.wav';
        const audio = new Audio(file);
        audio.loop = kind === 'strong-alarm' || kind === 'suhoor-alarm';
        activeTestAudio = audio;
        if (kind === 'adhan') {
          setTimeout(() => {
            if (activeTestAudio === audio) {
              audio.pause();
              activeTestAudio = null;
            }
          }, 8000);
        }
        window.dispatchEvent(new CustomEvent('wens-audio-playing', { detail: { kind } }));
        audio.play().catch(() => {});
        const title =
          kind === 'strong-alarm' || kind === 'suhoor-alarm' || kind === 'fasting'
            ? 'منبه السحور القوي — تجربة الاستيقاظ'
            : kind === 'adhan'
            ? 'دخل وقت الصلاة — تجربة التنبيه'
            : kind === 'work'
            ? 'انتهاء جلسة العمل — تجربة'
            : 'اختبار تنبيه وِنس';
        const body = 'هذا تنبيه تجريبي لتأكيد وصول الإشعارات والصوت.';
        const reminder = {
          id: `test-${Date.now()}`,
          title,
          body,
          kind: kind === 'suhoor-alarm' ? 'fasting-suhoor' : `test-${kind}`,
          status: 'delivered',
        };
        window.dispatchEvent(new CustomEvent('wens-reminder', { detail: reminder }));
        if (kind === 'suhoor-alarm') {
          window.dispatchEvent(
            new CustomEvent('wens-critical-alarm', {
              detail: {
                id: reminder.id,
                title,
                body,
                kind: 'fasting-suhoor',
                requireChallenge: true,
              },
            })
          );
        }
        return {
          success: true,
          status: 'delivered',
          error: null,
        };
      } catch {
        // fallback
      }
    }
    return {
      success: false,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopAudio(): Promise<void> {
  if (activeTestAudio) {
    activeTestAudio.pause();
    activeTestAudio = null;
  }
  try {
    await invoke<void>('audio_stop');
  } catch {
    // browser fallback no-op
  }
}

export async function getActiveSuhoorAlarm(): Promise<CriticalAlarmPayload | null> {
  if (!isTauriRuntime()) return null;
  return await invoke<CriticalAlarmPayload | null>('active_suhoor_alarm_get');
}

export async function dismissAlarm(eventId?: string): Promise<void> {
  if (activeTestAudio) {
    activeTestAudio.pause();
    activeTestAudio = null;
  }
  try {
    await invoke<void>('alarm_dismiss', { eventId: eventId || null });
  } catch (error) {
    if (isTauriRuntime()) throw error;
  }
}

export async function snoozeAlarm(
  minutes = 5,
  title?: string,
  body?: string
): Promise<ReminderEvent | null> {
  if (activeTestAudio) {
    activeTestAudio.pause();
    activeTestAudio = null;
  }
  try {
    return await invoke<ReminderEvent>('alarm_snooze', {
      minutes,
      title: title || null,
      body: body || null,
    });
  } catch (error) {
    if (isTauriRuntime()) throw error;
    return null;
  }
}

export async function createProject(
  title: string,
  currentTask: string,
  options?: { description?: string; status?: string; goal?: string | null; isCurrent?: boolean }
): Promise<Project> {
  const cleanTitle = title.trim();
  const cleanTask = currentTask.trim();
  const description = (options?.description || '').trim();
  const status = options?.status || 'قيد التنفيذ';
  try {
    const created = await invoke<Project>('project_create', {
      input: { title: cleanTitle, currentTask: cleanTask || null, description, status },
    });
    if (options?.goal !== undefined || options?.isCurrent) {
      return await updateProject({
        id: created.id,
        goal: options?.goal ?? null,
        isCurrent: options?.isCurrent,
      });
    }
    return created;
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const ts = nowIso();
    const project: Project = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}`,
      title: cleanTitle,
      description,
      status,
      progress: 0,
      symbol: '✦',
      currentTask: cleanTask || null,
      goal: options?.goal ?? null,
      isCurrent: Boolean(options?.isCurrent),
      deviceId: fallbackId,
      createdAt: ts,
      updatedAt: ts,
      revision: 1,
      deletedAt: null,
    };
    const legacy = legacyState();
    const existing = Array.isArray(legacy.projects) ? legacy.projects.filter(isPlainObject) : [];
    const nextProjects = options?.isCurrent
      ? [project, ...existing.map((p) => ({ ...p, isCurrent: false }))]
      : [project, ...existing];
    legacy.projects = nextProjects as Array<Partial<Project>>;
    saveLegacyState(legacy);
    return project;
  }
}

export async function createIdea(title: string, tag: string, body = ''): Promise<Idea> {
  const cleanTitle = title.trim();
  const cleanTag = tag.trim() || 'فكرة';
  const cleanBody = body.trim();
  try {
    return await invoke<Idea>('idea_create', {
      input: { title: cleanTitle, tag: cleanTag, body: cleanBody },
    });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const ts = nowIso();
    const idea: Idea = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idea-${Date.now()}`,
      title: cleanTitle,
      tag: cleanTag,
      body: cleanBody,
      deviceId: fallbackId,
      createdAt: ts,
      updatedAt: ts,
      revision: 1,
      deletedAt: null,
    };
    const legacy = legacyState();
    const existing = Array.isArray(legacy.ideas) ? legacy.ideas.filter(isPlainObject) : [];
    legacy.ideas = [idea, ...existing] as Array<Partial<Idea>>;
    saveLegacyState(legacy);
    return idea;
  }
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  try {
    return await invoke<Project>('project_update', { input });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawList = Array.isArray(legacy.projects) ? legacy.projects : [];
    const sanitized = rawList
      .map((item, idx) => sanitizeProjectRecord(item, idx))
      .filter((p): p is Project => p !== null);
    const existing = sanitized.find((p) => p.id === input.id);
    const ts = nowIso();
    const merged: Project = {
      id: input.id,
      title: input.title !== undefined ? input.title : (existing?.title ?? 'مشروع بدون اسم'),
      description: input.description !== undefined ? input.description : (existing?.description ?? ''),
      status: input.status !== undefined ? input.status : (existing?.status ?? 'قيد التنفيذ'),
      progress: input.progress !== undefined ? input.progress : (existing?.progress ?? 0),
      symbol: input.symbol !== undefined ? input.symbol : (existing?.symbol ?? '✦'),
      currentTask: input.currentTask !== undefined ? input.currentTask : (existing?.currentTask ?? null),
      goal: input.goal !== undefined ? input.goal : (existing?.goal ?? null),
      isCurrent: input.isCurrent !== undefined ? input.isCurrent : Boolean(existing?.isCurrent),
      deviceId: existing?.deviceId ?? fallbackId,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
      revision: (existing?.revision ?? 0) + 1,
      deletedAt: existing?.deletedAt ?? null,
    };
    const updatedList = existing
      ? sanitized.map((p) =>
          p.id === input.id
            ? merged
            : input.isCurrent
            ? { ...p, isCurrent: false }
            : p
        )
      : [merged, ...sanitized];
    legacy.projects = updatedList;
    saveLegacyState(legacy);
    return merged;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    return await invoke<boolean>('project_delete', { id });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawList = Array.isArray(legacy.projects) ? legacy.projects : [];
    legacy.projects = rawList.filter((p) => isPlainObject(p) && p.id !== id);
    saveLegacyState(legacy);
    return true;
  }
}

export async function setCurrentProject(id: string): Promise<void> {
  try {
    await invoke<void>('project_set_current', { id });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawList = Array.isArray(legacy.projects) ? legacy.projects : [];
    legacy.projects = rawList
      .filter(isPlainObject)
      .map((p) => ({ ...p, isCurrent: p.id === id })) as Array<Partial<Project>>;
    saveLegacyState(legacy);
  }
}

export async function updateIdea(input: UpdateIdeaInput): Promise<Idea> {
  try {
    return await invoke<Idea>('idea_update', { input });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawList = Array.isArray(legacy.ideas) ? legacy.ideas : [];
    const sanitized = rawList
      .map((item, idx) => sanitizeIdeaRecord(item, idx))
      .filter((i): i is Idea => i !== null);
    const existing = sanitized.find((i) => i.id === input.id);
    const ts = nowIso();
    const merged: Idea = {
      id: input.id,
      title: input.title !== undefined ? input.title : (existing?.title ?? 'فكرة'),
      tag: input.tag !== undefined ? input.tag : (existing?.tag ?? 'فكرة'),
      body: input.body !== undefined ? input.body : (existing?.body ?? ''),
      deviceId: existing?.deviceId ?? fallbackId,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
      revision: (existing?.revision ?? 0) + 1,
      deletedAt: existing?.deletedAt ?? null,
    };
    legacy.ideas = existing
      ? sanitized.map((i) => (i.id === input.id ? merged : i))
      : [merged, ...sanitized];
    saveLegacyState(legacy);
    return merged;
  }
}

export async function deleteIdea(id: string): Promise<boolean> {
  try {
    return await invoke<boolean>('idea_delete', { id });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawList = Array.isArray(legacy.ideas) ? legacy.ideas : [];
    legacy.ideas = rawList.filter((i) => isPlainObject(i) && i.id !== id);
    saveLegacyState(legacy);
    return true;
  }
}

export async function promoteIdeaToProject(id: string): Promise<Project> {
  try {
    return await invoke<Project>('idea_promote_to_project', { id });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const legacy = legacyState();
    const rawIdeas = Array.isArray(legacy.ideas) ? legacy.ideas : [];
    const idea = rawIdeas
      .map((item, idx) => sanitizeIdeaRecord(item, idx))
      .find((i) => i?.id === id);
    const ts = nowIso();
    const project: Project = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `proj-${Date.now()}`,
      title: idea?.title || 'مشروع محوّل من فكرة',
      description: idea?.body || '',
      status: 'قيد التنفيذ',
      progress: 0,
      symbol: '✦',
      currentTask: null,
      goal: null,
      isCurrent: false,
      deviceId: fallbackId,
      createdAt: ts,
      updatedAt: ts,
      revision: 1,
      deletedAt: null,
    };
    const existingProjects = Array.isArray(legacy.projects) ? legacy.projects.filter(isPlainObject) : [];
    legacy.projects = [project, ...existingProjects] as Array<Partial<Project>>;
    legacy.ideas = rawIdeas.filter((i) => isPlainObject(i) && i.id !== id);
    saveLegacyState(legacy);
    return project;
  }
}

function sanitizeWorkSessionList(raw: unknown): WorkSessionRecord[] {
  if (!Array.isArray(raw)) return [];
  const results: WorkSessionRecord[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isPlainObject(item)) continue;
    const endedAt =
      typeof item.endedAt === 'string'
        ? item.endedAt
        : typeof item.timestamp === 'string'
        ? item.timestamp
        : nowIso();
    let durationSecs = sanitizeFiniteNumber(item.durationSecs, -1);
    if (durationSecs < 0 && typeof item.durationMs === 'number' && Number.isFinite(item.durationMs)) {
      durationSecs = Math.max(0, Math.round(item.durationMs / 1000));
    }
    if (durationSecs < 0 && typeof item.duration === 'string') {
      const parts = item.duration
        .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .split(':')
        .map(Number);
      if (parts.length === 3 && parts.every(Number.isFinite)) {
        durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2 && parts.every(Number.isFinite)) {
        durationSecs = parts[0] * 60 + parts[1];
      } else {
        durationSecs = 0;
      }
    }
    if (durationSecs < 0) durationSecs = 0;
    const startedAt =
      typeof item.startedAt === 'string' && item.startedAt !== endedAt
        ? item.startedAt
        : new Date(Math.max(0, new Date(endedAt).getTime() - durationSecs * 1000)).toISOString();
    results.push({
      id: typeof item.id === 'string' && item.id ? item.id : `ws-${i}-${Date.now()}`,
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
      projectTitle: typeof item.projectTitle === 'string' ? item.projectTitle : 'بدون مشروع محدد',
      durationSecs,
      startedAt,
      endedAt,
      note: typeof item.note === 'string' ? item.note : null,
    });
  }
  return results;
}

export async function saveWorkSession(record: WorkSessionRecord): Promise<WorkSessionRecord> {
  try {
    return await invoke<WorkSessionRecord>('work_session_save', { record });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const existing = sanitizeWorkSessionList(safeGetLocalStorageJson<unknown>('wens-work-sessions'));
    const filtered = existing.filter((s) => s.id !== record.id);
    safeSetLocalStorage('wens-work-sessions', JSON.stringify([record, ...filtered].slice(0, 100)));
    return record;
  }
}

export async function listWorkSessions(limit = 100): Promise<WorkSessionRecord[]> {
  try {
    return await invoke<WorkSessionRecord[]>('work_session_list', { limit });
  } catch {
    const parsed = sanitizeWorkSessionList(safeGetLocalStorageJson<unknown>('wens-work-sessions'));
    return parsed.slice(0, limit);
  }
}

export async function getDailyWorship(date: string): Promise<DailyWorshipRecord | null> {
  try {
    return await invoke<DailyWorshipRecord | null>('daily_worship_get', { date });
  } catch {
    const raw = safeGetLocalStorageJson<unknown>(`wens-worship-${date}`);
    if (isPlainObject(raw)) {
      return {
        date: typeof raw.date === 'string' ? raw.date : date,
        fajr: Boolean(raw.fajr),
        sunrise: Boolean(raw.sunrise),
        dhuhr: Boolean(raw.dhuhr),
        asr: Boolean(raw.asr),
        maghrib: Boolean(raw.maghrib),
        isha: Boolean(raw.isha),
        fasting: Boolean(raw.fasting),
        note: typeof raw.note === 'string' ? raw.note : null,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
      };
    }
    return null;
  }
}

export async function setDailyWorship(record: DailyWorshipRecord): Promise<void> {
  try {
    await invoke<void>('daily_worship_set', { record });
  } catch {
    safeSetLocalStorage(`wens-worship-${record.date}`, JSON.stringify(record));
  }
}

export async function getHistoryRange(days = 30): Promise<DailyWorshipRecord[]> {
  try {
    return await invoke<DailyWorshipRecord[]>('history_range_get', { days });
  } catch {
    if (typeof localStorage === 'undefined') return [];
    const results: DailyWorshipRecord[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const worship = safeGetLocalStorageJson<unknown>(`wens-worship-${dateStr}`);
      const checks = safeGetLocalStorageJson<unknown>(`wens-checks-${dateStr}`);
      const src = isPlainObject(worship) ? worship : isPlainObject(checks) ? checks : null;
      if (src) {
        results.push({
          date: dateStr,
          fajr: Boolean(src.fajr),
          sunrise: Boolean(src.sunrise),
          dhuhr: Boolean(src.dhuhr),
          asr: Boolean(src.asr),
          maghrib: Boolean(src.maghrib),
          isha: Boolean(src.isha),
          fasting: Boolean(src.fasting),
          note: typeof src.note === 'string' ? src.note : null,
          updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : nowIso(),
        });
      }
    }
    return results;
  }
}

export async function getDomainKv(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>('domain_kv_get', { key });
  } catch {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(`wens-kv-${key}`);
    } catch {
      return null;
    }
  }
}

export async function setDomainKv(key: string, valueJson: string): Promise<void> {
  try {
    await invoke<void>('domain_kv_set', { key, valueJson });
  } catch {
    safeSetLocalStorage(`wens-kv-${key}`, valueJson);
  }
}

export async function pickBackupSavePath(): Promise<string | null> {
  try {
    return await invoke<string | null>('pick_backup_save_path');
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    return null;
  }
}

export async function pickBackupOpenPath(): Promise<string | null> {
  try {
    return await invoke<string | null>('pick_backup_open_path');
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    return null;
  }
}

export async function exportBackupFile(targetPath?: string): Promise<string> {
  try {
    return await invoke<string>('backup_export_file', { targetPath });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    // Browser fallback: trigger local JSON download
    const payload = {
      version: 3,
      exportedAt: nowIso(),
      bootstrap: fallbackBootstrap(),
      workSessions: await listWorkSessions(500),
      history: await getHistoryRange(365),
    };
    const fileName = targetPath || `wens-backup-${nowIso().slice(0, 10)}.json`;
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return fileName;
  }
}

export async function restoreBackupFile(sourcePath: string): Promise<void> {
  await invoke<void>('backup_restore_file', { sourcePath });
  // The restored SQLite snapshot is authoritative for these mirrored records.
  try {
    const cachedRecords = Object.keys(localStorage).filter((key) =>
      /^(wens-checks-|wens-worship-|wens-today-note-|wens-kv-|wens-studio-(brief-|matrix-|storyboard$|last-saved$))/.test(key)
      || ['wens-local-v1', 'wens-work-sessions', 'wens-prayer-backlog-v1',
        'wens-fasting-intentions', 'wens-khatma-v2', 'wens-onboarding-completed'].includes(key)
    );
    cachedRecords.forEach((key) => localStorage.removeItem(key));
  } catch {
    // SQLite remains authoritative if the browser storage is inaccessible.
  }
}

export async function factoryReset(): Promise<BootstrapPayload> {
  if (isTauriRuntime()) {
    const res = await invoke<BootstrapPayload>('factory_reset');
    if (typeof localStorage !== 'undefined') {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('wens-')) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch {
        // ignore
      }
    }
    return {
      ...res,
      settings: deepMergePreferences(defaultPreferences, res.settings),
    };
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wens-')) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }
  return fallbackBootstrap();
}

export async function openLogsFolder(): Promise<void> {
  try {
    await invoke<void>('open_logs_folder');
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    throw new Error('مجلد السجلات متاح فقط داخل تطبيق سطح المكتب (Windows).');
  }
}

export async function getDiagnosticsBundle(): Promise<Record<string, unknown>> {
  try {
    return await invoke<Record<string, unknown>>('get_diagnostics_bundle');
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    const keys: string[] = [];
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('wens-')) keys.push(k);
      }
    }
    return {
      appVersion: '1.0.0',
      runtime: 'browser-preview',
      generatedAt: nowIso(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      storageKeyCount: keys.length,
    };
  }
}

export async function setAutostart(enabled: boolean): Promise<void> {
  try {
    await invoke<void>('autostart_set', { enabled });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    safeSetLocalStorage('wens-autostart-pref', enabled ? 'true' : 'false');
  }
}

export async function getAutostartIsEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>('autostart_is_enabled');
  } catch {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem('wens-autostart-pref') === 'true';
    } catch {
      return false;
    }
  }
}

export async function setTaskbarWidgetVisible(visible: boolean): Promise<void> {
  try {
    await invoke<void>('taskbar_widget_set_visible', { visible });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    safeSetLocalStorage('wens-taskbar-visible-pref', visible ? 'true' : 'false');
  }
}

export async function setTaskbarWidgetCustomX(x: number): Promise<void> {
  try {
    await invoke<void>('taskbar_widget_set_custom_x', { x });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    safeSetLocalStorage('wens-taskbar-custom-x', x.toString());
  }
}

export async function resetTaskbarWidgetPosition(): Promise<void> {
  try {
    await invoke<void>('taskbar_widget_reset_position');
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    try {
      localStorage.removeItem('wens-taskbar-custom-x');
    } catch {
      // ignore
    }
  }
}

export async function setTaskbarWidgetLocked(locked: boolean): Promise<void> {
  try {
    await invoke<void>('taskbar_widget_set_locked', { locked });
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    safeSetLocalStorage('wens-taskbar-locked-pref', locked ? 'true' : 'false');
  }
}

export async function isTaskbarWidgetLocked(): Promise<boolean> {
  try {
    return await invoke<boolean>('taskbar_widget_is_locked');
  } catch {
    return true;
  }
}

export async function petResetPosition(): Promise<void> {
  try {
    await invoke<void>('pet_reset_position');
    try {
      localStorage.removeItem('wens-pet-position-v1');
    } catch {
      // ignore
    }
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
  }
}

export async function petSnapToCorner(corner: string): Promise<[number, number] | null> {
  try {
    const pos = await invoke<[number, number]>('pet_snap_to_corner', { corner });
    if (Array.isArray(pos) && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
      safeSetLocalStorage('wens-pet-position-v1', JSON.stringify({ x: pos[0], y: pos[1] }));
      return pos;
    }
    return null;
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
    return null;
  }
}

export async function overlayCenter(): Promise<void> {
  try {
    await invoke<void>('overlay_center');
    try {
      localStorage.removeItem('wens-overlay-position');
    } catch {
      // ignore
    }
  } catch (err) {
    if (isTauriRuntime()) {
      throw err;
    }
  }
}

function minutesToPrayer(key: string, nameAr: string, value: number) {
  return { key, nameAr, minutesFromMidnight: Math.round(value) };
}

function localPrayerFallback(settings?: Partial<AppPreferences>, targetDate?: Date): PrayerDay {
  const date = targetDate || new Date();
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const day = date.getDate();
  const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const tzOffsetHours = getTimeZoneOffsetHours(date, settings?.timeZone);
  const lat = sanitizeLatitude(settings?.latitude, 30.0444);
  const lng = sanitizeLongitude(settings?.longitude, 31.2357);
  const method = normalizeCalcMethod(settings?.calcMethod);
  try {
    const rows = calculateMonthPrayerTable(
      year,
      monthIndex,
      lat,
      lng,
      tzOffsetHours,
      method,
      sanitizeFiniteNumber(settings?.fajrOffset, 0),
      sanitizeFiniteNumber(settings?.maghribOffset, 0),
      sanitizeFiniteNumber(settings?.ishaOffset, 0),
      Boolean(settings?.asrHanafi),
      settings?.timeZone
    );
    const dayRow = rows.find((r) => r.day === day);
    if (dayRow && dayRow.times && dayRow.times.length >= 6) {
      return {
        date: dateStr,
        calculationNoteAr: 'حساب فلكي محلي دون إنترنت.',
        times: dayRow.times.map((t) => ({
          key: t.key,
          nameAr: t.nameAr,
          minutesFromMidnight: t.minutes,
        })),
      };
    }
  } catch {
    // fallback to default below
  }
  return {
    date: dateStr,
    calculationNoteAr: 'معاينة متصفح محلية؛ تطبيق سطح المكتب يستخدم نواة Rust.',
    times: [
      minutesToPrayer('fajr', 'الفجر', 303),
      minutesToPrayer('sunrise', 'الشروق', 389),
      minutesToPrayer('dhuhr', 'الظهر', 778),
      minutesToPrayer('asr', 'العصر', 983),
      minutesToPrayer('maghrib', 'المغرب', 1132),
      minutesToPrayer('isha', 'العشاء', 1248),
    ],
  };
}

export async function getPrayerDay(
  settings: Partial<AppPreferences>,
  targetDate?: Date | string
): Promise<PrayerDay> {
  const dateStr = typeof targetDate === 'string'
    ? targetDate
    : getCivilClock(targetDate, settings.timeZone).date;
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  const timezoneOffset = getTimeZoneOffsetMinutes(date, settings.timeZone);
  const latitude = sanitizeLatitude(settings.latitude, 30.0444);
  const longitude = sanitizeLongitude(settings.longitude, 31.2357);
  const method = normalizeCalcMethod(settings.calcMethod);
  const asrJurist = settings.asrHanafi ? 'hanafi' : 'standard';

  try {
    return await invoke<PrayerDay>('prayer_day', {
      request: {
        date: dateStr,
        latitude,
        longitude,
        timezoneOffsetMinutes: timezoneOffset,
        method,
        asrJurist,
        fajrOffsetMinutes: sanitizeFiniteNumber(settings.fajrOffset, 0),
        maghribOffsetMinutes: sanitizeFiniteNumber(settings.maghribOffset, 0),
        ishaOffsetMinutes: sanitizeFiniteNumber(settings.ishaOffset, 0),
      },
    });
  } catch {
    return localPrayerFallback(settings, date);
  }
}

export async function previewModule(path: string, developerMode: boolean) {
  return invoke<{
    manifest: { name: string; publisher: string; version: string };
    signed: boolean;
    trusted: boolean;
    files: string[];
  }>('module_preview', { path, developerMode });
}

export async function installModule(path: string, developerMode: boolean) {
  return invoke<{
    moduleId: string;
    version: string;
    installPath: string;
    rollbackPath?: string | null;
  }>('module_install', { path, developerMode, confirmed: true });
}

export async function rollbackModule(moduleId: string) {
  return invoke<{
    moduleId: string;
    version: string;
    installPath: string;
    displacedPath?: string | null;
  }>('module_rollback', { moduleId, confirmed: true });
}

export async function syncStorage(stateJson: string): Promise<void> {
  try {
    await invoke('storage_save', { stateJson });
  } catch {
    // browser fallback no-op
  }
}

export async function getPrivacyStatus(): Promise<PrivacyStatus> {
  try {
    return await invoke<PrivacyStatus>('privacy_status_get');
  } catch {
    return { mic_active: false, mic_apps: [], cam_active: false, cam_apps: [] };
  }
}

export async function getWaterCupsToday(): Promise<number> {
  try {
    return await invoke<number>('wellbeing_water_get');
  } catch {
    return 0;
  }
}

export async function incrementWaterCupsToday(): Promise<number> {
  try {
    return await invoke<number>('wellbeing_water_increment');
  } catch {
    return 1;
  }
}

export async function getSmartClipboardHistory(): Promise<ClipboardItem[]> {
  try {
    return await invoke<ClipboardItem[]>('smart_clipboard_get');
  } catch {
    return [];
  }
}

export async function clearSmartClipboard(): Promise<void> {
  try {
    await invoke<void>('smart_clipboard_clear');
  } catch {
    // browser no-op
  }
}

export async function setSmartClipboard(text: string): Promise<void> {
  try {
    await invoke<void>('smart_clipboard_set', { text });
  } catch {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
  }
}

export async function getShelfItems(): Promise<ShelfItem[]> {
  try {
    return await invoke<ShelfItem[]>('shelf_list');
  } catch {
    return [];
  }
}

export async function openShelfItem(path: string): Promise<void> {
  try {
    await invoke<void>('shelf_open', { path });
  } catch {
    // browser no-op
  }
}

export async function getActiveDownloads(): Promise<DownloadItem[]> {
  try {
    return await invoke<DownloadItem[]>('downloads_active_get');
  } catch {
    return [];
  }
}

export async function getCalendarMeetings(): Promise<CalendarMeeting[]> {
  try {
    return await invoke<CalendarMeeting[]>('calendar_meetings_get');
  } catch {
    return [];
  }
}

export async function getMediaSession(): Promise<MediaSessionInfo> {
  try {
    return await invoke<MediaSessionInfo>('media_session_get');
  } catch {
    return {
      has_session: false,
      title: '',
      artist: '',
      is_playing: false,
      position_seconds: 0,
      duration_seconds: 0,
    };
  }
}

export async function controlMediaSession(command: string): Promise<void> {
  try {
    await invoke<void>('media_session_control', { command });
  } catch {
    // browser no-op
  }
}

export async function setIslandOrientation(orientation: string): Promise<void> {
  try {
    await invoke<void>('island_set_orientation', { orientation });
  } catch {
    // browser no-op
  }
}
