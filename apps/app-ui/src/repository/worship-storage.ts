import type { AppPreferences, DailyWorshipRecord } from '../types';
import { toLocalDateString } from '../domain/formatters';
import { LEGACY_STORAGE_KEY } from '../domain/worship-backlog';
import {
  getDailyWorship,
  getHistoryRange,
  getDomainKv,
  isPlainObject,
  safeSetLocalStorage,
  setDailyWorship,
  setDomainKv,
} from '../api';

export interface DailyWorshipChecks {
  fajr?: boolean;
  sunrise?: boolean;
  dhuhr?: boolean;
  asr?: boolean;
  maghrib?: boolean;
  isha?: boolean;
  fasting?: boolean;
  [key: string]: boolean | undefined;
}

export interface KhatmaState {
  currentJuz: number;
  currentPage: number;
  targetDays: number;
  startDate: string;
}

const KHATMA_STORAGE_KEY = 'wens-khatma-v2';

const PRAYER_FIELD_TO_ARABIC: Record<string, string> = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

function sanitizeChecksObject(raw: unknown): DailyWorshipChecks {
  if (!isPlainObject(raw)) return {};
  const clean: DailyWorshipChecks = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'boolean') {
      clean[k] = v;
    }
  }
  return clean;
}

function toDailyWorshipRecord(dateStr: string, checks: DailyWorshipChecks): DailyWorshipRecord {
  return {
    date: dateStr,
    fajr: Boolean(checks.fajr),
    sunrise: Boolean(checks.sunrise),
    dhuhr: Boolean(checks.dhuhr),
    asr: Boolean(checks.asr),
    maghrib: Boolean(checks.maghrib),
    isha: Boolean(checks.isha),
    fasting: Boolean(checks.fasting),
    note: null,
    updatedAt: new Date().toISOString(),
  };
}

export function getDailyChecks(dateStr: string): DailyWorshipChecks {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(`wens-checks-${dateStr}`);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        return sanitizeChecksObject(parsed);
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (isPlainObject(legacy) && isPlainObject(legacy.accountability) && isPlainObject(legacy.accountability.days)) {
        const day = legacy.accountability.days[dateStr];
        if (isPlainObject(day)) {
          const prayers = isPlainObject(day.prayers) ? day.prayers : {};
          return {
            fajr: prayers['الفجر'] === 'done' || prayers['الفجر'] === 'made-up',
            sunrise: prayers['الشروق'] === 'done',
            dhuhr: prayers['الظهر'] === 'done' || prayers['الظهر'] === 'made-up',
            asr: prayers['العصر'] === 'done' || prayers['العصر'] === 'made-up',
            maghrib: prayers['المغرب'] === 'done' || prayers['المغرب'] === 'made-up',
            isha: prayers['العشاء'] === 'done' || prayers['العشاء'] === 'made-up',
            fasting: day.fasting === 'yes',
          };
        }
      }
    }
  } catch {
    // fallback
  }
  return {};
}

function cacheWorshipChecks(record: DailyWorshipRecord): DailyWorshipChecks {
  const checks: DailyWorshipChecks = {
    fajr: record.fajr,
    sunrise: record.sunrise,
    dhuhr: record.dhuhr,
    asr: record.asr,
    maghrib: record.maghrib,
    isha: record.isha,
    fasting: record.fasting,
  };
  safeSetLocalStorage(`wens-checks-${record.date}`, JSON.stringify(checks));
  return checks;
}

export async function hydrateDailyChecksFromSqlite(dateStr: string): Promise<DailyWorshipChecks> {
  try {
    const remote = await getDailyWorship(dateStr);
    if (remote) return cacheWorshipChecks(remote);
  } catch {
    // Fall back to the local mirror if the database is temporarily unavailable.
  }
  return getDailyChecks(dateStr);
}

export async function hydrateRecentWorshipFromSqlite(today: string): Promise<void> {
  // Backlog reconciliation reads up to 90 previous days synchronously.
  const records = await getHistoryRange(92);
  for (const record of records) {
    if (record.date < today) cacheWorshipChecks(record);
  }
}

