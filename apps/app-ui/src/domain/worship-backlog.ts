import type { PrayerDay } from '../types';
import { toLocalDateString, parseLocalDate } from './formatters';
import { gregorianToHijri } from './hijri-calendar';
import { getCivilClock, shiftCivilDate } from './astronomy';
import { getDailyChecks, setDailyCheck } from '../repository/worship-storage';
import { isPlainObject, safeSetLocalStorage, setDomainKv } from '../api';

export type PrayerName = 'الفجر' | 'الظهر' | 'العصر' | 'المغرب' | 'العشاء';

export type PrayerBacklogStatus = 'unconfirmed' | 'missed' | 'resolved' | 'removed';
export type PrayerResolution = 'made-up' | 'done' | 'excused';

export interface PrayerBacklogItem {
  id: string;
  prayerName: PrayerName;
  prayerDate: string; // YYYY-MM-DD
  source: 'automatic' | 'manual';
  status: PrayerBacklogStatus;
  resolution?: PrayerResolution | null;
  reason?: string; // 'window-ended' | 'day-rollover' | custom
  notes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export type FastingBacklogType =
  | 'قضاء رمضان'
  | 'يوم من رمضان'
  | 'نذر'
  | 'صيام مخطط'
  | 'آخر';

export type FastingBacklogStatus = 'unconfirmed' | 'missed' | 'resolved' | 'removed';
export type FastingResolution = 'fasted' | 'made-up' | 'excused' | 'not-required';

export interface FastingBacklogItem {
  id: string;
  fastingDate: string; // YYYY-MM-DD
  fastingType: FastingBacklogType | string;
  source: 'automatic' | 'manual';
  status: FastingBacklogStatus;
  resolution?: FastingResolution | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export interface BacklogState {
  autoTrack: boolean;
  autoReviewFasting: boolean;
  trackingStartedAt: string | null;
  items: PrayerBacklogItem[];
  fastingItems: FastingBacklogItem[];
}

export interface BacklogSummary {
  pendingPrayersCount: number;
  unconfirmedPrayersCount: number;
  missedPrayersCount: number;
  resolvedPrayersCount: number;
  madeUpPrayersCount: number;
  excusedPrayersCount: number;
  pendingFastingCount: number;
  resolvedFastingCount: number;
  madeUpFastingCount: number;
  excusedFastingCount: number;
  totalPendingCount: number;
}

export const BACKLOG_STORAGE_KEY = 'wens-prayer-backlog-v1';
export const LEGACY_STORAGE_KEY = 'wens-local-v1';

export const PRAYER_ORDER: PrayerName[] = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];

export const PRAYER_KEY_TO_NAME: Record<string, PrayerName> = {
  fajr: 'الفجر',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
};

export const PRAYER_NAME_TO_KEY: Record<PrayerName, string> = {
  'الفجر': 'fajr',
  'الظهر': 'dhuhr',
  'العصر': 'asr',
  'المغرب': 'maghrib',
  'العشاء': 'isha',
};

export function loadBacklogState(): BacklogState {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const defaultState: BacklogState = {
    autoTrack: true,
    autoReviewFasting: true,
    trackingStartedAt: todayStart.toISOString(),
    items: [],
    fastingItems: [],
  };

  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(BACKLOG_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        return {
          autoTrack: parsed.autoTrack !== false,
          autoReviewFasting: parsed.autoReviewFasting !== false,
          trackingStartedAt:
            typeof parsed.trackingStartedAt === 'string' && parsed.trackingStartedAt
              ? parsed.trackingStartedAt
              : defaultState.trackingStartedAt,
          items: Array.isArray(parsed.items)
            ? (parsed.items.filter(isPlainObject) as unknown as PrayerBacklogItem[])
            : [],
          fastingItems: Array.isArray(parsed.fastingItems)
            ? (parsed.fastingItems.filter(isPlainObject) as unknown as FastingBacklogItem[])
            : [],
        };
      }
    }

