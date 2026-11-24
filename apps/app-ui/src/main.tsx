import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertCircle,
  Archive,
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  CircleHelp,
  Clock3,
  Command,
  Compass,
  Droplets,
  Eye,
  FileText,
  FolderKanban,
  History,
  Home,
  Laptop,
  LayoutGrid,
  Leaf,
  Lightbulb,
  ListTodo,
  Lock,
  MapPin,
  Menu,
  MoonStar,
  MoreHorizontal,
  PackageOpen,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Square,
  Sun,
  Target,
  TimerReset,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';

import {
  createIdea,
  createProject,
  deepMergePreferences,
  defaultPreferences,
  deleteIdea,
  deleteProject,
  dismissAlarm,
  emitEvent,
  exportBackupFile,
  factoryReset,
  getActiveSuhoorAlarm,
  getAutostartIsEnabled,
  getBootstrap,
  getDailyWorship,
  getDiagnosticsBundle,
  getDomainKv,
  getHistoryRange,
  getPrayerDay,
  getWaterCupsToday,
  incrementWaterCupsToday,
  installModule,
  isPlainObject,
  isTauriRuntime,
  listNotificationHistory,
  listWorkSessions,
  listenToEvent,
  markNotificationsRead,
  mergePatches,
  openLogsFolder,
  overlayCenter,
  petResetPosition,
  petSnapToCorner,
  pickBackupOpenPath,
  pickBackupSavePath,
  previewModule,
  promoteIdeaToProject,
  restoreBackupFile,
  rollbackModule,
  safeSetLocalStorage,
  saveWorkSession,
  setAutostart,
  setCurrentProject,
  setDailyWorship,
  setDomainKv,
  setIslandOrientation,
  setSmartClipboard,
  setTaskbarWidgetVisible,
  resetTaskbarWidgetPosition,
  snoozeAlarm,
  stopAudio,
  testNotification,
  updateIdea,
  updateProject,
  updateReminderPlan,
  updateSettings,
} from './api';
import { CITIES_CATALOG, type OfflineCity } from './domain/cities-catalog';
import {
  civilPrayerEpoch,
  getCivilClock,
  getTimeZoneOffsetHours,
  shiftCivilDate,
  normalizeCalcMethod,
  sanitizeLatitude,
  sanitizeLongitude,
} from './domain/astronomy';
import { OnboardingWizard } from './components/OnboardingWizard';
import { AppErrorBoundary } from './components/ErrorBoundary';
import { ConfirmModal } from './components/ConfirmModal';
import { KhatmaAdhkarSection } from './components/KhatmaAdhkarSection';
import {
  POPULAR_RADIO_STATIONS,
  QuranRadioProvider,
  QuranRadioWidget,
  useQuranRadio,
} from './components/QuranRadioContext';
import { hydrateDailyChecksFromSqlite, hydrateRecentWorshipFromSqlite } from './repository/worship-storage';
import type {
  AccentId,
  AppPreferences,
  AppPreferencesPatch,
  BootstrapPayload,
  CriticalAlarmPayload,
  DailyWorshipRecord,
  NotificationRecord,
  NotificationSummary,
  PrayerDay,
  Project,
  ReminderEvent,
  ThemeId,
  WorkSessionRecord,
} from './types';

export { POPULAR_RADIO_STATIONS, QuranRadioWidget };
import './styles.css';
import { CompanionViewer, CompanionVisualState, CompanionAvatarId } from './CompanionViewer';
import { playCompanionSound } from './companion-sounds';
import {
  PRAYER_KEY_TO_NAME,
  PRAYER_NAME_TO_KEY,
  PRAYER_ORDER,
  addFastingBacklogItem,
  addPrayerBacklogItem,
  formatBacklogDate,
  getBacklogSummary,
  loadBacklogState,
  markPrayerBacklogAsMissed,
  reconcileFastingBacklog,
  reconcilePrayerBacklog,
  reopenFastingBacklogItem,
  reopenPrayerBacklogItem,
  resolveFastingBacklogItem,
  resolvePrayerBacklogItem,
  saveBacklogState,
  toLocalDateString,
  calculateQibla,
  calculateSuhoorTime,
  gregorianToHijri,
  calculateMonthPrayerTable,
  calculateWeekPrayerTable,
  getTomorrowPrayerTimes,
  getUpcomingSunnahDays,
  formatTimeMinutes,
  getFastingIntentions,
  saveFastingIntention,
  isFastingDateCompleted,
  recordFastingCompletion,
  getDailyChecks,
  saveDailyChecks,
  setDailyCheck,
  type WhiteDayItem,
  type BacklogState,
  type FastingBacklogType,
  type PrayerName,
} from './backlog';


type ViewId =
  | 'today'
  | 'worship'
  | 'work'
  | 'projects'
  | 'ideas'
  | 'studio'
  | 'history'
  | 'devices'
  | 'modules'
  | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  hidden?: boolean;
}

const navSections: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'الرئيسي',
    items: [
      { id:'today', label: 'اليوم', icon: Home },
      { id:'worship', label: 'العبادة', icon: MoonStar },
      { id:'work', label: 'الشغل', icon: BriefcaseBusiness },
    ],
  },
  {
    title: 'التركيز والإنتاج',
    items: [
      { id:'projects', label: 'المشروعات', icon: FolderKanban },
      { id:'ideas', label: 'الأفكار', icon: Lightbulb },
      { id:'studio', label: 'الاستوديو', icon: Sparkles },
    ],
  },
  {
    title: 'النظام',
    items: [
      { id:'history', label: 'السجل', icon: History },
      { id:'devices', label: 'الأجهزة', icon: Smartphone, hidden: true },
      { id:'modules', label: 'الحزم', icon: Boxes, hidden: true },
      { id:'settings', label: 'الإعدادات', icon: Settings },
    ],
  },
];

const allNavItems = navSections.flatMap((s) => s.items);
const visibleNavItems = allNavItems.filter((item) => !item.hidden);

// Module-level cached ICU formatters (never instantiate inside render/useMemo)
const arWeekdayFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });
  } catch {
    return null;
  }
})();
const arGregorianFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
})();
const arGregorianLatnFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
})();
const arShortDateFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    return null;
  }
})();
const arMonthYearFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
})();
const arFullDateFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
})();
const arTimeFmt = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
})();

async function runOneTimeSqliteV3Migration(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  try {
    const already = await getDomainKv('sqlite_v3_migrated');
    if (already === 'true') return;

    // 1. Migrate daily worship checks (`wens-checks-YYYY-MM-DD`)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('wens-checks-')) {
        const dStr = k.slice('wens-checks-'.length);
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
          try {
            const parsed: unknown = JSON.parse(localStorage.getItem(k) || 'null');
            if (isPlainObject(parsed) && !(await getDailyWorship(dStr))) {
              const note = localStorage.getItem(`wens-today-note-${dStr}`) || null;
              await setDailyWorship({
                date: dStr,
                fajr: Boolean(parsed.fajr),
                sunrise: Boolean(parsed.sunrise),
                dhuhr: Boolean(parsed.dhuhr),
                asr: Boolean(parsed.asr),
                maghrib: Boolean(parsed.maghrib),
                isha: Boolean(parsed.isha),
                fasting: Boolean(parsed.fasting),
                note,
                updatedAt: new Date().toISOString(),
              });
            }
          } catch {
            // ignore corrupted entry
          }
        }
      } else if (k.startsWith('wens-today-note-')) {
        const dStr = k.slice('wens-today-note-'.length);
        const val = localStorage.getItem(k);
        if (val && /^\d{4}-\d{2}-\d{2}$/.test(dStr) && (await getDomainKv(`today_note_${dStr}`)) === null) {
          await setDomainKv(`today_note_${dStr}`, JSON.stringify(val));
        }
      }
    }

    // 2. Migrate backlog, fasting intentions, khatma
    const backlogRaw = localStorage.getItem('wens-prayer-backlog-v1');
    if (backlogRaw && (await getDomainKv('worship_backlog')) === null) {
      await setDomainKv('worship_backlog', backlogRaw);
    }
    const intentsRaw = localStorage.getItem('wens-fasting-intentions');
    if (intentsRaw && (await getDomainKv('fasting_intentions')) === null) {
      await setDomainKv('fasting_intentions', intentsRaw);
    }
    const khatmaRaw = localStorage.getItem('wens-khatma-v2');
    if (khatmaRaw && (await getDomainKv('khatma')) === null) {
      await setDomainKv('khatma', khatmaRaw);
    }

    // 3. Migrate work sessions
    const sessionsRaw = localStorage.getItem('wens-work-sessions');
    if (sessionsRaw) {
      try {
        const parsed: unknown = JSON.parse(sessionsRaw);
        if (Array.isArray(parsed)) {
          for (const item of parsed.slice(0, 100)) {
            if (!isPlainObject(item)) continue;
            const endedAt =
              typeof item.endedAt === 'string'
                ? item.endedAt
                : typeof item.timestamp === 'string'
                ? item.timestamp
                : new Date().toISOString();
            let durationSecs =
              typeof item.durationSecs === 'number' && Number.isFinite(item.durationSecs)
                ? Math.max(0, Math.round(item.durationSecs))
                : 0;
            if (durationSecs === 0 && typeof item.duration === 'string') {
              const parts = item.duration
                .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                .split(':')
                .map(Number);
              if (parts.length === 3 && parts.every(Number.isFinite)) {
                durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }
            if (durationSecs <= 0) continue;
            const startedAt =
              typeof item.startedAt === 'string' && item.startedAt !== endedAt
                ? item.startedAt
                : new Date(Math.max(0, new Date(endedAt).getTime() - durationSecs * 1000)).toISOString();
            await saveWorkSession({
              id: typeof item.id === 'string' && item.id ? item.id : `mig-${Date.now()}-${Math.random()}`,
              projectId: typeof item.projectId === 'string' ? item.projectId : null,
              projectTitle: typeof item.projectTitle === 'string' ? item.projectTitle : 'بدون مشروع محدد',
              durationSecs,
              startedAt,
              endedAt,
              note: typeof item.note === 'string' ? item.note : null,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    // 4. Migrate studio drafts
    const studioSnapshot = {
      briefTitle: localStorage.getItem('wens-studio-brief-title') || '',
      briefAudience: localStorage.getItem('wens-studio-brief-audience') || '',
      briefKeyMessage: localStorage.getItem('wens-studio-brief-message') || '',
      briefCta: localStorage.getItem('wens-studio-brief-cta') || '',
      matrixQ1: localStorage.getItem('wens-studio-matrix-q1') || '',
      matrixQ2: localStorage.getItem('wens-studio-matrix-q2') || '',
      matrixQ3: localStorage.getItem('wens-studio-matrix-q3') || '',
      matrixQ4: localStorage.getItem('wens-studio-matrix-q4') || '',
      storyboard: localStorage.getItem('wens-studio-storyboard') || '',
    };
    if (Object.values(studioSnapshot).some((value) => value.length > 0) && (await getDomainKv('studio_drafts')) === null) {
      await setDomainKv('studio_drafts', JSON.stringify(studioSnapshot));
    }

    await setDomainKv('sqlite_v3_migrated', 'true');
  } catch {
    // non-fatal migration attempt
  }
}

function TopbarRadioPill() {
  const radio = useQuranRadio();
  if (!radio || (!radio.isPlaying && !radio.isLoading)) return null;
  return (
    <button
      type="button"
      className="topbar-radio-pill"
      onClick={radio.togglePlay}
      title={radio.currentStation.name}
      aria-label={`إيقاف ${radio.currentStation.name}`}
    >
      <Radio size={14} />
      <span>{radio.isLoading ? 'جارٍ الاتصال…' : 'إيقاف الإذاعة'}</span>
    </button>
  );
}

function MainTrayKeepAliveBridge({ isWorkTimerRunning }: { isWorkTimerRunning: boolean }) {
  const radio = useQuranRadio();
  const isRadioPlaying = Boolean(radio?.isPlaying || radio?.isLoading);
  const keepAlive = isRadioPlaying || isWorkTimerRunning;
  const lastSentRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastSentRef.current === keepAlive) return;
    lastSentRef.current = keepAlive;
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('main_set_keep_alive', { keepAlive });
      } catch {
        // Ignore gracefully in browser mode or if command is unavailable
      }
    })();
  }, [keepAlive]);

  return null;
}

const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const digits = (value: string | number) =>
  String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const formatMinutes = (minutes: number) => {
  const normalized = (minutes + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const period = h24 >= 12 ? 'م' : 'ص';
  return `${digits(String(h24 % 12 || 12).padStart(2, '0'))}:${digits(
    String(normalized % 60).padStart(2, '0')
  )} ${period}`;
};

const dateKey = () => toLocalDateString();

export const PRE_PRAYER_LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: 'ساعة' },
  { minutes: 30, label: 'نصف ساعة' },
  { minutes: 20, label: 'ثلث ساعة' },
  { minutes: 15, label: 'ربع ساعة' },
  { minutes: 10, label: '١٠ دقائق' },
  { minutes: 5, label: '٥ دقائق' },
];

export function getLeadLabel(minutes: number): string {
  const match = PRE_PRAYER_LEAD_OPTIONS.find((o) => o.minutes === minutes);
  if (match) return match.label;
  return `${digits(minutes)} دقيقة`;
}

export function buildReminderEvents(
  prefs: AppPreferences,
  todayPrayers: PrayerDay,
  tomorrowPrayers?: PrayerDay | null
): ReminderEvent[] {
  const events: ReminderEvent[] = [];
  const days = [todayPrayers];
  if (tomorrowPrayers) days.push(tomorrowPrayers);

  for (const day of days) {
    const prayerInstant = (minutes: number) => civilPrayerEpoch(day.date, minutes, prefs.timeZone);

    for (const p of day.times) {
      if (p.key === 'sunrise') continue;
      const prayerMs = prayerInstant(p.minutesFromMidnight);

      if (prefs.notifications.prePrayerEnabled) {
        const rawLeads = Array.isArray(prefs.prePrayerLeads) && prefs.prePrayerLeads.length > 0
          ? prefs.prePrayerLeads
          : [Number(prefs.wuduLeadMinutes) || 15];
        const leads = Array.from(new Set(rawLeads.map(Number))).filter((m) => m > 0).sort((a, b) => b - a);

        leads.forEach((lead, idx) => {
          const nextLead = leads[idx + 1] ?? 0;
          const untilNextMs = Math.max(1000, (lead - nextLead) * 60 * 1000 - 1000);
          const catchUpMs = Math.min(10 * 60 * 1000, Math.max(3 * 60 * 1000, untilNextMs));
          const label = getLeadLabel(lead);

          events.push({
            id: `prayer-${day.date}-${p.key}-prepare-${lead}`,
            title: `اقترب موعد صلاة ${p.nameAr} (فاضل ${digits(lead)} دقيقة)`,
            body: `فاضل ${label} على الأذان — الاستعداد للوضوء`,
            kind: `prayer-prepare-${lead}`,
            dueAtMs: prayerMs - lead * 60 * 1000,
            catchUpMs,
          });
        });
      }

      if (prefs.notifications.prayerAtTimeEnabled) {
        events.push({
          id: `prayer-${day.date}-${p.key}-at`,
          title: `حان الآن موعد أذان ${p.nameAr}`,
          body: 'حي على الصلاة، حي على الفلاح',
          kind: 'prayer-at',
          dueAtMs: prayerMs,
          catchUpMs: 15 * 60 * 1000,
        });
      }
    }

    if (prefs.notifications.fastingEnabled) {
      const fajr = day.times.find((p) => p.key === 'fajr');
      if (fajr) {
        const suhoorLead =
          Number(prefs.suhoorLeadMinutes) ||
          (() => {
            try {
              return Number(localStorage.getItem('wens-suhoor-lead')) || 45;
            } catch {
              return 45;
            }
          })();
        const fajrMs = prayerInstant(fajr.minutesFromMidnight);
        events.push({
          id: `fasting-${day.date}-suhoor`,
          title: '⏰ حان وقت السحور — استيقظ الآن!',
          body: `متبقي ${digits(suhoorLead)} دقيقة على أذان الفجر — تسحروا فإن في السحور بركة.`,
          kind: 'fasting-suhoor',
          dueAtMs: fajrMs - suhoorLead * 60 * 1000,
          catchUpMs: suhoorLead * 60 * 1000,
        });
        const imsakLead = prefs.imsakWaterLeadMinutes ?? 15;
        if (imsakLead > 0 && imsakLead < suhoorLead) {
          events.push({
            id: `fasting-${day.date}-imsak-water`,
            title: 'تنبيه الماء والإمساك',
            body: 'اشرب الماء واعقد نية الصيام قبل أذان الفجر.',
            kind: 'fasting-imsak-water',
            dueAtMs: fajrMs - imsakLead * 60 * 1000,
            catchUpMs: imsakLead * 60 * 1000,
          });
        }
      }
      const maghrib = day.times.find((p) => p.key === 'maghrib');
      if (maghrib) {
        events.push({
          id: `fasting-${day.date}-iftar`,
          title: 'حان موعد إفطار المغرب',
          body: 'ذهب الظمأ وابتلت العروق وثبت الأجر إن شاء الله.',
          kind: 'fasting-iftar',
          dueAtMs: prayerInstant(maghrib.minutesFromMidnight),
          catchUpMs: 30 * 60 * 1000,
        });
      }
    }
  }

  return events;
}

let lastLocalSettingsChange = 0;
let isLocalSettingsUpdate = false;

export function App() {
  const [view, setView] = useState<ViewId>('today');
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [prayer, setPrayer] = useState<PrayerDay | null>(null);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [currentDateKey, setCurrentDateKey] = useState(() => dateKey());
  const checksDateRef = useRef<string>(currentDateKey);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const pendingCheckSave = useRef<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [timerStarted, setTimerStarted] = useState<number | null>(null);
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Worship & Missed Prayers Backlog state
  const [worshipTab, setWorshipTab] = useState<'times' | 'today' | 'backlog' | 'fasting' | 'occasions'>('times');
  const [backlog, setBacklog] = useState<BacklogState>(() => loadBacklogState());

  // Notification center state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifHistory, setNotifHistory] = useState<NotificationRecord[]>([]);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Critical Wake-Up Alarm & Challenge Modal state
  const [criticalAlarm, setCriticalAlarm] = useState<CriticalAlarmPayload | null>(null);
  const alarmEvent = useRef<{ sequence: number; activeId: string | null }>({
    sequence: 0,
    activeId: null,
  });
  const clearCriticalAlarm = useCallback(() => {
    alarmEvent.current.sequence += 1;
    alarmEvent.current.activeId = null;
    setCriticalAlarm(null);
    setAudioPlaying(false);
  }, []);
  const [challengeMathA, setChallengeMathA] = useState<number>(14);
  const [challengeMathB, setChallengeMathB] = useState<number>(27);
  const [challengeAnswer, setChallengeAnswer] = useState<string>('');
  const [challengeError, setChallengeError] = useState<string>('');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  // Toast state with auto-dismiss
  const [activeToast, setActiveToast] = useState<{ title: string; body: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startToastTimer = useCallback((delay = 4000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
      toastTimerRef.current = null;
    }, delay);
  }, []);

  const triggerToast = useCallback((title: string, body: string, duration = 4000) => {
    setActiveToast({ title, body });
    startToastTimer(duration);
  }, [startToastTimer]);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setActiveToast(null);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Focus management
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const notifTriggerRef = useRef<HTMLButtonElement>(null);
  const paletteTriggerRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const paletteOpenRef = useRef(false);
  paletteOpenRef.current = palette;

  const openPalette = () => {
    paletteTriggerRef.current = document.activeElement as HTMLElement;
    setPalette(true);
  };

  const closePalette = useCallback(() => {
    if (!paletteOpenRef.current) return;
    setPalette(false);
    setQuery('');
    paletteTriggerRef.current?.focus();
  }, []);

  const syncReminderPlan = useCallback(async (settings: AppPreferences, today: PrayerDay) => {
    if (isTauriRuntime()) return;
    try {
      const tomorrow = await getPrayerDay(settings, shiftCivilDate(today.date, 1));
      const events = buildReminderEvents(settings, today, tomorrow);
      const summary = await updateReminderPlan(events);
      setData((prev) => (prev ? { ...prev, notificationSummary: summary } : prev));
    } catch {
      // fallback
    }
  }, []);

  const refreshPrayerForSettings = useCallback(
    async (settings: AppPreferences, targetDate?: Date) => {
      const today = await getPrayerDay(settings, targetDate);
      setPrayer(today);
      await syncReminderPlan(settings, today);
      return today;
    },
    [syncReminderPlan]
  );

  const applyThemeTokensToRoot = useCallback((settings: AppPreferences) => {
    document.documentElement.dataset.theme = settings.themeId || 'midnight-magenta';
    document.documentElement.dataset.accent = settings.accentId || 'amber';
    document.documentElement.dataset.fontSize = settings.fontSize || 'medium';
    document.documentElement.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false';
  }, []);

  const reloadAllFromBackend = useCallback(async () => {
    const value = await getBootstrap();
    const todayStr = getCivilClock(undefined, value.settings.timeZone).date;
    checksDateRef.current = todayStr;
    pendingCheckSave.current = null;
    setCurrentDateKey(todayStr);
    const [hydratedChecks, fastingIntents] = await Promise.all([
      hydrateDailyChecksFromSqlite(todayStr),
      getDomainKv('fasting_intentions'),
      hydrateRecentWorshipFromSqlite(todayStr),
    ]);
    if (fastingIntents) safeSetLocalStorage('wens-fasting-intentions', fastingIntents);
    setChecks(hydratedChecks as Record<string, boolean>);
    try {
      const kvBacklog = await getDomainKv('worship_backlog');
      if (kvBacklog) {
        const parsed: unknown = JSON.parse(kvBacklog);
        if (isPlainObject(parsed)) {
          const nextB: BacklogState = {
            autoTrack: parsed.autoTrack !== false,
            autoReviewFasting: parsed.autoReviewFasting !== false,
            trackingStartedAt:
              typeof parsed.trackingStartedAt === 'string' && parsed.trackingStartedAt
                ? parsed.trackingStartedAt
                : new Date().toISOString(),
            items: Array.isArray(parsed.items) ? (parsed.items.filter(isPlainObject) as any) : [],
            fastingItems: Array.isArray(parsed.fastingItems)
              ? (parsed.fastingItems.filter(isPlainObject) as any)
              : [],
          };
          safeSetLocalStorage('wens-prayer-backlog-v1', kvBacklog);
          setBacklog(nextB);
        }
      } else {
        setBacklog(loadBacklogState());
      }
    } catch {
      setBacklog(loadBacklogState());
    }
    const today = await getPrayerDay(value.settings, todayStr);
    setPrayer(today);
    setData(value);
    setDataRevision((revision) => revision + 1);
    setIsOnboardingOpen(!value.settings.onboardingCompleted);
    setTimerStarted(null);
    setAccumulatedMs(0);
    setElapsed(0);
    applyThemeTokensToRoot(value.settings);
    void syncReminderPlan(value.settings, today);
    return value;
  }, [applyThemeTokensToRoot, syncReminderPlan]);

  // Bootstrap load + SQLite v3 hydration & one-time migration
  useEffect(() => {
    let active = true;
    getBootstrap().then(async (value) => {
      if (!active) return;
      await runOneTimeSqliteV3Migration();
      const todayStr = getCivilClock(undefined, value.settings.timeZone).date;
      const [today, hydratedChecks, backlogSnapshot, fastingIntents] = await Promise.all([
        getPrayerDay(value.settings, todayStr),
        hydrateDailyChecksFromSqlite(todayStr),
        getDomainKv('worship_backlog'),
        getDomainKv('fasting_intentions'),
        isTauriRuntime() ? hydrateRecentWorshipFromSqlite(todayStr) : Promise.resolve(),
      ]);
      if (!active) return;
      if (backlogSnapshot) safeSetLocalStorage('wens-prayer-backlog-v1', backlogSnapshot);
      if (fastingIntents) safeSetLocalStorage('wens-fasting-intentions', fastingIntents);
      checksDateRef.current = todayStr;
      setCurrentDateKey(todayStr);
      setChecks(hydratedChecks as Record<string, boolean>);
      setBacklog(loadBacklogState());
      setPrayer(today);
      setData(value);
      setBootstrapError(false);
      applyThemeTokensToRoot(value.settings);
      void syncReminderPlan(value.settings, today);

      if (!value.settings.onboardingCompleted) {
        try {
          if (localStorage.getItem('wens-onboarding-completed') !== 'true') {
            setIsOnboardingOpen(true);
          }
        } catch {
          setIsOnboardingOpen(true);
        }
      }
    }).catch(() => {
      if (active) setBootstrapError(true);
    });
    return () => {
      active = false;
    };
  }, [applyThemeTokensToRoot, bootstrapAttempt, syncReminderPlan]);

  // Keep off-screen sidebar truly inert when closed so keyboard Tab never leaks into it
  useEffect(() => {
    if (sidebarRef.current) {
      (sidebarRef.current as HTMLElement & { inert: boolean }).inert = !mobileNav;
    }
  }, [mobileNav]);

  // Pause CSS animations & transitions whenever the main window is hidden or minimized to tray
  useEffect(() => {
    let cancelled = false;
    let unlistenMainVisibility = () => {};

    const syncDocumentHidden = () => {
      document.documentElement.dataset.hidden = document.hidden ? 'true' : 'false';
    };
    syncDocumentHidden();
    document.addEventListener('visibilitychange', syncDocumentHidden);

    listenToEvent<boolean | { visible?: boolean }>('wens-main-visibility', (payload) => {
      const isVisible =
        typeof payload === 'boolean'
          ? payload
          : typeof payload === 'object' && payload !== null && 'visible' in payload
          ? Boolean(payload.visible)
          : !document.hidden;
      document.documentElement.dataset.hidden = isVisible ? 'false' : 'true';
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenMainVisibility = fn;
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', syncDocumentHidden);
      unlistenMainVisibility();
    };
  }, []);

  // Surface storage quota warnings without crashing
  useEffect(() => {
    const onStorageWarn = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) {
        triggerToast('تنبيه التخزين المحلي', detail.message, 6000);
      }
    };
    window.addEventListener('wens-storage-warning', onStorageWarn);
    return () => window.removeEventListener('wens-storage-warning', onStorageWarn);
  }, [triggerToast]);

  // Listen before reading the active alarm so a dismissal can supersede the snapshot.
  useEffect(() => {
    let cancelled = false;
    let unlistenReminder = () => {};
    let unlistenStopped = () => {};
    let unlistenSettings = () => {};
    let unlistenAudioPlaying = () => {};
    const alarmListeners: Array<() => void> = [];

    const showCriticalAlarm = (payload: CriticalAlarmPayload) => {
      if (cancelled || !payload?.id || alarmEvent.current.activeId === payload.id) return;
      alarmEvent.current.activeId = payload.id;
      setChallengeMathA(Math.floor(12 + Math.random() * 25));
      setChallengeMathB(Math.floor(11 + Math.random() * 25));
      setChallengeAnswer('');
      setChallengeError('');
      setCriticalAlarm(payload);
      setAudioPlaying(true);
    };
    const registerAlarmListener = async <T,>(event: string, handler: (payload: T) => void) => {
      const unlisten = await listenToEvent<T>(event, (payload) => {
        if (!cancelled) handler(payload);
      });
      if (cancelled) unlisten();
      else alarmListeners.push(unlisten);
    };
    void Promise.all([
      registerAlarmListener<CriticalAlarmPayload>('wens-critical-alarm', (payload) => {
        alarmEvent.current.sequence += 1;
        showCriticalAlarm(payload);
      }),
      registerAlarmListener<string | null>('wens-alarm-dismissed', (eventId) => {
        if (!eventId || !alarmEvent.current.activeId || eventId === alarmEvent.current.activeId) {
          clearCriticalAlarm();
        }
      }),
      registerAlarmListener('wens-alarm-snoozed', clearCriticalAlarm),
    ]).then(async () => {
      if (cancelled) return;
      const sequence = alarmEvent.current.sequence;
      const active = await getActiveSuhoorAlarm();
      if (active && alarmEvent.current.sequence === sequence) showCriticalAlarm(active);
    }).catch(() => {
      // Live events still carry the alarm if the current snapshot is unavailable.
    });

    listenToEvent('wens-audio-playing', () => {
      setAudioPlaying(true);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenAudioPlaying = fn;
    });

    listenToEvent<{ id: string; title: string; body: string; kind: string; status: string }>(
      'wens-reminder',
      (payload) => {
        if (!payload) return;
        triggerToast(payload.title, payload.body, 7000);
        if (payload.status === 'delivered') {
          setAudioPlaying(true);
        }
        listNotificationHistory(20).then(setNotifHistory);
        setData((prev) =>
          prev && prev.notificationSummary
            ? {
                ...prev,
                notificationSummary: {
                  ...prev.notificationSummary,
                  unreadCount: prev.notificationSummary.unreadCount + 1,
                },
              }
            : prev
        );
      }
    ).then((fn) => {
      if (cancelled) fn();
      else unlistenReminder = fn;
    });

    listenToEvent('wens-audio-stopped', () => {
      setAudioPlaying(false);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenStopped = fn;
    });

    listenToEvent<AppPreferences>('wens-settings-changed', (newSettings) => {
      if (!newSettings) return;
      // Short echo cancellation window (500ms) for in-flight local edits
      if (isLocalSettingsUpdate || Date.now() - lastLocalSettingsChange < 500) {
        return;
      }
      if (newSettings.themeId) {
        document.documentElement.dataset.theme = newSettings.themeId;
      }
      if (newSettings.accentId) {
        document.documentElement.dataset.accent = newSettings.accentId;
      }
      if (newSettings.fontSize) {
        document.documentElement.dataset.fontSize = newSettings.fontSize;
      }
      if (newSettings.reducedMotion !== undefined) {
        document.documentElement.dataset.reducedMotion = newSettings.reducedMotion ? 'true' : 'false';
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              settings: deepMergePreferences(prev.settings, newSettings),
            }
          : prev
      );
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenSettings = fn;
    });

    return () => {
      cancelled = true;
      unlistenReminder();
      unlistenStopped();
      unlistenSettings();
      alarmListeners.forEach((unlisten) => unlisten());
      unlistenAudioPlaying();
    };
  }, [clearCriticalAlarm, triggerToast]);

  // Mobile drawer keyboard & focus trap
  useEffect(() => {
    if (!mobileNav) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileNav(false);
        menuButtonRef.current?.focus();
      } else if (e.key === 'Tab') {
        const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex="0"]'
        );
        if (!focusable || focusable.length === 0) return;
        const visibleFocusable = Array.from(focusable).filter(
          (el) => el.tabIndex !== -1 && window.getComputedStyle(el).display !== 'none'
        );
        if (visibleFocusable.length === 0) return;
        const first = visibleFocusable[0];
        const last = visibleFocusable[visibleFocusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileNav]);

  // Sync theme, accent, font size and reduced motion to document root whenever settings change
  useEffect(() => {
    if (data?.settings) {
      document.documentElement.dataset.theme = data.settings.themeId;
      document.documentElement.dataset.accent = data.settings.accentId;
      document.documentElement.dataset.fontSize = data.settings.fontSize || 'medium';
      document.documentElement.dataset.reducedMotion = data.settings.reducedMotion ? 'true' : 'false';
    }
  }, [data?.settings?.themeId, data?.settings?.accentId, data?.settings?.fontSize, data?.settings?.reducedMotion]);

  // Command palette keyboard shortcut
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((p) => {
          if (!p) paletteTriggerRef.current = document.activeElement as HTMLElement;
          else setQuery('');
          return !p;
        });
      }
      if (event.key === 'Escape') {
        if (paletteOpenRef.current) {
          closePalette();
        }
        setNotifOpen(false);
        setMobileNav(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePalette]);

  // Timer tick & accumulator
  useEffect(() => {
    if (!timerStarted) {
      setElapsed(accumulatedMs);
      return;
    }
    const updateElapsed = () => setElapsed(accumulatedMs + (Date.now() - timerStarted));
    updateElapsed();
    const id = setInterval(updateElapsed, 1000);
    return () => clearInterval(id);
  }, [timerStarted, accumulatedMs]);

  const handleSetTimerStarted = (
    val: number | null | ((prev: number | null) => number | null)
  ) => {
    const nextVal = typeof val === 'function' ? val(timerStarted) : val;
    if (nextVal !== null) {
      if (timerStarted) {
        const sessionMs = Date.now() - timerStarted;
        setAccumulatedMs((prev) => prev + sessionMs);
      }
      setTimerStarted(Date.now());
    } else {
      if (timerStarted) {
        const sessionMs = Date.now() - timerStarted;
        setAccumulatedMs((prev) => prev + sessionMs);
        setElapsed(accumulatedMs + sessionMs);
      }
      setTimerStarted(null);
    }
  };

  const handleResetTimer = () => {
    setTimerStarted(null);
    setAccumulatedMs(0);
    setElapsed(0);
  };

  // Hydrating or replacing a snapshot must not create a database write.
  useEffect(() => {
    const pendingDate = pendingCheckSave.current;
    if (pendingDate) {
      pendingCheckSave.current = null;
      saveDailyChecks(pendingDate, checks);
    }
  }, [checks]);

  // Load notification history when popover opens
  useEffect(() => {
    if (notifOpen) {
      listNotificationHistory(20).then(setNotifHistory);
    }
  }, [notifOpen]);

  // Periodic time ticker and midnight day transition
  const [minuteNow, setMinuteNow] = useState(() => getCivilClock().minutes);

  useEffect(() => {
    let cancelled = false;
    const settings = data?.settings;
    const checkClock = () => {
      const clock = getCivilClock(undefined, settings?.timeZone);
      setMinuteNow(clock.minutes);
      if (!settings || checksDateRef.current === clock.date) return;
      checksDateRef.current = clock.date;
      setCurrentDateKey(clock.date);
      const localChecks = getDailyChecks(clock.date) as Record<string, boolean>;
      setChecks(localChecks);
      void Promise.all([
        hydrateDailyChecksFromSqlite(clock.date),
        getPrayerDay(settings, clock.date),
      ]).then(([hydrated, newDay]) => {
        if (cancelled || checksDateRef.current !== clock.date) return;
        setChecks((current) => current === localChecks
          ? hydrated as Record<string, boolean>
          : current);
        setPrayer(newDay);
        void syncReminderPlan(settings, newDay);
      });
    };
    checkClock();
    const interval = setInterval(checkClock, 15000);
    const onFocus = () => checkClock();
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [data?.settings, syncReminderPlan]);

  // Prayer calculations
  const next = useMemo(() => {
    if (!prayer) return null;
    const obligatory = prayer.times.filter((item) => prayerKeys.includes(item.key));
    return obligatory.find((item) => item.minutesFromMidnight > minuteNow) || obligatory[0];
  }, [prayer, minuteNow]);

  const following = useMemo(() => {
    if (!prayer || !next) return null;
    const obligatory = prayer.times.filter((item) => prayerKeys.includes(item.key));
    const nextIdx = obligatory.findIndex((item) => item.key === next.key);
    return obligatory[(nextIdx + 1) % obligatory.length];
  }, [prayer, next]);

  const go = (id: ViewId) => {
    setView(id);
    setPalette(false);
    setMobileNav(false);
    setNotifOpen(false);
  };

  const toggle = (key: string) =>
    setChecks((current) => {
      const now = new Date();
      const timeZone = data?.settings.timeZone;
      const activeDate = getCivilClock(now, timeZone).date;
      let baseCurrent = current;
      if (checksDateRef.current !== activeDate) {
        checksDateRef.current = activeDate;
        setCurrentDateKey(activeDate);
        baseCurrent = getDailyChecks(activeDate) as Record<string, boolean>;
      }

      const nextChecked = !baseCurrent[key];
      if ((prayerKeys.includes(key) || key === 'sunrise') && nextChecked) {
        if (prayer && prayer.date === activeDate) {
          const pTime = prayer.times.find((t) => t.key === key);
          const liveMinuteNow = getCivilClock(now, timeZone).minutes;
          if (pTime && pTime.minutesFromMidnight > liveMinuteNow) {
            triggerToast(
              'لم يحن وقت الصلاة بعد',
              `لا يمكن تسجيل أداء صلاة ${pTime.nameAr} قبل دخول وقتها (${formatMinutes(pTime.minutesFromMidnight)}).`
            );
            return baseCurrent;
          }
        }
      }

      const updated = { ...baseCurrent, [key]: nextChecked };
      pendingCheckSave.current = activeDate;
      if (prayerKeys.includes(key)) {
        if (nextChecked) {
          const prayerName = PRAYER_KEY_TO_NAME[key];
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              const ch = new BroadcastChannel('wens-state');
              ch.postMessage({
                type: 'wens-state',
                source: 'app-ui',
                action: 'markPrayer',
                prayerKey: key,
                prayerName,
                date: activeDate,
              });
              ch.close();
            } catch {}
          }
          emitEvent('wens-prayer-completed', {
            prayerName,
            prayerKey: key,
            date: activeDate,
            source: 'app-ui',
          });
        }
        setBacklog((currBacklog) => {
          if (!currBacklog.autoTrack) return currBacklog;
          if (nextChecked) {
            if (prayer?.date !== activeDate) return currBacklog;
            const rec = reconcilePrayerBacklog(currBacklog, prayer, updated, now, timeZone);
            if (rec.changed) {
              saveBacklogState(rec.state);
              return rec.state;
            }
          } else {
            const prayerName = PRAYER_KEY_TO_NAME[key];
            const todayStr = activeDate;
            const existingResolved = currBacklog.items.find(
              (it) => it.prayerDate === todayStr && it.prayerName === prayerName && it.status === 'resolved'
            );
            if (existingResolved) {
              const res = reopenPrayerBacklogItem(currBacklog, existingResolved.id);
              saveBacklogState(res.state);
              return res.state;
            }
          }
          return currBacklog;
        });
      } else if (key === 'sunrise') {
        if (nextChecked) {
          if (typeof BroadcastChannel !== 'undefined') {
            try {
              const ch = new BroadcastChannel('wens-state');
              ch.postMessage({
                type: 'wens-state',
                source: 'app-ui',
                action: 'markPrayer',
                prayerKey: 'sunrise',
                prayerName: 'الشروق',
                date: activeDate,
              });
              ch.close();
            } catch {}
          }
          emitEvent('wens-prayer-completed', {
            prayerName: 'الشروق',
            prayerKey: 'sunrise',
            date: activeDate,
            source: 'app-ui',
          });
        }
      } else if (key === 'fasting') {
        setBacklog((currBacklog) => {
          const todayStr = activeDate;
          if (nextChecked) {
            const activeFasting = currBacklog.fastingItems.find(
              (it) => it.fastingDate === todayStr && (it.status === 'unconfirmed' || it.status === 'missed')
            );
            if (activeFasting) {
              const res = resolveFastingBacklogItem(currBacklog, activeFasting.id, 'fasted');
              saveBacklogState(res.state);
              return res.state;
            }
          } else {
            const resolvedFasting = currBacklog.fastingItems.find(
              (it) => it.fastingDate === todayStr && it.status === 'resolved' && it.resolution === 'fasted'
            );
            if (resolvedFasting) {
              const res = reopenFastingBacklogItem(currBacklog, resolvedFasting.id);
              saveBacklogState(res.state);
              return res.state;
            }
          }
          return currBacklog;
        });
      }
      return updated;
    });

  const selectedTimeZone = data?.settings.timeZone;
  const markPrayerCompleted = useCallback((key: string, eventDate?: string) => {
    const now = new Date();
    const clock = getCivilClock(now, selectedTimeZone);
    const activeDate = clock.date;
    if (eventDate && (eventDate !== activeDate || checksDateRef.current !== activeDate)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        // The originating companion already persisted this date.
        void hydrateDailyChecksFromSqlite(eventDate);
      }
      return;
    }
    setChecks((current) => {
      let baseCurrent = current;
      if (checksDateRef.current !== activeDate) {
        checksDateRef.current = activeDate;
        setCurrentDateKey(activeDate);
        baseCurrent = getDailyChecks(activeDate) as Record<string, boolean>;
      }
      if (baseCurrent[key]) return baseCurrent;
      if (prayer && prayer.date === activeDate) {
        const pTime = prayer.times.find((t) => t.key === key);
        if (pTime && pTime.minutesFromMidnight > clock.minutes) {
          return baseCurrent;
        }
      }
      const updated = { ...baseCurrent, [key]: true };
      pendingCheckSave.current = activeDate;
      if (prayerKeys.includes(key)) {
        setBacklog((currBacklog) => {
          if (!currBacklog.autoTrack || prayer?.date !== activeDate) return currBacklog;
          const rec = reconcilePrayerBacklog(currBacklog, prayer, updated, now, selectedTimeZone);
          if (rec.changed) {
            saveBacklogState(rec.state);
            return rec.state;
          }
          return currBacklog;
        });
      }
      return updated;
    });
  }, [prayer, selectedTimeZone]);

  // Cross-window BroadcastChannel and Tauri event sync for prayer completion from overlay/companion
  useEffect(() => {
    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        broadcastChannel = new BroadcastChannel('wens-state');
        broadcastChannel.onmessage = (event) => {
          if (event.data?.source === 'app-ui') return;
          if (
            event.data?.action === 'markPrayer' ||
            event.data?.prayerKey ||
            event.data?.prayerName
          ) {
            const key =
              event.data.prayerKey ||
              (event.data.prayerName === 'الشروق'
                ? 'sunrise'
                : event.data.prayerName
                ? PRAYER_NAME_TO_KEY[event.data.prayerName as PrayerName]
                : undefined);
            if (key && (prayerKeys.includes(key) || key === 'sunrise')) {
              const date = event.data.date || getCivilClock(undefined, selectedTimeZone).date;
              markPrayerCompleted(key, date);
            }
          }
        };
      } catch {}
    }

    let cancelled = false;
    let unlistenPrayerCompleted = () => {};
    listenToEvent<{ prayerName?: string; prayerKey?: string; date?: string; source?: string }>(
      'wens-prayer-completed',
      (payload) => {
        if (!payload || payload.source === 'app-ui') return;
        const key =
          payload.prayerKey ||
          (payload.prayerName === 'الشروق'
            ? 'sunrise'
            : payload.prayerName
            ? PRAYER_NAME_TO_KEY[payload.prayerName as PrayerName]
            : undefined);
        if (key && (prayerKeys.includes(key) || key === 'sunrise')) {
          const date = payload.date || getCivilClock(undefined, selectedTimeZone).date;
          markPrayerCompleted(key, date);
        }
      }
    ).then((fn) => {
      if (cancelled) fn();
      else unlistenPrayerCompleted = fn;
    });

    return () => {
      cancelled = true;
      broadcastChannel?.close();
      unlistenPrayerCompleted();
    };
  }, [markPrayerCompleted, selectedTimeZone]);
  const reconcileLoadedBacklog = useCallback((currentBacklog: BacklogState) => {
    const now = new Date();
    const cityDate = getCivilClock(now, selectedTimeZone).date;
    if (prayer?.date !== cityDate || currentDateKey !== cityDate) return;
    const reviewedPrayers = reconcilePrayerBacklog(currentBacklog, prayer, checks, now, selectedTimeZone);
    const reviewedFasting = reconcileFastingBacklog(reviewedPrayers.state, prayer, checks, now, selectedTimeZone);
    if (reviewedPrayers.changed || reviewedFasting.changed) {
      setBacklog(reviewedFasting.state);
      saveBacklogState(reviewedFasting.state);
    }
  }, [checks, currentDateKey, prayer, selectedTimeZone]);

  useEffect(() => {
    reconcileLoadedBacklog(backlog);
  }, [reconcileLoadedBacklog]);

  useEffect(() => {
    const id = setInterval(() => reconcileLoadedBacklog(backlog), 60000);
    return () => clearInterval(id);
  }, [backlog, reconcileLoadedBacklog]);

  const completed = Object.values(isPlainObject(checks) ? checks : {}).filter(Boolean).length;
  const workTime = `${digits(
    Math.floor(elapsed / 3600000)
      .toString()
      .padStart(2, '0')
  )}:${digits(
    Math.floor((elapsed / 60000) % 60)
      .toString()
      .padStart(2, '0')
  )}:${digits(
    Math.floor((elapsed / 1000) % 60)
      .toString()
      .padStart(2, '0')
  )}`;

  const handleStopAudio = async () => {
    await stopAudio();
    setAudioPlaying(false);
  };

  const handleMarkAllRead = async () => {
    await markNotificationsRead('all');
    if (data?.notificationSummary) {
      setData({
        ...data,
        notificationSummary: { ...data.notificationSummary, unreadCount: 0 },
      });
    }
    setNotifHistory((prev) =>
      prev.map((item) => ({ ...item, readAt: new Date().toISOString() }))
    );
  };

  const workSession = useWorkSession({
    timerStarted,
    setTimerStarted: handleSetTimerStarted,
    workTime,
    elapsedMs: elapsed,
    projects: data?.projects ?? [],
    onResetTimer: handleResetTimer,
    settings: data?.settings,
    triggerToast,
    dataRevision,
    enabled: Boolean(data),
  });

  if (!data) {
    return (
      <div className="loading-shell" role="status" aria-live="polite">
        <div className="brand-mark">و</div>
        {bootstrapError ? (
          <>
            <strong>تعذر تحميل بيانات وِنس</strong>
            <button className="secondary-button" type="button" onClick={() => {
              setBootstrapError(false);
              setBootstrapAttempt((attempt) => attempt + 1);
            }}>
              إعادة المحاولة
            </button>
          </>
        ) : (
          <>
            <strong>بنجهّز يومك محليًا…</strong>
            <span>لا يوجد اتصال بحساب أو سحابة</span>
          </>
        )}
      </div>
    );
  }

  const notifSummary = data.notificationSummary || {
    status: data.settings.notifications.prayerAtTimeEnabled ? 'armed' : 'silent',
    unreadCount: 0,
  };

  return (
    <QuranRadioProvider
      strictOffline={Boolean(data.settings.strictOffline)}
      enabled={data.settings.quranRadioEnabled !== false}
      defaultStation={data.settings.quranRadioDefaultStation || 'cairo'}
      pauseAtPrayer={data.settings.radioPauseAtPrayer !== false}
    >
    <MainTrayKeepAliveBridge isWorkTimerRunning={Boolean(timerStarted) || workSession.pomodoroRunning} />
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {mobileNav && (
        <div
          className="sidebar-backdrop"
          onClick={() => {
            setMobileNav(false);
            menuButtonRef.current?.focus();
          }}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        ref={sidebarRef}
        className={`sidebar ${mobileNav ? 'open' : ''}`}
        aria-label="القائمة الجانبية"
        aria-hidden={!mobileNav}
        role="navigation"
      >
        <div className="brand">
          <div className="brand-mark">و</div>
          <div>
            <strong>وِنس</strong>
            <span>رفيقك المحلي الموثوق</span>
          </div>
          <button
            className="icon-button close-nav"
            tabIndex={mobileNav ? 0 : -1}
            aria-hidden={!mobileNav}
            onClick={() => {
              setMobileNav(false);
              menuButtonRef.current?.focus();
            }}
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-groups" aria-label="التنقل الرئيسي">
          {navSections.map((sec) => (
            <div key={sec.title} className="nav-group">
              <span className="nav-group-title">{sec.title}</span>
              {sec.items.filter((item) => !item.hidden).map((item) => (
                <React.Fragment key={item.id}>
                  <button
                    className={view === item.id ? 'nav-item active' : 'nav-item'}
                    onClick={() => go(item.id)}
                    aria-current={view === item.id ? 'page' : undefined}
                  >
                    <item.icon size={19} />
                    <span>{item.label}</span>
                    {item.id === 'worship' && getBacklogSummary(backlog).totalPendingCount > 0 && (
                      <span className="worship-subtab-badge" style={{ marginInlineStart: 'auto' }}>
                        {digits(getBacklogSummary(backlog).totalPendingCount)}
                      </span>
                    )}
                    {item.id === 'modules' && <small>v1</small>}
                  </button>

                  {item.id === 'worship' && view === 'worship' && (
                    <div className="worship-sidebar-subitems" role="group" aria-label="أقسام العبادة الفرعية">
                      <button
                        className={`worship-sidebar-subitem ${
                          worshipTab === 'times' || worshipTab === 'today' ? 'active' : ''
                        }`}
                        onClick={() => {
                          setWorshipTab('times');
                          go('worship');
                        }}
                      >
                        <Clock3 size={15} />
                        <span>مواعيد الصلاة والقبلة</span>
                      </button>
                      <button
                        className={`worship-sidebar-subitem ${
                          worshipTab === 'backlog' ? 'active' : ''
                        }`}
                        onClick={() => {
                          setWorshipTab('backlog');
                          go('worship');
                        }}
                      >
                        <History size={15} />
                        <span>قضاء الفوائت والمعلّق</span>
                        {getBacklogSummary(backlog).pendingPrayersCount > 0 && (
                          <span className="worship-subtab-badge">
                            {digits(getBacklogSummary(backlog).pendingPrayersCount)}
                          </span>
                        )}
                      </button>
                      <button
                        className={`worship-sidebar-subitem ${
                          worshipTab === 'fasting' ? 'active' : ''
                        }`}
                        onClick={() => {
                          setWorshipTab('fasting');
                          go('worship');
                        }}
                      >
                        <MoonStar size={15} />
                        <span>الصيام والسحور والمنبهات</span>
                        {getBacklogSummary(backlog).pendingFastingCount > 0 && (
                          <span className="worship-subtab-badge">
                            {digits(getBacklogSummary(backlog).pendingFastingCount)}
                          </span>
                        )}
                      </button>
                      <button
                        className={`worship-sidebar-subitem ${
                          worshipTab === 'occasions' ? 'active' : ''
                        }`}
                        onClick={() => {
                          setWorshipTab('occasions');
                          go('worship');
                        }}
                      >
                        <Sparkles size={15} />
                        <span>الأعياد والمناسبات الدينية</span>
                      </button>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="offline">
            <ShieldCheck size={18} />
            <div>
              <strong>بياناتك عندك أوفلاين</strong>
              <span>النواة والصوت محليان بالكامل</span>
            </div>
          </div>
          <button
            className="command-hint"
            onClick={openPalette}
            aria-label="البحث والانتقال السريع"
          >
            <Search size={16} />
            <span>افتح أي حاجة</span>
            <kbd>Ctrl K</kbd>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="content">
        <header className="topbar horizon-topbar">
          <button
            type="button"
            className="horizon-brand"
            onClick={() => go('today')}
            aria-label="العودة إلى الرئيسية — وِنس"
          >
            <strong>وِنس</strong>
          </button>

          {/* Primary Destinations */}
          <nav className="horizon-nav" aria-label="أفق اليوم الرئيسي">
            <button
              type="button"
              className={`horizon-nav-btn ${view === 'today' ? 'active' : ''}`}
              onClick={() => go('today')}
              aria-current={view === 'today' ? 'page' : undefined}
            >
              <Home size={16} />
              <span>اليوم</span>
            </button>
            <button
              type="button"
              className={`horizon-nav-btn ${view === 'worship' ? 'active' : ''}`}
              onClick={() => go('worship')}
              aria-current={view === 'worship' ? 'page' : undefined}
            >
              <BookOpen size={16} />
              <span>العبادة والسجل</span>
              {getBacklogSummary(backlog).totalPendingCount > 0 && (
                <span className="horizon-nav-badge">
                  {digits(getBacklogSummary(backlog).totalPendingCount)}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`horizon-nav-btn ${['projects', 'work', 'ideas', 'studio'].includes(view) ? 'active' : ''}`}
              onClick={() => go('projects')}
              aria-current={['projects', 'work', 'ideas', 'studio'].includes(view) ? 'page' : undefined}
            >
              <Lightbulb size={16} />
              <span>المشروعات والأفكار</span>
            </button>
            <button
              type="button"
              className={`horizon-nav-btn ${view === 'history' ? 'active' : ''}`}
              onClick={() => go('history')}
              aria-current={view === 'history' ? 'page' : undefined}
            >
              <History size={16} />
              <span>السجل</span>
            </button>
          </nav>

          <div className="horizon-top-right">
            <TopbarRadioPill />

            {audioPlaying && (
              <button
                type="button"
                className="stop-audio-btn"
                onClick={handleStopAudio}
                aria-label="إيقاف الصوت فورًا"
              >
                <VolumeX size={17} />
                <span>إيقاف الصوت</span>
              </button>
            )}

            <div style={{ position: 'relative' }}>
              <button
                ref={notifTriggerRef}
                type="button"
                className={`horizon-gear-btn notif-trigger ${notifOpen ? 'active' : ''}`}
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="مركز التنبيهات"
                aria-expanded={notifOpen}
                title="مركز التنبيهات"
              >
                <Bell size={17} />
                {notifSummary.unreadCount > 0 && (
                  <span className="notif-unread-badge">
                    {digits(Math.min(99, notifSummary.unreadCount))}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="notif-popover"
                  role="dialog"
                  aria-label="سجل التنبيهات الأخيرة"
                >
                  <div className="notif-popover-head">
                    <strong>مركز التنبيهات</strong>
                    {notifHistory.length > 0 && (
                      <button
                        type="button"
                        className="notif-mark-read-btn"
                        onClick={handleMarkAllRead}
                      >
                        تحديد الكل كمقروء
                      </button>
                    )}
                  </div>
                  <div className="notif-popover-list">
                    {notifHistory.length === 0 ? (
                      <div className="notif-empty-state">
                        <BellOff size={20} style={{ opacity: 0.6 }} />
                        <span>لا توجد تنبيهات مسجلة بعد.</span>
                      </div>
                    ) : (
                      notifHistory.slice(0, 12).map((item) => (
                        <div
                          key={item.id}
                          className={`notif-history-item ${item.readAt ? 'read' : 'unread'}`}
                        >
                          <strong>{item.title}</strong>
                          <p>{item.body}</p>
                          <time>
                            {arTimeFmt
                              ? arTimeFmt.format(new Date(item.createdAt))
                              : item.createdAt.slice(11, 16)}
                          </time>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="horizon-gear-btn"
              onClick={() => go('settings')}
              aria-label="الإعدادات"
              title="الإعدادات"
            >
              <Settings size={17} />
            </button>
          </div>
        </header>

        {activeToast && (
          <div
            className="live-reminder-toast"
            role="alert"
            aria-live="polite"
            onMouseEnter={() => {
              if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            }}
            onMouseLeave={() => {
              startToastTimer(2500);
            }}
          >
            <Sparkles size={18} style={{ flexShrink: 0, color: 'var(--accent)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{activeToast.title}</strong>
              <p>{activeToast.body}</p>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="إغلاق الإشعار"
              style={{ flexShrink: 0, cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {data.migration?.migrated && (
          <div className="migration-banner" role="status">
            <Archive size={20} />
            <div>
              <strong>بيانات النسخة السابقة انتقلت بأمان</strong>
              <span>
                تم عمل نسخة JSON احتياطية واعتماد المخطط المحدث بدون فقد أي بيانات.
              </span>
            </div>
            <button onClick={() => go('history')}>عرض التفاصيل</button>
          </div>
        )}

        <section key={view} className={`view ${view === 'today' ? 'view-today' : ''}`} data-view={view} aria-live="polite">
          {['devices', 'modules', 'history'].includes(view) && (
            <div className="secondary-view-banner">
              <button className="back-to-today-btn" onClick={() => go('today')}>
                <ChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />
                <span>العودة إلى «أفق اليوم»</span>
              </button>
              <div className="secondary-view-title">
                <strong>
                  {view === 'devices' && 'الأجهزة والمزامنة'}
                  {view === 'modules' && 'إدارة الحزم (wenspack)'}
                  {view === 'history' && 'سجل الأنشطة والأرشيف'}
                </strong>
                <span>أداة ثانوية · اضغط للرجوع أو استخدم Ctrl K</span>
              </div>
            </div>
          )}

          {['projects', 'work', 'ideas', 'studio'].includes(view) && (
            <div className="workspace-subnav-pills" role="navigation" aria-label="أقسام المشروعات والأفكار">
              <button
                type="button"
                className={`workspace-nav-pill ${view === 'projects' ? 'active' : ''}`}
                onClick={() => go('projects')}
                aria-current={view === 'projects' ? 'page' : undefined}
              >
                <FolderKanban size={16} />
                <span>المشروعات</span>
              </button>
              <button
                type="button"
                className={`workspace-nav-pill ${view === 'work' ? 'active' : ''}`}
                onClick={() => go('work')}
                aria-current={view === 'work' ? 'page' : undefined}
              >
                <Target size={16} />
                <span>جلسة تركيز</span>
              </button>
              <button
                type="button"
                className={`workspace-nav-pill ${view === 'ideas' ? 'active' : ''}`}
                onClick={() => go('ideas')}
                aria-current={view === 'ideas' ? 'page' : undefined}
              >
                <Lightbulb size={16} />
                <span>الأفكار</span>
              </button>
              <button
                type="button"
                className={`workspace-nav-pill ${view === 'studio' ? 'active' : ''}`}
                onClick={() => go('studio')}
                aria-current={view === 'studio' ? 'page' : undefined}
              >
                <Sparkles size={16} />
                <span>الاستوديو</span>
              </button>
            </div>
          )}

          {view === 'today' && (
            <Today
              data={data}
              prayer={prayer}
              next={next}
              following={following}
              checks={checks}
              toggle={toggle}
              completed={completed}
              timerStarted={timerStarted}
              setTimerStarted={handleSetTimerStarted}
              workTime={workTime}
              go={go}
              onOpenBacklog={() => {
                setWorshipTab('backlog');
                go('worship');
              }}
              onOpenFasting={() => {
                setWorshipTab('fasting');
                go('worship');
              }}
              pendingBacklogCount={getBacklogSummary(backlog).pendingPrayersCount}
              minuteNow={minuteNow}
              dateKey={currentDateKey}
            />
          )}
          {view === 'worship' && (
            <Worship
              prayer={prayer}
              checks={checks}
              toggle={toggle}
              backlog={backlog}
              setBacklog={setBacklog}
              activeTab={worshipTab}
              setActiveTab={setWorshipTab}
              triggerToast={triggerToast}
              onCheckPrayer={(pKey) => markPrayerCompleted(pKey)}
              onCheckFasting={() => markPrayerCompleted('fasting')}
              settings={data.settings}
              onUpdateSettings={async (patch) => {
                const res = await updateSettings(patch);
                setData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
                if (prayer) await syncReminderPlan(res.settings, prayer);
              }}
              syncReminderPlan={async (s, p) => {
                const st = s || data.settings;
                const pr = p || prayer;
                if (st && pr) await syncReminderPlan(st, pr);
              }}
              setAudioPlaying={setAudioPlaying}
              minuteNow={minuteNow}
              dateKey={currentDateKey}
            />
          )}

          {view === 'work' && <WorkPanel projects={data.projects} session={workSession} />}
          {view === 'projects' && <Projects data={data} setData={setData} go={go} triggerToast={triggerToast} />}
          {view === 'ideas' && <Ideas data={data} setData={setData} triggerToast={triggerToast} />}
          {view === 'studio' && <Studio key={dataRevision} go={go} />}
          {view === 'history' && (
            <HistoryView data={data} checks={checks} elapsed={elapsed} />
          )}
          {view === 'devices' && <Devices deviceId={data.deviceId} />}
          {view === 'modules' && <Modules />}
          {view === 'settings' && (
            <SettingsView
              data={data}
              setData={setData}
              setAudioPlaying={setAudioPlaying}
              prayer={prayer}
              syncReminderPlan={syncReminderPlan}
              refreshPrayerForSettings={refreshPrayerForSettings}
              onReloadAll={reloadAllFromBackend}
              go={go}
              onOpenOnboarding={() => setIsOnboardingOpen(true)}
              triggerToast={triggerToast}
            />
          )}
        </section>
      </main>

      {/* Onboarding Wizard */}
      <OnboardingWizard
        isOpen={isOnboardingOpen}
        onClose={async () => {
          setIsOnboardingOpen(false);
          safeSetLocalStorage('wens-onboarding-completed', 'true');
          try {
            const res = await updateSettings({ onboardingCompleted: true });
            setData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
          } catch {}
        }}
        initialCityId={
          CITIES_CATALOG.find(
            (c) =>
              Math.abs(c.latitude - sanitizeLatitude(data?.settings.latitude, 30.0444)) < 0.05 &&
              Math.abs(c.longitude - sanitizeLongitude(data?.settings.longitude, 31.2357)) < 0.05
          )?.id || 'eg-cairo'
        }
        onComplete={async (config) => {
          const patch: AppPreferencesPatch = {
            latitude: config.city.latitude,
            longitude: config.city.longitude,
            calcMethod: normalizeCalcMethod(config.city.calcMethod),
            locationLabel: `${config.city.nameAr}، ${config.city.countryAr}`,
            countryCode: config.city.countryCode,
            timeZone: config.city.timeZone,
            onboardingCompleted: true,
            taskbarWidgetEnabled: config.taskbarEnabled,
            taskbarWidgetDigits: config.useEasternDigits ? 'arabic' : 'latin',
            fajrOffset: config.city.fajrOffset ?? 0,
            maghribOffset: config.city.maghribOffset ?? 0,
            ishaOffset: config.city.ishaOffset ?? 0,
          };
          const res = await updateSettings(patch);
          setData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
          try {
            await setAutostart(config.autostartEnabled);
          } catch {
            // non-fatal during onboarding
          }
          try {
            await setTaskbarWidgetVisible(config.taskbarEnabled);
          } catch {
            // non-fatal during onboarding
          }
          safeSetLocalStorage('wens-onboarding-completed', 'true');
          setIsOnboardingOpen(false);
          triggerToast('تم إعداد وِنس بنجاح', `تم ضبط مدينة ${config.city.nameAr} وحفظ تفضيلاتك.`);
          await refreshPrayerForSettings(res.settings);
        }}
      />

      {/* Command Palette */}
      {palette && (
        <CommandPalette
          query={query}
          setQuery={setQuery}
          go={go}
          close={closePalette}
          data={data}
          onOpenBacklog={() => {
            setWorshipTab('backlog');
            go('worship');
          }}
          onOpenTimes={() => {
            setWorshipTab('times');
            go('worship');
          }}
        />
      )}

      {/* Critical Alarm Modal */}
      {criticalAlarm && (
        <div
          className="critical-alarm-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="critical-alarm-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(8, 10, 18, 0.94)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div
            className="critical-alarm-modal"
            style={{
              width: '100%',
              maxWidth: '540px',
              background: 'var(--bg-card, #141824)',
              border: '2px solid var(--accent, #f59e0b)',
              borderRadius: '24px',
              padding: '32px',
              boxShadow: '0 25px 80px rgba(245, 158, 11, 0.35)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--accent, #f59e0b) 20%, transparent)',
                color: 'var(--accent, #f59e0b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <Bell size={38} />
            </div>

            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 14px',
                  borderRadius: '999px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginBottom: '8px',
                }}
              >
                منبه استيقاظ قوي — لا يتوقف تلقائياً
              </span>
              <h2
                id="critical-alarm-title"
                style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 8px', color: 'var(--text)' }}
              >
                {criticalAlarm.title}
              </h2>
              <p style={{ fontSize: '16px', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
                {criticalAlarm.body}
              </p>
            </div>

            {(criticalAlarm.requireChallenge ?? data?.settings?.suhoorWakeChallenge ?? true) ? (
              <div
                style={{
                  background: 'var(--bg-elevated, #1d2333)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <strong style={{ fontSize: '15px', color: 'var(--accent)' }}>
                  تحدي إثبات الاستيقاظ (لمنع إغلاق المنبه أثناء النوم):
                </strong>
                <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                  احسب الناتج أو اكتب عبارة <strong>«نويت الصيام»</strong> لإيقاف الرنين:
                </span>
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    color: 'var(--text)',
                    padding: '6px 0',
                  }}
                >
                  {digits(challengeMathA)} + {digits(challengeMathB)} = ؟
                </div>
                <input
                  type="text"
                  value={challengeAnswer}
                  onChange={(e) => {
                    setChallengeAnswer(e.target.value);
                    setChallengeError('');
                  }}
                  placeholder="اكتب الناتج أو: نويت الصيام"
                  autoFocus
                  style={{
                    width: '100%',
                    minHeight: '48px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text)',
                    fontSize: '18px',
                    textAlign: 'center',
                    fontWeight: 700,
                    padding: '8px 14px',
                  }}
                />
                {challengeError && (
                  <span style={{ color: '#f87171', fontSize: '13px', fontWeight: 600 }}>
                    {challengeError}
                  </span>
                )}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="primary-button"
                style={{
                  flex: 2,
                  minHeight: '52px',
                  fontSize: '16px',
                  fontWeight: 800,
                }}
                onClick={async () => {
                  const needChallenge =
                    criticalAlarm.requireChallenge ?? data?.settings?.suhoorWakeChallenge ?? true;
                  if (needChallenge) {
                    const normalized = challengeAnswer
                      .trim()
                      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
                    const expectedSum = String(challengeMathA + challengeMathB);
                    if (
                      normalized !== expectedSum &&
                      !normalized.includes('نويت') &&
                      !normalized.includes('صيام') &&
                      !normalized.includes('استيقظت')
                    ) {
                      setChallengeError(
                        'الإجابة غير صحيحة! احسب ناتج الجمع الصحيح أو اكتب عبارة «نويت الصيام» لإيقاف المنبه.'
                      );
                      return;
                    }
                  }
                  const id = criticalAlarm.id;
                  try {
                    await dismissAlarm(id);
                  } catch {
                    setChallengeError('تعذر إيقاف المنبه. حاول مرة أخرى.');
                    return;
                  }
                  if (alarmEvent.current.activeId === id) clearCriticalAlarm();
                  triggerToast(
                    'تقبل الله طاعتك وسحورك',
                    'تم إيقاف المنبه. لا تنسَ شرب الماء وعقد النية قبل أذان الفجر.'
                  );
                }}
              >
                <Check size={20} />
                <span>استيقظت — إيقاف المنبه الآن</span>
              </button>

              <button
                type="button"
                className="secondary-button"
                style={{
                  flex: 1,
                  minHeight: '52px',
                  fontSize: '15px',
                  fontWeight: 700,
                }}
                onClick={async () => {
                  const title = criticalAlarm.title;
                  const body = criticalAlarm.body;
                  const id = criticalAlarm.id;
                  try {
                    await snoozeAlarm(5, title, body);
                  } catch {
                    setChallengeError('تعذر تشغيل الغفوة. حاول مرة أخرى.');
                    return;
                  }
                  if (alarmEvent.current.activeId === id) clearCriticalAlarm();
                  triggerToast('غفوة ٥ دقائق', 'سيرن المنبه القوي مرة أخرى بعد ٥ دقائق بالضبط.');
                }}
              >
                <Clock3 size={18} />
                <span>غفوة ٥ دقائق</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </QuranRadioProvider>
  );
}

function PageTitle({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}

function CheckButton({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`check-button ${done ? 'done' : ''}`}
      onClick={onClick}
      aria-pressed={done}
    >
      <span>{done ? <Check size={16} /> : null}</span>
      {label}
    </button>
  );
}

/* ---------------------------------------------------- */
/* DYNAMIC PRODUCTIVITY WIDGETS: WATER & QURAN RADIO    */
/* ---------------------------------------------------- */

export function WaterTrackerWidget({ dailyGoal = 8 }: { dailyGoal?: number }) {
  const [cups, setCups] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    let unlistenWater = () => {};
    getWaterCupsToday()
      .then((count) => {
        if (active) setCups(count);
      })
      .catch(() => {});
    listenToEvent<{ cups?: number } | number>('wens-water-updated', (payload) => {
      if (!active) return;
      if (typeof payload === 'number' && Number.isFinite(payload)) {
        setCups(payload);
      } else if (isPlainObject(payload) && typeof payload.cups === 'number') {
        setCups(payload.cups);
      } else {
        getWaterCupsToday()
          .then((count) => {
            if (active) setCups(count);
          })
          .catch(() => {});
      }
    }).then((fn) => {
      if (!active) fn();
      else unlistenWater = fn;
    });
    return () => {
      active = false;
      unlistenWater();
    };
  }, []);

  const handleDrink = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const next = await incrementWaterCupsToday();
      setCups(next);
    } catch {
      setCups((prev) => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  const goal = dailyGoal > 0 ? dailyGoal : 8;
  const pct = Math.min(100, Math.round((cups / goal) * 100));

  return (
    <div className="productivity-widget-card water-widget" aria-labelledby="waterWidgetTitle">
      <div className="widget-card-header">
        <div className="widget-header-title">
          <Droplets size={18} style={{ color: '#38bdf8' }} />
          <span id="waterWidgetTitle">ترطيب وصحة اليوم</span>
        </div>
        <span className={`widget-badge ${cups >= goal ? 'active' : ''}`}>
          {cups >= goal ? 'اكتمل الهدف' : `${pct}%`}
        </span>
      </div>

      <div className="water-widget-stats">
        <div className="water-counter-display">
          <span className="water-counter-val">{digits(cups)}</span>
          <span className="water-counter-total">من {digits(goal)} أكواب</span>
        </div>
        <button
          type="button"
          className="water-drink-btn"
          onClick={handleDrink}
          disabled={loading}
          aria-label="تسجيل شرب كوب ماء"
        >
          <Plus size={14} />
          <span>شربت كوباً</span>
        </button>
      </div>

      <div className="water-progress-track" aria-hidden="true">
        <div className="water-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="water-cups-row" aria-label={`أكواب الماء المكتملة: ${cups} من ${goal}`}>
        {Array.from({ length: Math.min(12, Math.max(goal, cups)) }).map((_, idx) => (
          <span
            key={idx}
            className={`water-cup-chip ${idx < cups ? 'filled' : ''}`}
            title={`كوب ${idx + 1}`}
          >
            <Droplets size={13} />
          </span>
        ))}
      </div>

      <p className="water-tip-text">
        {cups >= goal
          ? 'بارك الله فيك، حققت هدف الترطيب اليومي لحفظ نشاطك وتركيزك.'
          : 'الماء عصب التركيز. احرص على كوب ماء بعد كل جلسة عمل أو وضوء.'}
      </p>
    </div>
  );
}

/* ---------------------------------------------------- */
/* TODAY VIEW                                           */
/* ---------------------------------------------------- */
export const TIMELINE_ANCHORS: Record<string, number> = {
  fajr: 7,
  sunrise: 22,
  dhuhr: 50,
  asr: 68,
  maghrib: 84,
  isha: 94,
};

export function Today({
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
  onOpenFasting,
  pendingBacklogCount,
  minuteNow: propMinuteNow,
  dateKey: propDateKey,
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
  onOpenFasting?: () => void;
  pendingBacklogCount?: number;
  minuteNow?: number;
  dateKey?: string;
}) {
  const current =
    data.projects.find((project) => project.isCurrent) ||
    data.projects.find((project) => project.status === 'قيد التنفيذ') ||
    data.projects[0];
  const lead = Number(data.settings.wuduLeadMinutes) || 15;
  const minuteNow = propMinuteNow ?? (new Date().getHours() * 60 + new Date().getMinutes());
  const minutesUntilNext = next ? (next.minutesFromMidnight - minuteNow + 1440) % 1440 : 999;
  const inWuduWindow = minutesUntilNext <= lead && minutesUntilNext >= 0;

  // Single in-window reminder banner state
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [showChecklistDetails, setShowChecklistDetails] = useState(false);

  // Daily note state (synced with SQLite v3 domain_kv)
  const todayKey = propDateKey || dateKey();
  const [todayNote, setTodayNote] = useState<string>(() => {
    try {
      return localStorage.getItem(`wens-today-note-${todayKey}`) || '';
    } catch {
      return '';
    }
  });
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(todayNote);

  useEffect(() => {
    let active = true;
    setReminderDismissed(false);
    setSnoozedUntil(null);
    setIsEditingNote(false);
    let localNote = '';
    try {
      localNote = localStorage.getItem(`wens-today-note-${todayKey}`) || '';
    } catch {
      localNote = '';
    }
    setTodayNote(localNote);
    setNoteDraft(localNote);
    getDomainKv(`today_note_${todayKey}`)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed: unknown = JSON.parse(raw);
          const remoteNote = typeof parsed === 'string' ? parsed : '';
          if (typeof parsed === 'string') {
            setTodayNote(remoteNote);
            setNoteDraft(remoteNote);
            safeSetLocalStorage(`wens-today-note-${todayKey}`, remoteNote);
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [todayKey]);

  const handleSaveNote = () => {
    const trimmed = noteDraft.trim();
    setTodayNote(trimmed);
    setIsEditingNote(false);
    safeSetLocalStorage(`wens-today-note-${todayKey}`, trimmed);
    void setDomainKv(`today_note_${todayKey}`, JSON.stringify(trimmed)).catch(() => {});
  };

  // Living Companion Interactive Node in Today view
  const [companionBubble, setCompanionBubble] = useState<string | null>(null);
  const [isCompanionTapped, setIsCompanionTapped] = useState(false);
  const bubbleTimerRef = useRef<any>(null);
  const tapTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

  const isAllObligatoryPrayersDone = Boolean(
    checks.fajr && checks.dhuhr && checks.asr && checks.maghrib && checks.isha
  );

  const todayCompanionState: CompanionVisualState = timerStarted
    ? 'focus'
    : inWuduWindow
    ? 'prayer'
    : isAllObligatoryPrayersDone
    ? 'celebration'
    : 'idle';

  const petAvatar = data.settings?.petAvatar || 'orb';
  const petAvatarName =
    petAvatar === 'robot'
      ? 'الروبوت وِنس'
      : petAvatar === 'cat'
      ? 'القط وِنس'
      : petAvatar === 'owl'
      ? 'البومة الحكيمة'
      : petAvatar === 'crescent'
      ? 'الهلال الهادئ'
      : petAvatar === 'sprout'
      ? 'نبتة وِنس'
      : petAvatar === 'lantern'
      ? 'فانوس وِنس'
      : 'وِنس';

  const todayCompanionStatusText = timerStarted
    ? 'في جلسة تركيز'
    : inWuduWindow
    ? 'استعداد للصلاة'
    : isAllObligatoryPrayersDone
    ? 'أتممت صلواتك'
    : 'معاك خطوة بخطوة';

  const handleCompanionTap = () => {
    setIsCompanionTapped(true);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      setIsCompanionTapped(false);
    }, 380);

    playCompanionSound(petAvatar, 'tap', {
      enabled: data.settings?.petInteractionSounds !== false,
    });
    let msg = 'أنا هنا جنبك.. يومك مبارك وموفق 🌱';
    if (timerStarted) {
      msg = 'شغال بتركيز وهدوء؛ كمل خطوتك الحالية 💪';
    } else if (inWuduWindow) {
      msg = `حان وقت الوضوء لصلاة ${next?.nameAr || 'الفريضة'} 🕌`;
    } else if (isAllObligatoryPrayersDone) {
      msg = 'ما شاء الله! أتممت صلوات اليوم كلها، ربنا يتقبل طاعتك 🌟';
    } else if (next) {
      msg = `الصلاة القادمة ${next.nameAr}، وِنس معاك دائماً 🤍`;
    }
    setCompanionBubble(msg);
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      setCompanionBubble(null);
    }, 3800);
  };

  // Date strings & Sunnah fasting memoized strictly on stable todayKey (zero per-second Hijri scans!)
  const { weekdayName, gregorianStr, hijriStr, sunnahFasting, closestFasting } = useMemo(() => {
    const parts = todayKey.split('-').map(Number);
    const dayDate =
      parts.length === 3 && parts.every(Number.isFinite)
        ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
        : new Date();
    const wName = arWeekdayFmt ? arWeekdayFmt.format(dayDate) : todayKey;
    const gStr = arGregorianFmt ? arGregorianFmt.format(dayDate) : todayKey;
    const hijriOffset = Number(data.settings?.hijriDateOffset) || 0;
    const hToday = gregorianToHijri(dayDate, hijriOffset);
    const hStr = `${digits(hToday.day)} ${hToday.monthName} ${digits(hToday.year)} هـ`;
    const sunnah = getUpcomingSunnahDays(dayDate, hijriOffset);

    const todayMidnight = new Date(dayDate);
    todayMidnight.setHours(0, 0, 0, 0);
    const getDiffDays = (targetDate: Date) => {
      const d = new Date(targetDate);
      d.setHours(0, 0, 0, 0);
      return Math.round((d.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
    };

    const monDiff = getDiffDays(sunnah.nextMonday.date);
    const thuDiff = getDiffDays(sunnah.nextThursday.date);
    const formatShortDate = (d: Date) => (arShortDateFmt ? arShortDateFmt.format(d) : toLocalDateString(d));

    const activeWhiteItem =
      sunnah.whiteDays.items.find((w) => w.isToday) ||
      sunnah.whiteDays.items.find((w) => !w.isPassed);

    let closest: { name: string; rel: string; dateStr: string; isToday: boolean };
    if (
      activeWhiteItem &&
      (sunnah.whiteDays.isCurrent || activeWhiteItem.diffDays < Math.min(monDiff, thuDiff))
    ) {
      const wDiff = Math.max(0, activeWhiteItem.diffDays);
      const rel = wDiff === 0 ? 'اليوم' : wDiff === 1 ? 'غدًا' : `بعد ${digits(wDiff)} أيام`;
      closest = {
        name: `الأيام البيض (${activeWhiteItem.hijriDateStr})`,
        rel,
        dateStr: formatShortDate(activeWhiteItem.date),
        isToday: wDiff === 0 || activeWhiteItem.isToday,
      };
    } else if (monDiff <= thuDiff) {
      const rel = monDiff === 0 ? 'اليوم' : monDiff === 1 ? 'غدًا' : `بعد ${digits(monDiff)} أيام`;
      closest = {
        name: 'صيام الإثنين',
        rel,
        dateStr: formatShortDate(sunnah.nextMonday.date),
        isToday: monDiff === 0,
      };
    } else {
      const rel = thuDiff === 0 ? 'اليوم' : thuDiff === 1 ? 'غدًا' : `بعد ${digits(thuDiff)} أيام`;
      closest = {
        name: 'صيام الخميس',
        rel,
        dateStr: formatShortDate(sunnah.nextThursday.date),
        isToday: thuDiff === 0,
      };
    }

    return {
      weekdayName: wName,
      gregorianStr: gStr,
      hijriStr: hStr,
      sunnahFasting: sunnah,
      closestFasting: closest,
    };
  }, [todayKey, data.settings?.hijriDateOffset]);

  const prayerTimes = prayer?.times || [];

  // Accurate Sun & Celestial Position & Appearance Engine
  const fajrObj = prayerTimes.find((p) => p.key === 'fajr');
  const sunriseObj = prayerTimes.find((p) => p.key === 'sunrise');
  const dhuhrObj = prayerTimes.find((p) => p.key === 'dhuhr');
  const asrObj = prayerTimes.find((p) => p.key === 'asr');
  const maghribObj = prayerTimes.find((p) => p.key === 'maghrib');
  const ishaObj = prayerTimes.find((p) => p.key === 'isha');

  const fajrMins = fajrObj?.minutesFromMidnight ?? 319;
  const sunriseMins = sunriseObj?.minutesFromMidnight ?? 405;
  const dhuhrMins = dhuhrObj?.minutesFromMidnight ?? 766;
  const asrMins = asrObj?.minutesFromMidnight ?? 972;
  const maghribMins = maghribObj?.minutesFromMidnight ?? 1127;
  const ishaMins = ishaObj?.minutesFromMidnight ?? 1204;

  // LTR timeline percentages matching 02-time-horizon.png
  const X_FAJR = TIMELINE_ANCHORS.fajr;
  const X_SUNRISE = TIMELINE_ANCHORS.sunrise;
  const X_DHUHR = TIMELINE_ANCHORS.dhuhr;
  const X_ASR = TIMELINE_ANCHORS.asr;
  const X_MAGHRIB = TIMELINE_ANCHORS.maghrib;
  const X_ISHA = TIMELINE_ANCHORS.isha;

  // Mathematical height function for the celestial arc baseline (in px from bottom of 44px container)
  // SVG path: M 20,54 Q 500,6 980,54 in viewBox 0 0 1000 60
  const getArcBottom = (xPercent: number) => {
    const u = Math.max(0, Math.min(1, (xPercent - 2) / 96));
    const svgY = 54 - 96 * u * (1 - u);
    return (60 - svgY) * (44 / 60);
  };

  let sunX = 50;
  let sunPhase: 'fajr' | 'sunrise' | 'morning' | 'dhuhr' | 'asr' | 'sunset' | 'night' = 'dhuhr';
  let isSunVisible = true;

  if (minuteNow < fajrMins) {
    // Deep Night before Fajr - Sun is completely below horizon, radiant crescent moon
    sunPhase = 'night';
    isSunVisible = false;
    sunX = X_FAJR;
  } else if (minuteNow < sunriseMins) {
    // Dawn / Fajr to Sunrise - Sun is just beginning to peek over horizon baseline (tiny sliver)
    sunPhase = 'fajr';
    const t = (minuteNow - fajrMins) / Math.max(1, sunriseMins - fajrMins);
    sunX = X_FAJR + t * (X_SUNRISE - X_FAJR);
  } else if (minuteNow < sunriseMins + 40) {
    // Sunrise - Sun is half-submerged dome rising through horizon line with golden flare
    sunPhase = 'sunrise';
    const t = (minuteNow - sunriseMins) / 40;
    sunX = X_SUNRISE + t * 8;
  } else if (minuteNow < dhuhrMins) {
    // Morning / Duha - Sun climbs into the sky toward Dhuhr zenith
    const t = (minuteNow - (sunriseMins + 40)) / Math.max(1, dhuhrMins - (sunriseMins + 40));
    sunX = 30 + t * (X_DHUHR - 30);
    sunPhase = t > 0.85 ? 'dhuhr' : 'morning';
  } else if (minuteNow < asrMins) {
    // Midday / Solar Noon descending to Asr
    const t = (minuteNow - dhuhrMins) / Math.max(1, asrMins - dhuhrMins);
    sunX = X_DHUHR + t * (X_ASR - X_DHUHR);
    sunPhase = t < 0.35 ? 'dhuhr' : 'asr';
  } else if (minuteNow < maghribMins) {
    // Golden Afternoon to Sunset - Sun stays round through Asr until within 6 minutes of Maghrib
    const t = (minuteNow - asrMins) / Math.max(1, maghribMins - asrMins);
    sunX = X_ASR + t * (X_MAGHRIB - X_ASR);
    sunPhase = minuteNow >= maghribMins - 6 ? 'sunset' : 'asr';
  } else if (minuteNow < maghribMins + 35) {
    // Sunset Twilight / Dusk - Sun is setting dome sinking into the horizon
    const t = (minuteNow - maghribMins) / 35;
    sunX = X_MAGHRIB + t * (X_ISHA - X_MAGHRIB);
    sunPhase = 'sunset';
    isSunVisible = true;
  } else {
    // Night after sunset (Isha and onwards) - transitions into Crescent Moon
    sunPhase = 'night';
    isSunVisible = false;
    sunX = X_ISHA;
  }

  const sunBottom = getArcBottom(sunX);

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
    const isNext = item.isObligatory && next?.key === item.key && minuteNow <= minutes;
    const isDone = Boolean(checks[item.key]);
    const isPassed = !isDone && !isNext && minuteNow > minutes;
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
    if (h > 0 && m > 0) return `${digits(h)} ساعة و ${digits(m)} دقيقة`;
    if (h > 0) return `${digits(h)} ساعة`;
    return `${digits(m)} دقيقة`;
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

  const getSunArcColors = (phase: typeof sunPhase) => {
    switch (phase) {
      case 'fajr':
        return {
          core: '#fed7aa',
          mid: '#f97316',
          outer: '#ea580c',
        };
      case 'sunrise':
        return {
          core: '#fef08a',
          mid: '#f59e0b',
          outer: '#d97706',
        };
      case 'morning':
        return {
          core: '#fef08a',
          mid: '#f5c278',
          outer: '#d49748',
        };
      case 'dhuhr':
        return {
          core: '#fef9c3',
          mid: '#fde047',
          outer: '#f5c278',
        };
      case 'asr':
        return {
          core: '#fef3c7',
          mid: '#f59e0b',
          outer: '#c2731d',
        };
      case 'sunset':
        return {
          core: '#fed7aa',
          mid: '#e06b3a',
          outer: '#b84620',
        };
      default:
        return {
          core: '#fef08a',
          mid: '#f5c278',
          outer: '#d49748',
        };
    }
  };
  const arcGlow = getSunArcColors(sunPhase);

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
              {next ? `${next.nameAr} بعد` : 'الصلاة القادمة بعد'}
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
            <div
              className="horizon-companion-interactive"
              role="button"
              tabIndex={0}
              onClick={handleCompanionTap}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCompanionTap();
                }
              }}
              title="رفيقك وِنس — انقر للتفاعل"
              aria-label="رفيق وِنس التفاعلي"
            >
              <div className="horizon-companion-avatar-wrap">
                <CompanionViewer
                  avatar={petAvatar}
                  state={todayCompanionState}
                  size="small"
                  className={isCompanionTapped ? 'is-tapped' : ''}
                />
              </div>
              <div className="horizon-companion-label">
                <strong>{petAvatarName}</strong>
                <small>{todayCompanionStatusText}</small>
              </div>
              {companionBubble && (
                <div className="horizon-companion-speech-bubble" role="status">
                  <span>{companionBubble}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Celestial Arc with Dynamic Ambient Glow, Traveling Spherical Sun & Crescent Moon */}
        <div className="horizon-celestial-arc-wrap" aria-hidden="true">
          {/* Ambient Corona Glow illuminating the sky behind the sun */}
          {isSunVisible && (
            <div
              className={`horizon-sun-ambient-glow phase-${sunPhase}`}
              style={{
                left: `${sunX}%`,
                bottom: `${sunBottom}px`,
              }}
            />
          )}
          {/* Celestial Arc SVG layered behind the sun with localized golden thread radiance */}
          <svg className="horizon-celestial-svg" viewBox="0 0 1000 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="horizon-celestial-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 14))}%`} stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 7))}%`} stopColor={arcGlow.outer} stopOpacity={isSunVisible ? 0.35 : 0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 2))}%`} stopColor={arcGlow.mid} stopOpacity={isSunVisible ? 0.75 : 0} />
                <stop offset={`${Math.round(sunX)}%`} stopColor={arcGlow.core} stopOpacity={isSunVisible ? 0.9 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 2))}%`} stopColor={arcGlow.mid} stopOpacity={isSunVisible ? 0.75 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 7))}%`} stopColor={arcGlow.outer} stopOpacity={isSunVisible ? 0.35 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 14))}%`} stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset="100%" stopColor={arcGlow.outer} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path
              d="M 20,54 Q 500,6 980,54"
              className="horizon-celestial-arc-path"
            />
            {isSunVisible && (
              <path
                d="M 20,54 Q 500,6 980,54"
                className="horizon-celestial-arc-glow"
                stroke="url(#horizon-celestial-gradient)"
              />
            )}
          </svg>
          {/* Dynamic Luminous Celestial Sun Orb traveling centered on the arc path */}
          {isSunVisible && (
            <div
              className={`horizon-sun-disc phase-${sunPhase}`}
              style={{
                left: `${sunX}%`,
                bottom: `${sunBottom}px`,
              }}
              title={`موضع الشمس: ${
                sunPhase === 'fajr'
                  ? 'الفجر (شروق مبكر)'
                  : sunPhase === 'sunrise'
                  ? 'الشروق (بزوغ القرص)'
                  : sunPhase === 'morning'
                  ? 'الضحى'
                  : sunPhase === 'dhuhr'
                  ? 'الظهر (ذروة كبد السماء)'
                  : sunPhase === 'asr'
                  ? 'العصر'
                  : 'المغرب (غروب القرص)'
              }`}
            >
              <span className="sun-inner-core" />
              <span className="sun-corona-flare" />
              <span className="sun-horizon-flare" />
            </div>
          )}
          {/* Celestial Horizon Rail / Strip passing in front of the sun to cover its lower portion */}
          <svg className="horizon-celestial-strip-front" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="horizon-celestial-strip-front-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 16))}%`} stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 8))}%`} stopColor={arcGlow.outer} stopOpacity={isSunVisible ? 0.35 : 0} />
                <stop offset={`${Math.max(0, Math.round(sunX - 3))}%`} stopColor={arcGlow.mid} stopOpacity={isSunVisible ? 0.85 : 0} />
                <stop offset={`${Math.round(sunX)}%`} stopColor={arcGlow.core} stopOpacity={isSunVisible ? 1 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 3))}%`} stopColor={arcGlow.mid} stopOpacity={isSunVisible ? 0.85 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 8))}%`} stopColor={arcGlow.outer} stopOpacity={isSunVisible ? 0.35 : 0} />
                <stop offset={`${Math.min(100, Math.round(sunX + 16))}%`} stopColor={arcGlow.outer} stopOpacity={0} />
                <stop offset="100%" stopColor={arcGlow.outer} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* The occluding horizon body covering the lower portion of the sun along the exact arc curve */}
            <path
              d="M 0,54 L 20,54 Q 500,6 980,54 L 1000,54 L 1000,120 L 0,120 Z"
              className="horizon-celestial-body"
            />
            <path
              d="M 20,54 Q 500,6 980,54"
              className="horizon-celestial-front-path"
            />
            {isSunVisible && (
              <path
                d="M 20,54 Q 500,6 980,54"
                className="horizon-celestial-front-glow"
                stroke="url(#horizon-celestial-strip-front-gradient)"
              />
            )}
          </svg>
          {/* Crescent Moon (radiant at night, subtle during day) */}
          <div
            className={`horizon-moon-crescent ${!isSunVisible ? 'is-night' : ''}`}
            title={!isSunVisible ? 'القمر - سماء الليل' : 'القمر'}
            aria-label="القمر"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </div>
        </div>

        {/* 5-Prayer + Sunrise Dots on Horizon Line */}
        <div className="horizon-five-prayers" role="region" aria-label="شريط أفق الصلوات">
          <div className="horizon-timeline-baseline" aria-hidden="true" />
          {fivePrayers.map((p) => (
            <div
              key={p.key}
              className={`horizon-prayer-node ${p.isDone ? 'done' : p.isNext ? 'next' : p.isPassed ? 'passed missed' : ''} ${!p.isObligatory ? 'sunrise' : ''}`}
              style={{ left: `${TIMELINE_ANCHORS[p.key] ?? 50}%` }}
              onClick={() => toggle(p.key)}
              title={
                p.isDone
                  ? `تمت صلاة ${p.name} (${formatMinutes(p.minutes)})`
                  : p.isPassed
                  ? `فائتة لم تُصلَ: ${p.name} (${formatMinutes(p.minutes)}) (انقر للتسجيل)`
                  : !p.isObligatory
                  ? `موعد ${p.name} (${formatMinutes(p.minutes)})`
                  : `تسجيل صلاة ${p.name} (${formatMinutes(p.minutes)})`
              }
              aria-label={
                p.isDone
                  ? `تمت صلاة ${p.name} (${formatMinutes(p.minutes)})`
                  : p.isPassed
                  ? `فائتة لم تُصلَ: ${p.name} (${formatMinutes(p.minutes)}) (انقر للتسجيل)`
                  : !p.isObligatory
                  ? `موعد ${p.name} (${formatMinutes(p.minutes)})`
                  : `تسجيل صلاة ${p.name} (${formatMinutes(p.minutes)})`
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(p.key);
                }
              }}
              aria-pressed={p.isDone}
            >
              {/* Instant Hover Tooltip (appears at 0ms delay on mouseover) */}
              <div className="prayer-instant-tooltip" role="tooltip" aria-hidden="true">
                <span className="prayer-tooltip-time">{formatMinutes(p.minutes)}</span>
                <span className="prayer-tooltip-status">
                  {p.isDone
                    ? 'تمت الصلاة ✓'
                    : p.isPassed
                    ? 'فائتة'
                    : p.isNext
                    ? 'الصلاة القادمة'
                    : !p.isObligatory
                    ? 'شروق الشمس'
                    : 'تسجيل الصلاة'}
                </span>
              </div>
              {p.isNext && !p.isDone && <span className="prayer-vertical-beam" aria-hidden="true" />}
              <span
                className={`prayer-dot ${p.isDone ? 'done' : p.isNext ? 'next' : p.isPassed ? 'passed missed' : p.isObligatory ? 'obligatory' : 'sunrise'}`}
              >
                {p.isDone && (
                  <svg width="7" height="7" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="prayer-check-icon">
                    <path d="M2.5 6.5L4.8 8.8L9.5 3.5" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <strong className="prayer-name">{p.name}</strong>
              <span className="prayer-time">{formatMinutes(p.minutes)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Sunnah Fasting Quick Strip */}
      <div className="horizon-fasting-bar">
        <div className="horizon-fasting-info">
          <div className="horizon-fasting-icon-wrap">
            <Leaf size={16} />
          </div>
          <div className="horizon-fasting-text">
            <strong>
              {closestFasting.isToday
                ? `اليوم فرصة صيام مباركة (${closestFasting.name})`
                : `${closestFasting.name} (${closestFasting.rel})`}
            </strong>
            <span>
              {closestFasting.dateStr} • {sunnahFasting.whiteDays.isCurrent ? 'نحن الآن في الأيام البيض المستحبة' : 'سنة نبوية مستحبة ترفع فيها الأعمال'}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="horizon-fasting-link-btn"
          onClick={() => (onOpenFasting ? onOpenFasting() : go('worship'))}
          aria-label="الانتقال لجدول الصيام والسنن"
        >
          <span>جدول الصيام والسنن</span>
          <ChevronLeft size={15} />
        </button>
      </div>

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
              <span>{current?.title || 'بدون مشروع نشط'}</span>
              {current?.title && (
                <span className="sr-only">استئناف جلسة العمل — {current.title}</span>
              )}
            </div>
          </div>

          <div className="horizon-work-body">
            <span className="horizon-step-kicker">الخطوة التالية:</span>
            <h2 className="horizon-step-title">
              {current?.currentTask || (current ? 'حدّد الخطوة المباشرة التالية' : 'أضف مشروعك الأول للتركيز عليه')}
            </h2>
            <p className="horizon-step-desc">
              {current?.description || (current ? 'ابدأ جلسة تركيز هادئة أو حرّر تفاصيل مشروعك من قسم المشروعات.' : 'يمكنك إنشاء مشروع جديد وتحديد هدفه وخطوته التالية من صفحة المشروعات.')}
            </p>
          </div>

          <div className="horizon-work-actions">
            <button className="horizon-all-steps-btn" onClick={() => go('projects')}>
              <ListTodo size={16} />
              <span>عرض جميع الخطوات</span>
            </button>
            <button
              className={`horizon-focus-btn ${timerStarted ? 'running' : ''}`}
              onClick={() => setTimerStarted(timerStarted ? null : Date.now())}
            >
              {timerStarted ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              <span>{timerStarted ? `إيقاف مؤقت (${workTime})` : 'استئناف الشغل'}</span>
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
            <button
              type="button"
              className={`horizon-checklist-toggle-btn ${showChecklistDetails ? 'active' : ''}`}
              onClick={() => setShowChecklistDetails(!showChecklistDetails)}
              aria-label="عرض تفاصيل علامات اليوم"
            >
              <CheckCircle2 size={13} />
              <span>{showChecklistDetails ? 'إخفاء التفاصيل' : 'عرض وتعديل'}</span>
            </button>
          </div>

          <div className="horizon-review-body">
            {showChecklistDetails && (
              <div className="horizon-checklist-expanded" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                {prayer?.times.filter((p) => p.key !== 'sunrise').map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`check-chip ${checks[p.key] ? 'checked' : ''}`}
                    onClick={() => toggle(p.key)}
                  >
                    {checks[p.key] && <Check size={14} />}
                    <span>{p.nameAr}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`check-chip ${checks['fasting'] ? 'checked' : ''}`}
                  onClick={() => toggle('fasting')}
                >
                  {checks['fasting'] && <Check size={14} />}
                  <span>صمت اليوم</span>
                </button>
                <button
                  type="button"
                  className={`check-chip ${checks['workStep'] ? 'checked' : ''}`}
                  onClick={() => toggle('workStep')}
                >
                  {checks['workStep'] && <Check size={14} />}
                  <span>أنجزت خطوتي</span>
                </button>
              </div>
            )}
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

      {/* 3. Dynamic Productivity Suite: Water & Quran Radio */}
      {(data.settings.waterReminderEnabled !== false || data.settings.quranRadioEnabled !== false) && (
        <div className="today-widgets-row">
          {data.settings.waterReminderEnabled !== false && (
            <WaterTrackerWidget dailyGoal={Number(data.settings.waterDailyGoal) || 8} />
          )}
          {data.settings.quranRadioEnabled !== false && (
            <QuranRadioWidget
              strictOffline={Boolean(data.settings.strictOffline)}
              defaultStation={data.settings.quranRadioDefaultStation || 'cairo'}
            />
          )}
        </div>
      )}

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

export function Worship({
  prayer,
  checks,
  toggle,
  backlog: propBacklog,
  setBacklog: propSetBacklog,
  activeTab: propActiveTab,
  setActiveTab: propSetActiveTab,
  triggerToast,
  onCheckPrayer,
  onCheckFasting,
  settings: propSettings,
  onUpdateSettings,
  syncReminderPlan,
  setAudioPlaying,
  minuteNow: propMinuteNow,
  dateKey: propDateKey,
}: {
  prayer: PrayerDay | null;
  checks: Record<string, boolean>;
  toggle: (k: string) => void;
  backlog?: BacklogState;
  setBacklog?: React.Dispatch<React.SetStateAction<BacklogState>>;
  activeTab?: 'times' | 'today' | 'backlog' | 'fasting' | 'occasions';
  setActiveTab?: (tab: 'times' | 'today' | 'backlog' | 'fasting' | 'occasions') => void;
  triggerToast?: (title: string, body: string) => void;
  onCheckPrayer?: (key: string) => void;
  onCheckFasting?: () => void;
  settings?: AppPreferences;
  onUpdateSettings?: (patch: AppPreferencesPatch) => Promise<void> | void;
  syncReminderPlan?: (settings?: AppPreferences, today?: PrayerDay) => Promise<void> | void;
  setAudioPlaying?: React.Dispatch<React.SetStateAction<boolean>>;
  minuteNow?: number;
  dateKey?: string;
}) {
  const todayKey = propDateKey || getCivilClock(undefined, propSettings?.timeZone).date;
  const isDateToday = (date?: string | null) => date === todayKey;
  const [deferredReviewIds, setDeferredReviewIds] = useState<string[]>([]);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const suhoorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (suhoorTimerRef.current) clearTimeout(suhoorTimerRef.current);
    };
  }, []);
  const [localBacklog, setLocalBacklog] = useState<BacklogState>(() => loadBacklogState());
  const backlog = propBacklog ?? localBacklog;
  const setBacklog = propSetBacklog ?? setLocalBacklog;

  const [localTab, setLocalTab] = useState<'times' | 'today' | 'backlog' | 'fasting' | 'occasions'>(
    propActiveTab || 'times'
  );
  const activeTab = propActiveTab ?? localTab;
  const setActiveTab = propSetActiveTab ?? setLocalTab;

  const isTimesActive = activeTab === 'times' || activeTab === 'today';
  const isBacklogActive = activeTab === 'backlog';
  const isFastingActive = activeTab === 'fasting';
  const isOccasionsActive = activeTab === 'occasions';

  // Toggle between today prayer times, weekly table, and full month table in times section
  const [prayerViewMode, setPrayerViewMode] = useState<'today' | 'week' | 'month'>('today');
  const [showDailyTimesTable, setShowDailyTimesTable] = useState(false);

  // Filter for missed prayers
  const [prayerFilter, setPrayerFilter] = useState<
    'all' | 'pending' | 'unconfirmed' | 'missed' | 'resolved' | 'excused'
  >('pending');

  // Filter for Islamic occasions
  const [occasionsFilter, setOccasionsFilter] = useState<
    'all' | 'eid' | 'blessed_night' | 'prophetic' | 'general'
  >('all');

  // Manual prayer add form state
  const [addPrayerName, setAddPrayerName] = useState<PrayerName>('الفجر');
  const [addPrayerDate, setAddPrayerDate] = useState<string>(() => toLocalDateString());
  const [addPrayerNotes, setAddPrayerNotes] = useState<string>('');

  // Manual fasting add form state
  const [fastingFormType, setFastingFormType] = useState<string>('قضاء رمضان');
  const [fastingFormDate, setFastingFormDate] = useState<string>(() => toLocalDateString());
  const [fastingFormNotes, setFastingFormNotes] = useState<string>('');

  // Settings & Suhoor Alarm Controls
  const [localSettings, setLocalSettings] = useState<AppPreferences>(
    () => propSettings ?? defaultPreferences
  );
  const settings = propSettings ?? localSettings;

  const [suhoorLead, setSuhoorLead] = useState<number>(() => {
    if (propSettings?.suhoorLeadMinutes) return Number(propSettings.suhoorLeadMinutes);
    try {
      return Number(localStorage.getItem('wens-suhoor-lead')) || 45;
    } catch {
      return 45;
    }
  });
  const [suhoorSaving, setSuhoorSaving] = useState(false);
  const [suhoorAudioTesting, setSuhoorAudioTesting] = useState(false);

  const updateBacklog = (next: BacklogState) => {
    setBacklog(next);
    saveBacklogState(next);
  };

  const toast = (title: string, body: string) => {
    if (triggerToast) {
      triggerToast(title, body);
    }
  };

  // Fasting intentions state
  const [fastingIntents, setFastingIntents] = useState<Record<string, boolean>>(() =>
    getFastingIntentions()
  );

  const handleToggleIntent = (dateStr: string, secondaryKey?: string, label?: string) => {
    const isCurrentlyIntended = Boolean(
      fastingIntents[dateStr] || (secondaryKey && fastingIntents[secondaryKey])
    );
    const nextVal = !isCurrentlyIntended;
    const updated = saveFastingIntention(dateStr, nextVal);
    if (secondaryKey && updated[secondaryKey]) {
      saveFastingIntention(secondaryKey, false);
      delete updated[secondaryKey];
    }
    setFastingIntents({ ...updated });
    toast(
      'نية الصيام',
      nextVal
        ? `ثبت الله أجرك ونواك بالخير. تم تحديد نية ${label || 'الصيام'}.`
        : `تم إلغاء تحديد نية ${label || 'الصيام'}.`
    );
  };

  const handleToggleComplete = (dateStr: string, label: string) => {
    if (dateStr > todayKey) {
      toast(
        'لا يمكن تسجيل الصيام لموعد قادم',
        'لا يمكنك تسجيل إتمام الصيام قبل حلول اليوم نفسه. يمكنك تحديد (نية الصيام) مسبقاً.'
      );
      return;
    }
    const isDone = isFastingDateCompleted(dateStr, checks, backlog.fastingItems);
    const nextDone = !isDone;
    const { nextBacklog } = recordFastingCompletion(dateStr, label, nextDone, backlog);
    updateBacklog(nextBacklog);

    if (dateStr === todayKey) {
      if (nextDone && onCheckFasting && !checks.fasting) {
        onCheckFasting();
      } else if (Boolean(checks.fasting) !== nextDone) {
        toggle('fasting');
      }
    }

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel('wens-state');
        ch.postMessage({
          type: 'wens-state',
          source: 'app-ui',
          action: 'markFasting',
          fastingDate: dateStr,
          completed: nextDone,
        });
        ch.close();
      } catch {}
    }

    toast(
      nextDone ? 'تقبل الله طاعتك!' : 'سجل الصيام',
      nextDone
        ? `تم تسجيل صيام ${label} (${dateStr}) بنجاح في سجل المحاسبة والصيام.`
        : `تم إلغاء تسجيل صيام ${label} (${dateStr}).`
    );
  };

  const handleUpdateSuhoorSettings = async (patch: AppPreferencesPatch, silent = false) => {
    setSuhoorSaving(true);
    try {
      if (onUpdateSettings) {
        await onUpdateSettings(patch);
      } else {
        const res = await updateSettings(patch);
        setLocalSettings(res.settings);
        if (syncReminderPlan) await syncReminderPlan();
      }
      if (!silent) {
        toast('تم الحفظ محليًا', 'تم تحديث إعدادات منبه السحور بنجاح.');
      }
    } catch (err: any) {
      if (!silent) {
        toast('تعذر الحفظ', err?.message || 'حدث خطأ أثناء حفظ الإعدادات.');
      }
    } finally {
      setSuhoorSaving(false);
    }
  };

  const handleLeadChange = async (lead: number) => {
    setSuhoorSaving(true);
    setSuhoorLead(lead);
    toast('تم ضبط وقت السحور', `سيتم تنبيهك قبل الفجر بـ ${digits(lead)} دقيقة.`);
    try {
      localStorage.setItem('wens-suhoor-lead', String(lead));
    } catch {}
    try {
      await handleUpdateSuhoorSettings({ suhoorLeadMinutes: lead }, true);
      if (syncReminderPlan) {
        await syncReminderPlan({ ...settings, suhoorLeadMinutes: lead }, prayer || undefined);
      }
    } finally {
      if (suhoorTimerRef.current) clearTimeout(suhoorTimerRef.current);
      suhoorTimerRef.current = setTimeout(() => {
        setSuhoorSaving(false);
        suhoorTimerRef.current = null;
      }, 250);
    }
  };

  const handleTestSuhoorAudio = async () => {
    setSuhoorAudioTesting(true);
    if (setAudioPlaying) setAudioPlaying(true);
    try {
      const mode = settings.audio?.fasting || 'strong-alarm';
      const testKind =
        mode === 'strong-alarm'
          ? 'strong-alarm'
          : mode === 'adhan'
          ? 'adhan'
          : 'gentle';
      await testNotification(testKind);
      toast(
        'تجربة نغمة السحور',
        mode === 'strong-alarm'
          ? 'يعمل الآن صوت المنبه القوي المتكرر! اضغط إيقاف الصوت عند التأكد.'
          : 'تم تشغيل الصوت المختار محليًا.'
      );
    } catch {
      // test notification error handled
    }
  };

  const handleTestFullWakeChallenge = async () => {
    setSuhoorAudioTesting(true);
    if (setAudioPlaying) setAudioPlaying(true);
    try {
      await testNotification('suhoor-alarm');
    } catch {}
  };

  const handleStopSuhoorAudio = async () => {
    await stopAudio();
    setSuhoorAudioTesting(false);
    if (setAudioPlaying) setAudioPlaying(false);
  };

  useEffect(() => {
    if (drawerRef.current) {
      (drawerRef.current as HTMLDivElement & { inert: boolean }).inert = !showDailyTimesTable;
    }
  }, [showDailyTimesTable]);

  const summary = useMemo(() => getBacklogSummary(backlog), [backlog]);

  const safeLat = sanitizeLatitude(settings.latitude, 30.0444);
  const safeLng = sanitizeLongitude(settings.longitude, 31.2357);

  const qibla = useMemo(() => calculateQibla(safeLat, safeLng), [safeLat, safeLng]);

  const dayDate = useMemo(() => {
    const parts = todayKey.split('-').map(Number);
    return parts.length === 3 && parts.every(Number.isFinite)
      ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0)
      : new Date();
  }, [todayKey]);

  const currentYear = dayDate.getFullYear();
  const currentMonthIndex = dayDate.getMonth();
  const monthLabel = useMemo(() => {
    return arMonthYearFmt ? arMonthYearFmt.format(dayDate) : `${currentYear}-${currentMonthIndex + 1}`;
  }, [dayDate, currentYear, currentMonthIndex]);

  const monthRows = useMemo(() => {
    const tz = getTimeZoneOffsetHours(dayDate, settings.timeZone);
    return calculateMonthPrayerTable(
      currentYear,
      currentMonthIndex,
      safeLat,
      safeLng,
      tz,
      settings.calcMethod || 'egypt',
      Number(settings.fajrOffset) || 0,
      Number(settings.maghribOffset) || 0,
      Number(settings.ishaOffset) || 0,
      Boolean(settings.asrHanafi),
      settings.timeZone
    );
  }, [
    safeLat,
    safeLng,
    settings.calcMethod,
    settings.fajrOffset,
    settings.maghribOffset,
    settings.ishaOffset,
    settings.asrHanafi,
    settings.timeZone,
    currentYear,
    currentMonthIndex,
    dayDate,
  ]);

  const weekRows = useMemo(() => {
    const tz = getTimeZoneOffsetHours(dayDate, settings.timeZone);
    return calculateWeekPrayerTable(
      dayDate,
      safeLat,
      safeLng,
      tz,
      settings.calcMethod || 'egypt',
      Number(settings.fajrOffset) || 0,
      Number(settings.maghribOffset) || 0,
      Number(settings.ishaOffset) || 0,
      Boolean(settings.asrHanafi),
      settings.timeZone
    );
  }, [
    safeLat,
    safeLng,
    settings.calcMethod,
    settings.fajrOffset,
    settings.maghribOffset,
    settings.ishaOffset,
    settings.asrHanafi,
    settings.timeZone,
    dayDate,
  ]);

  const tomorrowPrayer = useMemo(() => {
    const tz = getTimeZoneOffsetHours(dayDate, settings.timeZone);
    return getTomorrowPrayerTimes(
      dayDate,
      safeLat,
      safeLng,
      tz,
      settings.calcMethod || 'egypt',
      Number(settings.fajrOffset) || 0,
      Number(settings.maghribOffset) || 0,
      Number(settings.ishaOffset) || 0,
      Boolean(settings.asrHanafi),
      settings.timeZone
    );
  }, [
    safeLat,
    safeLng,
    settings.calcMethod,
    settings.fajrOffset,
    settings.maghribOffset,
    settings.ishaOffset,
    settings.asrHanafi,
    settings.timeZone,
    dayDate,
  ]);

  const hijriToday = useMemo(() => {
    return gregorianToHijri(dayDate, Number(settings.hijriDateOffset) || 0);
  }, [dayDate, settings.hijriDateOffset]);

  const weekdayName = useMemo(() => {
    return arWeekdayFmt ? arWeekdayFmt.format(dayDate) : todayKey;
  }, [dayDate, todayKey]);

  const gregorianDateStr = useMemo(() => {
    return arGregorianLatnFmt ? arGregorianLatnFmt.format(dayDate) : todayKey;
  }, [dayDate, todayKey]);

  const hijriDateStr = useMemo(() => {
    return `${digits(hijriToday.day)} ${hijriToday.monthName} ${digits(hijriToday.year)} هـ`;
  }, [hijriToday]);

  const qiblaDistance = useMemo(() => {
    const R = 6371;
    const kaabaLat = (21.4225 * Math.PI) / 180;
    const kaabaLng = (39.8262 * Math.PI) / 180;
    const phi1 = (safeLat * Math.PI) / 180;
    const deltaPhi = kaabaLat - phi1;
    const deltaLambda = kaabaLng - (safeLng * Math.PI) / 180;
    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(kaabaLat) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }, [safeLat, safeLng]);

  const sunnahDays = useMemo(() => {
    return getUpcomingSunnahDays(dayDate, Number(settings.hijriDateOffset) || 0);
  }, [settings.hijriDateOffset, dayDate]);

  const filteredReligiousHolidays = useMemo(() => {
    if (!sunnahDays.religiousHolidays) return [];
    if (occasionsFilter === 'all') return sunnahDays.religiousHolidays.items;
    return sunnahDays.religiousHolidays.items.filter((it) => it.category === occasionsFilter);
  }, [sunnahDays.religiousHolidays, occasionsFilter]);

  const fastingSchedule = useMemo(() => {
    const todayMidnight = new Date(dayDate);
    todayMidnight.setHours(0, 0, 0, 0);
    const getDiffDays = (targetDate: Date) => {
      const d = new Date(targetDate);
      d.setHours(0, 0, 0, 0);
      return Math.round((d.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
    };

    const monDiff = getDiffDays(sunnahDays.nextMonday.date);
    const thuDiff = getDiffDays(sunnahDays.nextThursday.date);

    const monRel = monDiff === 0 ? 'اليوم' : monDiff === 1 ? 'غدًا' : `بعد ${digits(monDiff)} أيام`;
    const thuRel = thuDiff === 0 ? 'اليوم' : thuDiff === 1 ? 'غدًا' : `بعد ${digits(thuDiff)} أيام`;

    const formatFullDate = (d: Date) =>
      arFullDateFmt ? arFullDateFmt.format(d) : toLocalDateString(d);

    return {
      mon: {
        name: 'صيام الإثنين القادم',
        rel: monRel,
        dateStr: formatFullDate(sunnahDays.nextMonday.date),
        diff: monDiff,
        countdown: sunnahDays.nextMonday.countdown,
      },
      thu: {
        name: 'صيام الخميس القادم',
        rel: thuRel,
        dateStr: formatFullDate(sunnahDays.nextThursday.date),
        diff: thuDiff,
        countdown: sunnahDays.nextThursday.countdown,
      },
      whiteDays: {
        name: `الأيام البيض لشهر ${sunnahDays.whiteDays.monthName}`,
        days: '١٣ و ١٤ و ١٥',
        isCurrent: sunnahDays.whiteDays.isCurrent,
        countdown: sunnahDays.whiteDays.countdown,
        startDateStr: sunnahDays.whiteDays.startDateStr,
        endDateStr: sunnahDays.whiteDays.endDateStr,
        formattedStartDate: sunnahDays.whiteDays.formattedStartDate,
        formattedEndDate: sunnahDays.whiteDays.formattedEndDate,
      },
    };
  }, [sunnahDays, dayDate]);


  const fajrTimeObj = prayer?.times.find((t) => t.key === 'fajr');
  const maghribTimeObj = prayer?.times.find((t) => t.key === 'maghrib');
  const ishaTimeObj = prayer?.times.find((t) => t.key === 'isha');
  const fajrMinutes = fajrTimeObj ? fajrTimeObj.minutesFromMidnight : 303;
  const maghribMinutes = maghribTimeObj ? maghribTimeObj.minutesFromMidnight : 1090;
  const ishaMinutes = ishaTimeObj ? ishaTimeObj.minutesFromMidnight : 1170;

  const currentMinute = propMinuteNow ?? (new Date().getHours() * 60 + new Date().getMinutes());
  const isAfterIsha = currentMinute > ishaMinutes;
  const exactSuhoorMinutes = calculateSuhoorTime(fajrMinutes, suhoorLead);

  // Tomorrow prayer & fasting calculations
  const tomorrowFajrMinutes = useMemo(() => {
    return tomorrowPrayer?.times.find((t) => t.key === 'fajr')?.minutes ?? 304;
  }, [tomorrowPrayer]);

  const tomorrowMaghribMinutes = useMemo(() => {
    return tomorrowPrayer?.times.find((t) => t.key === 'maghrib')?.minutes ?? 1088;
  }, [tomorrowPrayer]);

  const tomorrowSuhoorMinutes = useMemo(() => {
    return calculateSuhoorTime(tomorrowFajrMinutes, suhoorLead);
  }, [tomorrowFajrMinutes, suhoorLead]);

  const tomorrowCountdown = useMemo(() => {
    const minutesToMidnight = 1440 - currentMinute;
    const minutesToTomorrowSuhoor = minutesToMidnight + tomorrowSuhoorMinutes;
    const minutesToTomorrowFajr = minutesToMidnight + tomorrowFajrMinutes;
    const hSuhoor = Math.floor(minutesToTomorrowSuhoor / 60);
    const mSuhoor = minutesToTomorrowSuhoor % 60;
    const hFajr = Math.floor(minutesToTomorrowFajr / 60);
    const mFajr = minutesToTomorrowFajr % 60;
    return {
      suhoor: `${digits(hSuhoor)} س و ${digits(mSuhoor)} د`,
      fajr: `${digits(hFajr)} س و ${digits(mFajr)} د`,
    };
  }, [currentMinute, tomorrowSuhoorMinutes, tomorrowFajrMinutes]);

  // Next prayer timeline progress and wudu window
  const obligatoryTimes = useMemo(() => {
    return (prayer?.times || []).filter((item) => prayerKeys.includes(item.key));
  }, [prayer]);

  const { nextPrayer, prevPrayer, progressPercent, minutesUntilNext, inWuduWindow, wuduLead } = useMemo(() => {
    const lead = Number(settings.wuduLeadMinutes) || 15;
    if (!obligatoryTimes.length) {
      return {
        nextPrayer: null,
        prevPrayer: null,
        progressPercent: 0,
        minutesUntilNext: 0,
        inWuduWindow: false,
        wuduLead: lead,
      };
    }
    const upcoming = obligatoryTimes.find((p) => p.minutesFromMidnight > currentMinute);
    let nextP = upcoming || obligatoryTimes[0];
    let prevP = obligatoryTimes[obligatoryTimes.length - 1];
    if (upcoming) {
      const idx = obligatoryTimes.indexOf(upcoming);
      prevP = idx > 0 ? obligatoryTimes[idx - 1] : obligatoryTimes[obligatoryTimes.length - 1];
    }
    const diff = (nextP.minutesFromMidnight - currentMinute + 1440) % 1440;
    const interval = (nextP.minutesFromMidnight - prevP.minutesFromMidnight + 1440) % 1440 || 1;
    const elapsed = (currentMinute - prevP.minutesFromMidnight + 1440) % 1440;
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / interval) * 100)));
    const isWudu = diff <= lead && diff >= 0;
    return {
      nextPrayer: nextP,
      prevPrayer: prevP,
      progressPercent: pct,
      minutesUntilNext: diff,
      inWuduWindow: isWudu,
      wuduLead: lead,
    };
  }, [obligatoryTimes, currentMinute, settings.wuduLeadMinutes]);

  const nextPrayerCountdown = useMemo(() => {
    if (!nextPrayer) return '';
    const h = Math.floor(minutesUntilNext / 60);
    const m = minutesUntilNext % 60;
    if (h > 0) return `${h} ساعة و ${m} دقيقة`;
    return `${m} دقيقة`;
  }, [nextPrayer, minutesUntilNext]);

  const wuduStartTime = useMemo(() => {
    if (!nextPrayer) return '';
    const startM = (nextPrayer.minutesFromMidnight - wuduLead + 1440) % 1440;
    return formatMinutes(startM);
  }, [nextPrayer, wuduLead]);

  const fastingStatus = useMemo(() => {
    if (currentMinute < fajrMinutes) {
      const diff = fajrMinutes - currentMinute;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return {
        stage: 'pre-fajr',
        title: 'فاضل على أذان الفجر والإمساك',
        countdown: `${digits(h)} س و ${digits(m)} د`,
        subtext: `موعد منبه السحور: ${formatMinutes(exactSuhoorMinutes)}`,
      };
    } else if (currentMinute < maghribMinutes) {
      const diff = maghribMinutes - currentMinute;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return {
        stage: 'fasting',
        title: 'فاضل على أذان المغرب والإفطار',
        countdown: `${digits(h)} س و ${digits(m)} د`,
        subtext: 'تقبل الله صيامكم وطاعتكم',
      };
    } else {
      const diffUntilNextFajr = 1440 - currentMinute + fajrMinutes;
      const h = Math.floor(diffUntilNextFajr / 60);
      return {
        stage: 'post-maghrib',
        title: 'تقبل الله صيامكم اليوم',
        countdown: `متبقي على فجر الغد ${digits(h)} ساعة`,
        subtext: 'جهز نيتك لصيام الغد إن أردت',
      };
    }
  }, [currentMinute, fajrMinutes, maghribMinutes, exactSuhoorMinutes]);

  // Filtered prayers
  const filteredPrayers = useMemo(() => {
    const list = [...(backlog.items || [])].filter((it) => it.status !== 'removed');
    if (prayerFilter === 'all') return list;
    if (prayerFilter === 'pending') {
      return list.filter((it) => it.status === 'unconfirmed' || it.status === 'missed');
    }
    if (prayerFilter === 'unconfirmed') {
      return list.filter((it) => it.status === 'unconfirmed');
    }
    if (prayerFilter === 'missed') {
      return list.filter((it) => it.status === 'missed');
    }
    if (prayerFilter === 'resolved') {
      return list.filter((it) => it.status === 'resolved' && it.resolution === 'made-up');
    }
    if (prayerFilter === 'excused') {
      return list.filter((it) => it.status === 'resolved' && it.resolution === 'excused');
    }
    return list;
  }, [backlog.items, prayerFilter]);

  // Active or resolved fasting items
  const activeFasting = useMemo(() => {
    return [...(backlog.fastingItems || [])].filter((it) => it.status !== 'removed');
  }, [backlog.fastingItems]);

  return (
    <>
      <div className={isTimesActive ? 'sr-only' : ''}>
        <PageTitle
          title="العبادة"
          copy="مواقيت محسوبة محليًا بأعلى دقة، مع تتبع هادئ لقضاء الفوائت وبوابة متكاملة للصيام ومنبه السحور."
        />
      </div>

      {!isTimesActive && (
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            className="worship-btn-secondary"
            onClick={() => setActiveTab('times')}
          >
            <ChevronLeft size={16} style={{ transform: 'rotate(180deg)' }} />
            <span>العودة إلى صلاتك اليوم</span>
          </button>
        </div>
      )}

      {/* Segmented Top Tabs */}
      <div className={`worship-tabs ${isTimesActive ? 'sr-only' : ''}`} role="tablist" aria-label="أقسام العبادة">
        <button
          role="tab"
          aria-selected={isTimesActive}
          aria-label="مواقيت اليوم ومواعيد الصلاة والقبلة"
          className={`worship-tab ${isTimesActive ? 'active' : ''}`}
          onClick={() => setActiveTab('times')}
        >
          <Clock3 size={18} />
          <span>مواعيد الصلاة والقبلة</span>
        </button>
        <button
          role="tab"
          aria-selected={isBacklogActive}
          aria-label="قضاء الفوائت والمعلّق"
          className={`worship-tab ${isBacklogActive ? 'active' : ''}`}
          onClick={() => setActiveTab('backlog')}
        >
          <History size={18} />
          <span>قضاء الفوائت والمعلّق</span>
          {summary.totalPendingCount > 0 && (
            <span
              className="tab-badge"
              aria-label={`${digits(summary.totalPendingCount)} معلّقة`}
            >
              {digits(summary.totalPendingCount)}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={isFastingActive}
          aria-label="الصيام والسحور والمنبهات"
          className={`worship-tab ${isFastingActive ? 'active' : ''}`}
          onClick={() => setActiveTab('fasting')}
        >
          <MoonStar size={18} />
          <span>الصيام والسحور والمنبهات</span>
          {summary.pendingFastingCount > 0 && (
            <span
              className="tab-badge"
              aria-label={`${digits(summary.pendingFastingCount)} أيام صيام معلّقة`}
            >
              {digits(summary.pendingFastingCount)}
            </span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={isOccasionsActive}
          aria-label="تقويم الأعياد والمناسبات والنفحات الدينية"
          className={`worship-tab ${isOccasionsActive ? 'active' : ''}`}
          onClick={() => setActiveTab('occasions')}
        >
          <Sparkles size={18} />
          <span>الأعياد والمناسبات الدينية</span>
        </button>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 1: مواعيد الصلاة والقبلة                    */}
      {/* ---------------------------------------------------- */}
      {isTimesActive && (
        <>
          {/* Screen 1: Unified Worship & Log matching exec-366e1359-9146-4a88-93bf-a7785e9f3f2a.png */}
          <div className="worship-unified-container">
            {/* 1. Hero Card: صلاتك اليوم */}
            <div className="worship-hero-card">
              <div className="worship-hero-top">
                {/* Right: Date Block (matching TodayView) */}
                <div className="worship-hero-date-block">
                  <span className="worship-hero-weekday">{weekdayName}</span>
                  <span className="worship-hero-hijri">{hijriDateStr}</span>
                  <span className="worship-hero-gregorian">{gregorianDateStr}</span>
                </div>

                {/* Center: Live countdown to next prayer */}
                <div className="worship-hero-countdown">
                  <span className="worship-hero-countdown-kicker">
                    {nextPrayer ? `${nextPrayer.nameAr} بعد` : 'الصلاة القادمة بعد'}
                  </span>
                  <strong className="worship-hero-countdown-val">
                    {nextPrayerCountdown ? nextPrayerCountdown : '—'}
                  </strong>
                </div>

                {/* Left: Title & Subtitle Block */}
                <div className="worship-hero-title-block">
                  <h2 className="worship-hero-title">صلاتك اليوم</h2>
                  <p className="worship-hero-subtitle">حافظ على صلاتك، فكل صلاة موعد مع السكينة.</p>
                </div>
              </div>

              {/* Subtle celestial arc glow header */}
              <div className="worship-arc-container">
                <svg className="worship-arc-svg" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="worshipArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="rgba(212,151,72,0)" />
                      <stop offset="25%" stopColor="rgba(212,151,72,0.2)" />
                      <stop offset="50%" stopColor="rgba(212,151,72,0.9)" />
                      <stop offset="75%" stopColor="rgba(212,151,72,0.2)" />
                      <stop offset="100%" stopColor="rgba(212,151,72,0)" />
                    </linearGradient>
                  </defs>
                  <path d="M 30,52 Q 500,8 970,52" stroke="url(#worshipArcGrad)" strokeWidth="2.5" fill="none" />
                </svg>
                {/* Golden luminous flare crest positioned over the current prayer using left: matching TodayView */}
                <div
                  className="worship-arc-glow-crest"
                  style={{
                    left: `${TIMELINE_ANCHORS[isAfterIsha ? 'isha' : (nextPrayer?.key || 'dhuhr')] ?? 50}%`,
                  }}
                />
                <div
                  className="worship-arc-sun-dot"
                  style={{
                    left: `${TIMELINE_ANCHORS[isAfterIsha ? 'isha' : (nextPrayer?.key || 'dhuhr')] ?? 50}%`,
                  }}
                />
              </div>

              {/* 5 prayers horizontal timeline: Anchored Left-to-Right identically to TodayView */}
              <div className="worship-timeline-track" role="region" aria-label="أفق صلوات اليوم">
                <div className="worship-timeline-baseline" aria-hidden="true" />
                {[
                  { key: 'fajr', name: 'الفجر' },
                  { key: 'dhuhr', name: 'الظهر' },
                  { key: 'asr', name: 'العصر' },
                  { key: 'maghrib', name: 'المغرب' },
                  { key: 'isha', name: 'العشاء' },
                ].map((p, idx, arr) => {
                  const currentIdx = arr.findIndex((x) => x.key === (nextPrayer?.key || 'dhuhr'));
                  const pTime = prayer?.times.find((t) => t.key === p.key);
                  const pMinutes = pTime?.minutesFromMidnight ?? 0;
                  const isDone = Boolean(checks[p.key]);
                  const isCurrent = !isAfterIsha && (nextPrayer?.key || 'dhuhr') === p.key && currentMinute <= pMinutes;
                  const isPassed = !isDone && !isCurrent && (pTime ? currentMinute > pMinutes : idx < currentIdx);
                  let status = 'لاحقًا';
                  if (isDone) status = 'أُدّيت';
                  else if (isCurrent) status = 'الآن';
                  else if (isPassed) status = 'فائتة';
                  else if (!isAfterIsha && idx === currentIdx + 1) status = 'قريبًا';

                  return (
                    <button
                      key={p.key}
                      type="button"
                      className={`worship-timeline-item ${isDone ? 'completed' : isCurrent ? 'current' : isPassed ? 'missed passed' : ''}`}
                      style={{ left: `${TIMELINE_ANCHORS[p.key] ?? 50}%` }}
                      onClick={() => toggle(p.key)}
                      aria-label={isDone ? `إلغاء تأكيد أداء ${p.name}` : `تأكيد أداء ${p.name}`}
                      title={
                        isDone
                          ? `تمت صلاة ${p.name} (${formatMinutes(pMinutes)})`
                          : isPassed
                          ? `فائتة لم تُصلَ: ${p.name} (${formatMinutes(pMinutes)}) (انقر للتسجيل)`
                          : isCurrent
                          ? `صلاة ${p.name} الآن (${formatMinutes(pMinutes)}) (انقر للتسجيل)`
                          : `تسجيل صلاة ${p.name} (${formatMinutes(pMinutes)})`
                      }
                    >
                      <div className="prayer-instant-tooltip" role="tooltip" aria-hidden="true">
                        <span className="prayer-tooltip-time">{formatMinutes(pMinutes)}</span>
                        <span className="prayer-tooltip-status">
                          {isDone ? 'تمت الصلاة ✓' : isPassed ? 'فائتة' : isCurrent ? 'الصلاة الحالية' : 'تسجيل الصلاة'}
                        </span>
                      </div>
                      <div className="worship-timeline-dot">
                        {isDone && <Check size={12} style={{ color: '#fff' }} />}
                      </div>
                      <span className="worship-timeline-name">{p.name}</span>
                      <span className="worship-timeline-status">{status}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mid Row: Mid-Right (Current Prayer & Qibla) + Mid-Left (Needs Review) */}
            <div className="worship-mid-row">
              {/* Mid-Right: Current Prayer & Qibla Widget */}
              <div className="worship-card">
                <div>
                  <div className="worship-current-card-head">
                    <span className="worship-now-pill">
                      <span className="worship-now-dot" />
                      {currentMinute >= fajrMinutes && prevPrayer ? 'الوقت الحالي' : 'قبل الفجر'}
                    </span>
                  </div>
                  {(() => {
                    const currentWindowPrayer = currentMinute >= fajrMinutes ? prevPrayer : null;
                    const primaryPrayer = currentWindowPrayer || nextPrayer;
                    return (
                      <div className="worship-current-info">
                        <h3 className="worship-current-name">
                          {primaryPrayer?.nameAr || 'الفجر'}
                        </h3>
                        <p className="worship-current-kicker">
                          {currentWindowPrayer
                            ? checks[currentWindowPrayer.key]
                              ? `أدّيت صلاة ${currentWindowPrayer.nameAr} — تقبل الله`
                              : `أنت الآن في وقت صلاة ${currentWindowPrayer.nameAr}`
                            : `في انتظار أذان ${nextPrayer?.nameAr || 'الفجر'}`}
                        </p>
                        <div className="worship-current-time">
                          {primaryPrayer ? formatMinutes(primaryPrayer.minutesFromMidnight) : '—'}
                        </div>
                        <p className="worship-current-remaining">
                          {nextPrayer
                            ? `الأذان القادم: ${nextPrayer.nameAr} (${formatMinutes(nextPrayer.minutesFromMidnight)}) · متبقي ${nextPrayerCountdown || 'أقل من دقيقة'}`
                            : 'جاري تحميل مواقيت الصلاة...'}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Live Realistic Qibla Compass Widget */}
                  <div className="worship-qibla-block">
                    <div className="worship-qibla-meta">
                      <div className="worship-qibla-title-row">
                        <Compass size={18} style={{ color: 'var(--accent, #d49748)' }} />
                        <strong>اتجاه القبلة</strong>
                      </div>
                      <span className="worship-qibla-loc">
                        {settings.locationLabel || 'القاهرة، مصر'} • {digits(qiblaDistance.toLocaleString('ar-EG'))} كم إلى مكة
                      </span>
                      <span className="worship-qibla-deg-badge">
                        زاوية الانحراف: {digits(qibla.angle)}° نحو {qibla.direction}
                      </span>
                    </div>
                    <div className="worship-qibla-dial-wrap">
                      <div
                        className="worship-qibla-dial"
                        aria-label={`مؤشر القبلة الدائري بزاوية ${qibla.angle} درجة`}
                        title={`اتجاه القبلة: ${qibla.angle}° ${qibla.label}`}
                      >
                        <svg width="84" height="84" viewBox="0 0 100 100" className="worship-qibla-svg" aria-hidden="true">
                          <defs>
                            <radialGradient id="worshipCompassGrad" cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor="#1a2332" />
                              <stop offset="80%" stopColor="#0f1620" />
                              <stop offset="100%" stopColor="#080c10" />
                            </radialGradient>
                            <filter id="qiblaNeedleGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#f59e0b" floodOpacity="0.6" />
                            </filter>
                          </defs>

                          {/* Outer Dial Rim */}
                          <circle cx="50" cy="50" r="48" fill="url(#worshipCompassGrad)" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                          <circle cx="50" cy="50" r="43" fill="none" stroke="rgba(212,151,72,0.2)" strokeWidth="0.75" strokeDasharray="1.5, 3" />

                          {/* Ticks: 12 marks for 30 deg steps */}
                          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                            <line
                              key={deg}
                              x1="50"
                              y1={deg % 90 === 0 ? "5" : "7"}
                              x2="50"
                              y2={deg % 90 === 0 ? "11" : "9"}
                              stroke={deg === 0 ? "#ef4444" : "rgba(255,255,255,0.3)"}
                              strokeWidth={deg % 90 === 0 ? "1.5" : "0.75"}
                              transform={`rotate(${deg} 50 50)`}
                            />
                          ))}

                          {/* Cardinal Labels: North (ش) at top, East (ق) at right, South (ج) at bottom, West (غ) at left */}
                          <text x="50" y="19" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ef4444">ش</text>
                          <text x="83" y="53" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.75)">ق</text>
                          <text x="50" y="87" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.75)">ج</text>
                          <text x="17" y="53" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.75)">غ</text>

                          {/* Rotating Qibla Needle Group */}
                          <g className="qibla-needle-group" transform={`rotate(${qibla.angle} 50 50)`} filter="url(#qiblaNeedleGlow)">
                            {/* Golden tapered pointer to Qibla angle */}
                            <polygon points="50,14 53.5,47 50,44 46.5,47" fill="#d49748" />
                            <polygon points="50,14 46.5,47 50,44" fill="#f59e0b" />
                            {/* Counterweight tail */}
                            <polygon points="50,84 52.5,52 50,55 47.5,52" fill="#334155" />
                            <polygon points="50,84 47.5,52 50,55" fill="#475569" />
                            {/* Kaaba Golden Cube Beacon at needle tip */}
                            <rect x="46" y="8" width="8" height="8" rx="1.5" fill="#0d1219" stroke="#d49748" strokeWidth="1.2" />
                            <line x1="46" y1="11" x2="54" y2="11" stroke="#f59e0b" strokeWidth="1" />
                          </g>

                          {/* Center Pivot Pin */}
                          <circle cx="50" cy="50" r="4.5" fill="#d49748" stroke="#0d1219" strokeWidth="1.5" />
                          <circle cx="50" cy="50" r="1.5" fill="#fef08a" />
                        </svg>
                      </div>
                      <span className="worship-qibla-deg">{digits(qibla.angle)}°</span>
                    </div>
                  </div>
                </div>

                <div className="worship-current-actions">
                  <button
                    type="button"
                    className="worship-btn-primary"
                    onClick={() => {
                      const activePrayer = currentMinute >= fajrMinutes ? prevPrayer : null;
                      if (!activePrayer) {
                        toast(
                          'لم يحن وقت الصلاة بعد',
                          `موعد أذان ${nextPrayer?.nameAr || 'الفجر'} الساعة ${formatMinutes(nextPrayer?.minutesFromMidnight ?? fajrMinutes)}.`
                        );
                        return;
                      }
                      const pKey = activePrayer.key;
                      if (checks[pKey]) {
                        toast(
                          'تم تسجيل الصلاة بالفعل',
                          `تم تسجيل صلاة ${activePrayer.nameAr} مسبقًا، ولم يحن وقت صلاة ${nextPrayer?.nameAr || ''} بعد.`
                        );
                        return;
                      }
                      toggle(pKey);
                      toast('أثبت أنك صليت', `تم تسجيل صلاة ${activePrayer.nameAr} بنجاح.`);
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>أثبت إني صليت الآن</span>
                  </button>
                  <button
                    type="button"
                    className="worship-btn-secondary"
                    onClick={() => setShowDailyTimesTable((v) => !v)}
                  >
                    <Clock3 size={16} />
                    <span>عرض أوقات اليوم</span>
                  </button>
                </div>
              </div>

              {/* Mid-Left: Needs Review (محتاجة مراجعة) */}
              <div className="worship-card">
                <div>
                  <div className="worship-review-card-head">
                    <FileText size={20} style={{ color: 'var(--muted)' }} />
                    <strong>محتاجة مراجعة</strong>
                  </div>
                  <p className="worship-review-sub">بعض الصلوات لم تُسجّل بعد، يمكنك تأكيدها الآن.</p>

                  <div className="worship-review-list">
                    {(() => {
                      const pendingList = (backlog.items || []).filter(
                        (it) =>
                          (it.status === 'unconfirmed' || it.status === 'missed') &&
                          !deferredReviewIds.includes(it.id)
                      );

                      if (pendingList.length === 0) {
                        return (
                          <div className="worship-review-empty">
                            <CheckCircle2 size={24} style={{ color: 'var(--success, #22c55e)' }} />
                            <div>
                              <strong>
                                {deferredReviewIds.length > 0
                                  ? 'تم تأجيل المراجعة مؤقتاً'
                                  : 'صلواتك مسجلة بالكامل'}
                              </strong>
                              <p>
                                {deferredReviewIds.length > 0
                                  ? 'يمكنك مراجعة الصلوات المؤجلة في أي وقت من السجل الكامل.'
                                  : 'لا توجد صلوات معلّقة أو فائتة تحتاج مراجعة حالياً، بارك الله فيك.'}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return pendingList.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="worship-review-item">
                          <div className="worship-review-item-meta">
                            <strong>{item.prayerName}</strong>
                            <ChevronLeft size={14} style={{ color: 'var(--faint)' }} />
                            <span>{item.date || item.prayerDate}</span>
                          </div>
                          <div className="worship-review-item-actions">
                            <button
                              type="button"
                              className="worship-review-btn-defer"
                              onClick={() => {
                                setDeferredReviewIds((prev) =>
                                  prev.includes(item.id) ? prev : [...prev, item.id]
                                );
                                toast(
                                  'تأجيل المراجعة',
                                  `تم تأجيل مراجعة صلاة ${item.prayerName} لوقت لاحق.`
                                );
                              }}
                            >
                              راجع لاحقًا
                            </button>
                            <button
                              type="button"
                              className="worship-review-btn-confirm"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'done');
                                updateBacklog(res.state);
                                const pKey = PRAYER_NAME_TO_KEY[item.prayerName as PrayerName];
                                if (pKey) {
                                  if (item.prayerDate) {
                                    setDailyCheck(item.prayerDate, pKey as any, true);
                                  }
                                  if (isDateToday(item.prayerDate) && onCheckPrayer) {
                                    onCheckPrayer(pKey);
                                  }
                                }
                                toast('تم التأكيد', `تم تأكيد أداء صلاة ${item.prayerName}.`);
                              }}
                            >
                              تأكيد
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                <button
                  type="button"
                  className="worship-btn-full-log"
                  onClick={() => setActiveTab('backlog')}
                >
                  <ListTodo size={17} />
                  <span>عرض السجل الكامل</span>
                </button>
              </div>
            </div>

            {/* Bottom Section: Upcoming Sunnah Fasting Schedule (أيام الصيام القادمة والسنن) */}
            <div className="worship-fasting-section">
              <div className="worship-fasting-section-head">
                <div className="worship-fasting-head-right">
                  <CalendarDays size={20} style={{ color: 'var(--accent, #d49748)' }} />
                  <div>
                    <h3 className="worship-fasting-title">أيام الصيام القادمة والسنن المستحبة</h3>
                    <p className="worship-fasting-subtitle">
                      فرص الطاعات المستحبة للأيام القادمة وفق التقويم الهجري والسنة النبوية
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="worship-occasions-hub-btn"
                    onClick={() => setActiveTab('occasions')}
                    title="الانتقال لتقويم الأعياد والمناسبات والنفحات الدينية"
                  >
                    <Sparkles size={16} />
                    <span>الأعياد والمناسبات</span>
                  </button>
                  <button
                    type="button"
                    className="worship-fasting-hub-btn"
                    onClick={() => setActiveTab('fasting')}
                    title="الانتقال لمركز الصيام والسحور والمنبهات"
                  >
                    <MoonStar size={16} />
                    <span>مركز الصيام والسحور</span>
                  </button>
                </div>
              </div>

              <div className="worship-fasting-grid">
                {/* 1. Next Monday Card */}
                <div className={`worship-fasting-card ${fastingSchedule.mon.diff === 0 || fastingSchedule.mon.diff === 1 ? 'featured' : ''}`}>
                  <div className="worship-fasting-card-top">
                    <span className="worship-fasting-badge weekly">سنة أسبوعية</span>
                    <span className="worship-fasting-relative">{fastingSchedule.mon.countdown}</span>
                  </div>
                  <strong className="worship-fasting-day-name">{fastingSchedule.mon.name}</strong>
                  <span className="worship-fasting-day-date">{fastingSchedule.mon.dateStr}</span>
                  <div className="worship-fasting-card-bottom">
                    <span className="worship-fasting-note">تُعرض الأعمال على الله يومي الإثنين والخميس</span>
                    {(() => {
                      const isMonIntended = Boolean(fastingIntents[sunnahDays.nextMonday.dateStr]);
                      const isMonDone = isFastingDateCompleted(
                        sunnahDays.nextMonday.dateStr,
                        checks,
                        backlog.fastingItems
                      );
                      return (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`worship-fasting-intent-btn ${isMonIntended ? 'intended' : ''}`}
                            onClick={() =>
                              handleToggleIntent(
                                sunnahDays.nextMonday.dateStr,
                                'fasting-mon',
                                'صيام الإثنين القادم'
                              )
                            }
                          >
                            {isMonIntended ? (
                              <>
                                <Check size={14} />
                                <span>نويت الصيام</span>
                              </>
                            ) : (
                              <span>أنوي الصيام</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`sunnah-complete-btn ${isMonDone ? 'completed' : ''} ${fastingSchedule.mon.diff > 0 ? 'locked' : ''}`}
                            disabled={fastingSchedule.mon.diff > 0}
                            aria-label={isMonDone ? 'تم الصيام' : fastingSchedule.mon.diff > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                            onClick={() =>
                              handleToggleComplete(
                                sunnahDays.nextMonday.dateStr,
                                'صيام الإثنين'
                              )
                            }
                            title={fastingSchedule.mon.diff > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام الصيام'}
                          >
                            {isMonDone ? (
                              <>
                                <Check size={13} />
                                <span>تم الصيام</span>
                              </>
                            ) : fastingSchedule.mon.diff > 0 ? (
                              <>
                                <Lock size={12} />
                                <span>مغلق (يُسجل في وقته)</span>
                              </>
                            ) : (
                              <span>صمت هذا اليوم</span>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 2. Next Thursday Card */}
                <div className={`worship-fasting-card ${fastingSchedule.thu.diff === 0 || fastingSchedule.thu.diff === 1 ? 'featured' : ''}`}>
                  <div className="worship-fasting-card-top">
                    <span className="worship-fasting-badge weekly">سنة أسبوعية</span>
                    <span className="worship-fasting-relative">{fastingSchedule.thu.countdown}</span>
                  </div>
                  <strong className="worship-fasting-day-name">{fastingSchedule.thu.name}</strong>
                  <span className="worship-fasting-day-date">{fastingSchedule.thu.dateStr}</span>
                  <div className="worship-fasting-card-bottom">
                    <span className="worship-fasting-note">يُستحب صيامه تأسياً بالحبيب المصطفى ﷺ</span>
                    {(() => {
                      const isThuIntended = Boolean(fastingIntents[sunnahDays.nextThursday.dateStr]);
                      const isThuDone = isFastingDateCompleted(
                        sunnahDays.nextThursday.dateStr,
                        checks,
                        backlog.fastingItems
                      );
                      return (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`worship-fasting-intent-btn ${isThuIntended ? 'intended' : ''}`}
                            onClick={() =>
                              handleToggleIntent(
                                sunnahDays.nextThursday.dateStr,
                                'fasting-thu',
                                'صيام الخميس القادم'
                              )
                            }
                          >
                            {isThuIntended ? (
                              <>
                                <Check size={14} />
                                <span>نويت الصيام</span>
                              </>
                            ) : (
                              <span>أنوي الصيام</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`sunnah-complete-btn ${isThuDone ? 'completed' : ''} ${fastingSchedule.thu.diff > 0 ? 'locked' : ''}`}
                            disabled={fastingSchedule.thu.diff > 0}
                            aria-label={isThuDone ? 'تم الصيام' : fastingSchedule.thu.diff > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                            onClick={() =>
                              handleToggleComplete(
                                sunnahDays.nextThursday.dateStr,
                                'صيام الخميس'
                              )
                            }
                            title={fastingSchedule.thu.diff > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام الصيام'}
                          >
                            {isThuDone ? (
                              <>
                                <Check size={13} />
                                <span>تم الصيام</span>
                              </>
                            ) : fastingSchedule.thu.diff > 0 ? (
                              <>
                                <Lock size={12} />
                                <span>مغلق (يُسجل في وقته)</span>
                              </>
                            ) : (
                              <span>صمت هذا اليوم</span>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 3. White Days Card */}
                <div className={`worship-fasting-card ${fastingSchedule.whiteDays.isCurrent ? 'current-white' : ''}`}>
                  <div className="worship-fasting-card-top">
                    <span className="worship-fasting-badge monthly">سنة شهرية</span>
                    <span className="worship-fasting-relative">
                      {fastingSchedule.whiteDays.countdown}
                    </span>
                  </div>
                  <strong className="worship-fasting-day-name">{fastingSchedule.whiteDays.name}</strong>
                  <span className="worship-fasting-day-date">
                    {fastingSchedule.whiteDays.isCurrent
                      ? 'أيام ١٣ و ١٤ و ١٥ هجرياً جارية الآن'
                      : `تبدأ ${fastingSchedule.whiteDays.formattedStartDate} (أيام ١٣، ١٤، ١٥ ${sunnahDays.whiteDays.monthName})`}
                  </span>
                  <div className="worship-fasting-card-bottom">
                    <span className="worship-fasting-note">صيام ثلاثة أيام من كل شهر كصيام الدهر كله</span>
                    {(() => {
                      const firstUpcoming =
                        sunnahDays.whiteDays.items.find((w) => !w.isPassed) ||
                        sunnahDays.whiteDays.items[0];
                      const isWhiteIntended = Boolean(fastingIntents[firstUpcoming.dateStr]);
                      const isWhiteDone = isFastingDateCompleted(
                        firstUpcoming.dateStr,
                        checks,
                        backlog.fastingItems
                      );
                      return (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className={`worship-fasting-intent-btn ${isWhiteIntended ? 'intended' : ''}`}
                            onClick={() => {
                              handleToggleIntent(
                                firstUpcoming.dateStr,
                                `white-day-${firstUpcoming.dayNumber}`,
                                `الأيام البيض لشهر ${sunnahDays.whiteDays.monthName}`
                              );
                            }}
                          >
                            {isWhiteIntended ? (
                              <>
                                <Check size={14} />
                                <span>نويت الصيام</span>
                              </>
                            ) : (
                              <span>أنوي الصيام</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className={`sunnah-complete-btn ${isWhiteDone ? 'completed' : ''} ${firstUpcoming.diffDays > 0 ? 'locked' : ''}`}
                            disabled={firstUpcoming.diffDays > 0}
                            aria-label={isWhiteDone ? 'تم الصيام' : firstUpcoming.diffDays > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                            onClick={() =>
                              handleToggleComplete(
                                firstUpcoming.dateStr,
                                `الأيام البيض (${firstUpcoming.hijriDateStr})`
                              )
                            }
                            title={firstUpcoming.diffDays > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام الصيام'}
                          >
                            {isWhiteDone ? (
                              <>
                                <Check size={13} />
                                <span>تم الصيام</span>
                              </>
                            ) : firstUpcoming.diffDays > 0 ? (
                              <>
                                <Lock size={12} />
                                <span>مغلق (يُسجل في وقته)</span>
                              </>
                            ) : (
                              <span>صمت هذا اليوم</span>
                            )}
                          </button>
                          <button
                            type="button"
                            className="worship-fasting-plan-btn"
                            onClick={() => setActiveTab('fasting')}
                          >
                            <Calendar size={14} />
                            <span>تفاصيل التقويم</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
            {/* Khatma & Daily Adhkar Interactive Hub */}
            <KhatmaAdhkarSection dateKey={todayKey} triggerToast={toast} />
          </div>

          {/* Collapsible / Detailed Today Tables & Qibla Drawer */}
          <div
            ref={drawerRef}
            className="worship-detailed-drawer"
            aria-hidden={!showDailyTimesTable}
            style={
              showDailyTimesTable
                ? { marginTop: '28px' }
                : { height: 0, overflow: 'hidden', opacity: 0, margin: 0, padding: 0, visibility: 'hidden' }
            }
          >

          {summary.pendingPrayersCount > 0 && (
            <div className="backlog-jump-banner">
              <div>
                <strong>{`عندك ${digits(summary.pendingPrayersCount)} صلوات في سجل الفوائت والمعلّق.`}</strong>
                <p>تقدر تراجع حالتها أو تسجّل قضاءها بهدوء وقت فراغك.</p>
              </div>
              <button
                className="backlog-action-btn primary"
                onClick={() => setActiveTab('backlog')}
              >
                <span>افتح قضاء الفوائت</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          )}

          <div className="prayer-view-toggle-bar">
            <button
              type="button"
              className={`prayer-view-toggle-btn ${prayerViewMode === 'today' ? 'active' : ''}`}
              onClick={() => setPrayerViewMode('today')}
            >
              <Clock3 size={16} />
              <span>مواقيت اليوم</span>
            </button>
            <button
              type="button"
              className={`prayer-view-toggle-btn ${prayerViewMode === 'week' ? 'active' : ''}`}
              onClick={() => setPrayerViewMode('week')}
            >
              <Calendar size={16} />
              <span>جدول الأسبوع (٧ أيام)</span>
            </button>
            <button
              type="button"
              className={`prayer-view-toggle-btn ${prayerViewMode === 'month' ? 'active' : ''}`}
              onClick={() => setPrayerViewMode('month')}
            >
              <CalendarDays size={16} />
              <span>جدول الشهر بالكامل</span>
            </button>
          </div>

          {prayerViewMode === 'today' ? (
            <>
              {/* Next Prayer Focus & Wudu Window Hub */}
              <div className="prayer-focus-hub">
                <div className="prayer-focus-header">
                  <div className="prayer-focus-title">
                    <Clock3 size={20} style={{ color: 'var(--accent)' }} />
                    <strong>
                      الصلاة القادمة: {nextPrayer?.nameAr || 'الفجر'} (
                      {nextPrayer ? formatMinutes(nextPrayer.minutesFromMidnight) : '—'})
                    </strong>
                  </div>
                  <span className="prayer-focus-badge">
                    {nextPrayerCountdown ? `فاضل ${nextPrayerCountdown}` : 'في موعدها'}
                  </span>
                </div>

                <div className="prayer-progress-track">
                  <div
                    className="prayer-progress-fill"
                    style={{ width: `${progressPercent}%` }}
                    aria-label={`تقدم الوقت نحو الصلاة القادمة: ${progressPercent}٪`}
                  />
                </div>

                <div className={`wudu-window-box ${inWuduWindow ? 'active' : ''}`}>
                  <div className="wudu-window-info">
                    <strong>نافذة الاستعداد والوضوء لصلاة {nextPrayer?.nameAr || 'الفجر'}</strong>
                    <span>
                      يبدأ الاستعداد عند الساعة {wuduStartTime} (قبل الأذان بـ {digits(wuduLead)} دقيقة حسب إعداداتك)
                    </span>
                  </div>
                  {inWuduWindow ? (
                    <span className="wudu-active-pill">
                      <Sparkles size={14} />
                      حان وقت الوضوء والاستعداد
                    </span>
                  ) : (
                    <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 600 }}>
                      موعد الوضوء: {wuduStartTime}
                    </span>
                  )}
                </div>
              </div>

              {/* Visual Prayer Timeline */}
              <div className="prayer-timeline-card">
                <div className="prayer-timeline-header">
                  <h3>
                    <Clock3 size={18} style={{ color: 'var(--accent)' }} />
                    <span>الخط الزمني لصلوات اليوم</span>
                  </h3>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                    {prayer?.date || toLocalDateString()}
                  </span>
                </div>

                <div className="prayer-timeline-container">
                  <div className="prayer-timeline-items">
                    {(prayer?.times || []).map((item) => {
                      const isCompleted = (prayerKeys.includes(item.key) || item.key === 'sunrise') && checks[item.key];
                      const isCurrent = item.key === nextPrayer?.key;
                      return (
                        <div
                          key={item.key}
                          className={`prayer-timeline-node ${isCompleted ? 'completed' : ''} ${
                            isCurrent ? 'current' : ''
                          }`}
                        >
                          <div className="prayer-timeline-marker">
                            {isCompleted ? (
                              <Check size={16} />
                            ) : isCurrent ? (
                              <Clock3 size={16} />
                            ) : (
                              <span>{item.nameAr.slice(0, 1)}</span>
                            )}
                          </div>
                          <span className="prayer-timeline-name">{item.nameAr}</span>
                          <span className="prayer-timeline-time">
                            {formatMinutes(item.minutesFromMidnight)}
                          </span>
                          <button
                            type="button"
                            className={`prayer-timeline-check-btn ${isCompleted ? 'checked' : ''}`}
                            onClick={() => toggle(item.key)}
                            aria-label={`تأكيد أداء ${item.nameAr}`}
                          >
                            {isCompleted ? <Check size={13} /> : <Square size={13} />}
                            <span>{isCompleted ? 'أديتها' : item.key === 'sunrise' ? 'صلّيت الضحى' : 'صلّيت'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="two-column">
                <section className="surface">
                  <div className="section-heading">
                    <div>
                      <strong>مواقيت اليوم</strong>
                      <span>{prayer?.date}</span>
                    </div>
                    <span className="local-status">محلي بدون شبكة</span>
                  </div>

                  <div className="prayer-list">
                    {prayer?.times.map((item) => (
                      <div
                        className={`prayer-row ${
                          (prayerKeys.includes(item.key) || item.key === 'sunrise') && checks[item.key] ? 'complete' : ''
                        }`}
                        key={item.key}
                      >
                        <div>
                          <strong>{item.nameAr}</strong>
                          <span>
                            {item.key === 'sunrise'
                              ? 'شروق الشمس — صلاة الضحى'
                              : 'علّمها عند أداء الصلاة'}
                          </span>
                        </div>
                        <time>{formatMinutes(item.minutesFromMidnight)}</time>
                        <button
                          onClick={() => toggle(item.key)}
                          aria-label={`تبديل حالة ${item.nameAr}`}
                        >
                          {checks[item.key] ? (
                            <Check size={18} style={{ color: 'var(--success)' }} />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>

                  <p className="calculation-note">
                    <CircleHelp size={17} />
                    {prayer?.calculationNoteAr ||
                      'المواقيت تعتمد طريقة الهيئة المصرية العامة للمساحة وتحدث محليًا.'}
                  </p>
                </section>

                <aside style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Qibla Direction Compass Card */}
                  <div className="qibla-card">
                    <div className="qibla-card-head">
                      <h3>قبلة الصلاة (Qibla Direction)</h3>
                      <span>من موقعك الحالي مباشرة باتجاه الكعبة المشرفة</span>
                    </div>

                    <div
                      className="qibla-compass"
                      aria-label={`بوصلة القبلة بزاوية ${qibla.angle} درجة`}
                    >
                      <span className="qibla-cardinal north">ش</span>
                      <span className="qibla-cardinal south">ج</span>
                      <span className="qibla-cardinal east">ق</span>
                      <span className="qibla-cardinal west">غ</span>
                      <div
                        className="qibla-needle"
                        style={{ transform: `rotate(${qibla.angle}deg)` }}
                      >
                        <div className="qibla-arrow-head" />
                        <div className="qibla-needle-stem" />
                        <div className="qibla-needle-tail" />
                      </div>
                      <div className="qibla-pivot" />
                    </div>

                    <div className="qibla-angle-pill">
                      <Compass size={16} />
                      <span>{qibla.label}</span>
                    </div>

                    <p className="qibla-footnote">
                      الإحداثيات: {Math.abs(safeLat).toFixed(2)}° {safeLat >= 0 ? 'ش (N)' : 'ج (S)'} ·{' '}
                      {Math.abs(safeLng).toFixed(2)}° {safeLng >= 0 ? 'ق (E)' : 'غ (W)'}
                    </p>
                  </div>

                  <div className="surface quiet">
                    <MoonStar size={26} style={{ color: 'var(--accent)' }} />
                    <h2>تذكير بلا ضغط</h2>
                    <p>
                      التطبيق مصمم ليكون رفيقًا مساندًا يذكرك بالصلاة في وقتها، بدون إشعارات مزعجة
                      أو عدادات حرمان.
                    </p>
                    <CheckButton
                      done={!!checks.fasting}
                      onClick={() => toggle('fasting')}
                      label="أنا صائم اليوم"
                    />
                  </div>
                </aside>
              </div>
            </>
          ) : prayerViewMode === 'week' ? (
            <section className="surface">
              <div className="section-heading">
                <div>
                  <strong>مواقيت الأسبوع الحالي (٧ أيام)</strong>
                  <span>جدول مواقيت الأيام السبعة محسوب محليًا بنفس إحداثياتك</span>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPrayerViewMode('today')}
                >
                  الرجوع لمواقيت اليوم
                </button>
              </div>

              <div className="month-table-container">
                <table className="month-prayer-table">
                  <thead>
                    <tr>
                      <th>اليوم</th>
                      <th>الفجر</th>
                      <th>الشروق</th>
                      <th>الظهر</th>
                      <th>العصر</th>
                      <th>المغرب</th>
                      <th>العشاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekRows.map((row) => (
                      <tr key={row.dateStr} className={row.isToday ? 'today' : ''}>
                        <td>
                          <strong>{digits(row.day)}</strong> {row.weekdayName}
                          {row.isToday && ' (اليوم)'}
                        </td>
                        {row.times.map((t) => (
                          <td key={t.key}>{t.formatted}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="surface">
              <div className="section-heading">
                <div>
                  <strong>مواقيت شهر {monthLabel}</strong>
                  <span>جدول المواقيت الكامل محسوب محليًا بنفس إحداثياتك</span>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setPrayerViewMode('today')}
                >
                  الرجوع لمواقيت اليوم
                </button>
              </div>

              <div className="month-table-container">
                <table className="month-prayer-table">
                  <thead>
                    <tr>
                      <th>اليوم</th>
                      <th>الفجر</th>
                      <th>الشروق</th>
                      <th>الظهر</th>
                      <th>العصر</th>
                      <th>المغرب</th>
                      <th>العشاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((row) => (
                      <tr key={row.day} className={row.isToday ? 'today' : ''}>
                        <td>
                          <strong>{digits(row.day)}</strong> {row.weekdayName}
                          {row.isToday && ' (اليوم)'}
                        </td>
                        {row.times.map((t) => (
                          <td key={t.key}>{t.formatted}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          </div>
        </>
      )}


      {/* ---------------------------------------------------- */}
      {/* SECTION 2: قضاء الفوائت والمعلّق                    */}
      {/* ---------------------------------------------------- */}
      {isBacklogActive && (
        <div className="backlog-container">
          {/* Summary Cards */}
          <div className="backlog-stats-grid">
            <div className="backlog-stat-card">
              <History size={24} style={{ color: 'var(--accent)' }} />
              <strong>{digits(summary.totalPendingCount)}</strong>
              <span>صلوات وأيام صيام معلّقة</span>
              <p>
                {summary.unconfirmedPrayersCount > 0
                  ? `${digits(summary.unconfirmedPrayersCount)} غير مؤكدة و ${digits(
                      summary.missedPrayersCount
                    )} مسجلة كفائتة`
                  : 'لا توجد صلوات غير مؤكدة'}
              </p>
            </div>

            <div className="backlog-stat-card">
              <MoonStar size={24} style={{ color: 'var(--accent)' }} />
              <strong>{digits(summary.missedPrayersCount)}</strong>
              <span>صلوات مسجلة كفائتة</span>
              <p>مطلوب قضاؤها وقت الفراغ بهدوء</p>
            </div>

            <div className="backlog-stat-card">
              <Check size={24} style={{ color: 'var(--success)' }} />
              <strong>{digits(summary.madeUpPrayersCount + summary.madeUpFastingCount)}</strong>
              <span>فوائت تم قضاؤها (مقضية)</span>
              <p>ربنا يتقبل منك صالح الأعمال</p>
            </div>

            <div className="backlog-stat-card">
              <Sparkles size={24} style={{ color: 'var(--accent)' }} />
              <strong>{digits(summary.excusedPrayersCount + summary.excusedFastingCount)}</strong>
              <span>مسجلة بعذر شرعي</span>
              <p>لا حرج عليك ونسأل الله لك القبول</p>
            </div>
          </div>

          {/* Calm Reassurance Banner */}
          <div className="backlog-reassurance">
            <Sparkles size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>
              مفيش لوم ولا نقاط سالبة ولا مقارنات. القائمة هنا لمساعدتك تتذكر فوائتك وتقضيها
              براحتك في الأوقات التي تناسبك.
            </span>
          </div>

          {/* Missed Prayers Panel */}
          <article className="backlog-panel" aria-labelledby="prayer-backlog-heading">
            <div className="backlog-panel-head">
              <div>
                <h3 id="prayer-backlog-heading">الصلوات الفائتة والمحتاجة تأكيد</h3>
                <p>
                  الصلوات التي ينتهي وقتها تظهر هنا كـ«غير مؤكدة». القرار لك لتحديد ما إذا
                  صليتها في وقتها، أو فاتتك لتقضيها، أو لعذر شرعي.
                </p>
              </div>
              <div className="backlog-controls">
                <span className="tab-badge">
                  {summary.pendingPrayersCount > 0
                    ? `معلّقة: ${digits(summary.pendingPrayersCount)}`
                    : 'مفيش صلوات معلّقة'}
                </span>
                <label className="auto-backlog-toggle">
                  <input
                    type="checkbox"
                    checked={backlog.autoTrack}
                    onChange={(e) => {
                      const autoTrack = e.target.checked;
                      let updated = { ...backlog, autoTrack };
                      const now = new Date();
                      const timeZone = settings.timeZone;
                      if (autoTrack && prayer?.date === todayKey && getCivilClock(now, timeZone).date === todayKey) {
                        const rec = reconcilePrayerBacklog(updated, prayer, checks, now, timeZone);
                        updated = rec.state;
                      }
                      updateBacklog(updated);
                      toast(
                        autoTrack
                          ? 'تم تشغيل المراجعة التلقائية'
                          : 'تم إيقاف المراجعة التلقائية',
                        autoTrack
                          ? 'الصلوات التي ينتهي وقتها ستظهر هنا كغير مؤكدة.'
                          : 'الصلوات المسجلة محفوظة، ولن يضاف جديد تلقائيًا.'
                      );
                    }}
                  />
                  <span>مراجعة تلقائية عند انتهاء الوقت</span>
                </label>
              </div>
            </div>

            {/* Add Prayer Form */}
            <form
              className="backlog-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const res = addPrayerBacklogItem(backlog, {
                    prayerName: addPrayerName,
                    prayerDate: addPrayerDate,
                    notes: addPrayerNotes,
                    status: 'missed',
                  });
                  updateBacklog(res.state);
                  setAddPrayerNotes('');
                  toast(
                    'تمت الإضافة للتذكير',
                    `ستظل ${addPrayerName} ظاهرة حتى تسجل قضاءها.`
                  );
                } catch (err: any) {
                  toast('تنبيه', err.message || 'راجع البيانات المدخلة');
                }
              }}
            >
              <div className="backlog-form-field">
                <label htmlFor="backlog-prayer-select">الصلاة</label>
                <select
                  id="backlog-prayer-select"
                  value={addPrayerName}
                  onChange={(e) => setAddPrayerName(e.target.value as PrayerName)}
                >
                  {PRAYER_ORDER.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="backlog-form-field">
                <label htmlFor="backlog-prayer-date">تاريخها</label>
                <input
                  id="backlog-prayer-date"
                  type="date"
                  max={toLocalDateString()}
                  value={addPrayerDate}
                  onChange={(e) => setAddPrayerDate(e.target.value)}
                  required
                />
              </div>

              <div className="backlog-form-field">
                <label htmlFor="backlog-prayer-notes">سبب أو ملاحظة (اختياري)</label>
                <input
                  id="backlog-prayer-notes"
                  type="text"
                  placeholder="مثال: نوم، سفر، نسيان..."
                  value={addPrayerNotes}
                  onChange={(e) => setAddPrayerNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="backlog-add-btn">
                <Plus size={16} />
                <span>سجّلها كفائتة</span>
              </button>
            </form>

            {/* Filter Bar */}
            <div className="backlog-filter-bar" role="group" aria-label="تصفية الصلوات">
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'pending' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('pending')}
              >
                المعلّقة والفائتة ({digits(summary.pendingPrayersCount)})
              </button>
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'unconfirmed' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('unconfirmed')}
              >
                غير مؤكدة ({digits(summary.unconfirmedPrayersCount)})
              </button>
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'missed' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('missed')}
              >
                فائتة ({digits(summary.missedPrayersCount)})
              </button>
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'resolved' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('resolved')}
              >
                تم قضاؤها ({digits(summary.madeUpPrayersCount)})
              </button>
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'excused' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('excused')}
              >
                عذر شرعي ({digits(summary.excusedPrayersCount)})
              </button>
              <button
                type="button"
                className={`backlog-filter-btn ${prayerFilter === 'all' ? 'active' : ''}`}
                onClick={() => setPrayerFilter('all')}
              >
                الكل ({digits((backlog.items || []).filter((it) => it.status !== 'removed').length)})
              </button>
            </div>

            {/* Prayers List */}
            <div className="backlog-items-list" aria-live="polite">
              {filteredPrayers.length === 0 ? (
                <div className="backlog-empty">مفيش صلوات في هذا القسم حاليًا.</div>
              ) : (
                filteredPrayers.map((item) => {
                  const isUnconfirmed = item.status === 'unconfirmed';
                  const isMissed = item.status === 'missed';
                  const isResolved = item.status === 'resolved';

                  return (
                    <div
                      key={item.id}
                      className={`backlog-item-card ${item.status}`}
                    >
                      <div className="backlog-item-header">
                        <div className="backlog-item-title">
                          <span
                            className={`backlog-status-badge ${
                              isResolved && item.resolution ? item.resolution : item.status
                            }`}
                          >
                            {isUnconfirmed
                              ? '؟ غير مؤكدة'
                              : isMissed
                              ? '! فائتة'
                              : item.resolution === 'made-up'
                              ? '✓ تم قضاؤها'
                              : item.resolution === 'done'
                              ? '✓ صليتها في وقتها'
                              : 'عذر شرعي'}
                          </span>
                          <strong>صلاة {item.prayerName}</strong>
                          <time>{formatBacklogDate(item.prayerDate)}</time>
                        </div>
                      </div>

                      <div className="backlog-item-body">
                        {isUnconfirmed ? (
                          item.reason === 'day-rollover' ? (
                            'اليوم اتغيّر، لكن وقت العشاء يمتد حتى الفجر. اختر حالتها عندما تكون جاهزًا.'
                          ) : item.source === 'automatic' ? (
                            'وِنس أضافها لأن وقتها انتهى بدون تأكيد الأداء.'
                          ) : (
                            'أضفتها يدويًا للمتابعة.'
                          )
                        ) : isMissed ? (
                          'مسجّلة كصلاة فائتة حتى تقضيها وتسجل قضاءها.'
                        ) : item.resolution === 'made-up' ? (
                          'تم تسجيل قضائها بنجاح… تقبل الله منك.'
                        ) : item.resolution === 'done' ? (
                          'تم تأكيد أدائها في وقتها.'
                        ) : (
                          'مسجّلة كعذر شرعي.'
                        )}

                        {item.notes && (
                          <div>
                            <span className="backlog-item-notes">{item.notes}</span>
                          </div>
                        )}
                      </div>

                      <div className="backlog-actions-row">
                        {isUnconfirmed && (
                          <>
                            <button
                              type="button"
                              className="backlog-action-btn primary"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'done');
                                updateBacklog(res.state);
                                const pKey = PRAYER_NAME_TO_KEY[item.prayerName];
                                if (pKey) {
                                  if (item.prayerDate) {
                                    setDailyCheck(item.prayerDate, pKey as any, true);
                                  }
                                  if (isDateToday(item.prayerDate) && onCheckPrayer) {
                                    onCheckPrayer(pKey);
                                  }
                                }
                                toast(
                                  'تم التأكيد',
                                  `تم تسجيل ${item.prayerName} كصلاة مؤداة في وقتها… تقبل الله منك.`
                                );
                              }}
                            >
                              صليتها في وقتها
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = markPrayerBacklogAsMissed(backlog, item.id);
                                updateBacklog(res.state);
                                toast(
                                  'ستظل للتذكير',
                                  `تم تسجيل ${item.prayerName} كفائتة لقضائها وقت فراغك.`
                                );
                              }}
                            >
                              فاتتني
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'excused');
                                updateBacklog(res.state);
                                toast('عذر شرعي', `تم تسجيل عذر شرعي لـ ${item.prayerName}.`);
                              }}
                            >
                              عذر شرعي
                            </button>
                          </>
                        )}

                        {isMissed && (
                          <>
                            <button
                              type="button"
                              className="backlog-action-btn success"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'made-up');
                                updateBacklog(res.state);
                                const pKey = PRAYER_NAME_TO_KEY[item.prayerName];
                                if (pKey) {
                                  if (item.prayerDate) {
                                    setDailyCheck(item.prayerDate, pKey as any, true);
                                  }
                                  if (isDateToday(item.prayerDate) && onCheckPrayer) {
                                    onCheckPrayer(pKey);
                                  }
                                }
                                toast(
                                  'تقبل الله قضاءك',
                                  `تم تسجيل قضاء ${item.prayerName} وخروجها من الفوائت.`
                                );
                              }}
                            >
                              <Check size={16} />
                              <span>قضيتها</span>
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'done');
                                updateBacklog(res.state);
                                const pKey = PRAYER_NAME_TO_KEY[item.prayerName];
                                if (pKey) {
                                  if (item.prayerDate) {
                                    setDailyCheck(item.prayerDate, pKey as any, true);
                                  }
                                  if (isDateToday(item.prayerDate) && onCheckPrayer) {
                                    onCheckPrayer(pKey);
                                  }
                                }
                                toast(
                                  'تم التأكيد',
                                  `تم تسجيل ${item.prayerName} كصلاة مؤداة في وقتها.`
                                );
                              }}
                            >
                              صليتها في وقتها
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolvePrayerBacklogItem(backlog, item.id, 'excused');
                                updateBacklog(res.state);
                                toast('عذر شرعي', `تم تسجيل عذر شرعي لـ ${item.prayerName}.`);
                              }}
                            >
                              عذر شرعي
                            </button>
                          </>
                        )}

                        {isResolved && (
                          <button
                            type="button"
                            className="backlog-action-btn"
                            onClick={() => {
                              const res = reopenPrayerBacklogItem(backlog, item.id);
                              updateBacklog(res.state);
                              toast(
                                'إعادة فتح',
                                `تمت إعادة ${item.prayerName} لقائمة المراجعة.`
                              );
                            }}
                          >
                            <RefreshCw size={14} />
                            <span>إعادة فتح</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>

          {/* Missed Fasting Panel (accessible in Backlog view) */}
          <article className="backlog-panel" aria-labelledby="fasting-backlog-heading">
            <div className="backlog-panel-head">
              <div>
                <h3 id="fasting-backlog-heading">أيام الصيام الفائتة والمحتاجة قضاء</h3>
                <p>
                  سجّل أيام الصيام التي عليك (قضاء رمضان، نذر، كفارة) وتابع قضاءها بهدوء.
                </p>
              </div>
              <div className="backlog-controls">
                <span className="tab-badge">
                  {summary.pendingFastingCount > 0
                    ? `أيام معلّقة: ${digits(summary.pendingFastingCount)}`
                    : 'مفيش أيام معلّقة'}
                </span>
                <label className="auto-backlog-toggle">
                  <input
                    type="checkbox"
                    checked={backlog.autoReviewFasting}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      updateBacklog({ ...backlog, autoReviewFasting: enabled });
                      toast(
                        enabled
                          ? 'تم تفعيل مراجعة الصيام'
                          : 'تم إيقاف مراجعة الصيام',
                        enabled
                          ? 'أيام الصيام المخططة ورمضان ستراجع بعد المغرب.'
                          : 'المسجل حاليًا محفوظ، ولن يضاف جديد تلقائيًا.'
                      );
                    }}
                  />
                  <span>مراجعة الصيام المخطط</span>
                </label>
              </div>
            </div>

            {/* Fasting Add Form */}
            <form
              className="backlog-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const res = addFastingBacklogItem(backlog, {
                    fastingDate: fastingFormDate,
                    fastingType: fastingFormType,
                    notes: fastingFormNotes,
                  });
                  updateBacklog(res.state);
                  setFastingFormNotes('');
                  toast(
                    'تم تسجيل يوم الصيام',
                    `سيظل ${fastingFormType} في قائمة الفوائت حتى تسجل قضاءه.`
                  );
                } catch (err: any) {
                  toast('تنبيه', err.message || 'راجع تاريخ الصيام');
                }
              }}
            >
              <div className="backlog-form-field">
                <label htmlFor="backlog-fasting-type">نوع الصيام</label>
                <select
                  id="backlog-fasting-type"
                  value={fastingFormType}
                  onChange={(e) => setFastingFormType(e.target.value)}
                >
                  <option value="قضاء رمضان">قضاء رمضان</option>
                  <option value="يوم من رمضان">يوم من رمضان</option>
                  <option value="نذر">نذر</option>
                  <option value="صيام مخطط">صيام مخطط</option>
                  <option value="آخر">آخر</option>
                </select>
              </div>

              <div className="backlog-form-field">
                <label htmlFor="backlog-fasting-date">تاريخ اليوم</label>
                <input
                  id="backlog-fasting-date"
                  type="date"
                  max={toLocalDateString()}
                  value={fastingFormDate}
                  onChange={(e) => setFastingFormDate(e.target.value)}
                  required
                />
              </div>

              <div className="backlog-form-field">
                <label htmlFor="backlog-fasting-notes">ملاحظة (اختياري)</label>
                <input
                  id="backlog-fasting-notes"
                  type="text"
                  placeholder="سبب الفطر أو نية القضاء..."
                  value={fastingFormNotes}
                  onChange={(e) => setFastingFormNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="backlog-add-btn">
                <Plus size={16} />
                <span>سجّله كفائت</span>
              </button>
            </form>

            {/* Fasting Items List */}
            <div className="backlog-items-list" aria-live="polite">
              {activeFasting.length === 0 ? (
                <div className="backlog-empty">مفيش أيام صيام مسجلة كفائتة حاليًا.</div>
              ) : (
                activeFasting.map((item) => {
                  const isPending = item.status === 'unconfirmed' || item.status === 'missed';
                  const isResolved = item.status === 'resolved';

                  return (
                    <div
                      key={item.id}
                      className={`backlog-item-card ${item.status}`}
                    >
                      <div className="backlog-item-header">
                        <div className="backlog-item-title">
                          <span
                            className={`backlog-status-badge ${
                              isResolved && item.resolution ? item.resolution : item.status
                            }`}
                          >
                            {isPending
                              ? '! صيام مطلوب قضاؤه'
                              : item.resolution === 'fasted'
                              ? '✓ صيم في وقته'
                              : item.resolution === 'made-up'
                              ? '✓ تم قضاؤه'
                              : item.resolution === 'excused'
                              ? 'عذر شرعي'
                              : 'غير مطلوب'}
                          </span>
                          <strong>{item.fastingType}</strong>
                          <time>{formatBacklogDate(item.fastingDate)}</time>
                        </div>
                      </div>

                      {item.notes && (
                        <div className="backlog-item-body">
                          <span className="backlog-item-notes">{item.notes}</span>
                        </div>
                      )}

                      <div className="backlog-actions-row">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              className="backlog-action-btn success"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'made-up');
                                updateBacklog(res.state);
                                if (isDateToday(item.fastingDate) && onCheckFasting) {
                                  onCheckFasting();
                                }
                                toast(
                                  'تقبل الله صيامك',
                                  `تم تسجيل قضاء ${item.fastingType}.`
                                );
                              }}
                            >
                              <Check size={16} />
                              <span>قضيته</span>
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'fasted');
                                updateBacklog(res.state);
                                if (isDateToday(item.fastingDate) && onCheckFasting) {
                                  onCheckFasting();
                                }
                                toast(
                                  'تم التأكيد',
                                  `تم تسجيل صيام اليوم في وقته… تقبل الله منك.`
                                );
                              }}
                            >
                              صمته في وقته
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'excused');
                                updateBacklog(res.state);
                                toast('عذر شرعي', 'تم تسجيل عذر شرعي.');
                              }}
                            >
                              عذر شرعي
                            </button>
                          </>
                        )}

                        {isResolved && (
                          <button
                            type="button"
                            className="backlog-action-btn"
                            onClick={() => {
                              const res = reopenFastingBacklogItem(backlog, item.id);
                              updateBacklog(res.state);
                              toast(
                                'إعادة فتح',
                                'تمت إعادة يوم الصيام إلى قائمة الفوائت.'
                              );
                            }}
                          >
                            <RefreshCw size={14} />
                            <span>إعادة فتح</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* SECTION 3: الصيام والسحور والمنبهات                */}
      {/* ---------------------------------------------------- */}
      {isFastingActive && (
        <div className="fasting-hub-container">
          {/* Hero Card: Today Fasting & Countdown */}
          <div className="fasting-hero-card">
            <div className="fasting-hero-head">
              <div className="fasting-hero-title">
                <h2>
                  <MoonStar size={24} style={{ color: 'var(--accent)' }} />
                  <span>الصيام والسحور والمنبهات</span>
                </h2>
                <p>
                  متابعة أوقات الإمساك والإفطار، ضبط منبه السحور بهدوء، ومتابعة أيام السنن وقضاء
                  الصيام.
                </p>
              </div>

              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-full)',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                }}
              >
                {digits(hijriToday.day)} {hijriToday.monthName} {digits(hijriToday.year)} هـ
              </div>
            </div>

            <div className="fasting-countdown-box">
              <div className="fasting-countdown-meta">
                <strong>{fastingStatus.title}</strong>
                <span
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: 'var(--accent)',
                    margin: '4px 0',
                    lineHeight: 1.2,
                  }}
                >
                  {fastingStatus.countdown}
                </span>
                <span>{fastingStatus.subtext}</span>
              </div>

              <div className="fasting-times-row">
                <div className="fasting-time-pill">
                  <span>الإمساك / أذان الفجر</span>
                  <strong>{formatMinutes(fajrMinutes)}</strong>
                </div>
                <div className="fasting-time-pill">
                  <span>الإفطار / أذان المغرب</span>
                  <strong>{formatMinutes(maghribMinutes)}</strong>
                </div>
                <div className="fasting-time-pill">
                  <span>منبه السحور</span>
                  <strong>{formatMinutes(exactSuhoorMinutes)}</strong>
                </div>
              </div>

              <CheckButton
                done={!!checks.fasting}
                onClick={() => toggle('fasting')}
                label="أنا صائم اليوم"
              />
            </div>
          </div>

          {/* Tomorrow's Fasting & Suhoor Preview Card */}
          <section className="tomorrow-fasting-card" aria-labelledby="tomorrow-fasting-heading">
            <div className="tomorrow-fasting-head">
              <h3 id="tomorrow-fasting-heading">
                <CalendarDays size={20} style={{ color: 'var(--accent)' }} />
                <span>سحور وصيام الغد (Tomorrow's Fasting & Suhoor)</span>
              </h3>
              <span className="tab-badge">مواقيت الغد المحسوبة</span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
              مواقيت محسوبة مسبقًا لمساعدتك على ترتيب سحورك وتثبيت نيتك قبل النوم بهدوء.
            </p>

            <div className="tomorrow-fasting-grid">
              <div className="tomorrow-pill">
                <span>موعد منبه سحور الغد</span>
                <strong>{formatMinutes(tomorrowSuhoorMinutes)}</strong>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                  فاضل: {tomorrowCountdown.suhoor}
                </span>
              </div>
              <div className="tomorrow-pill">
                <span>إمساك وفجر الغد</span>
                <strong>{formatMinutes(tomorrowFajrMinutes)}</strong>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                  فاضل: {tomorrowCountdown.fajr}
                </span>
              </div>
              <div className="tomorrow-pill">
                <span>إفطار ومغرب الغد</span>
                <strong>{formatMinutes(tomorrowMaghribMinutes)}</strong>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  موعد الإفطار غدًا بإذن الله
                </span>
              </div>
            </div>
          </section>

          {/* Suhoor Alarm Controls Panel */}
          <article className="suhoor-alarm-panel">
            <div className="suhoor-panel-head">
              <div>
                <h3>
                  <Bell size={20} style={{ color: 'var(--accent)' }} />
                  <span>منبه وتذكير السحور — الاستيقاظ والماء (Suhoor Wake-Up Alarm)</span>
                </h3>
                <p>
                  منبه استيقاظ حقيقي عالي الصوت ومستمر الرنين يخترق ساعات الهدوء ويعمل حتى لو كان البرنامج مصغّراً، مع تحدي استيقاظ يمنعك من إغلاقه وأنت نائم.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  className={`tab-badge ${
                    settings.notifications?.fastingEnabled ? 'active' : ''
                  }`}
                  style={{
                    background: settings.notifications?.fastingEnabled
                      ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                      : 'var(--bg-elevated)',
                    color: settings.notifications?.fastingEnabled
                      ? 'var(--success)'
                      : 'var(--muted)',
                  }}
                >
                  {settings.notifications?.fastingEnabled ? 'منبه السحور مسلّح ومفعّل' : 'منبه السحور متوقف'}
                </span>
                <label className="auto-backlog-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.notifications?.fastingEnabled)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      handleUpdateSuhoorSettings({
                        notifications: { fastingEnabled: checked },
                      });
                    }}
                  />
                  <span>تشغيل منبه السحور</span>
                </label>
              </div>
            </div>

            {/* Suhoor Lead Time Selector */}
            <div className="suhoor-lead-selector">
              <label>وقت التنبيه قبل أذان الفجر (منبه الاستيقاظ):</label>
              <div className="suhoor-lead-options">
                {[15, 30, 45, 60, 75, 90].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`suhoor-lead-btn ${suhoorLead === mins ? 'active' : ''}`}
                    onClick={() => handleLeadChange(mins)}
                  >
                    قبل الفجر بـ {digits(mins)} دقيقة {mins === 45 ? '(موصى به)' : ''}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                موعد رنين السحور القادم: <strong>{formatMinutes(exactSuhoorMinutes)}</strong> (قبل الفجر بـ{' '}
                {digits(suhoorLead)} دقيقة) • يليه تنبيه شرب الماء والإمساك قبل الفجر بـ{' '}
                {digits(settings.imsakWaterLeadMinutes ?? 15)} دقيقة.
              </span>
            </div>

            {/* Wake-Up Protection & Multi-Stage Controls */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                marginTop: '14px',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={settings.suhoorWakeChallenge ?? true}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({ suhoorWakeChallenge: e.target.checked })
                  }
                />
                <span>
                  <strong>تحدي إثبات الاستيقاظ:</strong> اشتراط حل مسألة أو كتابة «نويت الصيام» لإغلاق المنبه
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={(settings.suhoorWakeCheckMinutes ?? 5) > 0}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({
                      suhoorWakeCheckMinutes: e.target.checked ? 5 : 0,
                    })
                  }
                />
                <span>
                  <strong>فحص ما بعد الاستيقاظ:</strong> إعادة الرنين بعد ٥ دقائق إذا عدت للنوم
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={(settings.imsakWaterLeadMinutes ?? 15) > 0}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({
                      imsakWaterLeadMinutes: e.target.checked ? 15 : 0,
                    })
                  }
                />
                <span>
                  <strong>تنبيه الماء والإمساك:</strong> تذكير إضافي قبل أذان الفجر بـ ١٥ دقيقة
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={settings.preventSleepForSuhoor ?? true}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({ preventSleepForSuhoor: e.target.checked })
                  }
                />
                <span>
                  <strong>منع سكون الجهاز ليلاً:</strong> إبقاء المؤقت نشطاً حتى لو أُغلقت الشاشة
                </span>
              </label>
            </div>

            {/* Audio Mode & Volume Controls */}
            <div className="suhoor-preview-row" style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  قوة ونوع صوت منبه السحور:
                </label>
                <select
                  value={settings.audio?.fasting || 'strong-alarm'}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({
                      audio: { fasting: e.target.value as any },
                    })
                  }
                  style={{
                    minHeight: '44px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                >
                  <option value="strong-alarm">🚨 منبه استيقاظ قوي متكرر (Strong Wake-Up Alarm - موصى به)</option>
                  <option value="adhan">🕌 صوت الأذان الكامل المتكرر (Adhan)</option>
                  <option value="gentle-chime">🔔 رنين متكرر هادئ (Gentle Chime)</option>
                  <option value="silent">🔕 صامت (إشعار مرئي فقط — لا يوقظ النائم)</option>
                </select>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  flex: 1,
                  minWidth: '160px',
                }}
              >
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  مستوى الصوت المبدئي: {digits(settings.audio?.volume ?? 85)}٪ (يتصاعد تلقائياً إلى ١٠٠٪)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.audio?.volume ?? 85}
                  onChange={(e) =>
                    handleUpdateSuhoorSettings({
                      audio: { volume: Number(e.target.value) },
                    })
                  }
                  style={{ minHeight: '32px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', minHeight: '44px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleTestSuhoorAudio}
                >
                  <Volume2 size={16} />
                  <span>تجربة نغمة السحور</span>
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleTestFullWakeChallenge}
                >
                  <Bell size={16} />
                  <span>تجربة شاشة المنبه القوي والتحدي</span>
                </button>
                {suhoorAudioTesting && (
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    onClick={handleStopSuhoorAudio}
                  >
                    <span>إيقاف الصوت الآن</span>
                  </button>
                )}
              </div>
            </div>

            {suhoorSaving && (
              <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginTop: '8px' }}>
                جارٍ الحفظ والجدولة محليًا...
              </div>
            )}
          </article>

          {/* Sunnah Fasting Calendar */}
          <section className="surface" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="section-heading">
              <div>
                <strong>تقويم صيام السُنن</strong>
                <span>أيام مستحب صيامها وفق التقويم الهجري والنبوي الشريف</span>
              </div>
            </div>

            <div className="sunnah-days-grid">
              {/* Card 1: Monday & Thursday */}
              <div className={`sunnah-day-card ${sunnahDays.nextMonday.isToday || sunnahDays.nextThursday.isToday ? 'highlight' : ''}`}>
                <div className="sunnah-day-header">
                  <strong>صيام الإثنين والخميس</strong>
                  <span className="tab-badge">أسبوعي</span>
                </div>

                <div className="sunnah-countdown-highlight">
                  <span className="sunnah-countdown-label">
                    {sunnahDays.nearestFast.isToday ? 'اليوم يوم الصيام المستحب' : 'أقرب صيام قادم:'}
                  </span>
                  <strong className="sunnah-countdown-val">
                    <Clock3 size={15} />
                    <span>{sunnahDays.nearestFast.name} — {sunnahDays.nearestFast.countdown}</span>
                  </strong>
                </div>

                <div className="sunnah-sub-list">
                  {/* Monday */}
                  {(() => {
                    const monDateStr = sunnahDays.nextMonday.dateStr;
                    const isMonIntended = Boolean(fastingIntents[monDateStr]);
                    const isMonDone = isFastingDateCompleted(monDateStr, checks, backlog.fastingItems);
                    return (
                      <div className={`sunnah-sub-item ${sunnahDays.nextMonday.isToday ? 'today-highlight' : ''}`}>
                        <div className="sunnah-sub-item-header">
                          <div className="sunnah-sub-item-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>الإثنين القادم</strong>
                              <span className="sunnah-pill-date">{sunnahDays.nextMonday.dayName}</span>
                            </div>
                            <span className="sunnah-sub-item-dates">
                              <span>الميلادي: {sunnahDays.nextMonday.formattedDate}</span>
                              <span>•</span>
                              <span>الهجري: {sunnahDays.nextMonday.hijriDateStr}</span>
                            </span>
                          </div>
                          <span className="sunnah-pill-countdown">{sunnahDays.nextMonday.countdown}</span>
                        </div>

                        <div className="sunnah-sub-item-footer">
                          <div className="sunnah-item-actions">
                            <button
                              type="button"
                              className={`sunnah-intent-btn ${isMonIntended ? 'intended' : ''}`}
                              onClick={() => handleToggleIntent(monDateStr, 'fasting-mon', 'صيام الإثنين القادم')}
                              title="تحديد نية صيام الإثنين"
                            >
                              {isMonIntended ? (
                                <>
                                  <Check size={13} />
                                  <span>نويت الصيام</span>
                                </>
                              ) : (
                                <span>أنوي الصيام</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`sunnah-complete-btn ${isMonDone ? 'completed' : ''} ${sunnahDays.nextMonday.diffDays > 0 ? 'locked' : ''}`}
                              disabled={sunnahDays.nextMonday.diffDays > 0}
                              aria-label={isMonDone ? 'تم الصيام' : sunnahDays.nextMonday.diffDays > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                              onClick={() => handleToggleComplete(monDateStr, 'صيام الإثنين')}
                              title={sunnahDays.nextMonday.diffDays > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام صيام الإثنين في سجل المحاسبة'}
                            >
                              {isMonDone ? (
                                <>
                                  <Check size={13} />
                                  <span>تم الصيام</span>
                                </>
                              ) : sunnahDays.nextMonday.diffDays > 0 ? (
                                <>
                                  <Lock size={12} />
                                  <span>مغلق (يُسجل في وقته)</span>
                                </>
                              ) : (
                                <span>صمت هذا اليوم</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Thursday */}
                  {(() => {
                    const thuDateStr = sunnahDays.nextThursday.dateStr;
                    const isThuIntended = Boolean(fastingIntents[thuDateStr]);
                    const isThuDone = isFastingDateCompleted(thuDateStr, checks, backlog.fastingItems);
                    return (
                      <div className={`sunnah-sub-item ${sunnahDays.nextThursday.isToday ? 'today-highlight' : ''}`}>
                        <div className="sunnah-sub-item-header">
                          <div className="sunnah-sub-item-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>الخميس القادم</strong>
                              <span className="sunnah-pill-date">{sunnahDays.nextThursday.dayName}</span>
                            </div>
                            <span className="sunnah-sub-item-dates">
                              <span>الميلادي: {sunnahDays.nextThursday.formattedDate}</span>
                              <span>•</span>
                              <span>الهجري: {sunnahDays.nextThursday.hijriDateStr}</span>
                            </span>
                          </div>
                          <span className="sunnah-pill-countdown">{sunnahDays.nextThursday.countdown}</span>
                        </div>

                        <div className="sunnah-sub-item-footer">
                          <div className="sunnah-item-actions">
                            <button
                              type="button"
                              className={`sunnah-intent-btn ${isThuIntended ? 'intended' : ''}`}
                              onClick={() => handleToggleIntent(thuDateStr, 'fasting-thu', 'صيام الخميس القادم')}
                              title="تحديد نية صيام الخميس"
                            >
                              {isThuIntended ? (
                                <>
                                  <Check size={13} />
                                  <span>نويت الصيام</span>
                                </>
                              ) : (
                                <span>أنوي الصيام</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`sunnah-complete-btn ${isThuDone ? 'completed' : ''} ${sunnahDays.nextThursday.diffDays > 0 ? 'locked' : ''}`}
                              disabled={sunnahDays.nextThursday.diffDays > 0}
                              aria-label={isThuDone ? 'تم الصيام' : sunnahDays.nextThursday.diffDays > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                              onClick={() => handleToggleComplete(thuDateStr, 'صيام الخميس')}
                              title={sunnahDays.nextThursday.diffDays > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام صيام الخميس في سجل المحاسبة'}
                            >
                              {isThuDone ? (
                                <>
                                  <Check size={13} />
                                  <span>تم الصيام</span>
                                </>
                              ) : sunnahDays.nextThursday.diffDays > 0 ? (
                                <>
                                  <Lock size={12} />
                                  <span>مغلق (يُسجل في وقته)</span>
                                </>
                              ) : (
                                <span>صمت هذا اليوم</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <p style={{ marginTop: '2px' }}>
                  تُعرض الأعمال على الله يومي الإثنين والخميس، وكان النبي ﷺ يحب أن يُعرض عمله وهو صائم.
                </p>
              </div>

              {/* Card 2: White Days */}
              <div className={`sunnah-day-card ${sunnahDays.whiteDays.isCurrent ? 'highlight' : ''}`}>
                <div className="sunnah-day-header">
                  <strong>الأيام البيض (١٣، ١٤، ١٥)</strong>
                  <span className="tab-badge">شهري</span>
                </div>

                <div className="sunnah-countdown-highlight">
                  <span className="sunnah-countdown-label">
                    {sunnahDays.whiteDays.isCurrent
                      ? 'الأيام البيض جارية الآن'
                      : `الأيام البيض القادمة (شهر ${sunnahDays.whiteDays.monthName}):`}
                  </span>
                  <strong className="sunnah-countdown-val">
                    <Clock3 size={15} />
                    <span>{sunnahDays.whiteDays.countdown}</span>
                  </strong>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span>تاريخ البداية (١٣ {sunnahDays.whiteDays.monthName}): {sunnahDays.whiteDays.formattedStartDate}</span>
                    <span>•</span>
                    <span>تاريخ النهاية (١٥ {sunnahDays.whiteDays.monthName}): {sunnahDays.whiteDays.formattedEndDate}</span>
                  </div>
                </div>

                <div className="sunnah-sub-list">
                  {sunnahDays.whiteDays.items.map((dayItem) => {
                    const isIntended = Boolean(fastingIntents[dayItem.dateStr]);
                    const isDone = isFastingDateCompleted(dayItem.dateStr, checks, backlog.fastingItems);
                    return (
                      <div
                        key={dayItem.dayNumber}
                        className={`sunnah-sub-item ${dayItem.isToday ? 'today-highlight' : ''}`}
                      >
                        <div className="sunnah-sub-item-header">
                          <div className="sunnah-sub-item-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>{dayItem.dayLabel}</strong>
                              <span className="sunnah-pill-date">{dayItem.dayName}</span>
                            </div>
                            <span className="sunnah-sub-item-dates">
                              <span>الميلادي: {dayItem.formattedDate}</span>
                              <span>•</span>
                              <span>الهجري: {dayItem.hijriDateStr}</span>
                            </span>
                          </div>
                          <span className="sunnah-pill-countdown">{dayItem.countdown}</span>
                        </div>

                        <div className="sunnah-sub-item-footer">
                          <div className="sunnah-item-actions">
                            <button
                              type="button"
                              className={`sunnah-intent-btn ${isIntended ? 'intended' : ''}`}
                              onClick={() =>
                                handleToggleIntent(
                                  dayItem.dateStr,
                                  `white-day-${dayItem.dayNumber}`,
                                  `${dayItem.dayLabel} من الأيام البيض`
                                )
                              }
                              title="تحديد نية صيام هذا اليوم"
                            >
                              {isIntended ? (
                                <>
                                  <Check size={13} />
                                  <span>نويت الصيام</span>
                                </>
                              ) : (
                                <span>أنوي الصيام</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`sunnah-complete-btn ${isDone ? 'completed' : ''} ${dayItem.diffDays > 0 ? 'locked' : ''}`}
                              disabled={dayItem.diffDays > 0}
                              aria-label={isDone ? 'تم الصيام' : dayItem.diffDays > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                              onClick={() =>
                                handleToggleComplete(
                                  dayItem.dateStr,
                                  `صيام الأيام البيض (${dayItem.hijriDateStr})`
                                )
                              }
                              title={dayItem.diffDays > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام صيام هذا اليوم في سجل المحاسبة'}
                            >
                              {isDone ? (
                                <>
                                  <Check size={13} />
                                  <span>تم الصيام</span>
                                </>
                              ) : dayItem.diffDays > 0 ? (
                                <>
                                  <Lock size={12} />
                                  <span>مغلق (يُسجل في وقته)</span>
                                </>
                              ) : (
                                <span>صمت هذا اليوم</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p style={{ marginTop: '2px' }}>
                  أيام ١٣ و١٤ و١٥ من الشهر الهجري، سُميت بيضاً لاكتمال نور القمر، وصيامها يعادل صيام الدهر.
                </p>
              </div>

              {/* Card 3: Major Fasting Occasions */}
              <div className="sunnah-day-card">
                <div className="sunnah-day-header">
                  <strong>سنن ومواسم الصيام الكبرى</strong>
                  <span className="tab-badge">موسمي</span>
                </div>

                <div className="sunnah-countdown-highlight">
                  <span className="sunnah-countdown-label">
                    أقرب موسم صيام: {sunnahDays.majorOccasions.nearest.name} ({sunnahDays.majorOccasions.nearest.hijriDateStr})
                  </span>
                  <strong className="sunnah-countdown-val">
                    <Sparkles size={15} />
                    <span>{sunnahDays.majorOccasions.nearest.countdownText}</span>
                  </strong>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span>الموعد: {sunnahDays.majorOccasions.nearest.dayName}، {sunnahDays.majorOccasions.nearest.formattedDate}</span>
                  </div>
                </div>

                <div className="sunnah-occasions-scroll">
                  {sunnahDays.majorOccasions.items.slice(0, 6).map((occ) => {
                    const isIntended = Boolean(fastingIntents[occ.dateStr]);
                    const isDone = isFastingDateCompleted(occ.dateStr, checks, backlog.fastingItems);
                    return (
                      <div key={occ.id} className={`sunnah-sub-item ${occ.isToday ? 'today-highlight' : ''}`}>
                        <div className="sunnah-sub-item-header">
                          <div className="sunnah-sub-item-info">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong>{occ.name}</strong>
                              {occ.dayName && <span className="sunnah-pill-date">{occ.dayName}</span>}
                            </div>
                            <span className="sunnah-sub-item-dates">
                              <span>الميلادي: {occ.formattedDate}</span>
                              <span>•</span>
                              <span>الهجري: {occ.hijriDateStr}</span>
                            </span>
                          </div>
                          <span className="sunnah-pill-countdown">{occ.countdownText}</span>
                        </div>

                        <div className="sunnah-sub-item-footer">
                          <div className="sunnah-item-actions">
                            <button
                              type="button"
                              className={`sunnah-intent-btn ${isIntended ? 'intended' : ''}`}
                              onClick={() => handleToggleIntent(occ.dateStr, occ.id, occ.name)}
                              title="تحديد نية الصيام لهذه المناسبة"
                            >
                              {isIntended ? (
                                <>
                                  <Check size={13} />
                                  <span>نويت الصيام</span>
                                </>
                              ) : (
                                <span>أنوي الصيام</span>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`sunnah-complete-btn ${isDone ? 'completed' : ''} ${occ.diffDays > 0 ? 'locked' : ''}`}
                              disabled={occ.diffDays > 0}
                              aria-label={isDone ? 'تم الصيام' : occ.diffDays > 0 ? 'صمت هذا اليوم (مغلق حتى حلول اليوم)' : 'صمت هذا اليوم'}
                              onClick={() => handleToggleComplete(occ.dateStr, occ.name)}
                              title={occ.diffDays > 0 ? 'لا يمكن تسجيل إتمام الصيام قبل حلول اليوم' : 'تسجيل إتمام الصيام في سجل المحاسبة'}
                            >
                              {isDone ? (
                                <>
                                  <Check size={13} />
                                  <span>تم الصيام</span>
                                </>
                              ) : occ.diffDays > 0 ? (
                                <>
                                  <Lock size={12} />
                                  <span>مغلق (يُسجل في وقته)</span>
                                </>
                              ) : (
                                <span>صمت هذا اليوم</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p style={{ marginTop: '2px' }}>
                  مواعيد ومواقيت محسوبة فلكياً وفق التقويم الهجري المعتمد لحفظ وترتيب نية الصيام وإتمام الطاعات.
                </p>
              </div>
            </div>
          </section>

          {/* Dedicated Religious Holidays & Occasions Hub Banner */}
          <div className="occasions-bridge-banner">
            <div className="occasions-bridge-info">
              <div className="occasions-bridge-icon">
                <Sparkles size={22} />
              </div>
              <div>
                <strong>تقويم الأعياد والمناسبات والنفحات الدينية</strong>
                <p>
                  تم تخصيص خانة مستقلة للمناسبات النبوية الشريفة، الأعياد الكبرى، والنفحات المباركة (غير مقتصرة على الصيام) مع الفضائل والسنن والأحكام الشرعية.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveTab('occasions')}
            >
              <span>فتح تقويم المناسبات</span>
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Missed Fasting Tracker */}
          <article className="backlog-panel" aria-labelledby="fasting-tracker-heading">
            <div className="backlog-panel-head">
              <div>
                <h3 id="fasting-tracker-heading">أيام الصيام الفائتة والمحتاجة قضاء</h3>
                <p>
                  سجّل أيام الصيام التي عليك (قضاء رمضان، نذر، كفارة) وتابع قضاءها بهدوء.
                </p>
              </div>
              <div className="backlog-controls">
                <span className="tab-badge">
                  {summary.pendingFastingCount > 0
                    ? `أيام معلّقة: ${digits(summary.pendingFastingCount)}`
                    : 'مفيش أيام معلّقة'}
                </span>
                <label className="auto-backlog-toggle">
                  <input
                    type="checkbox"
                    checked={backlog.autoReviewFasting}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      updateBacklog({ ...backlog, autoReviewFasting: enabled });
                      toast(
                        enabled
                          ? 'تم تفعيل مراجعة الصيام'
                          : 'تم إيقاف مراجعة الصيام',
                        enabled
                          ? 'أيام الصيام المخططة ورمضان ستراجع بعد المغرب.'
                          : 'المسجل حاليًا محفوظ، ولن يضاف جديد تلقائيًا.'
                      );
                    }}
                  />
                  <span>مراجعة الصيام المخطط</span>
                </label>
              </div>
            </div>

            {/* Fasting Add Form */}
            <form
              className="backlog-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  const res = addFastingBacklogItem(backlog, {
                    fastingDate: fastingFormDate,
                    fastingType: fastingFormType,
                    notes: fastingFormNotes,
                  });
                  updateBacklog(res.state);
                  setFastingFormNotes('');
                  toast(
                    'تم تسجيل يوم الصيام',
                    `سيظل ${fastingFormType} في قائمة الفوائت حتى تسجل قضاءه.`
                  );
                } catch (err: any) {
                  toast('تنبيه', err.message || 'راجع تاريخ الصيام');
                }
              }}
            >
              <div className="backlog-form-field">
                <label htmlFor="fasting-type-hub">نوع الصيام</label>
                <select
                  id="fasting-type-hub"
                  value={fastingFormType}
                  onChange={(e) => setFastingFormType(e.target.value)}
                >
                  <option value="قضاء رمضان">قضاء رمضان</option>
                  <option value="يوم من رمضان">يوم من رمضان</option>
                  <option value="نذر">نذر</option>
                  <option value="صيام مخطط">صيام مخطط</option>
                  <option value="آخر">آخر</option>
                </select>
              </div>

              <div className="backlog-form-field">
                <label htmlFor="fasting-date-hub">تاريخ اليوم</label>
                <input
                  id="fasting-date-hub"
                  type="date"
                  max={toLocalDateString()}
                  value={fastingFormDate}
                  onChange={(e) => setFastingFormDate(e.target.value)}
                  required
                />
              </div>

              <div className="backlog-form-field">
                <label htmlFor="fasting-notes-hub">ملاحظة (اختياري)</label>
                <input
                  id="fasting-notes-hub"
                  type="text"
                  placeholder="سبب الفطر أو نية القضاء..."
                  value={fastingFormNotes}
                  onChange={(e) => setFastingFormNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="backlog-add-btn">
                <Plus size={16} />
                <span>سجّله كفائت</span>
              </button>
            </form>

            {/* Fasting Items List */}
            <div className="backlog-items-list" aria-live="polite">
              {activeFasting.length === 0 ? (
                <div className="backlog-empty">مفيش أيام صيام مسجلة كفائتة حاليًا.</div>
              ) : (
                activeFasting.map((item) => {
                  const isPending = item.status === 'unconfirmed' || item.status === 'missed';
                  const isResolved = item.status === 'resolved';

                  return (
                    <div
                      key={item.id}
                      className={`backlog-item-card ${item.status}`}
                    >
                      <div className="backlog-item-header">
                        <div className="backlog-item-title">
                          <span
                            className={`backlog-status-badge ${
                              isResolved && item.resolution ? item.resolution : item.status
                            }`}
                          >
                            {isPending
                              ? '! صيام مطلوب قضاؤه'
                              : item.resolution === 'fasted'
                              ? '✓ صيم في وقته'
                              : item.resolution === 'made-up'
                              ? '✓ تم قضاؤه'
                              : item.resolution === 'excused'
                              ? 'عذر شرعي'
                              : 'غير مطلوب'}
                          </span>
                          <strong>{item.fastingType}</strong>
                          <time>{formatBacklogDate(item.fastingDate)}</time>
                        </div>
                      </div>

                      {item.notes && (
                        <div className="backlog-item-body">
                          <span className="backlog-item-notes">{item.notes}</span>
                        </div>
                      )}

                      <div className="backlog-actions-row">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              className="backlog-action-btn success"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'made-up');
                                updateBacklog(res.state);
                                if (isDateToday(item.fastingDate) && onCheckFasting) {
                                  onCheckFasting();
                                }
                                toast(
                                  'تقبل الله صيامك',
                                  `تم تسجيل قضاء ${item.fastingType}.`
                                );
                              }}
                            >
                              <Check size={16} />
                              <span>قضيته</span>
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'fasted');
                                updateBacklog(res.state);
                                if (isDateToday(item.fastingDate) && onCheckFasting) {
                                  onCheckFasting();
                                }
                                toast(
                                  'تم التأكيد',
                                  `تم تسجيل صيام اليوم في وقته… تقبل الله منك.`
                                );
                              }}
                            >
                              صمته في وقته
                            </button>
                            <button
                              type="button"
                              className="backlog-action-btn"
                              onClick={() => {
                                const res = resolveFastingBacklogItem(backlog, item.id, 'excused');
                                updateBacklog(res.state);
                                toast('عذر شرعي', 'تم تسجيل عذر شرعي.');
                              }}
                            >
                              عذر شرعي
                            </button>
                          </>
                        )}

                        {isResolved && (
                          <button
                            type="button"
                            className="backlog-action-btn"
                            onClick={() => {
                              const res = reopenFastingBacklogItem(backlog, item.id);
                              updateBacklog(res.state);
                              toast(
                                'إعادة فتح',
                                'تمت إعادة يوم الصيام إلى قائمة الفوائت.'
                              );
                            }}
                          >
                            <RefreshCw size={14} />
                            <span>إعادة فتح</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* SECTION 4: تقويم الأعياد والمناسبات والنفحات الدينية  */}
      {/* ---------------------------------------------------- */}
      {isOccasionsActive && (
        <div className="occasions-hub-container">
          <div className="occasions-hub-head">
            <div className="occasions-hub-head-info">
              <h2 className="occasions-hub-title">
                <Sparkles size={24} style={{ color: 'var(--accent, #d49748)' }} />
                <span>تقويم الأعياد والمناسبات والنفحات الدينية</span>
              </h2>
              <p className="occasions-hub-subtitle">
                تقويم مستقل للأعياد الإسلامية الكبرى، المناسبات النبوية والنفحات المباركة (غير مقتصرة على الصيام) مع الفضائل والسنن والأحكام الشرعية.
              </p>
            </div>
            {sunnahDays.religiousHolidays && (
              <span className="tab-badge" style={{ fontSize: '13px', padding: '6px 14px' }}>
                {digits(sunnahDays.religiousHolidays.items.length)} مناسبات سنوية مباركة
              </span>
            )}
          </div>

          {/* Nearest Occasion Hero Banner */}
          {sunnahDays.religiousHolidays?.nearest && (
            <div className="occasions-hero-banner">
              <div className="occasions-hero-content">
                <div className="occasions-hero-top">
                  <span className="occasions-hero-kicker">أقرب مناسبة دينية قادمة</span>
                  <span className={`islamic-holiday-badge ${sunnahDays.religiousHolidays.nearest.category}`}>
                    {sunnahDays.religiousHolidays.nearest.categoryLabel}
                  </span>
                </div>
                <strong className="occasions-hero-name">
                  {sunnahDays.religiousHolidays.nearest.name}
                </strong>
                <div className="occasions-hero-dates">
                  <span>الهجري: <strong>{sunnahDays.religiousHolidays.nearest.hijriDateStr}</strong></span>
                  <span>•</span>
                  <span>الميلادي: <strong>{sunnahDays.religiousHolidays.nearest.dayName ? `${sunnahDays.religiousHolidays.nearest.dayName}، ` : ''}{sunnahDays.religiousHolidays.nearest.formattedDate}</strong></span>
                </div>
                <div className="occasions-hero-countdown-box">
                  <Clock3 size={16} />
                  <span>{sunnahDays.religiousHolidays.nearest.countdownText}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category Filter Chips */}
          <div className="occasions-filter-bar" role="tablist" aria-label="تصنيفات المناسبات">
            {[
              { id: 'all', label: 'جميع المناسبات' },
              { id: 'eid', label: 'الأعياد الكبرى وأيام التشريق' },
              { id: 'blessed_night', label: 'الليالي والنفحات المباركة' },
              { id: 'prophetic', label: 'المناسبات والذكريات النبوية' },
              { id: 'general', label: 'المواسم وبدايات الأعوام' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={occasionsFilter === cat.id}
                className={`occasions-filter-chip ${occasionsFilter === cat.id ? 'active' : ''}`}
                onClick={() => setOccasionsFilter(cat.id as any)}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Occasions Cards Grid */}
          <div className="islamic-holidays-grid">
            {filteredReligiousHolidays.map((holiday) => {
              const isEid = holiday.category === 'eid' || holiday.id === 'tashreeq_days';
              const isRecommendedFast = ['day_of_arafah', 'ashura_day'].includes(holiday.id);

              return (
                <div
                  key={holiday.id}
                  className={`islamic-holiday-card ${holiday.isToday ? 'highlight' : ''}`}
                >
                  <div className="islamic-holiday-top">
                    <strong className="islamic-holiday-title">{holiday.name}</strong>
                    <span className={`islamic-holiday-badge ${holiday.category}`}>
                      {holiday.categoryLabel}
                    </span>
                  </div>

                  <div className="islamic-holiday-dates">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>الهجري: <strong>{holiday.hijriDateStr}</strong></span>
                      <span className="sunnah-pill-countdown">{holiday.countdownText}</span>
                    </div>
                    <div>
                      الميلادي: {holiday.dayName ? `${holiday.dayName}، ` : ''}{holiday.formattedDate}
                    </div>
                  </div>

                  {/* Fasting Sharia Ruling Pill */}
                  <div className="islamic-ruling-row">
                    {isEid ? (
                      <span className="islamic-ruling-badge forbidden">
                        ⛔ يحرم صومه شرعاً (عيد وفرحة وأكل وشرب وذكر)
                      </span>
                    ) : isRecommendedFast ? (
                      <span className="islamic-ruling-badge recommended">
                        ⭐ يُستحب صومه لغير الحاج (يكفّر الذنوب)
                      </span>
                    ) : (
                      <span className="islamic-ruling-badge worship">
                        ✨ يوم ذكر وطاعة وتكبير وصلاة على النبي ﷺ
                      </span>
                    )}
                  </div>

                  <p className="islamic-holiday-desc">{holiday.virtue}</p>

                  <div className="islamic-holiday-deed">
                    <strong>العمل المستحب والسنن:</strong> {holiday.recommendedDeed}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}


/* ---------------------------------------------------- */
/* WORK VIEW (Pomodoro Countdown + Stopwatch + SQLite)  */
/* ---------------------------------------------------- */
function parseDurationSecsFromText(text: string): number {
  const ascii = String(text || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const parts = ascii.split(':').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }
  return 0;
}

function formatDurationSecs(totalSecs: number): string {
  const safe = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${digits(String(h).padStart(2, '0'))}:${digits(String(m).padStart(2, '0'))}:${digits(
    String(s).padStart(2, '0')
  )}`;
}

type WorkSessionOptions = {
  timerStarted: number | null;
  setTimerStarted: (n: number | null) => void;
  workTime: string;
  elapsedMs?: number;
  projects: BootstrapPayload['projects'];
  onResetTimer?: () => void;
  settings?: AppPreferences;
  triggerToast?: (title: string, body: string) => void;
  dataRevision?: number;
  enabled?: boolean;
};

function useWorkSession({
  timerStarted,
  setTimerStarted,
  workTime,
  elapsedMs,
  projects,
  onResetTimer,
  settings,
  triggerToast,
  dataRevision = 0,
  enabled = true,
}: WorkSessionOptions) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [timerMode, setTimerMode] = useState<'stopwatch' | 'pomodoro'>('stopwatch');
  const [pomodoroMinutes, setPomodoroMinutes] = useState<number>(25);
  const [pomodoroRunning, setPomodoroRunning] = useState<boolean>(false);
  const [pomodoroRemainingSecs, setPomodoroRemainingSecs] = useState<number>(25 * 60);
  const pomodoroDeadlineRef = useRef<number | null>(null);

  const [savedSessions, setSavedSessions] = useState<WorkSessionRecord[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<string>('');
  const [saveError, setSaveError] = useState<string>('');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    listWorkSessions(100)
      .then((list) => {
        if (active) setSavedSessions(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [dataRevision, enabled]);

  useEffect(() => {
    pomodoroDeadlineRef.current = null;
    setPomodoroRunning(false);
    setPomodoroMinutes(25);
    setPomodoroRemainingSecs(25 * 60);
    setTimerMode('stopwatch');
    setSelectedProjectId('');
    setSavedSessions([]);
    setSaveError('');
    setSaveFeedback('');
  }, [dataRevision]);

  const persistSessionRecord = useCallback(
    (durationSecs: number, note?: string) => {
      const chosenProject = projects.find((p) => p.id === selectedProjectId);
      const endedMs = Date.now();
      const startedMs = Math.max(0, endedMs - durationSecs * 1000);
      const formattedDuration = formatDurationSecs(durationSecs);
      const latinDuration = `${String(Math.floor(durationSecs / 3600)).padStart(2, '0')}:${String(
        Math.floor((durationSecs % 3600) / 60)
      ).padStart(2, '0')}:${String(durationSecs % 60).padStart(2, '0')}`;
      const record: WorkSessionRecord = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `ws-${endedMs}`,
        projectId: selectedProjectId || null,
        projectTitle: chosenProject ? chosenProject.title : 'بدون مشروع محدد',
        durationSecs,
        startedAt: new Date(startedMs).toISOString(),
        endedAt: new Date(endedMs).toISOString(),
        note: note || null,
      };

      // Update UI & local cache synchronously (capped at 100 entries)
      setSavedSessions((prev) => [record, ...prev.filter((s) => s.id !== record.id)].slice(0, 100));
      setSaveError('');
      setSaveFeedback(
        `تم إنهاء الجلسة وحفظها (${formattedDuration} · ${record.projectTitle || 'بدون مشروع محدد'})`
      );
      try {
        const raw = localStorage.getItem('wens-work-sessions');
        const parsed = raw ? JSON.parse(raw) : [];
        const existing = Array.isArray(parsed) ? parsed.filter((s) => s && typeof s === 'object') : [];
        const cacheEntry = { ...record, duration: latinDuration, timestamp: record.endedAt };
        const capped = [cacheEntry, ...existing.filter((s: any) => s.id !== record.id)].slice(0, 100);
        safeSetLocalStorage('wens-work-sessions', JSON.stringify(capped));
      } catch {
        // ignore local cache failure
      }

      // Persist asynchronously to SQLite v3
      void saveWorkSession(record).catch((err: any) => {
        setSaveError(`تعذر مزامنة الجلسة مع قاعدة البيانات: ${String(err?.message || err)}`);
      });
    },
    [projects, selectedProjectId]
  );

  useEffect(() => {
    const deadline = pomodoroDeadlineRef.current;
    if (!pomodoroRunning || deadline === null) return;
    const tickPomodoro = () => {
      if (pomodoroDeadlineRef.current !== deadline) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining > 0) {
        setPomodoroRemainingSecs(remaining);
        return;
      }
      pomodoroDeadlineRef.current = null;
      const duration = pomodoroMinutes * 60;
      setPomodoroRunning(false);
      setPomodoroRemainingSecs(duration);
      persistSessionRecord(duration, `جلسة بومودورو مكتملة (${pomodoroMinutes} دقيقة)`);
      if (settings?.notifications.focusCompletionEnabled !== false) {
        triggerToast?.(
          'اكتملت جلسة التركيز!',
          `أحسنت! أتممت ${digits(pomodoroMinutes)} دقيقة من التركيز المتواصل — خذ استراحة قصيرة.`
        );
        if (settings?.audio.work !== 'silent') void testNotification('work').catch(() => {});
      }
    };
    tickPomodoro();
    const id = setInterval(tickPomodoro, 1000);
    document.addEventListener('visibilitychange', tickPomodoro);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tickPomodoro);
    };
  }, [pomodoroRunning, pomodoroMinutes, persistSessionRecord, settings, triggerToast]);

  const finishAndSaveSession = () => {
    setSaveError('');
    if (timerMode === 'pomodoro') {
      const totalTargetSecs = pomodoroMinutes * 60;
      const deadline = pomodoroDeadlineRef.current;
      const remaining = deadline === null
        ? pomodoroRemainingSecs
        : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const elapsedPomodoroSecs = Math.max(0, totalTargetSecs - remaining);
      if (elapsedPomodoroSecs <= 0) {
        setSaveError('ابدأ المؤقت أولاً قبل إنهاء الجلسة — لا يمكن حفظ جلسة مدتها ٠٠:٠٠:٠٠.');
        return;
      }
      setPomodoroRunning(false);
      setPomodoroRemainingSecs(totalTargetSecs);
      pomodoroDeadlineRef.current = null;
      persistSessionRecord(elapsedPomodoroSecs, 'جلسة بومودورو');
      return;
    }

    const fromPropMs = typeof elapsedMs === 'number' && elapsedMs > 0 ? Math.floor(elapsedMs / 1000) : 0;
    const fromText = parseDurationSecsFromText(workTime);
    const durationSecs = fromPropMs > 0 ? fromPropMs : fromText;
    if (durationSecs <= 0) {
      setSaveError('ابدأ جلسة العمل أولاً قبل الحفظ — لا يمكن حفظ جلسة مدتها ٠٠:٠٠:٠٠.');
      return;
    }

    persistSessionRecord(durationSecs);
    if (timerStarted) {
      setTimerStarted(null);
    }
    if (onResetTimer) {
      onResetTimer();
    }
  };

  const displayTime =
    timerMode === 'pomodoro' ? formatDurationSecs(pomodoroRemainingSecs) : workTime;
  const isRunning = timerMode === 'pomodoro' ? pomodoroRunning : Boolean(timerStarted);

  const handleToggleRun = () => {
    setSaveError('');
    if (timerMode === 'pomodoro') {
      if (pomodoroRunning && pomodoroDeadlineRef.current !== null) {
        const remaining = Math.max(0, Math.ceil((pomodoroDeadlineRef.current - Date.now()) / 1000));
        setPomodoroRemainingSecs(remaining);
        pomodoroDeadlineRef.current = null;
        setPomodoroRunning(false);
      } else {
        pomodoroDeadlineRef.current = Date.now() + pomodoroRemainingSecs * 1000;
        setPomodoroRunning(true);
      }
    } else {
      setTimerStarted(timerStarted ? null : Date.now());
    }
  };

  const resetPomodoro = (minutes = pomodoroMinutes) => {
    pomodoroDeadlineRef.current = null;
    setPomodoroRunning(false);
    setPomodoroMinutes(minutes);
    setPomodoroRemainingSecs(minutes * 60);
  };

  return {
    timerMode,
    setTimerMode,
    pomodoroMinutes,
    pomodoroRunning,
    resetPomodoro,
    selectedProjectId,
    setSelectedProjectId,
    displayTime,
    isRunning,
    handleToggleRun,
    finishAndSaveSession,
    saveError,
    saveFeedback,
    savedSessions,
  };
}

export function Work(props: WorkSessionOptions) {
  const session = useWorkSession(props);
  return <WorkPanel projects={props.projects} session={session} />;
}

function WorkPanel({ projects, session }: {
  projects: BootstrapPayload['projects'];
  session: ReturnType<typeof useWorkSession>;
}) {
  const {
    timerMode,
    setTimerMode,
    pomodoroMinutes,
    pomodoroRunning,
    resetPomodoro,
    selectedProjectId,
    setSelectedProjectId,
    displayTime,
    isRunning,
    handleToggleRun,
    finishAndSaveSession,
    saveError,
    saveFeedback,
    savedSessions,
  } = session;
  return (
    <>
      <PageTitle
        title="الشغل"
        copy="جلسة عمل واحدة واضحة، مع مؤقت بومودورو (٢٥ دقيقة) أو ساعة إيقاف وحفظ مباشر في SQLite."
      />

      <section className={`timer-stage ${isRunning ? 'timer-active' : ''}`}>
        <div className="work-mode-switcher" role="tablist" aria-label="نمط مؤقت التركيز">
          <button
            type="button"
            role="tab"
            aria-selected={timerMode === 'stopwatch'}
            className={`work-mode-btn ${timerMode === 'stopwatch' ? 'active' : ''}`}
            onClick={() => setTimerMode('stopwatch')}
          >
            ساعة إيقاف حرة
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={timerMode === 'pomodoro'}
            className={`work-mode-btn ${timerMode === 'pomodoro' ? 'active' : ''}`}
            onClick={() => setTimerMode('pomodoro')}
          >
            مؤقت بومودورو ({digits(pomodoroMinutes)} دقيقة)
          </button>
        </div>

        {timerMode === 'pomodoro' && (
          <div className="work-pomodoro-presets">
            {[15, 25, 45].map((mins) => (
              <button
                key={mins}
                type="button"
                disabled={pomodoroRunning}
                className={`work-preset-chip ${pomodoroMinutes === mins ? 'active' : ''}`}
                onClick={() => resetPomodoro(mins)}
              >
                {digits(mins)} دقيقة
              </button>
            ))}
          </div>
        )}

        <span>{timerMode === 'pomodoro' ? 'العد التنازلي لجلسة البومودورو' : 'الجلسة الحالية'}</span>
        <strong>{displayTime}</strong>

        <select
          aria-label="المشروع المرتبط بالجلسة"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
        >
          <option value="">بدون مشروع محدد</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`primary-button large ${isRunning ? 'running' : ''}`}
            onClick={handleToggleRun}
          >
            {isRunning ? <Pause size={20} /> : <Play size={20} />}
            {isRunning ? 'إيقاف مؤقت للجلسة' : 'ابدأ جلسة العمل'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={finishAndSaveSession}
          >
            <Check size={18} />
            إنهاء الجلسة وحفظها
          </button>
          {timerMode === 'pomodoro' && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => resetPomodoro()}
              aria-label="إعادة ضبط مؤقت بومودورو"
            >
              <TimerReset size={17} />
              إعادة ضبط
            </button>
          )}
        </div>
        {saveError && (
          <p role="alert" style={{ color: '#f87171', marginTop: '12px', fontSize: '14px', fontWeight: 600 }}>
            {saveError}
          </p>
        )}
        {saveFeedback && (
          <p style={{ color: 'var(--primary-hover)', marginTop: '12px', fontSize: '14px', fontWeight: 600 }}>
            {saveFeedback}
          </p>
        )}
      </section>

      <div className="tool-row">
        <article>
          <Clock3 size={24} />
          <div>
            <strong>جلسة بومودورو مركزة</strong>
            <span>اختر ٢٥ دقيقة عد تنازلي مع تنبيه تلقائي عند اكتمال الجلسة.</span>
          </div>
        </article>
        <article>
          <CalendarDays size={24} />
          <div>
            <strong>حفظ آمن في SQLite</strong>
            <span>تُحفظ مدة كل جلسة بوقت البداية والنهاية الفعلي في سجلك المحلي.</span>
          </div>
        </article>
      </div>

      {savedSessions.length > 0 && (
        <section className="saved-sessions-list surface" style={{ marginTop: '24px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>
            الجلسات المسجلة حديثًا ({digits(savedSessions.length)})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedSessions.slice(0, 8).map((s) => (
              <div
                key={s.id}
                className="saved-session-item"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div>
                  <strong>{s.projectTitle || 'بدون مشروع محدد'}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--faint)' }}>
                    {arTimeFmt ? arTimeFmt.format(new Date(s.endedAt)) : s.endedAt.slice(11, 16)}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                  {formatDurationSecs(s.durationSecs)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------- */
/* PROJECTS VIEW (Full SQLite v3 CRUD + Safe Confirm)   */
/* ---------------------------------------------------- */
export function Projects({
  data,
  setData,
  go,
  triggerToast,
}: {
  data: BootstrapPayload;
  setData: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  go?: (view: any) => void;
  triggerToast?: (title: string, body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [task, setTask] = useState('');
  const [status, setStatus] = useState('قيد التنفيذ');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [quickIdea, setQuickIdea] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const project = await createProject(title.trim(), task.trim(), {
        description: description.trim(),
        goal: goal.trim() || null,
        status,
        isCurrent: data.projects.length === 0,
      });
      setData((prev) => (prev ? { ...prev, projects: [project, ...prev.projects] } : prev));
      setTitle('');
      setDescription('');
      setGoal('');
      setTask('');
      setStatus('قيد التنفيذ');
      setOpen(false);
      triggerToast?.('تمت إضافة المشروع', `تم حفظ مشروع «${project.title}» في قاعدة البيانات.`);
    } catch (err: any) {
      triggerToast?.('تعذر إنشاء المشروع', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject || !editingProject.title.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await updateProject({
        id: editingProject.id,
        title: editingProject.title.trim(),
        description: editingProject.description.trim(),
        goal: editingProject.goal?.trim() || null,
        currentTask: editingProject.currentTask?.trim() || null,
        status: editingProject.status,
        progress: editingProject.status === 'مكتمل' ? 100 : editingProject.progress,
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              projects: prev.projects.map((p) => (p.id === updated.id ? updated : p)),
            }
          : prev
      );
      setEditingProject(null);
      triggerToast?.('تم تحديث المشروع', `تم حفظ تعديلات مشروع «${updated.title}».`);
    } catch (err: any) {
      triggerToast?.('تعذر تحديث المشروع', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const toggleProjectStatus = async (id: string) => {
    const target = data.projects.find((p) => p.id === id);
    if (!target) return;
    const nextStatus = target.status === 'مكتمل' ? 'قيد التنفيذ' : 'مكتمل';
    const nextProgress = nextStatus === 'مكتمل' ? 100 : target.progress === 100 ? 50 : target.progress;
    try {
      const updated = await updateProject({
        id,
        status: nextStatus,
        progress: nextProgress,
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              projects: prev.projects.map((p) =>
                p.id === id ? { ...p, ...updated, status: nextStatus, progress: nextProgress } : p
              ),
            }
          : prev
      );
    } catch (err: any) {
      triggerToast?.('تعذر تحديث الحالة', String(err?.message || err));
    }
  };

  const handleSetActiveProject = async (id: string) => {
    try {
      await setCurrentProject(id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              projects: prev.projects.map((p) => ({ ...p, isCurrent: p.id === id })),
            }
          : prev
      );
      const chosen = data.projects.find((p) => p.id === id);
      if (chosen) {
        triggerToast?.('المشروع النشط', `تم تعيين «${chosen.title}» كمشروع التركيز الحالي.`);
      }
    } catch (err: any) {
      triggerToast?.('تعذر تعيين المشروع النشط', String(err?.message || err));
    }
  };

  const confirmDeleteProject = async () => {
    if (!pendingDeleteProject || busy) return;
    setBusy(true);
    try {
      await deleteProject(pendingDeleteProject.id);
      const deletedId = pendingDeleteProject.id;
      const deletedTitle = pendingDeleteProject.title;
      setData((prev) =>
        prev
          ? { ...prev, projects: prev.projects.filter((p) => p.id !== deletedId) }
          : prev
      );
      setPendingDeleteProject(null);
      triggerToast?.('تم حذف المشروع', `تم حذف مشروع «${deletedTitle}» نهائياً.`);
    } catch (err: any) {
      triggerToast?.('تعذر حذف المشروع', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const saveQuickIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIdea.trim()) return;
    try {
      const idea = await createIdea(quickIdea.trim(), 'فكرة سريعة');
      setData((prev) => (prev ? { ...prev, ideas: [idea, ...prev.ideas] } : prev));
      setQuickIdea('');
    } catch (err: any) {
      triggerToast?.('تعذر حفظ الفكرة', String(err?.message || err));
    }
  };

  const currentProject =
    data.projects.find((p) => p.isCurrent) ||
    data.projects.find((p) => p.status === 'قيد التنفيذ') ||
    data.projects[0];

  const filteredProjects = data.projects.filter((p) =>
    statusFilter === 'الكل' ? true : p.status === statusFilter
  );

  const projectsToDisplay = filteredProjects.map((p) => ({
    ...p,
    displayTitle: p.title,
    displayDesc: p.currentTask || p.description || 'لا توجد خطوة مسجلة بعد',
    statusType: p.status === 'مكتمل' ? 'pending' : p.status === 'متوقف مؤقتاً' ? 'paused' : 'active',
    statusLabel: p.status || 'قيد التنفيذ',
  }));

  return (
    <div className="projects-container">
      {/* Header bar with prominent + مشروع جديد button and status filters */}
      <div className="projects-toolbar-header">
        <div className="projects-filter-pills" role="group" aria-label="تصفية المشروعات حسب الحالة">
          {['الكل', 'قيد التنفيذ', 'فكرة', 'متوقف مؤقتاً', 'مكتمل'].map((st) => (
            <button
              key={st}
              type="button"
              className={`projects-filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setEditingProject(null);
            setOpen((v) => !v);
          }}
        >
          <Plus size={17} />
          <span>+ مشروع جديد</span>
        </button>
      </div>

      {open && (
        <form className="inline-form" onSubmit={submit} style={{ margin: '4px 0 16px' }}>
          <label>
            اسم المشروع
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="مثلاً: إطلاق الإصدار الأول من التطبيق"
            />
          </label>
          <label>
            وصف مختصر
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ماذا تريد أن تبني أو تنجز؟"
            />
          </label>
          <label>
            الهدف النهائي
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="مثلاً: إنهاء المشروع بحلول نهاية الشهر"
            />
          </label>
          <label>
            الخطوة التالية المباشرة
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="مثلاً: صياغة مسودة الصفحة الأولى"
            />
          </label>
          <label>
            الحالة
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="قيد التنفيذ">قيد التنفيذ</option>
              <option value="فكرة">فكرة</option>
              <option value="متوقف مؤقتاً">متوقف مؤقتاً</option>
              <option value="مكتمل">مكتمل</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button type="submit" className="primary-button" disabled={busy}>
              حفظ المشروع
            </button>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      )}

      {editingProject && (
        <form className="inline-form" onSubmit={handleSaveEdit} style={{ margin: '4px 0 16px' }}>
          <label>
            تعديل اسم المشروع
            <input
              value={editingProject.title}
              onChange={(e) => setEditingProject({ ...editingProject, title: e.target.value })}
              required
              autoFocus
            />
          </label>
          <label>
            الوصف
            <input
              value={editingProject.description}
              onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
            />
          </label>
          <label>
            الهدف
            <input
              value={editingProject.goal || ''}
              onChange={(e) => setEditingProject({ ...editingProject, goal: e.target.value })}
            />
          </label>
          <label>
            الخطوة التالية
            <input
              value={editingProject.currentTask || ''}
              onChange={(e) => setEditingProject({ ...editingProject, currentTask: e.target.value })}
            />
          </label>
          <label>
            الحالة
            <select
              value={editingProject.status}
              onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value })}
            >
              <option value="قيد التنفيذ">قيد التنفيذ</option>
              <option value="فكرة">فكرة</option>
              <option value="متوقف مؤقتاً">متوقف مؤقتاً</option>
              <option value="مكتمل">مكتمل</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button type="submit" className="primary-button" disabled={busy}>
              حفظ التعديلات
            </button>
            <button type="button" className="secondary-button" onClick={() => setEditingProject(null)}>
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Top Grid: Mid-Right (Current Project) + Mid-Left (Other Projects) */}
      <div className="projects-top-grid">
        {/* Right Card: Current Project */}
        <div className="project-current-card">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span className="project-current-sub">المشروع الحالي</span>
              {currentProject && (
                <button
                  type="button"
                  className="projects-btn-open"
                  style={{ padding: '4px 12px', minHeight: '32px', fontSize: '12px' }}
                  onClick={() => {
                    setOpen(false);
                    setEditingProject({ ...currentProject });
                  }}
                >
                  تعديل
                </button>
              )}
            </div>
            <h2 className="project-current-title">
              {currentProject?.title || 'لا يوجد مشروع نشط حالياً'}
            </h2>
            <p className="project-current-desc">
              {currentProject?.description || 'اختر مشروعاً أو أضف مشروعاً جديداً للتركيز عليه'}
            </p>

            {/* Arc Sun Wrap */}
            <div className="project-arc-wrap">
              <svg viewBox="0 0 400 40" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                <path d="M 0 35 Q 200 -10 400 35" fill="none" stroke="rgba(212, 151, 72, 0.4)" strokeWidth="1.5" />
              </svg>
              <div className="project-arc-sun" />
            </div>

            {/* Goal Block */}
            <div className="project-section-block">
              <div className="project-section-label">
                <Target size={15} style={{ color: '#d49748' }} />
                <span>الهدف</span>
              </div>
              <div className="project-section-box">
                {currentProject?.goal || 'حدّد هدفاً واضحاً للمشروع'}
              </div>
            </div>

            {/* Next Step Block */}
            <div className="project-section-block">
              <div className="project-section-label">
                <ListTodo size={15} style={{ color: '#d49748' }} />
                <span>الخطوة التالية</span>
              </div>
              <div
                className="project-step-row"
                role="button"
                tabIndex={0}
                onClick={() => currentProject && toggleProjectStatus(currentProject.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (currentProject) void toggleProjectStatus(currentProject.id);
                  }
                }}
              >
                <div className="project-step-text">
                  {currentProject?.status === 'مكتمل' ? (
                    <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
                  ) : (
                    <span className="project-circle-check" />
                  )}
                  <span>
                    {currentProject?.currentTask || 'حدّد الخطوة المباشرة القادمة'}
                  </span>
                </div>
                <ChevronLeft size={16} style={{ color: 'var(--muted)' }} />
              </div>
            </div>
          </div>

          {/* Focus CTA */}
          <div className="project-focus-cta-wrap">
            {currentProject ? (
              <>
                <button
                  type="button"
                  className="project-focus-cta-btn"
                  onClick={() => go?.('work')}
                >
                  <Play size={16} fill="currentColor" />
                  <span>ابدأ التركيز</span>
                </button>
                <div className="project-focus-cta-sub">
                  <Clock3 size={13} />
                  <span>جلسة تركيز بومودورو لمدة ٢٥ دقيقة</span>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="project-focus-cta-btn"
                onClick={() => setOpen(true)}
              >
                <Plus size={16} />
                <span>إنشاء أول مشروع الآن</span>
              </button>
            )}
          </div>
        </div>

        {/* Left Card: All Projects */}
        <div className="projects-other-card">
          <div>
            <div className="projects-other-head">
              <strong>
                <BriefcaseBusiness size={18} style={{ color: '#d49748' }} />
                <span>جميع المشروعات ({digits(projectsToDisplay.length)})</span>
              </strong>
            </div>

            <div className="projects-other-list">
              {projectsToDisplay.map((project) => (
                <div className="projects-other-item" key={project.id}>
                  <div className="projects-other-info">
                    <div className="projects-other-title-row">
                      <strong>{project.displayTitle}</strong>
                      <span className={`projects-status-dot ${project.statusType}`} />
                      <span className="projects-status-pill">{project.statusLabel}</span>
                      {currentProject?.id === project.id && (
                        <span className="projects-active-tag">النشط</span>
                      )}
                    </div>
                    <span className="projects-other-desc">{project.displayDesc}</span>
                  </div>
                  <div className="projects-other-actions">
                    {currentProject?.id !== project.id && (
                      <button
                        type="button"
                        className="projects-btn-open"
                        onClick={() => handleSetActiveProject(project.id)}
                        title="تعيين كمشروع نشط"
                      >
                        تفعيل
                      </button>
                    )}
                    <button
                      type="button"
                      className="projects-btn-open"
                      onClick={() => {
                        setOpen(false);
                        setEditingProject({ ...project });
                      }}
                      aria-label={`تعديل مشروع ${project.displayTitle}`}
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      className="projects-btn-open"
                      onClick={() => toggleProjectStatus(project.id)}
                      aria-label={`تغيير حالة مشروع ${project.displayTitle}`}
                    >
                      <span className="sr-only">
                        {project.status === 'مكتمل' ? 'تحديد كـ قيد التنفيذ' : 'تحديد كـ مكتمل'}
                      </span>
                      <span aria-hidden="true">
                        {project.status === 'مكتمل' ? 'متابعة' : 'إتمام'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="projects-btn-more danger"
                      onClick={() => setPendingDeleteProject(project)}
                      aria-label={`حذف مشروع ${project.displayTitle}`}
                      title="حذف المشروع"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {projectsToDisplay.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--muted)', fontSize: '0.88rem' }}>
                  لا توجد مشروعات مطابقة بعد. اضغط «+ مشروع جديد» للبدء.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Card: Quick Capture & Recent Ideas */}
      <div className="projects-bottom-card">
        <form className="projects-quick-capture-form" onSubmit={saveQuickIdea}>
          <div className="projects-quick-capture-head">
            <Lightbulb size={18} style={{ color: '#d49748' }} />
            <span>فكرة خطرت لك؟</span>
          </div>
          <label className="sr-only" htmlFor="quick-project-idea">فكرة سريعة</label>
          <input
            id="quick-project-idea"
            className="projects-quick-capture-input"
            value={quickIdea}
            onChange={(e) => setQuickIdea(e.target.value)}
            placeholder="اكتب فكرتك هنا..."
            required
          />
          <button type="submit" className="projects-quick-capture-btn">
            <Pencil size={15} />
            <span>حفظ</span>
          </button>
        </form>

        <div className="projects-recent-ideas-head">
          <Clock3 size={15} style={{ color: '#d49748' }} />
          <span>أفكار حديثة</span>
        </div>
        <div className="projects-recent-ideas-row">
          {(data.ideas || []).slice(0, 4).map((idea) => (
            <div className="projects-idea-card" key={idea.id} onClick={() => go?.('ideas')}>
              <div className="projects-idea-card-info">
                <strong>{idea.title}</strong>
                <span>{idea.tag || 'فكرة عامة'}</span>
              </div>
              <FileText size={18} style={{ color: 'var(--muted)' }} />
            </div>
          ))}
          {(!data.ideas || data.ideas.length === 0) && (
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '12px 16px' }}>
              لا توجد أفكار مسجلة بعد. دوّن فكرتك الأولى أعلاه!
            </div>
          )}
          <button
            type="button"
            className="projects-idea-all-btn"
            onClick={() => go?.('ideas')}
          >
            <span>عرض الكل</span>
            <ChevronLeft size={15} />
          </button>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingDeleteProject)}
        title="تأكيد حذف المشروع"
        description={`هل أنت متأكد من حذف مشروع «${pendingDeleteProject?.title || ''}» نهائياً من قاعدة البيانات؟`}
        confirmLabel="نعم، احذف المشروع"
        cancelLabel="إلغاء"
        danger
        busy={busy}
        onConfirm={confirmDeleteProject}
        onCancel={() => setPendingDeleteProject(null)}
      />
    </div>
  );
}

/* ---------------------------------------------------- */
/* IDEAS VIEW (Full SQLite v3 CRUD + Promote + Confirm) */
/* ---------------------------------------------------- */
export function Ideas({
  data,
  setData,
  triggerToast,
}: {
  data: BootstrapPayload;
  setData: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  triggerToast?: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('فكرة');
  const [body, setBody] = useState('');
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editBody, setEditBody] = useState('');
  const [pendingDeleteIdea, setPendingDeleteIdea] = useState<{ id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const idea = await createIdea(title.trim(), tag.trim() || 'فكرة', body.trim());
      setData((prev) => (prev ? { ...prev, ideas: [idea, ...prev.ideas] } : prev));
      setTitle('');
      setBody('');
    } catch (err: any) {
      triggerToast?.('تعذر حفظ الفكرة', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await updateIdea({
        id,
        title: editTitle.trim(),
        tag: editTag.trim() || 'فكرة',
        body: editBody.trim(),
      });
      setData((prev) =>
        prev
          ? { ...prev, ideas: prev.ideas.map((i) => (i.id === id ? updated : i)) }
          : prev
      );
      setEditingIdeaId(null);
      triggerToast?.('تم تحديث الفكرة', `تم حفظ تعديلات «${updated.title}».`);
    } catch (err: any) {
      triggerToast?.('تعذر تعديل الفكرة', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const handlePromoteIdea = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const project = await promoteIdeaToProject(id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              projects: [project, ...prev.projects],
              ideas: prev.ideas.filter((i) => i.id !== id),
            }
          : prev
      );
      triggerToast?.('تمت الترقية إلى مشروع', `تحولت الفكرة إلى مشروع «${project.title}».`);
    } catch (err: any) {
      triggerToast?.('تعذر تحويل الفكرة', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteIdea = async () => {
    if (!pendingDeleteIdea || busy) return;
    setBusy(true);
    try {
      await deleteIdea(pendingDeleteIdea.id);
      const deletedId = pendingDeleteIdea.id;
      setData((prev) =>
        prev ? { ...prev, ideas: prev.ideas.filter((i) => i.id !== deletedId) } : prev
      );
      setPendingDeleteIdea(null);
      triggerToast?.('تم حذف الفكرة', 'تمت إزالة الفكرة نهائياً من قاعدة البيانات.');
    } catch (err: any) {
      triggerToast?.('تعذر حذف الفكرة', String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle
        title="الأفكار"
        copy="التقط خواطرك وملاحظاتك فورًا، وعدّلها أو حوّلها إلى مشروع قابل للتنفيذ."
      />
      <form className="idea-capture" onSubmit={submit}>
        <Lightbulb size={24} style={{ color: 'var(--accent)' }} />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="دوّن الفكرة هنا قبل أن تنساها…"
          required
        />
        <input
          className="tag-input"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="تصنيف الفكرة"
        />
        <button type="submit" className="primary-button" disabled={busy}>
          حفظ
        </button>
      </form>

      <div className="ideas-list">
        {data.ideas.length === 0 && (
          <div className="ideas-empty">
            <Lightbulb size={30} />
            <h2>مكان للأفكار قبل أن تصبح مشروعات</h2>
            <p>اكتب جملة واحدة الآن. لا تحتاج إلى خطة كاملة.</p>
          </div>
        )}
        {data.ideas.map((idea) => {
          const isEditing = editingIdeaId === idea.id;
          return (
            <article key={idea.id}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="عنوان الفكرة"
                    aria-label="تعديل عنوان الفكرة"
                  />
                  <input
                    value={editTag}
                    onChange={(e) => setEditTag(e.target.value)}
                    placeholder="التصنيف"
                    aria-label="تعديل تصنيف الفكرة"
                  />
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="تفاصيل الفكرة..."
                    rows={3}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleSaveEdit(idea.id)}
                      disabled={busy}
                    >
                      حفظ التعديل
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditingIdeaId(null)}
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="idea-header"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
                  >
                    <span>{idea.tag}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="projects-btn-open"
                        style={{ padding: '4px 10px', minHeight: '32px', fontSize: '12px' }}
                        onClick={() => {
                          setEditingIdeaId(idea.id);
                          setEditTitle(idea.title);
                          setEditTag(idea.tag || 'فكرة');
                          setEditBody(idea.body || '');
                        }}
                        aria-label={`تعديل فكرة ${idea.title}`}
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        className="projects-btn-open"
                        style={{ padding: '4px 10px', minHeight: '32px', fontSize: '12px' }}
                        onClick={() => handlePromoteIdea(idea.id)}
                        disabled={busy}
                        aria-label={`تحويل فكرة ${idea.title} إلى مشروع`}
                      >
                        تحويل لمشروع
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => setPendingDeleteIdea({ id: idea.id, title: idea.title })}
                        aria-label={`حذف فكرة ${idea.title}`}
                        title="حذف الفكرة"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                  <h2>{idea.title}</h2>
                  <p>{idea.body || 'لا توجد تفاصيل إضافية مسجلة بعد.'}</p>
                </>
              )}
            </article>
          );
        })}
      </div>

      <ConfirmModal
        open={Boolean(pendingDeleteIdea)}
        title="تأكيد حذف الفكرة"
        description={`هل أنت متأكد من حذف فكرة «${pendingDeleteIdea?.title || ''}» نهائياً؟`}
        confirmLabel="نعم، احذف الفكرة"
        cancelLabel="إلغاء"
        danger
        busy={busy}
        onConfirm={confirmDeleteIdea}
        onCancel={() => setPendingDeleteIdea(null)}
      />
    </>
  );
}

/* ---------------------------------------------------- */
/* STUDIO VIEW                                          */
/* ---------------------------------------------------- */
export function Studio({ go }: { go?: (v: any) => void } = {}) {
  type StudioToolType = 'brief' | 'matrix' | 'storyboard' | 'metrics' | null;
  const [activeTool, setActiveTool] = useState<StudioToolType>(null);
  const [draftFeedback, setDraftFeedback] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem('wens-studio-last-saved') || null;
    } catch {
      return null;
    }
  });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDraftFeedback = useCallback((msg: string, ms = 4000) => {
    setDraftFeedback(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setDraftFeedback('');
      feedbackTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeTool) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool]);

  // 1. Campaign Brief / ورقة عمل جديدة
  const [briefTitle, setBriefTitle] = useState(() => localStorage.getItem('wens-studio-brief-title') || '');
  const [briefAudience, setBriefAudience] = useState(() => localStorage.getItem('wens-studio-brief-audience') || '');
  const [briefKeyMessage, setBriefKeyMessage] = useState(() => localStorage.getItem('wens-studio-brief-message') || '');
  const [briefCta, setBriefCta] = useState(() => localStorage.getItem('wens-studio-brief-cta') || '');

  // 2. Creative Matrix 2x2
  const [matrixQ1, setMatrixQ1] = useState(() => localStorage.getItem('wens-studio-matrix-q1') || '');
  const [matrixQ2, setMatrixQ2] = useState(() => localStorage.getItem('wens-studio-matrix-q2') || '');
  const [matrixQ3, setMatrixQ3] = useState(() => localStorage.getItem('wens-studio-matrix-q3') || '');
  const [matrixQ4, setMatrixQ4] = useState(() => localStorage.getItem('wens-studio-matrix-q4') || '');

  // 3. Storyboard
  interface StoryboardStep {
    id: string;
    scene: string;
    audio: string;
  }
  const [storyboardSteps, setStoryboardSteps] = useState<StoryboardStep[]>(() => {
    try {
      const raw = localStorage.getItem('wens-studio-storyboard');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter(isPlainObject).map((s, i) => ({
            id: typeof s.id === 'string' ? s.id : `step-${i + 1}`,
            scene: typeof s.scene === 'string' ? s.scene : '',
            audio: typeof s.audio === 'string' ? s.audio : '',
          }));
        }
      }
    } catch {}
    return [
      { id: 'step-1', scene: 'المشهد الافتتاحي: مشكلة العميل الحالية والصعوبة التي تواجهه', audio: 'موسيقى هادئة مع صوت الراوي يشرح الواقع' },
      { id: 'step-2', scene: 'نقطة التحول: ظهور الحل والخدمة وطريقة عملها بوضوح', audio: 'نبرة محفزة وشرح سريع ومباشر' },
    ];
  });

  // 4. Campaign Metrics
  const [roasRevenue, setRoasRevenue] = useState(() => localStorage.getItem('wens-studio-metric-rev') || '15000');
  const [roasSpend, setRoasSpend] = useState(() => localStorage.getItem('wens-studio-metric-spend') || '3000');
  const [ctrClicks, setCtrClicks] = useState(() => localStorage.getItem('wens-studio-metric-clicks') || '450');
  const [ctrImpressions, setCtrImpressions] = useState(() => localStorage.getItem('wens-studio-metric-impr') || '12000');
  const [cplCost, setCplCost] = useState(() => localStorage.getItem('wens-studio-metric-cpl-cost') || '3000');
  const [cplConversions, setCplConversions] = useState(() => localStorage.getItem('wens-studio-metric-cpl-conv') || '75');

  useEffect(() => {
    let active = true;
    void getDomainKv('studio_drafts').then((raw) => {
      if (!active || !raw) return;
      const draft: unknown = JSON.parse(raw);
      if (!isPlainObject(draft)) return;

      const draftFields = [
        [draft.briefTitle, setBriefTitle],
        [draft.briefAudience, setBriefAudience],
        [draft.briefKeyMessage, setBriefKeyMessage],
        [draft.briefCta, setBriefCta],
        [draft.matrixQ1, setMatrixQ1],
        [draft.matrixQ2, setMatrixQ2],
        [draft.matrixQ3, setMatrixQ3],
        [draft.matrixQ4, setMatrixQ4],
        [draft.savedAt, setLastSavedAt],
      ] as const;
      for (const [value, apply] of draftFields) {
        if (typeof value === 'string') apply(value);
      }
      const storyboard: unknown = typeof draft.storyboard === 'string'
        ? JSON.parse(draft.storyboard || 'null')
        : draft.storyboard;
      if (Array.isArray(storyboard)) {
        setStoryboardSteps(storyboard.filter(isPlainObject).map((step, index) => ({
          id: typeof step.id === 'string' ? step.id : `step-${index + 1}`,
          scene: typeof step.scene === 'string' ? step.scene : '',
          audio: typeof step.audio === 'string' ? step.audio : '',
        })));
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const syncStudioToSqlite = useCallback(
    (overrides?: Partial<{
      briefTitle: string;
      briefAudience: string;
      briefKeyMessage: string;
      briefCta: string;
      matrixQ1: string;
      matrixQ2: string;
      matrixQ3: string;
      matrixQ4: string;
      storyboard: StoryboardStep[];
    }>) => {
      const savedIso = new Date().toISOString();
      setLastSavedAt(savedIso);
      safeSetLocalStorage('wens-studio-last-saved', savedIso);
      const snapshot = {
        briefTitle: overrides?.briefTitle ?? briefTitle,
        briefAudience: overrides?.briefAudience ?? briefAudience,
        briefKeyMessage: overrides?.briefKeyMessage ?? briefKeyMessage,
        briefCta: overrides?.briefCta ?? briefCta,
        matrixQ1: overrides?.matrixQ1 ?? matrixQ1,
        matrixQ2: overrides?.matrixQ2 ?? matrixQ2,
        matrixQ3: overrides?.matrixQ3 ?? matrixQ3,
        matrixQ4: overrides?.matrixQ4 ?? matrixQ4,
        storyboard: overrides?.storyboard ?? storyboardSteps,
        savedAt: savedIso,
      };
      void setDomainKv('studio_drafts', JSON.stringify(snapshot)).catch(() => {});
    },
    [briefTitle, briefAudience, briefKeyMessage, briefCta, matrixQ1, matrixQ2, matrixQ3, matrixQ4, storyboardSteps]
  );

  const saveBriefDraft = () => {
    safeSetLocalStorage('wens-studio-brief-title', briefTitle);
    safeSetLocalStorage('wens-studio-brief-audience', briefAudience);
    safeSetLocalStorage('wens-studio-brief-message', briefKeyMessage);
    safeSetLocalStorage('wens-studio-brief-cta', briefCta);
    syncStudioToSqlite();
    showDraftFeedback('تم حفظ مسودة ورقة العمل محليًا بنجاح.');
  };

  const saveMatrixDraft = () => {
    safeSetLocalStorage('wens-studio-matrix-q1', matrixQ1);
    safeSetLocalStorage('wens-studio-matrix-q2', matrixQ2);
    safeSetLocalStorage('wens-studio-matrix-q3', matrixQ3);
    safeSetLocalStorage('wens-studio-matrix-q4', matrixQ4);
    syncStudioToSqlite();
    showDraftFeedback('تم حفظ مصفوفة الأفكار محليًا بنجاح.');
  };

  const saveStoryboardDraft = () => {
    safeSetLocalStorage('wens-studio-storyboard', JSON.stringify(storyboardSteps));
    syncStudioToSqlite();
    showDraftFeedback('تم حفظ تسلسل المشاهد محليًا بنجاح.');
  };

  const confirmClearBrief = () => {
    setBriefTitle('');
    setBriefAudience('');
    setBriefKeyMessage('');
    setBriefCta('');
    safeSetLocalStorage('wens-studio-brief-title', '');
    safeSetLocalStorage('wens-studio-brief-audience', '');
    safeSetLocalStorage('wens-studio-brief-message', '');
    safeSetLocalStorage('wens-studio-brief-cta', '');
    syncStudioToSqlite({ briefTitle: '', briefAudience: '', briefKeyMessage: '', briefCta: '' });
    setConfirmClearOpen(false);
    showDraftFeedback('تم تفريغ مسودة الحملة وحفظ التغيير.', 3000);
  };

  const roasValue = useMemo(() => {
    const spend = parseFloat(roasSpend);
    const rev = parseFloat(roasRevenue);
    if (!spend || spend <= 0 || isNaN(rev) || rev < 0) return '0.00x';
    return (rev / spend).toFixed(2) + 'x';
  }, [roasRevenue, roasSpend]);

  const ctrValue = useMemo(() => {
    const impr = parseFloat(ctrImpressions);
    const clicks = parseFloat(ctrClicks);
    if (!impr || impr <= 0 || isNaN(clicks) || clicks < 0) return '0.00%';
    return ((clicks / impr) * 100).toFixed(2) + '%';
  }, [ctrClicks, ctrImpressions]);

  const cplValue = useMemo(() => {
    const cost = parseFloat(cplCost);
    const conv = parseFloat(cplConversions);
    if (!conv || conv <= 0 || isNaN(cost) || cost < 0) return '0.00';
    return (cost / conv).toFixed(2);
  }, [cplCost, cplConversions]);

  const saveMetricsDraft = () => {
    safeSetLocalStorage('wens-studio-metric-rev', roasRevenue);
    safeSetLocalStorage('wens-studio-metric-spend', roasSpend);
    safeSetLocalStorage('wens-studio-metric-clicks', ctrClicks);
    safeSetLocalStorage('wens-studio-metric-impr', ctrImpressions);
    safeSetLocalStorage('wens-studio-metric-cpl-cost', cplCost);
    safeSetLocalStorage('wens-studio-metric-cpl-conv', cplConversions);
    syncStudioToSqlite();
    showDraftFeedback('تم حفظ بيانات وحسابات المقاييس محليًا بنجاح.');
  };

  const savedStatusText = lastSavedAt
    ? `تم الحفظ محلياً (${arTimeFmt ? arTimeFmt.format(new Date(lastSavedAt)) : lastSavedAt.slice(11, 16)})`
    : 'لم تُحفظ المسودة بعد';

  return (
    <>
      <div className="studio-unified-container">
        <div className="studio-unified-header">
          <h1>الاستوديو الإبداعي</h1>
          <p>من الفكرة إلى أثر واقعي</p>
          <div className="studio-header-arc-wrap">
            <svg viewBox="0 0 600 38" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 35 Q 300 -10 600 35" fill="none" stroke="rgba(212, 151, 72, 0.4)" strokeWidth="1.5" />
            </svg>
            <div className="studio-header-arc-sun" />
          </div>
        </div>

        {/* Mid Grid: Right Column (Draft Card) + Left Column (Studio Tools) */}
        <div className="studio-mid-grid">
          {/* Right Column: Draft Card */}
          <div className="studio-draft-card">
            <div className="studio-draft-head">
              <div className="studio-draft-title-block">
                <strong>
                  <FileText size={18} style={{ color: '#d49748' }} />
                  <span>مسودة حملة جديدة</span>
                </strong>
                <span>حوّل فكرتك إلى خطة واضحة قابلة للتنفيذ.</span>
              </div>
              <div className="studio-autosave-badge">
                <span className="studio-autosave-dot" />
                <span>{savedStatusText}</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-title-input">
                العنوان
              </label>
              <div className="studio-field-content">
                <input
                  id="studio-title-input"
                  className="studio-input"
                  value={briefTitle}
                  onChange={(e) => setBriefTitle(e.target.value)}
                  placeholder="حملة الوعي بالقراءة"
                  maxLength={100}
                />
                <span className="studio-char-counter">{briefTitle.length}/100</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-audience-input">
                الجمهور
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-audience-input"
                  className="studio-textarea"
                  value={briefAudience}
                  onChange={(e) => setBriefAudience(e.target.value)}
                  placeholder="الشباب من عمر 16 إلى 25 سنة، مهتمون بالتطوير الذاتي والمحتوى العربي."
                  maxLength={300}
                  rows={2}
                />
                <span className="studio-char-counter">{briefAudience.length}/300</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-message-input">
                الفكرة الأساسية
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-message-input"
                  className="studio-textarea"
                  value={briefKeyMessage}
                  onChange={(e) => setBriefKeyMessage(e.target.value)}
                  placeholder="محتوى قصير وملهم يربط القراءة بحياة أفضل، عبر قصص حقيقية وتجارب ملهمة."
                  maxLength={300}
                  rows={3}
                />
                <span className="studio-char-counter">{briefKeyMessage.length}/300</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-cta-input">
                الدعوة للفعل
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-cta-input"
                  className="studio-textarea"
                  value={briefCta}
                  onChange={(e) => setBriefCta(e.target.value)}
                  placeholder="ابدأ بكتاب واحد هذا الشهر وشاركنا رحلتك."
                  maxLength={300}
                  rows={2}
                />
                <span className="studio-char-counter">{briefCta.length}/300</span>
              </div>
            </div>

            <div className="studio-draft-footer">
              <button
                type="button"
                className="studio-btn-save"
                onClick={saveBriefDraft}
              >
                <Save size={16} />
                <span>حفظ المسودة</span>
              </button>
              {!activeTool && draftFeedback && (
                <span style={{ fontSize: '12.5px', color: '#22c55e', fontWeight: 700 }}>
                  {draftFeedback}
                </span>
              )}
            </div>
          </div>

          {/* Left Column: Tools Card */}
          <div className="studio-tools-card">
            <div className="studio-tools-head">
              <strong>
                <Sliders size={18} style={{ color: '#d49748' }} />
                <span>أدوات الاستوديو</span>
              </strong>
              <span>أدوات عملية تساعدك على تطوير فكرتك.</span>
            </div>

            <div className="studio-tools-list">
              <div
                className={`studio-tool-item ${activeTool === 'matrix' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('matrix');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTool('matrix');
                  }
                }}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <LayoutGrid size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>مصفوفة الأفكار</strong>
                    <span>وضع الاحتمالات ورتّب الأفكار.</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>

              <div
                className={`studio-tool-item ${activeTool === 'storyboard' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('storyboard');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTool('storyboard');
                  }
                }}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <FileText size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>سيناريو</strong>
                    <span>حوّل الفكرة إلى تسلسل واضح.</span>
                    <span className="sr-only">تسلسل المشاهد</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>

              <div
                className={`studio-tool-item ${activeTool === 'metrics' ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('metrics');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTool('metrics');
                  }
                }}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <BarChart3 size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>قياس بسيط</strong>
                    <span>حدّد ما الذي ستقيسه للنجاح.</span>
                    <span className="sr-only">مقاييس الحملة</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Toolbar */}
        <div className="studio-bottom-toolbar">
          <div className="studio-toolbar-group-end">
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => {
                setActiveTool('brief');
                setDraftFeedback('');
              }}
            >
              <FileText size={16} />
              <span>مسودة جديدة</span>
              <span className="sr-only">فتح ورقة عمل جديدة</span>
            </button>
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => go?.('projects')}
            >
              <FolderKanban size={16} />
              <span>فتح مشروع موجود</span>
            </button>
          </div>

          <div className="studio-toolbar-group-start">
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => setConfirmClearOpen(true)}
            >
              <RotateCcw size={16} />
              <span>تفريغ المسودة</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmClearOpen}
        title="تأكيد تفريغ المسودة"
        description="سيتم مسح جميع حقول مسودة الحملة الحالية من الشاشة ومن التخزين المحلي. هل تريد المتابعة؟"
        confirmLabel="نعم، فرّغ المسودة"
        cancelLabel="إلغاء"
        danger
        onConfirm={confirmClearBrief}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {activeTool && (
        <div className="studio-modal-backdrop" onClick={() => setActiveTool(null)}>
          <div
            className="studio-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="studio-modal-header">
              <div>
                <h2>
                  {activeTool === 'brief' && 'ورقة عمل جديدة / Campaign Brief'}
                  {activeTool === 'matrix' && 'مصفوفة الإبداع 2x2 (Creative Matrix)'}
                  {activeTool === 'storyboard' && 'لوحة تسلسل المشاهد (Storyboard)'}
                  {activeTool === 'metrics' && 'حاسبة مقاييس الحملات (Campaign Metrics)'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                  {activeTool === 'brief' && 'تثبيت العنوان، الجمهور، الرسالة الأساسية، والدعوة للإجراء.'}
                  {activeTool === 'matrix' && 'شبكة 2x2 لتوليد الأفكار بربط الجماهير بالزوايا الإبداعية.'}
                  {activeTool === 'storyboard' && 'ترتيب لقطات العمل ومشاهده بصريًا وصوتيًا خطوة بخطوة.'}
                  {activeTool === 'metrics' && 'حساب فوري محلي لمقاييس العائد، النقرات، وتكلفة الاكتساب.'}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setActiveTool(null)}
                aria-label="إغلاق ورقة العمل"
              >
                <X size={20} />
              </button>
            </div>

            <div className="studio-modal-body">
              {/* Campaign Brief */}
              {activeTool === 'brief' && (
                <>
                  <label>
                    عنوان الحملة / المشروع
                    <input
                      value={briefTitle}
                      onChange={(e) => setBriefTitle(e.target.value)}
                      placeholder="مثلاً: حملة إطلاق المساعد وِنس للإشراق والتركيز"
                    />
                  </label>
                  <label>
                    الجمهور المستهدف (Audience)
                    <textarea
                      value={briefAudience}
                      onChange={(e) => setBriefAudience(e.target.value)}
                      placeholder="من هو المستهدف بالتحديد؟ ما هي مشكلته اليومية واحتياجه الفعلي؟"
                      rows={3}
                    />
                  </label>
                  <label>
                    الرسالة الأساسية (Key Message)
                    <textarea
                      value={briefKeyMessage}
                      onChange={(e) => setBriefKeyMessage(e.target.value)}
                      placeholder="ما هي الفكرة الواحدة التي يجب أن يتذكرها بعد مشاهدة الحملة؟"
                      rows={3}
                    />
                  </label>
                  <label>
                    ملاحظة الدعوة للإجراء (Call To Action / CTA)
                    <textarea
                      value={briefCta}
                      onChange={(e) => setBriefCta(e.target.value)}
                      placeholder="ما هو الفعل الفوري المطلوب منه؟ (تحميل، تجربة، اشتراك...)"
                      rows={2}
                    />
                  </label>
                </>
              )}

              {/* Creative Matrix */}
              {activeTool === 'matrix' && (
                <div className="matrix-grid">
                  <div className="matrix-quadrant">
                    <h4>الربع الأول: جمهور حالي × مشكلة شائعة</h4>
                    <textarea
                      value={matrixQ1}
                      onChange={(e) => setMatrixQ1(e.target.value)}
                      placeholder="سجّل أفكار الربط هنا..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الثاني: جمهور حالي × زاوية غير متوقعة</h4>
                    <textarea
                      value={matrixQ2}
                      onChange={(e) => setMatrixQ2(e.target.value)}
                      placeholder="سجّل أفكار الطرح الإبداعي هنا..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الثالث: جمهور جديد × حاجة أساسية</h4>
                    <textarea
                      value={matrixQ3}
                      onChange={(e) => setMatrixQ3(e.target.value)}
                      placeholder="سجّل أفكار الوصول للجمهور الجديد..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الرابع: جمهور جديد × أسلوب سرد قصصي جريء</h4>
                    <textarea
                      value={matrixQ4}
                      onChange={(e) => setMatrixQ4(e.target.value)}
                      placeholder="سجّل الأفكار الجريئة هنا..."
                    />
                  </div>
                </div>
              )}

              {/* Storyboard */}
              {activeTool === 'storyboard' && (
                <div className="storyboard-steps">
                  {storyboardSteps.map((step, idx) => (
                    <div key={step.id} className="storyboard-step">
                      <div className="storyboard-step-header">
                        <strong>اللقطة #{digits(idx + 1)}</strong>
                        {storyboardSteps.length > 1 && (
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => setStoryboardSteps((steps) => steps.filter((s) => s.id !== step.id))}
                            aria-label="حذف اللقطة"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <div className="storyboard-step-grid">
                        <label>
                          المشهد / اللقطة البصرية
                          <textarea
                            value={step.scene}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStoryboardSteps((steps) =>
                                steps.map((s) => (s.id === step.id ? { ...s, scene: val } : s))
                              );
                            }}
                            placeholder="وصف المشهد البصري وحركة الكاميرا..."
                            rows={2}
                          />
                        </label>
                        <label>
                          الصوت / الحوار المصاحب
                          <textarea
                            value={step.audio}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStoryboardSteps((steps) =>
                                steps.map((s) => (s.id === step.id ? { ...s, audio: val } : s))
                              );
                            }}
                            placeholder="الكلام المنطوق أو المؤثرات الصوتية..."
                            rows={2}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      setStoryboardSteps((steps) => [
                        ...steps,
                        { id: `step-${Date.now()}`, scene: '', audio: '' },
                      ])
                    }
                  >
                    <Plus size={16} />
                    إضافة لقطة جديدة
                  </button>
                </div>
              )}

              {/* Campaign Metrics */}
              {activeTool === 'metrics' && (
                <div className="metrics-calculator-grid">
                  <div className="metric-card">
                    <h3>حاسبة العائد على الإنفاق الإعلاني (ROAS)</h3>
                    <p>مقياس يعكس كفاءة الإعلان وقدرته على توليد إيرادات مقابل كل جنيه أو دولار ينفق.</p>
                    <div className="metric-card-inputs">
                      <label>
                        العائد الكلي (Revenue)
                        <input
                          type="number"
                          min="0"
                          value={roasRevenue}
                          onChange={(e) => setRoasRevenue(e.target.value)}
                        />
                      </label>
                      <label>
                        الإنفاق الإعلاني (Ad Spend)
                        <input
                          type="number"
                          min="0"
                          value={roasSpend}
                          onChange={(e) => setRoasSpend(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>النتيجة الحالية</span>
                        <strong>{roasValue}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="metric-card">
                    <h3>معدل النقر إلى الظهور (CTR %)</h3>
                    <p>النسبة المئوية للأشخاص الذين نقروا على إعلانك بعد رؤيته.</p>
                    <div className="metric-card-inputs">
                      <label>
                        عدد النقرات (Clicks)
                        <input
                          type="number"
                          min="0"
                          value={ctrClicks}
                          onChange={(e) => setCtrClicks(e.target.value)}
                        />
                      </label>
                      <label>
                        مرات الظهور (Impressions)
                        <input
                          type="number"
                          min="0"
                          value={ctrImpressions}
                          onChange={(e) => setCtrImpressions(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>نسبة النقر</span>
                        <strong>{ctrValue}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="metric-card">
                    <h3>تكلفة الاكتساب / التحويل (CPL / CAC)</h3>
                    <p>متوسط التكلفة للحصول على عميل محتمل أو عملية تحويل ناجحة.</p>
                    <div className="metric-card-inputs">
                      <label>
                        التكلفة الإجمالية
                        <input
                          type="number"
                          min="0"
                          value={cplCost}
                          onChange={(e) => setCplCost(e.target.value)}
                        />
                      </label>
                      <label>
                        عدد التحويلات / العملاء
                        <input
                          type="number"
                          min="0"
                          value={cplConversions}
                          onChange={(e) => setCplConversions(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>التكلفة للتحويل</span>
                        <strong>{cplValue}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="studio-modal-footer">
              <div>
                {draftFeedback ? (
                  <span style={{ color: 'var(--primary-hover)', fontWeight: 600, fontSize: '13px' }}>
                    {draftFeedback}
                  </span>
                ) : (
                  <span style={{ color: 'var(--faint)', fontSize: '12px' }}>
                    تُحفظ المسودة محليًا على هذا الجهاز فقط
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (activeTool === 'brief') saveBriefDraft();
                    if (activeTool === 'matrix') saveMatrixDraft();
                    if (activeTool === 'storyboard') saveStoryboardDraft();
                    if (activeTool === 'metrics') saveMetricsDraft();
                  }}
                >
                  حفظ المسودة محليًا
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveTool(null)}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------- */
/* HISTORY VIEW (Real 30-Day SQLite v3 + Work Sessions) */
/* ---------------------------------------------------- */
export function HistoryView({
  data,
  checks,
  elapsed,
}: {
  data: BootstrapPayload;
  checks: Record<string, boolean>;
  elapsed: number;
}) {
  const [historyDays, setHistoryDays] = useState<DailyWorshipRecord[]>([]);
  const [workSessions, setWorkSessions] = useState<WorkSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getHistoryRange(30), listWorkSessions(100)])
      .then(([days, sessions]) => {
        if (!active) return;
        setHistoryDays(Array.isArray(days) ? days : []);
        setWorkSessions(Array.isArray(sessions) ? sessions : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [checks]);

  const todayPrayersDone = prayerKeys.filter((key) => checks[key]).length;
  const totalSavedFocusSecs = workSessions.reduce((acc, s) => acc + (Number(s.durationSecs) || 0), 0);
  const totalFocusMins = Math.floor((totalSavedFocusSecs + Math.floor(elapsed / 1000)) / 60);
  const total30DayPrayers = historyDays.reduce(
    (sum, d) =>
      sum +
      (d.fajr ? 1 : 0) +
      (d.dhuhr ? 1 : 0) +
      (d.asr ? 1 : 0) +
      (d.maghrib ? 1 : 0) +
      (d.isha ? 1 : 0),
    0
  );
  const total30DayFasting = historyDays.filter((d) => d.fasting).length;

  return (
    <>
      <PageTitle
        title="السجل"
        copy="سجل محلي هادئ لآخر ٣٠ يوماً يعرض صلواتك وصيامك وجلسات تركيزك مباشرة من قاعدة البيانات."
      />

      <section className="history-summary surface">
        <div>
          <span>صلوات اليوم</span>
          <strong>{digits(todayPrayersDone)} / ٥</strong>
        </div>
        <div>
          <span>صلوات آخر ٣٠ يوماً</span>
          <strong>{digits(total30DayPrayers)} صلاة</strong>
        </div>
        <div>
          <span>أيام الصيام (٣٠ يوماً)</span>
          <strong>{digits(total30DayFasting)} {total30DayFasting === 1 ? 'يوم' : 'أيام'}</strong>
        </div>
        <div>
          <span>إجمالي التركيز المسجّل</span>
          <strong>{digits(totalFocusMins)} دقيقة</strong>
        </div>
        <div>
          <span>إجمالي المشروعات</span>
          <strong>{digits(data.projects.length)}</strong>
        </div>
      </section>

      <div className="history-panels-grid">
        {/* 30-Day Worship Log */}
        <section className="surface history-panel" style={{ padding: '22px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: '17px' }}>
            سجل العبادات اليومي (آخر ٣٠ يوماً)
          </h2>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>جاري تحميل السجل المحلي...</p>
          ) : historyDays.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>
              لا توجد أيام مسجلة بعد. ابدأ بتعليم صلواتك اليوم لتظهر هنا تلقائياً.
            </p>
          ) : (
            <div className="history-days-list">
              {historyDays.map((day) => {
                const count =
                  (day.fajr ? 1 : 0) +
                  (day.dhuhr ? 1 : 0) +
                  (day.asr ? 1 : 0) +
                  (day.maghrib ? 1 : 0) +
                  (day.isha ? 1 : 0);
                return (
                  <div key={day.date} className="history-day-row">
                    <div className="history-day-meta">
                      <strong>{formatBacklogDate(day.date)}</strong>
                      <span>{digits(count)} / ٥ صلوات{day.fasting ? ' · صيام ✓' : ''}</span>
                    </div>
                    <div className="history-prayer-dots" aria-label={`صلوات يوم ${day.date}`}>
                      {[
                        ['الفجر', day.fajr],
                        ['الظهر', day.dhuhr],
                        ['العصر', day.asr],
                        ['المغرب', day.maghrib],
                        ['العشاء', day.isha],
                      ].map(([label, done]) => (
                        <span
                          key={String(label)}
                          className={`history-prayer-pill ${done ? 'done' : ''}`}
                        >
                          {String(label)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recorded Work Sessions */}
        <section className="surface history-panel" style={{ padding: '22px' }}>
          <h2 style={{ margin: '0 0 14px', fontSize: '17px' }}>
            سجل جلسات التركيز ({digits(workSessions.length)})
          </h2>
          {loading ? (
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>جاري تحميل الجلسات...</p>
          ) : workSessions.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '13.5px' }}>
              لم تُسجّل جلسات تركيز بعد. ابدأ جلسة بومودورو أو ساعة إيقاف من قسم الشغل.
            </p>
          ) : (
            <div className="history-sessions-list">
              {workSessions.slice(0, 20).map((s) => (
                <div key={s.id} className="history-session-row">
                  <div>
                    <strong>{s.projectTitle || 'بدون مشروع محدد'}</strong>
                    <span>
                      {formatBacklogDate(s.endedAt.slice(0, 10))} ·{' '}
                      {arTimeFmt ? arTimeFmt.format(new Date(s.endedAt)) : s.endedAt.slice(11, 16)}
                    </span>
                  </div>
                  <strong className="history-session-dur">{formatDurationSecs(s.durationSecs)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/* ---------------------------------------------------- */
/* DEVICES VIEW                                         */
/* ---------------------------------------------------- */
function Devices({ deviceId }: { deviceId: string }) {
  return (
    <>
      <PageTitle
        title="الأجهزة والمزامنة"
        copy="مزامنة مباشرة ومشفرة على الشبكة المحلية P2P، بدون سحابة أو تخزين وسيط."
      />
      <div className="two-column">
        <section className="surface device-card">
          <div className="device-icon">
            <Smartphone size={24} />
          </div>
          <div>
            <span>هذا الجهاز المحلي</span>
            <h2>Windows Desktop</h2>
            <code>{deviceId}</code>
          </div>
          <strong className="local-status">متصل وموثوق</strong>
        </section>

        <aside className="surface unavailable">
          <WifiOff size={26} style={{ color: 'var(--faint)' }} />
          <h2>مزامنة Android المحلية</h2>
          <p>
            النواة المحلية تدعم التزامن المشفر عبر الشبكة المحلية (LAN). تطبيق Android
            سيتوفر فور اكتمال تجهيز البيئة الخاصة به.
          </p>
          <button className="secondary-button" disabled>
            إضافة جهاز عبر الشبكة
          </button>
        </aside>
      </div>
    </>
  );
}

/* ---------------------------------------------------- */
/* MODULES VIEW                                         */
/* ---------------------------------------------------- */
interface InstalledModuleRecord {
  id: string;
  name: string;
  version: string;
  rollbackPath?: string | null;
  hasRollback: boolean;
}

export function Modules() {
  const [path, setPath] = useState('');
  const [developer, setDeveloper] = useState(false);
  const [result, setResult] = useState('');
  const [ready, setReady] = useState(false);
  const [lastPreviewName, setLastPreviewName] = useState('');
  const [rollbackFeedback, setRollbackFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const [modulesList, setModulesList] = useState<InstalledModuleRecord[]>(() => {
    try {
      const raw = localStorage.getItem('wens-installed-modules');
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(isPlainObject) as unknown as InstalledModuleRecord[];
        }
      }
    } catch {}
    return [];
  });

  const inspect = async () => {
    setReady(false);
    setRollbackFeedback(null);
    try {
      const preview = await previewModule(path, developer);
      setLastPreviewName(preview.manifest.name);
      setResult(
        `${preview.manifest.name} · الناشر: ${preview.manifest.publisher} · ${
          preview.files.length
        } ملفات · ${preview.signed ? 'توقيع صالح' : 'غير موقعة'}`
      );
      setReady(true);
    } catch (error) {
      setResult(String(error));
    }
  };

  const install = async () => {
    setRollbackFeedback(null);
    try {
      const installed = await installModule(path, developer);
      setResult(
        `تم تثبيت الحزمة ${installed.moduleId} v${installed.version} بنجاح محليًا${
          installed.rollbackPath ? ' (النسخة السابقة محفوظة للرجوع).' : '.'
        }`
      );
      setReady(false);
      setModulesList((prev) => {
        const existing = prev.find((m) => m.id === installed.moduleId);
        const updatedMod: InstalledModuleRecord = {
          id: installed.moduleId,
          name: lastPreviewName || existing?.name || installed.moduleId,
          version: installed.version,
          rollbackPath: installed.rollbackPath,
          hasRollback: Boolean(installed.rollbackPath),
        };
        const next = [updatedMod, ...prev.filter((m) => m.id !== installed.moduleId)];
        try {
          localStorage.setItem('wens-installed-modules', JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      setResult(String(error));
    }
  };

  const handleRollback = async (moduleId: string) => {
    setRollbackFeedback(null);
    try {
      const rollbackRes = await rollbackModule(moduleId);
      setRollbackFeedback({
        success: true,
        message: `تم التراجع للإصدار السابق بنجاح: الحزمة ${moduleId} أصبحت الآن بالإصدار v${rollbackRes.version}.`,
      });
      setModulesList((prev) => {
        const next = prev.map((m) =>
          m.id === moduleId
            ? { ...m, version: rollbackRes.version, hasRollback: false, rollbackPath: null }
            : m
        );
        try {
          localStorage.setItem('wens-installed-modules', JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (error) {
      setRollbackFeedback({
        success: false,
        message: `فشل التراجع للإصدار السابق: ${String(error)}`,
      });
    }
  };

  return (
    <>
      <PageTitle
        title="الحزم والإضافات"
        copy="قوالب وثيمات بيانات نقية فقط (.wenspack) — لا تتضمن أكواد برمجية مشبوهة أو أوامر Shell."
      />
      <section className="surface module-installer">
        <PackageOpen size={32} style={{ color: 'var(--primary-hover)' }} />
        <div>
          <h2>فحص وتثبيت حزم .wenspack</h2>
          <p>
            تتحقق النواة من صحة المسارات والحجم والتجزئة (Hash) والتوقيع قبل تثبيت أي
            ملف.
          </p>
        </div>

        <label>
          مسار ملف الحزمة
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Packages\arabic-marketing.wenspack"
          />
        </label>

        <label className="switch-line">
          <input
            type="checkbox"
            checked={developer}
            onChange={(e) => setDeveloper(e.target.checked)}
          />
          <span>وضع المطور (Developer Mode) للسماح بالحزم غير الموقعة</span>
        </label>

        <div className="module-actions">
          <button className="primary-button" onClick={inspect} disabled={!path}>
            فحص الحزمة
          </button>
          {ready && (
            <button className="secondary-button" onClick={install}>
              تأكيد التثبيت
            </button>
          )}
        </div>

        {result && <output>{result}</output>}
      </section>

      <section className="modules-staged-list surface" style={{ marginTop: '24px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Boxes size={24} style={{ color: 'var(--primary-hover)' }} />
          <div>
            <h3 style={{ margin: 0, fontSize: '17px' }}>الحزم المثبتة والمجهزة (Installed & Staged)</h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              قائمة الحزم المتاحة محليًا مع إمكانية التراجع الآمن لأي نسخة سابقة في حال حدوث خطأ.
            </p>
          </div>
        </div>

        {rollbackFeedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px',
              background: rollbackFeedback.success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${rollbackFeedback.success ? 'var(--primary-hover)' : '#ef4444'}`,
              color: 'var(--ink)',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {rollbackFeedback.message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {modulesList.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--muted)', fontSize: '13.5px', textAlign: 'center' }}>
              لا توجد حزم مثبتة بعد. يمكنك فحص وتثبيت حزمة .wenspack محلية من القسم أعلاه.
            </div>
          )}
          {modulesList.map((mod) => (
            <div
              key={mod.id}
              className="module-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ fontSize: '15px' }}>{mod.name}</strong>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                  <code style={{ fontSize: '12px', color: 'var(--faint)' }}>{mod.id}</code>
                  <span style={{ fontSize: '12px', padding: '2px 6px', background: 'var(--surface)', borderRadius: '4px' }}>
                    v{mod.version}
                  </span>
                  {mod.hasRollback && (
                    <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                      (نسخة سابقة متاحة)
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => handleRollback(mod.id)}
                aria-label={`تراجع للإصدار السابق للحزمة ${mod.name}`}
              >
                <RotateCcw size={16} />
                تراجع للإصدار السابق (Rollback)
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------- */
/* SETTINGS VIEW (5 Dedicated Rich Sections + States)   */
/* ---------------------------------------------------- */
const themesList: Array<{
  id: ThemeId;
  title: string;
  testTitle: string;
  desc: string;
  bg: string;
  arcStroke: string;
  sunColor: string;
}> = [
  {
    id: 'midnight-magenta',
    title: 'كلاسيكي',
    testTitle: 'أفق الليل',
    desc: 'داكن دافئ',
    bg: 'linear-gradient(180deg, #13171e 0%, #1a222f 100%)',
    arcStroke: '#d49748',
    sunColor: '#f59e0b',
  },
  {
    id: 'nile-teal',
    title: 'أزرق ليلي',
    testTitle: 'ليل النيل',
    desc: 'داكن هادئ',
    bg: 'linear-gradient(180deg, #0e1724 0%, #132236 100%)',
    arcStroke: '#38bdf8',
    sunColor: '#0ea5e9',
  },
  {
    id: 'copper-garden',
    title: 'أخضر زيتوني',
    testTitle: 'حديقة النحاس',
    desc: 'طبيعي',
    bg: 'linear-gradient(180deg, #0e1915 0%, #152720 100%)',
    arcStroke: '#22c55e',
    sunColor: '#10b981',
  },
  {
    id: 'studio-voltage',
    title: 'رمادي',
    testTitle: 'ليل الاستوديو',
    desc: 'محايد',
    bg: 'linear-gradient(180deg, #16181c 0%, #22252b 100%)',
    arcStroke: '#94a3b8',
    sunColor: '#e2e8f0',
  },
  {
    id: 'dawn-sand',
    title: 'رملي نهاري',
    testTitle: 'رمل الفجر',
    desc: 'نهاري دافئ',
    bg: 'linear-gradient(180deg, #faf6f0 0%, #ede3d2 100%)',
    arcStroke: '#b45309',
    sunColor: '#d97706',
  },
];

const accentsList: Array<{ id: AccentId; label: string; color: string }> = [
  { id: 'amber', label: 'عنبري', color: '#f59e0b' },
  { id: 'aqua', label: 'أكوا', color: '#06b6d4' },
  { id: 'lime', label: 'ليموني', color: '#84cc16' },
  { id: 'rose', label: 'وردي', color: '#f43f5e' },
  { id: 'violet', label: 'بنفسجي', color: '#a855f7' },
];

type SettingsSectionId = 'appearance' | 'notifications' | 'companion' | 'location' | 'privacy' | 'island';

export function SettingsView({
  data,
  setData,
  setAudioPlaying,
  prayer,
  syncReminderPlan,
  refreshPrayerForSettings,
  onReloadAll,
  go,
  onOpenOnboarding,
  triggerToast,
}: {
  data: BootstrapPayload;
  setData: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  setAudioPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  prayer: PrayerDay | null;
  syncReminderPlan: (settings: AppPreferences, today: PrayerDay) => Promise<void>;
  refreshPrayerForSettings?: (settings: AppPreferences) => Promise<PrayerDay>;
  onReloadAll?: () => Promise<BootstrapPayload>;
  go?: (view: any) => void;
  onOpenOnboarding?: () => void;
  triggerToast?: (title: string, body: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [lastFailedPatch, setLastFailedPatch] = useState<AppPreferencesPatch | null>(null);
  const [activeSettings, setActiveSettings] = useState<AppPreferences>(data.settings);
  const [previewCompanionState, setPreviewCompanionState] = useState<CompanionVisualState>('idle');
  const [isPreviewTapped, setIsPreviewTapped] = useState(false);
  const [restorePath, setRestorePath] = useState('');
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [confirmFactoryResetOpen, setConfirmFactoryResetOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isCopyingDiagnostics, setIsCopyingDiagnostics] = useState(false);
  const [autostartActive, setAutostartActive] = useState(false);

  // Local drafts so invalid/partial inputs don't save NaN/0 or spam backend per keystroke
  const [latDraft, setLatDraft] = useState(() => String(sanitizeLatitude(data.settings.latitude, 30.0444)));
  const [lngDraft, setLngDraft] = useState(() => String(sanitizeLongitude(data.settings.longitude, 31.2357)));
  const [coordError, setCoordError] = useState<string | null>(null);
  const [quietStartDraft, setQuietStartDraft] = useState(data.settings.notifications.quietHours?.start || '22:00');
  const [quietEndDraft, setQuietEndDraft] = useState(data.settings.notifications.quietHours?.end || '06:00');
  const [icalUrlDraft, setIcalUrlDraft] = useState(data.settings.meetingsIcalUrl || '');
  const [icalError, setIcalError] = useState<string | null>(null);

  useEffect(() => {
    getAutostartIsEnabled().then(setAutostartActive).catch(() => {});
  }, []);

  const pendingPatchRef = useRef<AppPreferencesPatch | null>(null);
  const isSavingRef = useRef(false);
  const latestSettingsRef = useRef(data.settings);
  const saveTimerRef = useRef<number | null>(null);
  const previewTapTimerRef = useRef<number | null>(null);
  const needsPlanSyncRef = useRef(false);
  const needsPrayerRefreshRef = useRef(false);

  useEffect(() => {
    if (!isSavingRef.current && !pendingPatchRef.current) {
      latestSettingsRef.current = data.settings;
      setActiveSettings(data.settings);
      setLatDraft(String(sanitizeLatitude(data.settings.latitude, 30.0444)));
      setLngDraft(String(sanitizeLongitude(data.settings.longitude, 31.2357)));
      if (data.settings.notifications.quietHours) {
        setQuietStartDraft(data.settings.notifications.quietHours.start || '22:00');
        setQuietEndDraft(data.settings.notifications.quietHours.end || '06:00');
      }
      setIcalUrlDraft(data.settings.meetingsIcalUrl || '');
    }
  }, [data.settings]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (previewTapTimerRef.current) window.clearTimeout(previewTapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const sectionIds: SettingsSectionId[] = [
      'appearance',
      'notifications',
      'companion',
      'location',
      'privacy',
      'island',
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const rawId = visible[0].target.id.replace('settings-', '') as SettingsSectionId;
          if (sectionIds.includes(rawId)) {
            setActiveSection(rawId);
          }
        }
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: [0.1, 0.35] }
    );
    sectionIds.forEach((id) => {
      const el = document.getElementById(`settings-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const processQueue = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveState('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    let lastRes: { settings: AppPreferences; notificationSummary: NotificationSummary } | null = null;
    let hadError = false;

    try {
      while (pendingPatchRef.current) {
        const currentPatch = pendingPatchRef.current;
        pendingPatchRef.current = null;
        try {
          const res = await updateSettings(currentPatch);
          lastRes = res;
          setLastFailedPatch(null);
        } catch {
          hadError = true;
          setLastFailedPatch(currentPatch);
          break;
        }
      }

      if (hadError) {
        setSaveState('failed');
      } else if (lastRes) {
        if (!pendingPatchRef.current) {
          latestSettingsRef.current = lastRes.settings;
          setActiveSettings(lastRes.settings);
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  settings: lastRes!.settings,
                  notificationSummary: lastRes!.notificationSummary,
                }
              : null
          );
        }

        if (needsPrayerRefreshRef.current) {
          needsPrayerRefreshRef.current = false;
          needsPlanSyncRef.current = false;
          if (refreshPrayerForSettings) {
            await refreshPrayerForSettings(lastRes.settings);
          } else {
            const refreshed = await getPrayerDay(lastRes.settings);
            await syncReminderPlan(lastRes.settings, refreshed);
          }
        } else if (prayer && needsPlanSyncRef.current) {
          needsPlanSyncRef.current = false;
          await syncReminderPlan(lastRes.settings, prayer);
        }

        setSaveState('saved');
        saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 2500);
      } else {
        setSaveState('idle');
      }
    } finally {
      isSavingRef.current = false;
      if (pendingPatchRef.current && !hadError) {
        processQueue();
      } else if (!pendingPatchRef.current) {
        isLocalSettingsUpdate = false;
      }
    }
  };

  const applyChange = (patch: AppPreferencesPatch) => {
    lastLocalSettingsChange = Date.now();
    isLocalSettingsUpdate = true;
    if (patch.themeId) {
      document.documentElement.dataset.theme = patch.themeId;
    }
    if (patch.accentId) {
      document.documentElement.dataset.accent = patch.accentId;
    }
    if (patch.fontSize) {
      document.documentElement.dataset.fontSize = patch.fontSize;
    }
    if (patch.reducedMotion !== undefined) {
      document.documentElement.dataset.reducedMotion = patch.reducedMotion ? 'true' : 'false';
    }

    if (
      patch.latitude !== undefined ||
      patch.longitude !== undefined ||
      patch.calcMethod !== undefined ||
      patch.timeZone !== undefined ||
      patch.fajrOffset !== undefined ||
      patch.maghribOffset !== undefined ||
      patch.ishaOffset !== undefined ||
      patch.asrHanafi !== undefined
    ) {
      needsPrayerRefreshRef.current = true;
      needsPlanSyncRef.current = true;
    } else if (
      patch.notifications !== undefined ||
      patch.wuduLeadMinutes !== undefined ||
      patch.prePrayerLeads !== undefined
    ) {
      needsPlanSyncRef.current = true;
    }

    const optimistic = deepMergePreferences(latestSettingsRef.current, patch);
    latestSettingsRef.current = optimistic;
    setActiveSettings(optimistic);
    setData((prev) => (prev ? { ...prev, settings: optimistic } : null));

    pendingPatchRef.current = mergePatches(pendingPatchRef.current, patch);

    processQueue();
  };

  const commitCoordinates = (rawLat: string, rawLng: string) => {
    const parsedLat = Number(rawLat.trim());
    const parsedLng = Number(rawLng.trim());
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      setCoordError('خط العرض يجب أن يكون رقمًا بين 90- و 90.');
      return;
    }
    if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setCoordError('خط الطول يجب أن يكون رقمًا بين 180- و 180.');
      return;
    }
    setCoordError(null);
    applyChange({ latitude: parsedLat, longitude: parsedLng });
  };

  const commitIcalUrl = () => {
    const trimmed = icalUrlDraft.trim();
    if (!trimmed) {
      setIcalError(null);
      applyChange({ meetingsIcalUrl: '' });
      triggerToast?.('تقويم الاجتماعات', 'تم مسح رابط التقويم.');
      return;
    }
    if (!/^https:\/\/\S+/i.test(trimmed)) {
      setIcalError('لأمانك، يُقبل فقط رابط تقويم يبدأ بـ https://');
      return;
    }
    setIcalError(null);
    applyChange({ meetingsIcalUrl: trimmed });
    triggerToast?.('تقويم الاجتماعات', 'تم حفظ رابط iCal بنجاح.');
  };

  const prefs = activeSettings;
  const normalizedCalcMethod = normalizeCalcMethod(prefs.calcMethod);
  const normalizedTaskbarPos =
    prefs.taskbarWidgetPosition === 'far_left' || prefs.taskbarWidgetPosition === 'left'
      ? 'far_left'
      : 'tray';
  const normalizedIslandOrientation = (() => {
    const raw = (prefs.islandOrientation || 'top').toLowerCase();
    if (raw === 'left' || raw === 'right' || raw === 'bottom' || raw === 'top') return raw;
    if (raw === 'vertical') return 'right';
    return 'top';
  })();
  const matchedCityId =
    CITIES_CATALOG.find(
      (c) =>
        Math.abs(c.latitude - sanitizeLatitude(prefs.latitude, 30.0444)) < 0.05 &&
        Math.abs(c.longitude - sanitizeLongitude(prefs.longitude, 31.2357)) < 0.05
    )?.id || '';

  return (
    <>
      <div className="settings-unified-container">
        <div className="settings-unified-layout settings-shell">
          {/* Navigation rail on the right side in RTL */}
          <aside className="settings-rail-column">
            <div className="settings-header-rail">
              <strong>
                <Settings size={22} style={{ color: 'var(--accent, #d49748)' }} />
                <span>الإعدادات</span>
                <span className="settings-version-badge">v1.0.0</span>
              </strong>
              <span>خصص تجربتك في وِنس بما يناسبك</span>
            </div>

            <nav className="settings-menu-rail settings-rail" aria-label="أقسام الإعدادات">
              {([
                ['appearance', 'المظهر', Palette],
                ['notifications', 'التنبيهات والصوت', Bell],
                ['companion', 'الرفيق', Bot],
                ['location', 'الموقع والمواقيت', MapPin],
                ['privacy', 'الخصوصية والنسخ الاحتياطي', ShieldCheck],
                ['island', 'الكبسولة الذكية', Sparkles],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className={`settings-menu-item ${activeSection === id ? 'active' : ''}`}
                  aria-current={activeSection === id ? 'true' : undefined}
                  onClick={() => {
                    setActiveSection(id);
                    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="settings-content-flow settings-grid">
            <div className="settings-content-topbar">
              <button
                type="button"
                className="settings-btn-back"
                onClick={() => go?.('today')}
              >
                <ChevronLeft size={16} />
                <span>العودة إلى اليوم</span>
                <span className="sr-only">العودة إلى «أفق اليوم»</span>
              </button>

              <div className="sr-only" role="status" aria-live="polite">
                {saveState === 'saving'
                  ? 'جارٍ حفظ الإعدادات محليًا'
                  : saveState === 'saved'
                  ? 'تم حفظ الإعدادات بنجاح'
                  : saveState === 'failed'
                  ? 'فشل حفظ الإعدادات'
                  : ''}
              </div>
              {saveState !== 'idle' && (
                <div
                  className={`save-state-pill ${saveState}`}
                  role="status"
                  aria-live="polite"
                >
                  {saveState === 'saving' && (
                    <>
                      <RefreshCw size={15} className="spinner" />
                      <span>جارٍ الحفظ محليًا…</span>
                    </>
                  )}
                  {saveState === 'saved' && (
                    <>
                      <Check size={16} />
                      <span>تم الحفظ محليًا</span>
                    </>
                  )}
                  {saveState === 'failed' && (
                    <>
                      <AlertCircle size={16} />
                      <span>فشل الحفظ</span>
                      {lastFailedPatch && (
                        <button
                          type="button"
                          className="retry-btn"
                          onClick={() => applyChange(lastFailedPatch)}
                        >
                          أعد المحاولة
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Section 1: Themes & Accents */}
            <section className="settings-panel-card settings-card" id="settings-appearance">
              <div className="settings-panel-head">
                <div>
                  <h2 aria-label="المظهر والسمات">
                    <Palette size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>سمة التطبيق</span>
                  </h2>
                  <p>اختر المظهر الذي تفضله. جميع السمات محسنة لتجربة مريحة.</p>
                </div>
              </div>

              <div>
                <div className="settings-themes-row skin-grid">
                  {themesList.map((skin) => {
                    const isActive = prefs.themeId === skin.id;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        className={`settings-theme-card skin-card ${isActive ? 'active' : ''}`}
                        onClick={() => applyChange({ themeId: skin.id })}
                      >
                        <div
                          className="settings-theme-preview-box skin-card-preview"
                          style={{
                            background: skin.bg,
                            border:
                              skin.id === 'dawn-sand'
                                ? '1px solid rgba(180, 120, 50, 0.35)'
                                : '1px solid rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          {isActive && (
                            <div className="settings-theme-check-badge">
                              <Check size={12} />
                            </div>
                          )}
                          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                            <path d="M 0 35 Q 50 10 100 35" fill="none" stroke={skin.arcStroke} strokeWidth="1.5" opacity="0.85" />
                            <circle cx="50" cy="18" r="4.5" fill={skin.sunColor} />
                          </svg>
                        </div>
                        <strong>
                          {skin.title}
                          <span className="sr-only">{skin.testTitle}</span>
                        </strong>
                        <span>{skin.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <span
                  style={{
                    display: 'block',
                    marginBottom: '2px',
                    fontWeight: 700,
                    fontSize: '14px',
                    color: 'var(--ink, #edf2f7)',
                  }}
                >
                  لون التمييز
                </span>
                <span
                  style={{
                    display: 'block',
                    marginBottom: '10px',
                    fontSize: '12.5px',
                    color: 'var(--muted, #8b9baa)',
                  }}
                >
                  يُستخدم في الأزرار والروابط والعناصر النشطة.
                </span>
                <div className="settings-accents-row accent-row">
                  {accentsList.map((acc) => {
                    const isActive = prefs.accentId === acc.id;
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        className={`settings-accent-dot accent-swatch ${isActive ? 'active' : ''}`}
                        style={{ backgroundColor: acc.color, color: acc.color }}
                        onClick={() => applyChange({ accentId: acc.id })}
                        aria-label={`تحديد لون ${acc.label}`}
                        title={acc.label}
                      >
                        {isActive ? (
                          <Check size={14} color={acc.id === 'amber' || acc.id === 'lime' ? '#0c1218' : '#ffffff'} strokeWidth={3} />
                        ) : (
                          <span
                            className="accent-swatch-inner"
                            style={{ background: acc.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="settings-appearance-subrow">
                <div className="settings-subblock" style={{ margin: 0 }}>
                  <div className="settings-subblock-title">حجم النص</div>
                  <div className="settings-subblock-desc">تطبيق الحجم على كامل الواجهة.</div>
                  <div className="settings-fontsize-group">
                    {(['small', 'medium', 'large'] as const).map((sz) => {
                      const curSize = prefs.fontSize || 'medium';
                      return (
                        <button
                          key={sz}
                          type="button"
                          className={`settings-fontsize-btn ${curSize === sz ? 'active' : ''}`}
                          onClick={() => applyChange({ fontSize: sz })}
                        >
                          {sz === 'small' ? 'صغير' : sz === 'medium' ? 'متوسط' : 'كبير'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="settings-toggle-row" style={{ border: 'none', padding: 0 }}>
                  <div className="settings-toggle-info">
                    <strong>تقليل الحركة</strong>
                    <span>تقليل الرسوم والحركات في التطبيق يساعد على الراحة وتقليل التشتت.</span>
                  </div>
                  <button
                    type="button"
                    className="settings-motion-toggle"
                    aria-pressed={Boolean(prefs.reducedMotion)}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({ reducedMotion: !cur.reducedMotion });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* Section 2: Notifications & Audio */}
            <section className="settings-panel-card settings-card" id="settings-notifications">
              <div className="settings-panel-head">
                <div>
                  <h2 aria-label="التنبيهات والصوت">
                    <Volume2 size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>الصوت والتنبيهات</span>
                  </h2>
                  <p>اختر طريقة التنبيه ومستوى الصوت.</p>
                </div>
              </div>

              <div className="settings-sound-row">
                <div className="settings-sound-cards-grid">
                  <div
                    className={`settings-sound-card ${prefs.audio.prayer === 'silent' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => applyChange({ audio: { prayer: 'silent' } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        applyChange({ audio: { prayer: 'silent' } });
                      }
                    }}
                  >
                    {prefs.audio.prayer === 'silent' && (
                      <div className="settings-theme-check-badge">
                        <Check size={12} />
                      </div>
                    )}
                    <VolumeX size={26} />
                    <strong>صامت</strong>
                    <span className="sr-only">تنبيه بصري فقط بدون نغمات</span>
                  </div>
                  <div
                    className={`settings-sound-card ${prefs.audio.prayer === 'gentle-chime' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => applyChange({ audio: { prayer: 'gentle-chime' } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        applyChange({ audio: { prayer: 'gentle-chime' } });
                      }
                    }}
                  >
                    {prefs.audio.prayer === 'gentle-chime' && (
                      <div className="settings-theme-check-badge">
                        <Check size={12} />
                      </div>
                    )}
                    <Leaf size={26} />
                    <strong>نغمة هادئة</strong>
                    <span className="sr-only">رنين 528Hz لطيف</span>
                  </div>
                  <div
                    className={`settings-sound-card ${prefs.audio.prayer === 'adhan' ? 'active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => applyChange({ audio: { prayer: 'adhan' } })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        applyChange({ audio: { prayer: 'adhan' } });
                      }
                    }}
                  >
                    {prefs.audio.prayer === 'adhan' && (
                      <div className="settings-theme-check-badge">
                        <Check size={12} />
                      </div>
                    )}
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3c-1.5 2-2 3.5-2 5v1h4V8c0-1.5-.5-3-2-5z" />
                      <path d="M8 9h8v3H8z" />
                      <path d="M6 12h12v9H6z" />
                      <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
                    </svg>
                    <strong>أذان</strong>
                    <span className="sr-only">نداء الصلاة بصوت ندي</span>
                  </div>
                </div>

                <div className="settings-volume-section">
                  <div className="settings-volume-head">
                    <strong>مستوى الصوت</strong>
                    <span>{prefs.audio.volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    className="settings-volume-slider"
                    value={prefs.audio.volume}
                    onChange={(e) => applyChange({ audio: { volume: Number(e.target.value) } })}
                  />
                  <div className="settings-volume-desc">
                    يتم استخدام هذا الصوت للتنبيهات داخل التطبيق.
                  </div>
                </div>
              </div>

              {/* Notification switches (indexes 0..3 for Vitest) */}
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>تنبيه الاستعداد للصلاة (قبل الموعد)</strong>
                    <span>إشعار هادئ قبل الأذان للوضوء وقطع الشغل بتدرج.</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.notifications.prePrayerEnabled}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({
                        notifications: {
                          prePrayerEnabled: !cur.notifications.prePrayerEnabled,
                        },
                      });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                {prefs.notifications.prePrayerEnabled && (
                  <div
                    className="pre-prayer-leads-picker"
                    style={{
                      margin: '10px 0 16px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: '12.5px', color: 'var(--muted)', marginBottom: '10px', lineHeight: '1.5' }}>
                      اختر التنبيهات التي ترغب في تفعيلها قبل دخول الوقت (يمكنك اختيار أكثر من تنبيه):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {PRE_PRAYER_LEAD_OPTIONS.map(({ minutes, label }) => {
                        const activeLeads = Array.isArray(prefs.prePrayerLeads) && prefs.prePrayerLeads.length > 0
                          ? prefs.prePrayerLeads
                          : [Number(prefs.wuduLeadMinutes) || 15];
                        const isSelected = activeLeads.includes(minutes);
                        return (
                          <button
                            key={minutes}
                            type="button"
                            className={`lead-chip ${isSelected ? 'active' : ''}`}
                            aria-pressed={isSelected}
                            onClick={() => {
                              const cur = latestSettingsRef.current;
                              let nextLeads = Array.isArray(cur.prePrayerLeads) && cur.prePrayerLeads.length > 0
                                ? [...cur.prePrayerLeads]
                                : [Number(cur.wuduLeadMinutes) || 15];
                              if (isSelected) {
                                nextLeads = nextLeads.filter((m) => m !== minutes);
                                if (nextLeads.length === 0) {
                                  nextLeads = [minutes];
                                }
                              } else {
                                nextLeads = [...nextLeads, minutes];
                              }
                              nextLeads.sort((a, b) => b - a);
                              const primaryLead = nextLeads[nextLeads.length - 1] || 15;
                              applyChange({
                                prePrayerLeads: nextLeads,
                                wuduLeadMinutes: primaryLead,
                              });
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '16px',
                              border: isSelected
                                ? '1px solid var(--accent, #f59e0b)'
                                : '1px solid var(--border)',
                              background: isSelected
                                ? 'color-mix(in srgb, var(--accent, #f59e0b) 16%, transparent)'
                                : 'var(--surface)',
                              color: isSelected ? 'var(--accent, #f59e0b)' : 'var(--ink)',
                              fontSize: '12.5px',
                              fontWeight: isSelected ? 600 : 400,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span style={{ fontSize: '12px', opacity: isSelected ? 1 : 0.6 }}>{isSelected ? '✓' : '+'}</span>
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>تنبيه دخول وقت الصلاة</strong>
                    <span>إشعار في نفس دقيقة الأذان.</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.notifications.prayerAtTimeEnabled}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({
                        notifications: {
                          prayerAtTimeEnabled: !cur.notifications.prayerAtTimeEnabled,
                        },
                      });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>تنبيهات الصيام (السحور والإفطار)</strong>
                    <span>تذكير بموعد الإمساك قبل الفجر وقرب المغرب (اختياري).</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.notifications.fastingEnabled}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({
                        notifications: {
                          fastingEnabled: !cur.notifications.fastingEnabled,
                        },
                      });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>تنبيه انتهاء جلسة الشغل</strong>
                    <span>إشعار عند اكتمال جلسة التركيز المؤقتة.</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.notifications.focusCompletionEnabled}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({
                        notifications: {
                          focusCompletionEnabled: !cur.notifications.focusCompletionEnabled,
                        },
                      });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>
              </div>

              {/* Sound selects, quiet hours & test buttons */}
              <div style={{ marginTop: '16px' }}>
                <div className="setting-row">
                  <div className="setting-info">
                    <strong>التشغيل الصوتي في الخلفية</strong>
                    <span>اختر ما إذا كان الأذان والتنبيهات الصوتية تعمل حتى عند تصغير النافذة.</span>
                  </div>
                  <select
                    className="setting-select"
                    value={prefs.audio.backgroundPlayback}
                    onChange={(e) =>
                      applyChange({
                        audio: { backgroundPlayback: e.target.value as any },
                      })
                    }
                  >
                    <option value="always">دائمًا حتى عند تصغير النافذة (الافتراضي)</option>
                    <option value="foreground-only">فقط عند ظهور النافذة</option>
                  </select>
                </div>

                <div className="setting-row">
                  <div className="setting-info">
                    <strong>ساعات الهدوء (عدم الإزعاج)</strong>
                    <span>
                      {prefs.notifications.quietHours
                        ? 'مفعّلة — يتم كتم التنبيهات غير الحرجة خلال هذه الفترة.'
                        : 'معطّلة — فعّلها أولاً لتعديل ساعات عدم الإزعاج.'}
                    </span>
                  </div>
                  <div className="setting-time-row">
                    <input
                      type="time"
                      className="setting-time-input"
                      aria-label="بداية ساعات الهدوء"
                      disabled={!prefs.notifications.quietHours}
                      value={prefs.notifications.quietHours ? prefs.notifications.quietHours.start : quietStartDraft}
                      onChange={(e) => {
                        setQuietStartDraft(e.target.value);
                        const cur = latestSettingsRef.current;
                        if (!cur.notifications.quietHours) return;
                        applyChange({
                          notifications: {
                            quietHours: {
                              start: e.target.value,
                              end: cur.notifications.quietHours.end || quietEndDraft,
                            },
                          },
                        });
                      }}
                    />
                    <span>إلى</span>
                    <input
                      type="time"
                      className="setting-time-input"
                      aria-label="نهاية ساعات الهدوء"
                      disabled={!prefs.notifications.quietHours}
                      value={prefs.notifications.quietHours ? prefs.notifications.quietHours.end : quietEndDraft}
                      onChange={(e) => {
                        setQuietEndDraft(e.target.value);
                        const cur = latestSettingsRef.current;
                        if (!cur.notifications.quietHours) return;
                        applyChange({
                          notifications: {
                            quietHours: {
                              start: cur.notifications.quietHours.start || quietStartDraft,
                              end: e.target.value,
                            },
                          },
                        });
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ minHeight: '44px', padding: '0 12px' }}
                      onClick={() => {
                        const cur = latestSettingsRef.current;
                        applyChange({
                          notifications: {
                            quietHours: cur.notifications.quietHours
                              ? null
                              : { start: quietStartDraft || '22:00', end: quietEndDraft || '06:00' },
                          },
                        });
                      }}
                    >
                      {prefs.notifications.quietHours ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '14px' }}>
                  <span
                    style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: 650,
                      fontSize: '13px',
                    }}
                  >
                    اختبار فوري للصوت المحلي:
                  </span>
                  <div className="test-audio-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        setAudioPlaying(true);
                        await testNotification('gentle');
                      }}
                    >
                      اختبار نغمة هادئة
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        setAudioPlaying(true);
                        await testNotification('work');
                      }}
                    >
                      اختبار نغمة شغل
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={async () => {
                        setAudioPlaying(true);
                        await testNotification('adhan');
                      }}
                    >
                      اختبار مقطع أذان (٨ ثوانٍ)
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                      onClick={async () => {
                        await stopAudio();
                        setAudioPlaying(false);
                      }}
                    >
                      إيقاف الصوت الآن
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Companion */}
            <section className="settings-panel-card settings-card" id="settings-companion">
              <div className="settings-panel-head">
                <div>
                  <h2 aria-label="الرفيق والنوافذ العائمة">
                    <Bot size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>الرفيق</span>
                  </h2>
                  <p>اختر الشكل الذي يرافقك في التطبيق وعلى سطح المكتب.</p>
                </div>
              </div>

              <div className="settings-companion-row">
                <div className="settings-companion-cards-grid">
                  {([
                    { id: 'orb', name: 'الكرة', desc: 'تجريدي هادئ' },
                    { id: 'robot', name: 'الروبوت', desc: 'مساعد ذكي' },
                    { id: 'cat', name: 'القط', desc: 'أليف ومرح' },
                    { id: 'owl', name: 'البومة', desc: 'حكيمة ويقظة' },
                    { id: 'crescent', name: 'الهلال', desc: 'سكينة كبرى' },
                    { id: 'sprout', name: 'النبتة', desc: 'نمو وحيوية' },
                    { id: 'lantern', name: 'الفانوس', desc: 'نور وأصالة' },
                  ] as const).map((c) => {
                    const isSelected = (prefs.petAvatar || 'orb') === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`settings-companion-card ${isSelected ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          applyChange({ petAvatar: c.id });
                          playCompanionSound(c.id, 'select', {
                            enabled: prefs.petInteractionSounds !== false,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            applyChange({ petAvatar: c.id });
                            playCompanionSound(c.id, 'select', {
                              enabled: prefs.petInteractionSounds !== false,
                            });
                          }
                        }}
                      >
                        {isSelected && (
                          <div className="settings-theme-check-badge">
                            <Check size={12} />
                          </div>
                        )}
                        <div className="settings-companion-card-visual">
                          <CompanionViewer avatar={c.id} state="idle" size="small" />
                        </div>
                        <strong>{c.name}</strong>
                        <small>{c.desc}</small>
                      </div>
                    );
                  })}
                </div>

                <div className="settings-companion-preview-box">
                  <div
                    className="settings-companion-viewer-stage"
                    style={{ cursor: 'pointer' }}
                    title="انقر للتفاعل وسماع الصوت"
                    onClick={() => {
                      setIsPreviewTapped(true);
                      if (previewTapTimerRef.current) window.clearTimeout(previewTapTimerRef.current);
                      previewTapTimerRef.current = window.setTimeout(() => setIsPreviewTapped(false), 380);
                      playCompanionSound(prefs.petAvatar || 'orb', 'tap', {
                        enabled: prefs.petInteractionSounds !== false,
                      });
                    }}
                  >
                    <CompanionViewer
                      avatar={prefs.petAvatar || 'orb'}
                      state={previewCompanionState}
                      size={prefs.petSize || 'normal'}
                      className={isPreviewTapped ? 'is-tapped' : ''}
                    />
                  </div>
                  <div className="settings-speech-bubble">
                    {previewCompanionState === 'focus'
                      ? 'في وضع التركيز والهدوء.'
                      : previewCompanionState === 'prayer'
                      ? 'وقت الصلاة اقترب، جهّز نفسك.'
                      : previewCompanionState === 'celebration'
                      ? 'مبروك! خطوة جديدة في يومك.'
                      : previewCompanionState === 'review'
                      ? 'نراجع اللي تم النهارده بهدوء.'
                      : 'أنا هنا، نبدأ؟'}
                  </div>
                  <div className="settings-companion-state-bar">
                    {(['idle', 'focus', 'prayer', 'celebration', 'review'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`settings-companion-state-btn ${previewCompanionState === st ? 'active' : ''}`}
                        onClick={() => {
                          setPreviewCompanionState(st);
                          playCompanionSound(
                            prefs.petAvatar || 'orb',
                            st === 'idle' ? 'tap' : st,
                            { enabled: prefs.petInteractionSounds !== false }
                          );
                        }}
                      >
                        {st === 'idle'
                          ? 'هادئ'
                          : st === 'focus'
                          ? 'تركيز'
                          : st === 'prayer'
                          ? 'تنبيه'
                          : st === 'celebration'
                          ? 'إنجاز'
                          : 'مراجعة'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Companion Size Controls */}
              <div className="settings-size-group">
                <div className="setting-info">
                  <strong>حجم الرفيق</strong>
                  <span>حدد حجم ظهور الرفيق داخل التطبيق وعلى سطح المكتب.</span>
                </div>
                <div className="settings-size-buttons">
                  {(['small', 'normal', 'large'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`settings-size-btn ${(prefs.petSize || 'normal') === s ? 'active' : ''}`}
                      onClick={() => applyChange({ petSize: s })}
                    >
                      {s === 'small' ? 'صغير' : s === 'normal' ? 'عادي' : 'كبير'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Popup / Bubble Size Controls */}
              <div className="settings-size-group" style={{ marginTop: '12px' }}>
                <div className="setting-info">
                  <strong>حجم نافذة التنبيهات والبوباب</strong>
                  <span>تحكم في حجم بالون التنبيه والملاحظات التابع للرفيق.</span>
                </div>
                <div className="settings-size-buttons">
                  {(['compact', 'normal', 'large'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`settings-size-btn ${(prefs.petPopupSize || 'normal') === s ? 'active' : ''}`}
                      onClick={() => applyChange({ petPopupSize: s })}
                    >
                      {s === 'compact' ? 'مدمج' : s === 'normal' ? 'عادي' : 'كبير'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Idle Fade & Desktop Transparency */}
              <div className="settings-idle-box" style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                  <div className="setting-info">
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>تلاشي الرفيق عند الخمول</strong>
                    <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                      يصبح الرفيق شفافًا تلقائيًا عند ترك الماوس لعدم إشغال الشاشة، ويستعيد وضوحه الكامل (١٠٠٪) فورًا عند التفاعل أو التنبيه.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.petIdleFade !== false}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({ petIdleFade: !(cur.petIdleFade !== false) });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                {prefs.petIdleFade !== false && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>نسبة الشفافية عند الخمول:</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                          {Math.round((1 - (prefs.petIdleOpacity ?? 0.15)) * 100)}٪ شفافية ({Math.round((prefs.petIdleOpacity ?? 0.15) * 100)}٪ وضوح)
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {[
                          { label: '٨٥٪ شفافية (مستحسن)', val: 0.15 },
                          { label: '٦٠٪ شفافية', val: 0.40 },
                          { label: '٣٠٪ شفافية', val: 0.70 },
                          { label: '٠٪ (ثابت بدون تلاشي)', val: 1.0 },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            className={`settings-size-btn ${Math.abs((prefs.petIdleOpacity ?? 0.15) - opt.val) < 0.05 ? 'active' : ''}`}
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                            onClick={() => applyChange({ petIdleOpacity: opt.val })}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="95"
                        step="5"
                        className="settings-volume-slider"
                        value={Math.round((1 - (prefs.petIdleOpacity ?? 0.15)) * 100)}
                        onChange={(e) => {
                          const trans = Number(e.target.value);
                          const op = Number(((100 - trans) / 100).toFixed(2));
                          applyChange({ petIdleOpacity: op });
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>المدة قبل الدخول في وضع الخمول:</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)' }}>
                          {(prefs.petIdleDelaySeconds ?? 2) === 2 ? 'ثانيتان' : `${prefs.petIdleDelaySeconds ?? 2} ثوانٍ`}
                        </span>
                      </div>
                      <div className="settings-size-buttons">
                        {[
                          { label: 'ثانيتان (مستحسن)', val: 2 },
                          { label: '٣ ثوانٍ', val: 3 },
                          { label: '٥ ثوانٍ', val: 5 },
                          { label: '١٠ ثوانٍ', val: 10 },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            className={`settings-size-btn ${(prefs.petIdleDelaySeconds ?? 2) === opt.val ? 'active' : ''}`}
                            onClick={() => applyChange({ petIdleDelaySeconds: opt.val })}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Companion Position & Movement Controls */}
              <div className="settings-position-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px', padding: '14px', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div className="setting-info">
                    <strong>موضع وحركة الرفيق</strong>
                    <span>يمكنك سحب الرفيق بالماوس إلى أي مكان في الشاشة ويتم حفظ مكانه تلقائيًا.</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: '8px', fontSize: '12.5px' }}
                    onClick={async () => {
                      await petResetPosition();
                      triggerToast?.('موضع الرفيق', 'تمت إعادة الرفيق إلى الموضع الافتراضي.');
                    }}
                  >
                    أسفل اليمين (الموضع الافتراضي)
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: '8px', fontSize: '12.5px' }}
                    onClick={async () => {
                      await petSnapToCorner('bottom-left');
                      triggerToast?.('موضع الرفيق', 'تم نقل الرفيق إلى أسفل اليسار.');
                    }}
                  >
                    أسفل اليسار
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: '8px', fontSize: '12.5px' }}
                    onClick={async () => {
                      await petSnapToCorner('top-right');
                      triggerToast?.('موضع الرفيق', 'تم نقل الرفيق إلى أعلى اليمين.');
                    }}
                  >
                    أعلى اليمين
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: '8px', fontSize: '12.5px' }}
                    onClick={async () => {
                      await petSnapToCorner('top-left');
                      triggerToast?.('موضع الرفيق', 'تم نقل الرفيق إلى أعلى اليسار.');
                    }}
                  >
                    أعلى اليسار
                  </button>
                </div>
              </div>

              {/* Companion switches */}
              <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>الرفيق العائم (Floating Companion)</strong>
                    <span>إظهار وِنس العائم دائمًا فوق النوافذ ليرافقك طوال اليوم.</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={prefs.petVisible}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({ petVisible: !cur.petVisible });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>التجوال الاختياري (Roaming)</strong>
                    <span>يتحرك الرفيق بهدوء في مساحة صغيرة أسفل الشاشة، ويتوقف وقت التركيز والتنبيه.</span>
                  </div>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-pressed={Boolean(prefs.petRoaming)}
                    onClick={() => {
                      const cur = latestSettingsRef.current;
                      applyChange({ petRoaming: !cur.petRoaming });
                    }}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>

                <div className="toggle-row">
                  <div className="setting-info">
                    <strong>أصوات التفاعل (Interaction Sounds)</strong>
                    <span>أصوات قصيرة وهادئة عند اللعب والإنجاز مع الرفيق.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px' }}
                      title="تجربة صوت الرفيق"
                      onClick={() => {
                        playCompanionSound(prefs.petAvatar || 'orb', 'tap', { enabled: true });
                      }}
                    >
                      تجربة الصوت
                    </button>
                    <button
                      type="button"
                      className="toggle-switch"
                      aria-pressed={Boolean(prefs.petInteractionSounds)}
                      onClick={() => {
                        const cur = latestSettingsRef.current;
                        applyChange({ petInteractionSounds: !cur.petInteractionSounds });
                      }}
                    >
                      <span className="toggle-track">
                        <span className="toggle-thumb" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4: Location & Prayer Settings */}
            <section className="settings-panel-card settings-card" id="settings-location">
              <div className="settings-panel-head">
                <div>
                  <h2>
                    <MapPin size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>الموقع والمواقيت</span>
                  </h2>
                  <p>إحداثياتك لحساب مواقيت الصلاة محليًا بدقة فلكية دون أي طلبات خارجية.</p>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>المدينة المحددة (دليل المدن دون إنترنت)</strong>
                  <span>اختر مدينتك لضبط الإحداثيات والمنطقة الزمنية وطريقة الحساب تلقائيًا.</span>
                </div>
                <select
                  className="setting-select"
                  aria-label="المدينة المحددة"
                  value={matchedCityId}
                  onChange={(e) => {
                    const city = CITIES_CATALOG.find((c) => c.id === e.target.value);
                    if (city) {
                      setLatDraft(String(city.latitude));
                      setLngDraft(String(city.longitude));
                      setCoordError(null);
                      applyChange({
                        latitude: city.latitude,
                        longitude: city.longitude,
                        calcMethod: normalizeCalcMethod(city.calcMethod),
                        locationLabel: `${city.nameAr}، ${city.countryAr}`,
                        countryCode: city.countryCode,
                        timeZone: city.timeZone,
                        fajrOffset: city.fajrOffset ?? 0,
                        maghribOffset: city.maghribOffset ?? 0,
                        ishaOffset: city.ishaOffset ?? 0,
                      });
                    }
                  }}
                >
                  <option value="">-- اختر من قائمة المدن (أوفلاين) --</option>
                  {CITIES_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameAr} ({c.countryAr})
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>خط العرض (Latitude)</strong>
                  <span>قيمة بين 90- و 90 (يُحفظ عند الانتهاء من الإدخال).</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  min="-90"
                  max="90"
                  aria-label="خط العرض"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={latDraft}
                  onChange={(e) => setLatDraft(e.target.value)}
                  onBlur={() => commitCoordinates(latDraft, lngDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCoordinates(latDraft, lngDraft);
                  }}
                />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>خط الطول (Longitude)</strong>
                  <span>قيمة بين 180- و 180 (يُحفظ عند الانتهاء من الإدخال).</span>
                </div>
                <input
                  type="number"
                  step="0.0001"
                  min="-180"
                  max="180"
                  aria-label="خط الطول"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={lngDraft}
                  onChange={(e) => setLngDraft(e.target.value)}
                  onBlur={() => commitCoordinates(latDraft, lngDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCoordinates(latDraft, lngDraft);
                  }}
                />
              </div>

              {coordError && (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: '13px', margin: '4px 0 8px' }}>
                  {coordError}
                </p>
              )}

              <div className="setting-row">
                <div className="setting-info">
                  <strong>مهلة الاستعداد للوضوء</strong>
                  <span>كم دقيقة قبل وقت الصلاة ترغب في التذكير للاستعداد.</span>
                </div>
                <select
                  className="setting-select"
                  value={prefs.wuduLeadMinutes}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    const curLeads = Array.isArray(latestSettingsRef.current.prePrayerLeads) && latestSettingsRef.current.prePrayerLeads.length > 0
                      ? latestSettingsRef.current.prePrayerLeads
                      : [15];
                    const nextLeads = curLeads.includes(val) ? curLeads : [...curLeads, val].sort((a, b) => b - a);
                    applyChange({ wuduLeadMinutes: val, prePrayerLeads: nextLeads });
                  }}
                >
                  <option value="5">٥ دقائق</option>
                  <option value="10">١٠ دقائق</option>
                  <option value="15">١٥ دقيقة (الافتراضي)</option>
                  <option value="20">٢٠ دقيقة</option>
                  <option value="30">٣٠ دقيقة</option>
                  <option value="60">ساعة (٦٠ دقيقة)</option>
                </select>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>طريقة حساب المواقيت</strong>
                  <span>الهيئة الفلكية المعتمدة لحساب زوايا الفجر والعشاء (تتحدث المواقيت فورًا).</span>
                </div>
                <select
                  className="setting-select"
                  value={normalizedCalcMethod}
                  onChange={(e) => applyChange({ calcMethod: normalizeCalcMethod(e.target.value) })}
                >
                  <option value="egypt">الهيئة المصرية العامة للمساحة</option>
                  <option value="umm_al_qura">جامعة أم القرى (مكة المكرمة)</option>
                  <option value="muslim_world_league">رابطة العالم الإسلامي</option>
                  <option value="karachi">جامعة العلوم الإسلامية بكراتشي</option>
                  <option value="north_america">الجمعية الإسلامية لأمريكا الشمالية (ISNA)</option>
                  <option value="dubai">دبي / الإمارات</option>
                  <option value="kuwait">الكويت</option>
                  <option value="qatar">قطر</option>
                  <option value="turkey">رئاسة الشؤون الدينية التركية</option>
                  <option value="morocco">وزارة الأوقاف المغربية</option>
                  <option value="algeria">الجزائر</option>
                  <option value="tunisia">تونس</option>
                  <option value="jordan">الأردن</option>
                </select>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>فارق دقائق صلاة الفجر (Fajr Offset)</strong>
                  <span>تعديل يدوي بالدقائق لتقديم أو تأخير وقت الفجر (+ / -).</span>
                </div>
                <input
                  type="number"
                  step="1"
                  aria-label="فارق دقائق صلاة الفجر"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={prefs.fajrOffset ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    applyChange({ fajrOffset: Number.isNaN(val) ? 0 : Math.max(-60, Math.min(60, val)) });
                  }}
                />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>فارق دقائق صلاة المغرب (Maghrib Offset)</strong>
                  <span>تعديل يدوي بالدقائق لتقديم أو تأخير وقت المغرب (+ / -).</span>
                </div>
                <input
                  type="number"
                  step="1"
                  aria-label="فارق دقائق صلاة المغرب"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={prefs.maghribOffset ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    applyChange({ maghribOffset: Number.isNaN(val) ? 0 : Math.max(-60, Math.min(60, val)) });
                  }}
                />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>فارق دقائق صلاة العشاء (Isha Offset)</strong>
                  <span>تعديل يدوي بالدقائق لتقديم أو تأخير وقت العشاء (+ / -).</span>
                </div>
                <input
                  type="number"
                  step="1"
                  aria-label="فارق دقائق صلاة العشاء"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={prefs.ishaOffset ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    applyChange({ ishaOffset: Number.isNaN(val) ? 0 : Math.max(-60, Math.min(60, val)) });
                  }}
                />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>تصحيح التاريخ الهجري (Hijri Offset)</strong>
                  <span>تعديل اليوم الهجري (+ / - بالأيام) لمطابقة رؤية الهلال في بلدك.</span>
                </div>
                <input
                  type="number"
                  step="1"
                  min="-3"
                  max="3"
                  aria-label="تصحيح التاريخ الهجري"
                  className="setting-time-input"
                  style={{ width: '140px' }}
                  value={prefs.hijriDateOffset ?? 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    applyChange({ hijriDateOffset: Number.isNaN(val) ? 0 : Math.max(-3, Math.min(3, val)) });
                  }}
                />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>ويدجت شريط مهام Windows (Taskbar Strip)</strong>
                  <span>عرض الصلاة القادمة والعد التنازلي بجوار الساعة مباشرة بخفة عالية.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="ويدجت شريط مهام Windows"
                  aria-pressed={prefs.taskbarWidgetEnabled ?? true}
                  onClick={() => {
                    const cur = prefs.taskbarWidgetEnabled ?? true;
                    applyChange({ taskbarWidgetEnabled: !cur });
                    setTaskbarWidgetVisible(!cur);
                  }}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>موضع ويدجت شريط المهام</strong>
                  <span>اختر موضعه أو اسحبه مباشرة بالفأرة على شريط المهام إلى أي مكان.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="setting-select"
                    aria-label="موضع ويدجت شريط المهام"
                    value={normalizedTaskbarPos}
                    onChange={async (e) => {
                      const pos = e.target.value as 'tray' | 'far_left';
                      applyChange({ taskbarWidgetPosition: pos });
                      await resetTaskbarWidgetPosition();
                    }}
                  >
                    <option value="tray">بجوار صينية النظام والساعة (موصى به)</option>
                    <option value="far_left">أقصى يسار شريط المهام</option>
                  </select>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={async () => {
                      await resetTaskbarWidgetPosition();
                      triggerToast?.('شريط المهام', 'تمت إعادة ضبط موضع الشريط تلقائيًا');
                    }}
                  >
                    إعادة ضبط
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>نمط أرقام شريط المهام</strong>
                  <span>عرض الأوقات بالأرقام القياسية أو المشرقية.</span>
                </div>
                <select
                  className="setting-select"
                  aria-label="نمط أرقام شريط المهام"
                  value={prefs.taskbarWidgetDigits || 'latin'}
                  onChange={(e) => applyChange({ taskbarWidgetDigits: e.target.value as any })}
                >
                  <option value="latin">أرقام قياسية (04:37)</option>
                  <option value="arabic">أرقام مشرقية (٠٤:٣٧)</option>
                </select>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>التشغيل التلقائي مع بدء Windows</strong>
                  <span>تشغيل التطبيق تلقائيًا في الخلفية عند بدء تشغيل الجهاز.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="التشغيل التلقائي مع بدء Windows"
                  aria-pressed={autostartActive}
                  onClick={async () => {
                    const prev = autostartActive;
                    const next = !prev;
                    setAutostartActive(next);
                    try {
                      await setAutostart(next);
                      triggerToast?.(
                        'التشغيل التلقائي',
                        next ? 'تم تفعيل تشغيل وِنس مع بدء Windows.' : 'تم تعطيل التشغيل التلقائي.'
                      );
                    } catch (err: any) {
                      setAutostartActive(prev);
                      triggerToast?.('تعذر تحديث التشغيل التلقائي', String(err?.message || err));
                    }
                  }}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>
            </section>

            {/* Section 5: Privacy, Backup, Reset & Diagnostics */}
            <section className="settings-panel-card settings-card" id="settings-privacy">
              <div className="settings-panel-head">
                <div>
                  <h2 aria-label="الخصوصية والعمل دون اتصال">
                    <ShieldCheck size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>الخصوصية والنسخ الاحتياطي والتشخيص</span>
                  </h2>
                  <p>بياناتك محمية ومخزنة على جهازك فقط — بدون أي اتصالات خفية.</p>
                </div>
              </div>

              <div className="toggle-row">
                <div className="setting-info">
                  <strong>الوضع الصارم بدون شبكة (Strict Offline)</strong>
                  <span>حظر أي محاولة اتصال بالإنترنت بما في ذلك الإذاعة والتقويم السحابي.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-pressed={prefs.strictOffline}
                  onClick={() => {
                    const cur = latestSettingsRef.current;
                    applyChange({ strictOffline: !cur.strictOffline });
                  }}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              <div className="setting-row" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div className="setting-info">
                  <strong>النسخ الاحتياطي لقاعدة البيانات (SQLite v3)</strong>
                  <span>تصدير نسخة كاملة من مشاريعك وجلساتك وسجل العبادات محليًا أو استعادتها.</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '240px' }}>
                  <button
                    type="button"
                    disabled={isExporting}
                    className="primary-button"
                    style={{ minHeight: '40px', padding: '8px 14px' }}
                    onClick={async () => {
                      setIsExporting(true);
                      try {
                        const pickedPath = await pickBackupSavePath();
                        if (isTauriRuntime() && pickedPath === null) {
                          return;
                        }
                        const path = await exportBackupFile(pickedPath || undefined);
                        triggerToast?.('تم تصدير النسخة الاحتياطية', `تم حفظ الملف بنجاح: ${path}`);
                      } catch (err: any) {
                        triggerToast?.('فشل التصدير', String(err?.message || err));
                      } finally {
                        setIsExporting(false);
                      }
                    }}
                  >
                    {isExporting ? 'جارٍ التصدير…' : 'تصدير نسخة احتياطية (.json)'}
                  </button>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ minHeight: '38px', padding: '6px 10px', fontSize: '12.5px' }}
                      onClick={async () => {
                        const picked = await pickBackupOpenPath();
                        if (picked) {
                          setRestorePath(picked);
                        }
                      }}
                    >
                      اختيار ملف…
                    </button>
                    <input
                      type="text"
                      placeholder="مسار ملف النسخة الاحتياطية…"
                      aria-label="مسار ملف النسخة الاحتياطية"
                      value={restorePath}
                      onChange={(e) => setRestorePath(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: '140px',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--ink)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={isRestoring || !restorePath.trim()}
                      style={{ minHeight: '38px', padding: '6px 12px', fontSize: '13px' }}
                      onClick={() => {
                        if (!restorePath.trim()) return;
                        setConfirmRestoreOpen(true);
                      }}
                    >
                      {isRestoring ? 'جارٍ…' : 'استعادة'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="setting-row" style={{ marginTop: '10px' }}>
                <div className="setting-info">
                  <strong>معالج الإعداد الأولي</strong>
                  <span>إعادة فتح نافذة ضبط المدينة وتكامل سطح المكتب.</span>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onOpenOnboarding?.()}
                >
                  تشغيل معالج الإعداد
                </button>
              </div>

              <div className="setting-row" style={{ marginTop: '10px' }}>
                <div className="setting-info">
                  <strong>أدوات الدعم والتشخيص المحلي</strong>
                  <span>افتح مجلد السجلات أو انسخ تقرير التشخيص الخالي من بياناتك الخاصة لمشاركته عند وجود مشكلة.</span>
                </div>
                <div className="settings-diagnostics-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        await openLogsFolder();
                        triggerToast?.('مجلد السجلات', 'تم فتح مجلد السجلات المحلي.');
                      } catch (err: any) {
                        triggerToast?.('تعذر فتح السجلات', String(err?.message || err));
                      }
                    }}
                  >
                    فتح مجلد السجلات
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isCopyingDiagnostics}
                    onClick={async () => {
                      setIsCopyingDiagnostics(true);
                      try {
                        const bundle = await getDiagnosticsBundle();
                        const text = JSON.stringify(bundle, null, 2);
                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(text);
                        } else {
                          await setSmartClipboard(text);
                        }
                        triggerToast?.('تم نسخ تقرير التشخيص', 'يمكنك الآن لصق التقرير في رسالة الدعم الفني.');
                      } catch (err: any) {
                        triggerToast?.('تعذر نسخ التشخيص', String(err?.message || err));
                      } finally {
                        setIsCopyingDiagnostics(false);
                      }
                    }}
                  >
                    {isCopyingDiagnostics ? 'جارٍ التجهيز…' : 'نسخ تقرير التشخيص'}
                  </button>
                </div>
              </div>

              <div className="setting-row" style={{ marginTop: '10px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                <div className="setting-info">
                  <strong style={{ color: 'var(--danger)' }}>إعادة ضبط المصنع (Factory Reset)</strong>
                  <span>حذف كافة البيانات والإعدادات المحلية وإعادة وِنس لحالته الأولى. يُنصح بتصدير نسخة احتياطية أولاً.</span>
                </div>
                <button
                  type="button"
                  className="danger-button"
                  disabled={isResetting}
                  onClick={() => setConfirmFactoryResetOpen(true)}
                >
                  {isResetting ? 'جارٍ المسح…' : 'إعادة ضبط المصنع'}
                </button>
              </div>

              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px', lineHeight: 1.7, marginTop: '14px' }}>
                وِنس الإصدار <strong>v1.0.0</strong> — قاعدة البيانات (SQLite v3) ونظام الصوت (Rodio) ومولد التنبيهات
                يعملون محليًا ومستقلين تمامًا عن أي خادم خارجي.
              </p>
            </section>

            {/* Section 6: Dynamic Island & Desktop Productivity Suite */}
            <section className="settings-panel-card settings-card" id="settings-island">
              <div className="settings-panel-head">
                <div>
                  <h2>
                    <Sparkles size={20} style={{ color: 'var(--accent, #d49748)' }} />
                    <span>كبسولة وِنس الذكية وأدوات سطح المكتب (Dynamic Island)</span>
                  </h2>
                  <p>كبسولة علوية عائمة تتفاعل مع المؤشر، وتعرض مواقيت الصلاة، الإذاعة، الوسائط، الأذكار، الماء، الحافظة الذكية، الرف، ومؤشرات الخصوصية.</p>
                </div>
              </div>

              {/* Dynamic Island Enabled (single canonical toggle!) */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>تفعيل كبسولة وِنس الذكية (Dynamic Island)</strong>
                  <span>كبسولة عائمة تعرض مواقيت الصلاة، الإذاعة، والوسائط والتنبيهات التفاعلية بنقرة واحدة.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="تفعيل كبسولة وِنس الذكية"
                  aria-pressed={prefs.overlayWidget ?? true}
                  onClick={() => applyChange({ overlayWidget: !(prefs.overlayWidget ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {/* Dynamic Island Size & Re-center */}
              <div className="settings-size-group" style={{ marginTop: '10px', borderTop: 'none', paddingTop: 0 }}>
                <div className="setting-info">
                  <strong>حجم الكبسولة الذكية</strong>
                  <span>تحكم في حجم ظهور الكبسولة العائمة على الشاشة.</span>
                </div>
                <div className="settings-size-buttons">
                  {(['compact', 'normal', 'large'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`settings-size-btn ${(prefs.overlaySize || 'normal') === s ? 'active' : ''}`}
                      onClick={() => applyChange({ overlaySize: s })}
                    >
                      {s === 'compact' ? 'مدمج' : s === 'normal' ? 'عادي' : 'كبير'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Island Orientation & Theme */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>موضع الكبسولة على الشاشة</strong>
                  <span>اختر مكان تموضع الكبسولة أو أعد توسيطها أعلى منتصف الشاشة.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="setting-select"
                    aria-label="موضع الكبسولة"
                    value={normalizedIslandOrientation}
                    onChange={async (e) => {
                      const ori = e.target.value as 'top' | 'right' | 'left' | 'bottom';
                      applyChange({ islandOrientation: ori });
                      await setIslandOrientation(ori);
                    }}
                  >
                    <option value="top">أعلى المنتصف (الافتراضي)</option>
                    <option value="right">أعلى اليمين</option>
                    <option value="left">أعلى اليسار</option>
                    <option value="bottom">أسفل المنتصف</option>
                  </select>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '38px', padding: '6px 12px', fontSize: '12.5px' }}
                    onClick={async () => {
                      await overlayCenter();
                      triggerToast?.('الكبسولة الذكية', 'تم توسيط الكبسولة أعلى الشاشة.');
                    }}
                  >
                    توسيط الكبسولة
                  </button>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>مظهر الكبسولة وإخفاؤها في ملء الشاشة</strong>
                  <span>اختر شفافية الكبسولة وهل تختفي تلقائيًا أثناء الألعاب أو الفيديو بملء الشاشة.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="setting-select"
                    aria-label="نمط مظهر الكبسولة"
                    value={prefs.islandTheme || 'original'}
                    onChange={(e) => applyChange({ islandTheme: e.target.value as any })}
                  >
                    <option value="original">قياسي زجاجي</option>
                    <option value="acrylic">أكريليك شفاف</option>
                    <option value="opaque">معتم عالي التباين</option>
                    <option value="system">يتبع سمة التطبيق</option>
                  </select>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-label="إخفاء الكبسولة في وضع ملء الشاشة"
                    aria-pressed={prefs.islandHideFullscreen ?? true}
                    onClick={() => applyChange({ islandHideFullscreen: !(prefs.islandHideFullscreen ?? true) })}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>
              </div>

              {/* Quran Radio Settings */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>إذاعة القرآن الكريم المباشرة</strong>
                  <span>تفعيل مشغل إذاعة القرآن في الواجهة الرئيسية والكبسولة (يتوقف تلقائيًا في الوضع الصارم بدون شبكة).</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="إذاعة القرآن الكريم"
                  aria-pressed={prefs.quranRadioEnabled ?? true}
                  onClick={() => applyChange({ quranRadioEnabled: !(prefs.quranRadioEnabled ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {(prefs.quranRadioEnabled ?? true) && (
                <div className="setting-row">
                  <div className="setting-info">
                    <strong>الإذاعة الافتراضية وإيقافها عند الأذان</strong>
                    <span>المحطة المختارة تلقائيًا عند فتح التطبيق، مع خيار إيقافها مؤقتًا وقت الأذان.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="setting-select"
                      aria-label="إذاعة القرآن الافتراضية"
                      value={prefs.quranRadioDefaultStation || 'cairo'}
                      onChange={(e) => applyChange({ quranRadioDefaultStation: e.target.value })}
                    >
                      {POPULAR_RADIO_STATIONS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="toggle-switch"
                      aria-label="إيقاف الإذاعة عند الأذان"
                      aria-pressed={prefs.radioPauseAtPrayer ?? true}
                      onClick={() => applyChange({ radioPauseAtPrayer: !(prefs.radioPauseAtPrayer ?? true) })}
                    >
                      <span className="toggle-track">
                        <span className="toggle-thumb" />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* Dhikr Cards */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>بطاقات الأذكار والآيات الدورية</strong>
                  <span>ظهور بطاقة ذكر أو آية هادئة في الكبسولة الذكية كل فترة تختارها.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="setting-select"
                    aria-label="تكرار بطاقات الأذكار"
                    value={prefs.dhikrCardsIntervalMinutes || prefs.dhikrEveryMinutes || 25}
                    onChange={(e) => {
                      const mins = Number(e.target.value);
                      applyChange({ dhikrCardsIntervalMinutes: mins, dhikrEveryMinutes: mins });
                    }}
                  >
                    <option value={10}>كل ١٠ دقائق</option>
                    <option value={15}>كل ١٥ دقيقة</option>
                    <option value={25}>كل ٢٥ دقيقة (افتراضي)</option>
                    <option value={45}>كل ٤٥ دقيقة</option>
                    <option value={60}>كل ساعة</option>
                  </select>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-label="بطاقات الأذكار الدورية"
                    aria-pressed={prefs.dhikrCardsEnabled ?? true}
                    onClick={() => applyChange({ dhikrCardsEnabled: !(prefs.dhikrCardsEnabled ?? true) })}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                </div>
              </div>

              {/* Media Pill (SMTC) */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>التحكم بالوسائط (SMTC) وإيقافها عند الأذان</strong>
                  <span>عرض المقطع الصوتي النشط على الكبسولة وإيقافه تلقائيًا عند دخول وقت الصلاة.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-label="عرض شريط الوسائط في الكبسولة"
                    aria-pressed={prefs.mediaPillEnabled ?? true}
                    onClick={() => applyChange({ mediaPillEnabled: !(prefs.mediaPillEnabled ?? true) })}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                    aria-pressed={prefs.mediaPauseAtPrayer ?? true}
                    onClick={() => applyChange({ mediaPauseAtPrayer: !(prefs.mediaPauseAtPrayer ?? true) })}
                  >
                    {prefs.mediaPauseAtPrayer ?? true ? '✓ إيقاف عند الأذان' : 'دون إيقاف عند الأذان'}
                  </button>
                </div>
              </div>

              {/* Asr Jurist (Hanafi vs Standard) */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>المذهب الفقهي لحساب وقت العصر</strong>
                  <span>جمهور العلماء (الظل مثل الشيء) أو المذهب الحنفي (الظل مثلين) — يتحدث الجدول فورًا.</span>
                </div>
                <select
                  className="setting-select"
                  aria-label="المذهب الفقهي لحساب صلاة العصر"
                  value={prefs.asrHanafi ? 'hanafi' : 'standard'}
                  onChange={(e) => applyChange({ asrHanafi: e.target.value === 'hanafi' })}
                >
                  <option value="standard">الجمهور: الشافعي والمالكي والحنبلي (ظل الشيء مثله)</option>
                  <option value="hanafi">المذهب الحنفي (ظل الشيء مثليه)</option>
                </select>
              </div>

              {/* Water Reminders */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>تنبيهات شرب الماء وترطيب الجسم</strong>
                  <span>تذكير دوري ذكي يعتمد على وقت الاستخدام الفعلي للشاشة.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="تنبيهات شرب الماء"
                  aria-pressed={prefs.waterReminderEnabled ?? true}
                  onClick={() => applyChange({ waterReminderEnabled: !(prefs.waterReminderEnabled ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {/* Water Goal & Interval */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>الهدف اليومي وتكرار تذكير الماء</strong>
                  <span>عدد الأكواب المستهدفة والفترة بين كل كوب وآخر.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    className="setting-select"
                    aria-label="الهدف اليومي لشرب الماء"
                    value={prefs.waterDailyGoal || 8}
                    onChange={(e) => applyChange({ waterDailyGoal: Number(e.target.value) })}
                  >
                    <option value={6}>٦ أكواب (١.٥ لتر)</option>
                    <option value={8}>٨ أكواب (٢ لتر - موصى به)</option>
                    <option value={10}>١٠ أكواب (٢.٥ لتر)</option>
                    <option value={12}>١٢ كوباً (٣ لتر)</option>
                  </select>
                  <select
                    className="setting-select"
                    aria-label="تكرار تذكير الماء"
                    value={prefs.waterEveryMinutes || 45}
                    onChange={(e) => applyChange({ waterEveryMinutes: Number(e.target.value) })}
                  >
                    <option value={30}>كل ٣٠ دقيقة</option>
                    <option value={45}>كل ٤٥ دقيقة (افتراضي)</option>
                    <option value={60}>كل ٦٠ دقيقة</option>
                    <option value={90}>كل ٩٠ دقيقة</option>
                  </select>
                </div>
              </div>

              {/* 20-20-20 Eye Care & Wellbeing */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>استراحة العينين (قاعدة 20-20-20)</strong>
                  <span>تذكير للنظر بعيداً لمدة ٢٠ ثانية كل ٢٠ دقيقة لحماية نظرك وإراحة عضلات العين.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="استراحة العينين 20-20-20"
                  aria-pressed={prefs.eyeBreakEnabled ?? true}
                  onClick={() => applyChange({ eyeBreakEnabled: !(prefs.eyeBreakEnabled ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <strong>رسالة الترحيب بالعودة وموجز الصباح</strong>
                  <span>تحية لطيفة عند العودة بعد استراحة طويلة، وموجز هادئ لبدء يومك.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                    aria-pressed={prefs.welcomeBackEnabled ?? true}
                    onClick={() => applyChange({ welcomeBackEnabled: !(prefs.welcomeBackEnabled ?? true) })}
                  >
                    {prefs.welcomeBackEnabled ?? true ? '✓ الترحيب بالعودة' : 'الترحيب بالعودة (متوقف)'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                    aria-pressed={prefs.morningBriefEnabled ?? true}
                    onClick={() => applyChange({ morningBriefEnabled: !(prefs.morningBriefEnabled ?? true) })}
                  >
                    {prefs.morningBriefEnabled ?? true ? '✓ موجز الصباح' : 'موجز الصباح (متوقف)'}
                  </button>
                </div>
              </div>

              {/* Smart Clipboard */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>الحافظة الذكية وحساب المعادلات تلقائياً</strong>
                  <span>حساب العمليات الرياضية وتحويل الألوان فور نسخها، مع سجل مؤقت في الرام فقط (يستثني مديري كلمات المرور ولا يُحفظ على القرص).</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="الحافظة الذكية"
                  aria-pressed={prefs.smartClipboardEnabled ?? true}
                  onClick={() => {
                    const next = !(prefs.smartClipboardEnabled ?? true);
                    applyChange({ smartClipboardEnabled: next, clipboardHistoryEnabled: next });
                  }}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {/* File Shelf & Downloads */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>رف الملفات ومراقبة تنزيلات المتصفح</strong>
                  <span>مساحة وصول سريعة لأحدث ملفات التنزيلات ومتابعة تقدم التنزيلات من المتصفح على الكبسولة.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="رف الملفات والتنزيلات"
                  aria-pressed={prefs.shelfEnabled ?? true}
                  onClick={() => {
                    const next = !(prefs.shelfEnabled ?? true);
                    applyChange({ shelfEnabled: next, downloadsWatcherEnabled: next, screenshotAutoShelf: next });
                  }}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {/* Privacy Dots */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>مؤشرات الخصوصية للكاميرا والمايكروفون (Privacy Dots)</strong>
                  <span>إظهار نقطة خضراء/برتقالية في الكبسولة عند استخدام أي برنامج للمايكروفون أو الكاميرا (قراءة فقط).</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="مؤشرات الخصوصية"
                  aria-pressed={prefs.privacyDotsEnabled ?? true}
                  onClick={() => applyChange({ privacyDotsEnabled: !(prefs.privacyDotsEnabled ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {/* Calendar Meetings Feed */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>تكامل مواعيد الاجتماعات (iCal Feed)</strong>
                  <span>عرض مواعيد Google Calendar / Outlook لليوم مع زر الانضمام السريع لـ Meet أو Zoom أو Teams.</span>
                </div>
                <button
                  type="button"
                  className="toggle-switch"
                  aria-label="تكامل مواعيد الاجتماعات"
                  aria-pressed={prefs.meetingsIcalEnabled ?? true}
                  onClick={() => applyChange({ meetingsIcalEnabled: !(prefs.meetingsIcalEnabled ?? true) })}
                >
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </button>
              </div>

              {prefs.meetingsIcalEnabled && (
                <div className="setting-row">
                  <div className="setting-info">
                    <strong>رابط تقويم iCal (HTTPS فقط)</strong>
                    <span>أدخل الرابط السري لتقويمك عبر HTTPS (يُحظر الوصول للشبكة المحلية والملفات لأمانك).</span>
                    {icalError && (
                      <span role="alert" style={{ color: 'var(--danger)', display: 'block', marginTop: '4px' }}>
                        {icalError}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="url"
                      className="setting-input"
                      aria-label="رابط تقويم iCal"
                      placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                      value={icalUrlDraft}
                      onChange={(e) => {
                        setIcalUrlDraft(e.target.value);
                        if (icalError) setIcalError(null);
                      }}
                      onBlur={commitIcalUrl}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitIcalUrl();
                      }}
                      style={{
                        minWidth: '240px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--ink)',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ minHeight: '38px', padding: '6px 12px', fontSize: '12.5px' }}
                      onClick={commitIcalUrl}
                    >
                      حفظ الرابط
                    </button>
                  </div>
                </div>
              )}

              {/* Companion Cursor Eyes & Context Props */}
              <div className="setting-row">
                <div className="setting-info">
                  <strong>تتبع عيون الرفيق للمؤشر وتفاعلاته السياقية</strong>
                  <span>حركة عيون لطيفة تتبع المؤشر عند اقترابه من الرفيق العائم مع تعبيرات مناسبة لوضعك.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="toggle-switch"
                    aria-label="تتبع عيون الرفيق للمؤشر"
                    aria-pressed={prefs.petCursorEyes ?? true}
                    onClick={() => applyChange({ petCursorEyes: !(prefs.petCursorEyes ?? true) })}
                  >
                    <span className="toggle-track">
                      <span className="toggle-thumb" />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ minHeight: '34px', padding: '4px 10px', fontSize: '12px' }}
                    aria-pressed={prefs.petContextProps ?? true}
                    onClick={() => applyChange({ petContextProps: !(prefs.petContextProps ?? true) })}
                  >
                    {prefs.petContextProps ?? true ? '✓ تعبيرات سياقية' : 'تعبيرات سياقية (متوقف)'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmRestoreOpen}
        title="تأكيد استعادة النسخة الاحتياطية"
        description={`النسخة الكاملة من وِنس تستبدل البيانات الحالية. ملفات الاستيراد القديمة تدمج محتواها مع البيانات الحالية. الملف المحدد: ${restorePath.trim()}`}
        confirmLabel="نعم، استبدل واستعد البيانات"
        danger
        busy={isRestoring}
        onCancel={() => setConfirmRestoreOpen(false)}
        onConfirm={async () => {
          setIsRestoring(true);
          try {
            await restoreBackupFile(restorePath.trim());
            setConfirmRestoreOpen(false);
            if (onReloadAll) {
              await onReloadAll();
            }
            triggerToast?.('تمت استعادة البيانات بنجاح', 'تم استيراد النسخة الاحتياطية وتحديث كافة الشاشات.');
          } catch (err: any) {
            triggerToast?.('فشل استعادة البيانات', String(err?.message || err));
          } finally {
            setIsRestoring(false);
          }
        }}
      />

      <ConfirmModal
        open={confirmFactoryResetOpen}
        title="إعادة ضبط المصنع"
        description="سيتم مسح المشاريع والأفكار وسجل العبادات وجلسات الشغل والإعدادات. إذا أردت الاحتفاظ ببياناتك، صدّر نسخة احتياطية قبل المتابعة."
        confirmLabel="نعم، امسح الكل وأعد الضبط"
        danger
        busy={isResetting}
        onCancel={() => setConfirmFactoryResetOpen(false)}
        onConfirm={async () => {
          setIsResetting(true);
          try {
            const fresh = await factoryReset();
            setConfirmFactoryResetOpen(false);
            setData(fresh);
            setActiveSettings(fresh.settings);
            latestSettingsRef.current = fresh.settings;
            if (onReloadAll) {
              await onReloadAll();
            }
            triggerToast?.('تمت إعادة ضبط المصنع', 'عاد وِنس إلى إعداداته الأولية بنجاح.');
          } catch (err: any) {
            triggerToast?.('تعذرت إعادة ضبط المصنع', String(err?.message || err));
          } finally {
            setIsResetting(false);
          }
        }}
      />
    </>
  );
}

/* ---------------------------------------------------- */
/* COMMAND PALETTE                                      */
/* ---------------------------------------------------- */
export function CommandPalette({
  query,
  setQuery,
  go,
  close,
  data,
  onOpenBacklog,
  onOpenTimes,
}: {
  query: string;
  setQuery: (v: string) => void;
  go: (id: ViewId) => void;
  close: () => void;
  data: BootstrapPayload;
  onOpenBacklog?: () => void;
  onOpenTimes?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestedItems = useMemo(
    () => [
      { id: 'work' as ViewId, label: 'استئناف جلسة الشغل والتايمر', meta: 'إجراء مقترح' },
      { id: 'worship' as ViewId, label: 'مواقيت الصلاة والقبلة', meta: 'إجراء مقترح' },
      { id: 'worship' as ViewId, label: 'قضاء الفوائت والصلوات الفائتة', meta: 'إجراء مقترح' },
      { id: 'ideas' as ViewId, label: 'تدوين فكرة سريعة جديدة', meta: 'إجراء مقترح' },
      { id: 'settings' as ViewId, label: 'تخصيص المظهر والأصوات', meta: 'إجراء مقترح' },
      { id: 'history' as ViewId, label: 'سجل التنبيهات والأداء', meta: 'إجراء مقترح' },
    ],
    []
  );

  const items = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return suggestedItems;
    }
    return [
      ...suggestedItems,
      ...visibleNavItems.map((item) => ({ id: item.id, label: item.label, meta: 'قسم' })),
      ...data.projects.map((item) => ({
        id: 'projects' as ViewId,
        label: item.title,
        meta: 'مشروع',
      })),
      ...data.ideas.map((item) => ({
        id: 'ideas' as ViewId,
        label: item.title,
        meta: 'فكرة',
      })),
    ].filter((item) => item.label.toLowerCase().includes(trimmed));
  }, [data, query, suggestedItems]);

  const visibleItems = useMemo(() => items.slice(0, 10), [items]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleClose = useCallback(() => {
    setQuery('');
    close();
  }, [close, setQuery]);

  const executeItem = useCallback(
    (item: { id: ViewId; label: string }) => {
      setQuery('');
      if (item.label.includes('قضاء الفوائت')) {
        onOpenBacklog?.();
      } else if (item.label.includes('مواقيت الصلاة')) {
        onOpenTimes?.();
      }
      go(item.id);
    },
    [go, onOpenBacklog, onOpenTimes, setQuery]
  );

  useEffect(() => {
    inputRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (selectedIndex >= visibleItems.length && visibleItems.length > 0) {
      setSelectedIndex(0);
    }
  }, [selectedIndex, visibleItems.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key === 'Tab') {
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const visible = Array.from(focusable).filter(
        (el) => el.tabIndex !== -1 && window.getComputedStyle(el).display !== 'none'
      );
      if (visible.length === 0) return;
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % visibleItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
      }
    } else if (e.key === 'Enter' && visibleItems[selectedIndex]) {
      e.preventDefault();
      executeItem(visibleItems[selectedIndex]);
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={handleClose}>
      <div
        ref={dialogRef}
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="البحث والانتقال السريع"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="palette-search">
          <Search size={22} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="ابحث عن قسم، مشروع، أو فكرة…"
            aria-label="مدخل البحث"
          />
          <button
            type="button"
            className="icon-button"
            onClick={handleClose}
            aria-label="إغلاق لوحة الأوامر"
          >
            <X size={20} />
          </button>
        </div>

        <div className="palette-results">
          {visibleItems.map((item, index) => (
            <button
              key={`${item.id}-${index}`}
              type="button"
              className={selectedIndex === index ? 'active' : ''}
              onClick={() => executeItem(item)}
            >
              <span>{item.label}</span>
              <small>{item.meta}</small>
              <ChevronLeft size={18} />
            </button>
          ))}

          {visibleItems.length === 0 && (
            <div style={{ padding: '16px', color: 'var(--faint)', textAlign: 'center' }}>
              لا توجد نتائج مطابقة لبحثك.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'contextmenu',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') ||
          Boolean(window.getSelection()?.toString()))
      ) {
        return;
      }
      e.preventDefault();
    },
    true
  );
}

if (typeof document !== 'undefined') {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>
    );
    if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
  }
}