export function saveDailyChecks(
  dateStr: string,
  checks: DailyWorshipChecks
): DailyWorshipChecks {
  const safeChecks = sanitizeChecksObject(checks);
  if (typeof localStorage !== 'undefined') {
    try {
      safeSetLocalStorage(`wens-checks-${dateStr}`, JSON.stringify(safeChecks));

      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const parsedLegacy: unknown = JSON.parse(legacyRaw);
        const legacy: Record<string, any> = isPlainObject(parsedLegacy) ? parsedLegacy : {};
        if (!isPlainObject(legacy.accountability)) legacy.accountability = { days: {} };
        if (!isPlainObject(legacy.accountability.days)) legacy.accountability.days = {};
        if (!isPlainObject(legacy.accountability.days[dateStr])) {
          legacy.accountability.days[dateStr] = { prayers: {}, fasting: null, tasks: [] };
        }
        const day = legacy.accountability.days[dateStr];
        if (!isPlainObject(day.prayers)) day.prayers = {};

        for (const [field, arName] of Object.entries(PRAYER_FIELD_TO_ARABIC)) {
          if (safeChecks[field]) {
            day.prayers[arName] = 'done';
          } else if (day.prayers[arName] === 'done') {
            delete day.prayers[arName];
          }
        }
        if (safeChecks.fasting !== undefined) {
          day.fasting = safeChecks.fasting ? 'yes' : 'no';
        }
        safeSetLocalStorage(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
      }
    } catch {
      // ignore
    }
  }
  void setDailyWorship(toDailyWorshipRecord(dateStr, safeChecks)).catch(() => {});
  return safeChecks;
}

export function sanitizeTodayChecks(
  dateStr: string,
  checks: DailyWorshipChecks,
  prayerTimes?: Array<{ key: string; minutesFromMidnight: number }>,
  minuteNow?: number
): { cleaned: DailyWorshipChecks; changed: boolean } {
  const safeChecks = sanitizeChecksObject(checks);
  if (!prayerTimes || prayerTimes.length === 0) {
    return { cleaned: safeChecks, changed: false };
  }
  const nowMin =
    typeof minuteNow === 'number'
      ? minuteNow
      : (() => {
          const d = new Date();
          return d.getHours() * 60 + d.getMinutes();
        })();

  const cleaned: DailyWorshipChecks = { ...safeChecks };
  let changed = false;

  for (const field of Object.keys(PRAYER_FIELD_TO_ARABIC)) {
    if (!cleaned[field]) continue;
    const pTime = prayerTimes.find((t) => t.key === field);
    if (pTime && pTime.minutesFromMidnight > nowMin) {
      delete cleaned[field];
      changed = true;
    }
  }

  if (changed) {
    saveDailyChecks(dateStr, cleaned);
  }

  return { cleaned, changed };
}

export function setDailyCheck(
  dateStr: string,
  field: 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha' | 'fasting',
  completed: boolean
): DailyWorshipChecks {
  const current = getDailyChecks(dateStr);
  current[field] = completed;

  if (typeof localStorage !== 'undefined') {
    try {
      safeSetLocalStorage(`wens-checks-${dateStr}`, JSON.stringify(current));

      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsedLegacy: unknown = legacyRaw ? JSON.parse(legacyRaw) : {};
      const legacy: Record<string, any> = isPlainObject(parsedLegacy) ? parsedLegacy : {};
      if (!isPlainObject(legacy.accountability)) legacy.accountability = { days: {} };
      if (!isPlainObject(legacy.accountability.days)) legacy.accountability.days = {};
      if (!isPlainObject(legacy.accountability.days[dateStr])) {
        legacy.accountability.days[dateStr] = { prayers: {}, fasting: null, tasks: [] };
      }

      const day = legacy.accountability.days[dateStr];

      if (field === 'fasting') {
        day.fasting = completed ? 'yes' : 'no';
      } else if (PRAYER_FIELD_TO_ARABIC[field]) {
        if (!isPlainObject(day.prayers)) day.prayers = {};
        if (completed) {
          day.prayers[PRAYER_FIELD_TO_ARABIC[field]] = 'done';
        } else {
          delete day.prayers[PRAYER_FIELD_TO_ARABIC[field]];
        }
      }

      safeSetLocalStorage(LEGACY_STORAGE_KEY, JSON.stringify(legacy));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wens-check-synced', {
            detail: { dateStr, field, completed },
          })
        );
      }
    } catch {
      // ignore
    }
  }

  void setDailyWorship(toDailyWorshipRecord(dateStr, current)).catch(() => {});
  return current;
}