    // Attempt migration from legacy storage if available
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy: unknown = JSON.parse(legacyRaw);
      if (isPlainObject(legacy)) {
        const legacyPrayer = isPlainObject(legacy.prayerBacklog) ? legacy.prayerBacklog : null;
        const legacyFasting = isPlainObject(legacy.fastingBacklog) ? legacy.fastingBacklog : null;
        if (legacyPrayer || legacyFasting) {
          const state: BacklogState = {
            autoTrack: legacyPrayer?.autoTrack !== false,
            autoReviewFasting: legacyFasting?.autoReview !== false,
            trackingStartedAt:
              typeof legacyPrayer?.trackingStartedAt === 'string' && legacyPrayer.trackingStartedAt
                ? legacyPrayer.trackingStartedAt
                : defaultState.trackingStartedAt,
            items: Array.isArray(legacyPrayer?.items)
              ? (legacyPrayer.items.filter(isPlainObject) as unknown as PrayerBacklogItem[])
              : [],
            fastingItems: Array.isArray(legacyFasting?.items)
              ? (legacyFasting.items.filter(isPlainObject) as unknown as FastingBacklogItem[])
              : [],
          };
          safeSetLocalStorage(BACKLOG_STORAGE_KEY, JSON.stringify(state));
          return state;
        }
      }
    }
  } catch {
    // Return safe defaults
  }

  return defaultState;
}

export function saveBacklogState(state: BacklogState): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

  try {
    const serialized = JSON.stringify(state);
    safeSetLocalStorage(BACKLOG_STORAGE_KEY, serialized);
    void setDomainKv('worship_backlog', serialized).catch(() => {});

    // Sync into legacy store for companion backward compatibility
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsedLegacy: unknown = legacyRaw ? JSON.parse(legacyRaw) : {};
      const legacy: Record<string, any> = isPlainObject(parsedLegacy) ? parsedLegacy : {};
      legacy.prayerBacklog = {
        autoTrack: state.autoTrack,
        trackingStartedAt: state.trackingStartedAt,
        items: state.items,
      };
      legacy.fastingBacklog = {
        autoReview: state.autoReviewFasting,
        trackingStartedAt: state.trackingStartedAt,
        items: state.fastingItems,
      };
      safeSetLocalStorage(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    } catch {
      // Ignore legacy sync failures
    }

    // Broadcast change in window
    window.dispatchEvent(new CustomEvent('wens-backlog-changed', { detail: state }));
  } catch {
    // Ignore storage quota or environment issues
  }
}

export function getBacklogSummary(state: BacklogState): BacklogSummary {
  const pendingPrayers = (state.items || []).filter(
    (item) => item.status === 'unconfirmed' || item.status === 'missed'
  );
  const unconfirmedPrayers = pendingPrayers.filter((item) => item.status === 'unconfirmed');
  const missedPrayers = pendingPrayers.filter((item) => item.status === 'missed');
  const resolvedPrayers = (state.items || []).filter((item) => item.status === 'resolved');
  const madeUpPrayers = resolvedPrayers.filter((item) => item.resolution === 'made-up');
  const excusedPrayers = resolvedPrayers.filter((item) => item.resolution === 'excused');

  const pendingFasting = (state.fastingItems || []).filter(
    (item) => item.status === 'unconfirmed' || item.status === 'missed'
  );
  const resolvedFasting = (state.fastingItems || []).filter((item) => item.status === 'resolved');
  const madeUpFasting = resolvedFasting.filter((item) => item.resolution === 'made-up');
  const excusedFasting = resolvedFasting.filter((item) => item.resolution === 'excused');

  return {
    pendingPrayersCount: pendingPrayers.length,
    unconfirmedPrayersCount: unconfirmedPrayers.length,
    missedPrayersCount: missedPrayers.length,
    resolvedPrayersCount: resolvedPrayers.length,
    madeUpPrayersCount: madeUpPrayers.length,
    excusedPrayersCount: excusedPrayers.length,
    pendingFastingCount: pendingFasting.length,
    resolvedFastingCount: resolvedFasting.length,
    madeUpFastingCount: madeUpFasting.length,
    excusedFastingCount: excusedFasting.length,
    totalPendingCount: pendingPrayers.length + pendingFasting.length,
  };
}