export function getKhatmaState(): KhatmaState {
  const defaultKhatma: KhatmaState = {
    currentJuz: 1,
    currentPage: 1,
    targetDays: 30,
    startDate: toLocalDateString(),
  };
  if (typeof localStorage === 'undefined') return defaultKhatma;
  try {
    const raw = localStorage.getItem(KHATMA_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        return {
          currentJuz: Math.max(1, Math.min(30, Number(parsed.currentJuz) || 1)),
          currentPage: Math.max(1, Math.min(604, Number(parsed.currentPage) || 1)),
          targetDays: Math.max(1, Number(parsed.targetDays) || 30),
          startDate: typeof parsed.startDate === 'string' && parsed.startDate ? parsed.startDate : defaultKhatma.startDate,
        };
      }
    }
  } catch {
    // fallback
  }
  return defaultKhatma;
}

export async function hydrateKhatmaFromSqlite(): Promise<KhatmaState> {
  const localState = getKhatmaState();
  try {
    const raw = await getDomainKv('khatma');
    if (!raw) return localState;
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      const hydrated: KhatmaState = {
        currentJuz: Math.max(1, Math.min(30, Number(parsed.currentJuz) || localState.currentJuz)),
        currentPage: Math.max(1, Math.min(604, Number(parsed.currentPage) || localState.currentPage)),
        targetDays: Math.max(1, Number(parsed.targetDays) || localState.targetDays),
        startDate: typeof parsed.startDate === 'string' && parsed.startDate ? parsed.startDate : localState.startDate,
      };
      safeSetLocalStorage(KHATMA_STORAGE_KEY, JSON.stringify(hydrated));
      return hydrated;
    }
  } catch {
    // fallback
  }
  return localState;
}

export function saveKhatmaState(next: Partial<KhatmaState>): KhatmaState {
  const current = getKhatmaState();
  const nextPage =
    next.currentPage !== undefined
      ? Math.max(1, Math.min(604, Number(next.currentPage) || 1))
      : current.currentPage;
  const computedJuz = Math.max(1, Math.min(30, Math.ceil(nextPage / 20.14)));
  const merged: KhatmaState = {
    currentJuz:
      next.currentJuz !== undefined
        ? Math.max(1, Math.min(30, Number(next.currentJuz) || 1))
        : next.currentPage !== undefined
        ? computedJuz
        : current.currentJuz,
    currentPage: nextPage,
    targetDays:
      next.targetDays !== undefined
        ? Math.max(1, Number(next.targetDays) || 30)
        : current.targetDays,
    startDate: next.startDate || current.startDate,
  };

  if (typeof localStorage !== 'undefined') {
    safeSetLocalStorage(KHATMA_STORAGE_KEY, JSON.stringify(merged));
  }
  void setDomainKv('khatma', JSON.stringify(merged)).catch(() => {});
  return merged;
}

export function getEffectiveHijriOffset(settings?: Partial<AppPreferences>): number {
  if (settings && typeof settings.hijriDateOffset === 'number' && Number.isFinite(settings.hijriDateOffset)) {
    return Math.max(-5, Math.min(5, settings.hijriDateOffset));
  }
  if (typeof localStorage !== 'undefined') {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        const legacy: unknown = JSON.parse(legacyRaw);
        if (isPlainObject(legacy) && isPlainObject(legacy.settings)) {
          const rawOffset = legacy.settings.hijriDateOffset;
          if (typeof rawOffset === 'number' && Number.isFinite(rawOffset)) {
            return Math.max(-5, Math.min(5, rawOffset));
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return 0;
}