export function getStoredPrayerCheck(
  prayerDate: string,
  prayerKey: string,
  _prayerName: PrayerName,
  todayChecks?: Record<string, boolean>
): boolean {
  const todayKey = toLocalDateString();
  if (prayerDate === todayKey && todayChecks) {
    return Boolean(todayChecks[prayerKey]);
  }
  const checks = getDailyChecks(prayerDate);
  return Boolean(checks[prayerKey]);
}

export function getStoredFastingCheck(
  fastingDate: string,
  todayChecks?: Record<string, boolean>
): boolean {
  const todayKey = toLocalDateString();
  if (fastingDate === todayKey && todayChecks) {
    return Boolean(todayChecks.fasting);
  }
  const checks = getDailyChecks(fastingDate);
  return Boolean(checks.fasting);
}

function firstBacklogDate(today: string, trackingStartedAt: string | null, timeZone?: string): string {
  const earliest = shiftCivilDate(today, -90);
  if (!trackingStartedAt) return today;
  const start = new Date(trackingStartedAt);
  if (!Number.isFinite(start.getTime())) return earliest;
  const startDate = getCivilClock(start, timeZone).date;
  return startDate < earliest ? earliest : startDate;
}

export function reconcilePrayerBacklog(
  state: BacklogState,
  todayPrayerDay?: PrayerDay | null,
  todayChecks: Record<string, boolean> = {},
  now: Date = new Date(),
  timeZone?: string
): { changed: boolean; state: BacklogState } {
  if (!state.autoTrack) {
    return { changed: false, state };
  }

  const items = [...(state.items || [])];
  let changed = false;

  const { date: todayKey, minutes: nowMinutes } = getCivilClock(now, timeZone);
  const yesterdayKey = shiftCivilDate(todayKey, -1);
  const firstDate = firstBacklogDate(todayKey, state.trackingStartedAt, timeZone);

  // Prayer window fallbacks (minutes from midnight)
  const defaultTimes: Record<string, number> = {
    fajr: 303,
    sunrise: 389,
    dhuhr: 778,
    asr: 983,
    maghrib: 1132,
    isha: 1248,
  };

  const getMinutes = (key: string): number => {
    if (todayPrayerDay) {
      const match = todayPrayerDay.times.find((t) => t.key === key);
      if (match) return match.minutesFromMidnight;
    }
    return defaultTimes[key] ?? 720;
  };

  // Obligatory prayers in sequence
  const prayers: Array<{ key: string; name: PrayerName }> = [
    { key: 'fajr', name: 'الفجر' },
    { key: 'dhuhr', name: 'الظهر' },
    { key: 'asr', name: 'العصر' },
    { key: 'maghrib', name: 'المغرب' },
    { key: 'isha', name: 'العشاء' },
  ];

  for (let prayerDate = firstDate; prayerDate <= todayKey; prayerDate = shiftCivilDate(prayerDate, 1)) {
    const isToday = prayerDate === todayKey;

    for (const { key, name } of prayers) {
      const isCompleted = isToday
        ? Boolean(todayChecks[key])
        : getStoredPrayerCheck(prayerDate, key, name);

      if (isCompleted) {
        // If prayer was completed, resolve any active item
        const activeIndex = items.findIndex(
          (it) =>
            it.prayerDate === prayerDate &&
            it.prayerName === name &&
            (it.status === 'unconfirmed' || it.status === 'missed')
        );
        if (activeIndex >= 0) {
          const currentItem = items[activeIndex];
          items[activeIndex] = {
            ...currentItem,
            status: 'resolved',
            resolution: 'done',
            resolvedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          changed = true;
        }
        continue;
      }

      // If prayer is today, check if its window has ended
      if (isToday) {
        let windowEnded = false;
        if (key === 'fajr') {
          windowEnded = nowMinutes >= getMinutes('sunrise');
        } else if (key === 'dhuhr') {
          windowEnded = nowMinutes >= getMinutes('asr');
        } else if (key === 'asr') {
          windowEnded = nowMinutes >= getMinutes('maghrib');
        } else if (key === 'maghrib') {
          windowEnded = nowMinutes >= getMinutes('isha');
        } else if (key === 'isha') {
          // Isha window extends until Fajr of next day; not ended today
          windowEnded = false;
        }

        if (!windowEnded) continue;
      }

      // Determine carry over for Isha vs window ended
      const isYesterday = prayerDate === yesterdayKey;
      const isIshaCarryOver =
        key === 'isha' && isYesterday && nowMinutes < getMinutes('fajr');

      // Check if item already exists
      const alreadyExists = items.some(
        (it) => it.prayerDate === prayerDate && it.prayerName === name
      );

      if (!alreadyExists) {
        const nowIso = now.toISOString();
        items.push({
          id: `auto-${prayerDate}-${key}`,
          prayerName: name,
          prayerDate,
          source: 'automatic',
          status: 'unconfirmed',
          reason: isIshaCarryOver ? 'day-rollover' : 'window-ended',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        changed = true;
      }
    }

  }

  const cappedItems = items.length > 600 ? items.slice(-600) : items;

  return {
    changed,
    state: {
      ...state,
      items: cappedItems,
    },
  };
}

export function reconcileFastingBacklog(
  state: BacklogState,
  todayPrayerDay?: PrayerDay | null,
  todayChecks: Record<string, boolean> = {},
  now: Date = new Date(),
  timeZone?: string
): { changed: boolean; state: BacklogState } {
  if (!state.autoReviewFasting) {
    return { changed: false, state };
  }

  const fastingItems = [...(state.fastingItems || [])];
  let changed = false;

  const { date: todayKey, minutes: nowMinutes } = getCivilClock(now, timeZone);
  const firstDate = firstBacklogDate(todayKey, state.trackingStartedAt, timeZone);

  const maghribMinutes =
    todayPrayerDay?.times.find((t) => t.key === 'maghrib')?.minutesFromMidnight ?? 1132;

  for (let fastingDate = firstDate; fastingDate <= todayKey; fastingDate = shiftCivilDate(fastingDate, 1)) {
    const isToday = fastingDate === todayKey;

    const isFasted = isToday
      ? Boolean(todayChecks.fasting)
      : getStoredFastingCheck(fastingDate);

    if (isFasted) {
      const activeIndex = fastingItems.findIndex(
        (it) =>
          it.fastingDate === fastingDate &&
          (it.status === 'unconfirmed' || it.status === 'missed')
      );
      if (activeIndex >= 0) {
        fastingItems[activeIndex] = {
          ...fastingItems[activeIndex],
          status: 'resolved',
          resolution: 'fasted',
          resolvedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        changed = true;
      }
    } else {
      const maghribPassed = isToday ? nowMinutes >= maghribMinutes : true;

      if (maghribPassed) {
        const calendarDay = parseLocalDate(fastingDate);
        let shouldTrack = false;
        let defaultType: FastingBacklogType | string = 'صيام مخطط';

        if (typeof localStorage !== 'undefined') {
          try {
            const intentions = getFastingIntentions();
            if (intentions && intentions[fastingDate]) {
              shouldTrack = true;
              defaultType = 'صيام مخطط';
            }
            const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyRaw) {
              const legacy = JSON.parse(legacyRaw);
              const day = legacy?.accountability?.days?.[fastingDate];
              if (day?.fasting === 'no') {
                shouldTrack = true;
                defaultType = 'صيام مخطط';
              }
              const plannedCustom = (legacy?.fasting?.custom || []).some(
                (item: any) => item.date === fastingDate
              );
              if (plannedCustom) {
                shouldTrack = true;
                defaultType = 'يوم الصيام المخصص';
              }
              const hijriOffset =
                Number(legacy?.settings?.hijriDateOffset ?? legacy?.settings?.hijriOffset) || 0;
              if (calendarDay && gregorianToHijri(calendarDay, hijriOffset).month === 9) {
                shouldTrack = true;
                defaultType = 'يوم من رمضان';
              }
            } else if (calendarDay && gregorianToHijri(calendarDay, 0).month === 9) {
              shouldTrack = true;
              defaultType = 'يوم من رمضان';
            }
          } catch {
            // ignore
          }
        }

        const alreadyExists = fastingItems.some((it) => it.fastingDate === fastingDate);
        if (shouldTrack && !alreadyExists) {
          const nowIso = now.toISOString();
          fastingItems.push({
            id: `auto-fast-${fastingDate}`,
            fastingDate,
            fastingType: defaultType,
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
          changed = true;
        }
      }
    }

  }

  const cappedItems = fastingItems.length > 300 ? fastingItems.slice(-300) : fastingItems;

  return {
    changed,
    state: {
      ...state,
      fastingItems: cappedItems,
    },
  };
}

export function addPrayerBacklogItem(
  state: BacklogState,
  input: {
    prayerName: PrayerName;
    prayerDate: string;
    notes?: string;
    status?: 'unconfirmed' | 'missed';
  }
): { state: BacklogState; item: PrayerBacklogItem } {
  if (!PRAYER_ORDER.includes(input.prayerName)) {
    throw new Error(`اسم الصلاة غير صحيح: ${input.prayerName}`);
  }

  const parsed = parseLocalDate(input.prayerDate);
  const todayKey = toLocalDateString();
  if (!parsed || input.prayerDate > todayKey) {
    throw new Error('يرجى اختيار تاريخ صحيح مش بعد النهارده.');
  }

  const nowIso = new Date().toISOString();
  const items = [...(state.items || [])];

  const existingIndex = items.findIndex(
    (it) =>
      it.prayerDate === input.prayerDate &&
      it.prayerName === input.prayerName &&
      it.status !== 'resolved' &&
      it.status !== 'removed'
  );

  let resultingItem: PrayerBacklogItem;

  if (existingIndex >= 0) {
    const existing = items[existingIndex];
    resultingItem = {
      ...existing,
      status: input.status || 'missed',
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      source: existing.source || 'manual',
      updatedAt: nowIso,
    };
    items[existingIndex] = resultingItem;
  } else {
    resultingItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      prayerName: input.prayerName,
      prayerDate: input.prayerDate,
      source: 'manual',
      status: input.status || 'missed',
      notes: input.notes?.trim() || '',
      reason: input.notes?.trim() || 'إضافة يدوية',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    items.push(resultingItem);
  }

  return {
    state: {
      ...state,
      items,
    },
    item: resultingItem,
  };
}

export function resolvePrayerBacklogItem(
  state: BacklogState,
  id: string,
  resolution: 'made-up' | 'done' | 'excused' | 'remove'
): { state: BacklogState; updatedItem?: PrayerBacklogItem } {
  const items = [...(state.items || [])];
  const index = items.findIndex((it) => it.id === id);
  if (index < 0) return { state };

  const current = items[index];
  const nowIso = new Date().toISOString();

  let updatedItem: PrayerBacklogItem;
  if (resolution === 'remove') {
    updatedItem = {
      ...current,
      status: 'removed',
      updatedAt: nowIso,
    };
  } else {
    updatedItem = {
      ...current,
      status: 'resolved',
      resolution,
      resolvedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  items[index] = updatedItem;
  return {
    state: { ...state, items },
    updatedItem,
  };
}

export function markPrayerBacklogAsMissed(
  state: BacklogState,
  id: string
): { state: BacklogState; updatedItem?: PrayerBacklogItem } {
  const items = [...(state.items || [])];
  const index = items.findIndex((it) => it.id === id);
  if (index < 0) return { state };

  const current = items[index];
  const nowIso = new Date().toISOString();
  const updatedItem: PrayerBacklogItem = {
    ...current,
    status: 'missed',
    updatedAt: nowIso,
  };

  items[index] = updatedItem;
  return {
    state: { ...state, items },
    updatedItem,
  };
}

export function reopenPrayerBacklogItem(
  state: BacklogState,
  id: string
): { state: BacklogState; updatedItem?: PrayerBacklogItem } {
  const items = [...(state.items || [])];
  const index = items.findIndex((it) => it.id === id);
  if (index < 0) return { state };

  const current = items[index];
  const nowIso = new Date().toISOString();
  const updatedItem: PrayerBacklogItem = {
    ...current,
    status: current.source === 'manual' ? 'missed' : 'unconfirmed',
    resolution: null,
    resolvedAt: null,
    updatedAt: nowIso,
  };

  items[index] = updatedItem;
  return {
    state: { ...state, items },
    updatedItem,
  };
}

export function addFastingBacklogItem(
  state: BacklogState,
  input: {
    fastingDate: string;
    fastingType: FastingBacklogType | string;
    notes?: string;
  }
): { state: BacklogState; item: FastingBacklogItem } {
  const parsed = parseLocalDate(input.fastingDate);
  const todayKey = toLocalDateString();
  if (!parsed || input.fastingDate > todayKey) {
    throw new Error('يرجى اختيار تاريخ صيام صحيح مش بعد النهارده.');
  }

  const nowIso = new Date().toISOString();
  const fastingItems = [...(state.fastingItems || [])];

  const existingIndex = fastingItems.findIndex(
    (it) =>
      it.fastingDate === input.fastingDate &&
      it.status !== 'resolved' &&
      it.status !== 'removed'
  );

  let resultingItem: FastingBacklogItem;
  if (existingIndex >= 0) {
    const existing = fastingItems[existingIndex];
    resultingItem = {
      ...existing,
      status: 'missed',
      fastingType: input.fastingType,
      notes: input.notes !== undefined ? input.notes.trim() : existing.notes,
      updatedAt: nowIso,
    };
    fastingItems[existingIndex] = resultingItem;
  } else {
    resultingItem = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `manual-fast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fastingDate: input.fastingDate,
      fastingType: input.fastingType || 'قضاء رمضان',
      source: 'manual',
      status: 'missed',
      notes: input.notes?.trim() || '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    fastingItems.push(resultingItem);
  }

  return {
    state: {
      ...state,
      fastingItems,
    },
    item: resultingItem,
  };
}

export function resolveFastingBacklogItem(
  state: BacklogState,
  id: string,
  resolution: 'fasted' | 'made-up' | 'excused' | 'remove'
): { state: BacklogState; updatedItem?: FastingBacklogItem } {
  const fastingItems = [...(state.fastingItems || [])];
  const index = fastingItems.findIndex((it) => it.id === id);
  if (index < 0) return { state };

  const current = fastingItems[index];
  const nowIso = new Date().toISOString();

  let updatedItem: FastingBacklogItem;
  if (resolution === 'remove') {
    updatedItem = {
      ...current,
      status: 'removed',
      resolution: 'not-required',
      updatedAt: nowIso,
    };
  } else {
    updatedItem = {
      ...current,
      status: 'resolved',
      resolution,
      resolvedAt: nowIso,
      updatedAt: nowIso,
    };
  }

  fastingItems[index] = updatedItem;
  return {
    state: { ...state, fastingItems },
    updatedItem,
  };
}

export function reopenFastingBacklogItem(
  state: BacklogState,
  id: string
): { state: BacklogState; updatedItem?: FastingBacklogItem } {
  const fastingItems = [...(state.fastingItems || [])];
  const index = fastingItems.findIndex((it) => it.id === id);
  if (index < 0) return { state };

  const current = fastingItems[index];
  const nowIso = new Date().toISOString();
  const updatedItem: FastingBacklogItem = {
    ...current,
    status: 'missed',
    resolution: null,
    resolvedAt: null,
    updatedAt: nowIso,
  };

  fastingItems[index] = updatedItem;
  return {
    state: { ...state, fastingItems },
    updatedItem,
  };
}

export const FASTING_INTENTIONS_STORAGE_KEY = 'wens-fasting-intentions';

export function getFastingIntentions(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FASTING_INTENTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v === true) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFastingIntention(intentKey: string, intended: boolean): Record<string, boolean> {
  const current = getFastingIntentions();
  if (intended) {
    current[intentKey] = true;
  } else {
    delete current[intentKey];
  }
  const serialized = JSON.stringify(current);
  if (typeof localStorage !== 'undefined') {
    safeSetLocalStorage(FASTING_INTENTIONS_STORAGE_KEY, serialized);
  }
  void setDomainKv('fasting_intentions', serialized).catch(() => {});
  return current;
}

export function isFastingDateCompleted(
  fastingDate: string,
  todayChecks?: Record<string, boolean>,
  fastingItems?: FastingBacklogItem[]
): boolean {
  const todayKey = toLocalDateString();
  if (fastingDate === todayKey && todayChecks && typeof todayChecks.fasting === 'boolean') {
    return todayChecks.fasting;
  }
  if (fastingItems && fastingItems.length > 0) {
    const item = fastingItems.find(
      (it) => it.fastingDate === fastingDate && it.status === 'resolved' && it.resolution === 'fasted'
    );
    if (item) return true;
  }
  return getStoredFastingCheck(fastingDate, todayChecks);
}

export function recordFastingCompletion(
  fastingDate: string,
  fastingType: string,
  completed: boolean,
  currentBacklog: BacklogState
): { nextBacklog: BacklogState; changed: boolean } {
  const nowIso = new Date().toISOString();
  let changed = false;

  // 1 & 2. Persist to checks and legacy accountability via unified repository
  setDailyCheck(fastingDate, 'fasting', completed);

  // 3. Update backlog fastingItems
  const items = [...(currentBacklog.fastingItems || [])];
  const existingIndex = items.findIndex((it) => it.fastingDate === fastingDate);

  if (completed) {
    if (existingIndex >= 0) {
      items[existingIndex] = {
        ...items[existingIndex],
        status: 'resolved',
        resolution: 'fasted',
        resolvedAt: nowIso,
        updatedAt: nowIso,
      };
      changed = true;
    } else {
      const newItem: FastingBacklogItem = {
        id: `sunnah-fast-${fastingDate}`,
        fastingDate,
        fastingType: fastingType || 'صيام سنة',
        source: 'manual',
        status: 'resolved',
        resolution: 'fasted',
        resolvedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      items.push(newItem);
      changed = true;
    }
  } else {
    // Unmarking completion
    if (existingIndex >= 0) {
      const existing = items[existingIndex];
      if (existing.id.startsWith('sunnah-fast-')) {
        items.splice(existingIndex, 1);
        changed = true;
      } else {
        items[existingIndex] = {
          ...existing,
          status: 'missed',
          resolution: null,
          resolvedAt: null,
          updatedAt: nowIso,
        };
        changed = true;
      }
    }
  }

  const nextBacklog: BacklogState = changed ? { ...currentBacklog, fastingItems: items } : currentBacklog;
  return { nextBacklog, changed };
}
