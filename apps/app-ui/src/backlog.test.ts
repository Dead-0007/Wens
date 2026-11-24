import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BACKLOG_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  addFastingBacklogItem,
  addPrayerBacklogItem,
  getBacklogSummary,
  loadBacklogState,
  reconcileFastingBacklog,
  reconcilePrayerBacklog,
  reopenFastingBacklogItem,
  reopenPrayerBacklogItem,
  resolveFastingBacklogItem,
  resolvePrayerBacklogItem,
  saveBacklogState,
  toLocalDateString,
  getStoredPrayerCheck,
  getStoredFastingCheck,
  calculateQibla,
  calculateSuhoorTime,
  gregorianToHijri,
  calculateMonthPrayerTable,
  calculateWeekPrayerTable,
  getTomorrowPrayerTimes,
  getUpcomingSunnahDays,
  isFastingDateCompleted,
  recordFastingCompletion,
  getFastingIntentions,
  saveFastingIntention,
  type BacklogState,
} from './backlog';
import type { PrayerDay } from './types';

describe('Prayer & Fasting Backlog Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('applies live checks only to the selected city day and preserves the actual UTC timestamp', () => {
    const now = new Date('2026-11-22T23:30:00Z');
    const hostDate = toLocalDateString(now);
    const cityIsAhead = hostDate === '2026-11-22';
    const timeZone = cityIsAhead ? 'Pacific/Kiritimati' : 'Pacific/Honolulu';
    const today = cityIsAhead ? '2026-11-23' : '2026-11-22';
    const yesterday = cityIsAhead ? '2026-11-22' : '2026-11-21';
    const startedAt = '2026-11-20T00:00:00Z';
    const state: BacklogState = {
      autoTrack: true,
      autoReviewFasting: true,
      trackingStartedAt: startedAt,
      items: [yesterday, today].map((date) => ({
        id: date, prayerDate: date, prayerName: 'الفجر', source: 'automatic',
        status: 'unconfirmed', createdAt: startedAt, updatedAt: startedAt,
      })),
      fastingItems: [yesterday, today].map((date) => ({
        id: date, fastingDate: date, fastingType: 'صيام مخطط', source: 'automatic',
        status: 'unconfirmed', createdAt: startedAt, updatedAt: startedAt,
      })),
    };
    const prayer = { date: today, times: [] };
    const checks = { fajr: true, fasting: true };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const prayers = reconcilePrayerBacklog(state, prayer, checks, now, timeZone).state.items;
    const fasting = reconcileFastingBacklog(state, prayer, checks, now, timeZone).state.fastingItems;
    vi.useRealTimers();

    for (const items of [prayers, fasting]) {
      expect(items.find((item) => item.id === yesterday)?.status).toBe('unconfirmed');
      expect(items.find((item) => item.id === today)).toMatchObject({
        status: 'resolved',
        resolvedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  });

  describe('Storage & Migration', () => {
    it('initializes default backlog state when localStorage is empty', () => {
      const state = loadBacklogState();
      expect(state.autoTrack).toBe(true);
      expect(state.autoReviewFasting).toBe(true);
      expect(state.items).toEqual([]);
      expect(state.fastingItems).toEqual([]);
      expect(state.trackingStartedAt).toBeDefined();
    });

    it('persists backlog state into localStorage under wens-prayer-backlog-v1 and syncs wens-local-v1', () => {
      const initial = loadBacklogState();
      const withItem = addPrayerBacklogItem(initial, {
        prayerName: 'العصر',
        prayerDate: toLocalDateString(),
        notes: 'كنت في الطريق',
      }).state;

      saveBacklogState(withItem);

      // Verify wens-prayer-backlog-v1 key
      const stored = localStorage.getItem(BACKLOG_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.items).toHaveLength(1);
      expect(parsed.items[0].prayerName).toBe('العصر');
      expect(parsed.items[0].notes).toBe('كنت في الطريق');

      // Verify wens-local-v1 legacy key synchronization
      const legacyStored = localStorage.getItem(LEGACY_STORAGE_KEY);
      expect(legacyStored).not.toBeNull();
      const legacyParsed = JSON.parse(legacyStored!);
      expect(legacyParsed.prayerBacklog.items).toHaveLength(1);
      expect(legacyParsed.prayerBacklog.items[0].prayerName).toBe('العصر');
    });

    it('migrates existing legacy backlog from wens-local-v1 if wens-prayer-backlog-v1 is missing', () => {
      const legacyState = {
        prayerBacklog: {
          autoTrack: true,
          trackingStartedAt: '2026-09-01T00:00:00.000Z',
          items: [
            {
              id: 'legacy-item-1',
              prayerName: 'الظهر',
              prayerDate: '2026-09-20',
              source: 'manual',
              status: 'missed',
              createdAt: '2026-09-20T12:00:00.000Z',
              updatedAt: '2026-09-20T12:00:00.000Z',
            },
          ],
        },
        fastingBacklog: {
          autoReview: true,
          items: [
            {
              id: 'legacy-fast-1',
              fastingDate: '2026-09-18',
              fastingType: 'قضاء رمضان',
              source: 'manual',
              status: 'missed',
              createdAt: '2026-09-18T10:00:00.000Z',
              updatedAt: '2026-09-18T10:00:00.000Z',
            },
          ],
        },
      };

      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyState));

      const loaded = loadBacklogState();
      expect(loaded.items).toHaveLength(1);
      expect(loaded.items[0].id).toBe('legacy-item-1');
      expect(loaded.items[0].prayerName).toBe('الظهر');
      expect(loaded.fastingItems).toHaveLength(1);
      expect(loaded.fastingItems[0].fastingType).toBe('قضاء رمضان');

      // Verify it was copied to wens-prayer-backlog-v1
      expect(localStorage.getItem(BACKLOG_STORAGE_KEY)).not.toBeNull();
    });
  });

  describe('Manual Addition of Missed Prayers', () => {
    it('successfully adds a missed prayer with notes', () => {
      const state = loadBacklogState();
      const today = toLocalDateString();
      const res = addPrayerBacklogItem(state, {
        prayerName: 'الفجر',
        prayerDate: today,
        notes: 'نمت قبل أن أصحو',
      });

      expect(res.state.items).toHaveLength(1);
      expect(res.item.prayerName).toBe('الفجر');
      expect(res.item.prayerDate).toBe(today);
      expect(res.item.status).toBe('missed');
      expect(res.item.source).toBe('manual');
      expect(res.item.notes).toBe('نمت قبل أن أصحو');
    });

    it('rejects adding prayers with future dates', () => {
      const state = loadBacklogState();
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const futureKey = toLocalDateString(future);

      expect(() =>
        addPrayerBacklogItem(state, {
          prayerName: 'الظهر',
          prayerDate: futureKey,
        })
      ).toThrow('يرجى اختيار تاريخ صحيح مش بعد النهارده.');
    });

    it('rejects invalid prayer names', () => {
      const state = loadBacklogState();
      expect(() =>
        addPrayerBacklogItem(state, {
          prayerName: 'الضحى' as any,
          prayerDate: toLocalDateString(),
        })
      ).toThrow('اسم الصلاة غير صحيح');
    });

    it('updates existing unconfirmed item to missed when added manually', () => {
      let state = loadBacklogState();
      const today = toLocalDateString();
      state.items.push({
        id: 'auto-test',
        prayerName: 'المغرب',
        prayerDate: today,
        source: 'automatic',
        status: 'unconfirmed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = addPrayerBacklogItem(state, {
        prayerName: 'المغرب',
        prayerDate: today,
        notes: 'لم أتمكن من أدائها',
      });

      expect(res.state.items).toHaveLength(1);
      expect(res.item.id).toBe('auto-test');
      expect(res.item.status).toBe('missed');
      expect(res.item.notes).toBe('لم أتمكن من أدائها');
    });
  });

  describe('Resolving Missed Prayers', () => {
    it('resolves a prayer with "قضيتها" (made-up)', () => {
      let state = loadBacklogState();
      const added = addPrayerBacklogItem(state, {
        prayerName: 'العصر',
        prayerDate: toLocalDateString(),
      });

      const res = resolvePrayerBacklogItem(added.state, added.item.id, 'made-up');
      expect(res.updatedItem?.status).toBe('resolved');
      expect(res.updatedItem?.resolution).toBe('made-up');
      expect(res.updatedItem?.resolvedAt).toBeDefined();

      const summary = getBacklogSummary(res.state);
      expect(summary.pendingPrayersCount).toBe(0);
      expect(summary.resolvedPrayersCount).toBe(1);
    });

    it('resolves a prayer with "صليتها في وقتها" (done)', () => {
      let state = loadBacklogState();
      const added = addPrayerBacklogItem(state, {
        prayerName: 'الظهر',
        prayerDate: toLocalDateString(),
      });

      const res = resolvePrayerBacklogItem(added.state, added.item.id, 'done');
      expect(res.updatedItem?.status).toBe('resolved');
      expect(res.updatedItem?.resolution).toBe('done');
    });

    it('resolves a prayer with "عذر شرعي" (excused)', () => {
      let state = loadBacklogState();
      const added = addPrayerBacklogItem(state, {
        prayerName: 'المغرب',
        prayerDate: toLocalDateString(),
      });

      const res = resolvePrayerBacklogItem(added.state, added.item.id, 'excused');
      expect(res.updatedItem?.status).toBe('resolved');
      expect(res.updatedItem?.resolution).toBe('excused');
    });

    it('removes a prayer when action is "remove"', () => {
      let state = loadBacklogState();
      const added = addPrayerBacklogItem(state, {
        prayerName: 'العشاء',
        prayerDate: toLocalDateString(),
      });

      const res = resolvePrayerBacklogItem(added.state, added.item.id, 'remove');
      expect(res.updatedItem?.status).toBe('removed');

      const summary = getBacklogSummary(res.state);
      expect(summary.pendingPrayersCount).toBe(0);
      expect(summary.resolvedPrayersCount).toBe(0);
    });

    it('can reopen a resolved prayer', () => {
      let state = loadBacklogState();
      const added = addPrayerBacklogItem(state, {
        prayerName: 'الفجر',
        prayerDate: toLocalDateString(),
      });
      const resolved = resolvePrayerBacklogItem(added.state, added.item.id, 'made-up');
      const reopened = reopenPrayerBacklogItem(resolved.state, added.item.id);

      expect(reopened.updatedItem?.status).toBe('missed');
      expect(reopened.updatedItem?.resolution).toBeNull();
      expect(reopened.updatedItem?.resolvedAt).toBeNull();
    });
  });

  describe('Automatic Reconciliation', () => {
    const mockPrayerDay: PrayerDay = {
      date: '2026-09-24',
      calculationNoteAr: '',
      times: [
        { key: 'fajr', nameAr: 'الفجر', minutesFromMidnight: 300 }, // 05:00
        { key: 'sunrise', nameAr: 'الشروق', minutesFromMidnight: 360 }, // 06:00
        { key: 'dhuhr', nameAr: 'الظهر', minutesFromMidnight: 720 }, // 12:00
        { key: 'asr', nameAr: 'العصر', minutesFromMidnight: 930 }, // 15:30
        { key: 'maghrib', nameAr: 'المغرب', minutesFromMidnight: 1080 }, // 18:00
        { key: 'isha', nameAr: 'العشاء', minutesFromMidnight: 1180 }, // 19:40
      ],
    };

    it('does nothing when autoTrack is false', () => {
      const state: BacklogState = {
        autoTrack: false,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      const now = new Date(2026, 8, 24, 16, 0); // 16:00 - after Dhuhr and Asr window
      const res = reconcilePrayerBacklog(state, mockPrayerDay, {}, now);
      expect(res.changed).toBe(false);
      expect(res.state.items).toHaveLength(0);
    });

    it('automatically logs unconfirmed prayers when prayer windows expire', () => {
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      // Test at 14:00 (after sunrise so Fajr window ended, but before Asr so Dhuhr window not ended yet)
      const at1400 = new Date(2026, 8, 24, 14, 0);
      const res1 = reconcilePrayerBacklog(state, mockPrayerDay, {}, at1400);

      expect(res1.changed).toBe(true);
      expect(res1.state.items.some((it) => it.prayerName === 'الفجر')).toBe(true);
      expect(res1.state.items.some((it) => it.prayerName === 'الظهر')).toBe(false);

      // Now at 16:00 (after 15:30 so Dhuhr window ended)
      const at1600 = new Date(2026, 8, 24, 16, 0);
      const res2 = reconcilePrayerBacklog(res1.state, mockPrayerDay, {}, at1600);

      expect(res2.changed).toBe(true);
      expect(res2.state.items.some((it) => it.prayerName === 'الظهر')).toBe(true);
      const dhuhrItem = res2.state.items.find((it) => it.prayerName === 'الظهر')!;
      expect(dhuhrItem.status).toBe('unconfirmed');
      expect(dhuhrItem.source).toBe('automatic');
    });

    it('does not log prayer if it was checked as performed', () => {
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      // Fajr was checked complete
      const at1400 = new Date(2026, 8, 24, 14, 0);
      const res = reconcilePrayerBacklog(state, mockPrayerDay, { fajr: true }, at1400);

      expect(res.state.items.some((it) => it.prayerName === 'الفجر')).toBe(false);
    });

    it('resolves active unconfirmed item when checked later in the day', () => {
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'auto-2026-09-24-fajr',
            prayerName: 'الفجر',
            prayerDate: '2026-09-24',
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: '2026-09-24T06:05:00.000Z',
            updatedAt: '2026-09-24T06:05:00.000Z',
          },
        ],
        fastingItems: [],
      };

      const now = new Date(2026, 8, 24, 10, 0);
      // User checks fajr now
      const res = reconcilePrayerBacklog(state, mockPrayerDay, { fajr: true }, now);
      expect(res.changed).toBe(true);
      const fajrItem = res.state.items.find((it) => it.prayerName === 'الفجر')!;
      expect(fajrItem.status).toBe('resolved');
      expect(fajrItem.resolution).toBe('done');
    });

    it('does not log unconfirmed items for past days if prayers were checked as completed', () => {
      // Simulate tracking started 2 days ago: 2026-09-22
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-22T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      // On 2026-09-22: all 5 prayers were performed
      localStorage.setItem(
        'wens-checks-2026-09-22',
        JSON.stringify({ fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true })
      );

      // On 2026-09-23: only Fajr and Dhuhr were performed
      localStorage.setItem(
        'wens-checks-2026-09-23',
        JSON.stringify({ fajr: true, dhuhr: true, asr: false, maghrib: false, isha: false })
      );

      const now = new Date(2026, 8, 24, 10, 0); // 2026-09-24 at 10:00 AM
      const res = reconcilePrayerBacklog(state, mockPrayerDay, { fajr: true }, now);

      // 2026-09-22 should have 0 backlog items
      const items22 = res.state.items.filter((it) => it.prayerDate === '2026-09-22');
      expect(items22).toHaveLength(0);

      // 2026-09-23 should have 3 items (asr, maghrib, isha), and NO fajr or dhuhr
      const items23 = res.state.items.filter((it) => it.prayerDate === '2026-09-23');
      expect(items23).toHaveLength(3);
      expect(items23.some((it) => it.prayerName === 'الفجر')).toBe(false);
      expect(items23.some((it) => it.prayerName === 'الظهر')).toBe(false);
      expect(items23.some((it) => it.prayerName === 'العصر')).toBe(true);
      expect(items23.some((it) => it.prayerName === 'المغرب')).toBe(true);
      expect(items23.some((it) => it.prayerName === 'العشاء')).toBe(true);
    });

    it('sets day-rollover for yesterday Isha before Fajr, but window-ended after Fajr', () => {
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-23T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      // At 02:00 AM on 2026-09-24 (before Fajr at 05:00 AM)
      const at0200 = new Date(2026, 8, 24, 2, 0);
      const resEarly = reconcilePrayerBacklog(state, mockPrayerDay, {}, at0200);
      const ishaEarly = resEarly.state.items.find(
        (it) => it.prayerDate === '2026-09-23' && it.prayerName === 'العشاء'
      );
      expect(ishaEarly?.reason).toBe('day-rollover');

      // At 08:00 AM on 2026-09-24 (after Fajr at 05:00 AM)
      const freshState: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-23T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };
      const at0800 = new Date(2026, 8, 24, 8, 0);
      const resLate = reconcilePrayerBacklog(freshState, mockPrayerDay, {}, at0800);
      const ishaLate = resLate.state.items.find(
        (it) => it.prayerDate === '2026-09-23' && it.prayerName === 'العشاء'
      );
      expect(ishaLate?.reason).toBe('window-ended');
    });

    it('automatically reconciles fasting backlog after Maghrib', () => {
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [
          {
            id: 'unconf-fast-today',
            fastingDate: '2026-09-24',
            fastingType: 'قضاء رمضان',
            source: 'manual',
            status: 'unconfirmed',
            createdAt: '2026-09-24T08:00:00.000Z',
            updatedAt: '2026-09-24T08:00:00.000Z',
          },
        ],
      };

      // User checked fasting today
      const now = new Date(2026, 8, 24, 19, 0); // After Maghrib (18:00)
      const res = reconcileFastingBacklog(state, mockPrayerDay, { fasting: true }, now);
      expect(res.changed).toBe(true);
      expect(res.state.fastingItems[0].status).toBe('resolved');
      expect(res.state.fastingItems[0].resolution).toBe('fasted');
    });
  });

  describe('Fasting Backlog Operations', () => {
    it('adds, resolves and reopens a missed fasting day', () => {
      const state = loadBacklogState();
      const today = toLocalDateString();

      // Add
      const added = addFastingBacklogItem(state, {
        fastingDate: today,
        fastingType: 'قضاء رمضان',
        notes: 'سفر',
      });

      expect(added.state.fastingItems).toHaveLength(1);
      expect(added.item.fastingType).toBe('قضاء رمضان');
      expect(added.item.status).toBe('missed');
      expect(added.item.notes).toBe('سفر');

      // Resolve with fasted
      const resolved = resolveFastingBacklogItem(added.state, added.item.id, 'fasted');
      expect(resolved.updatedItem?.status).toBe('resolved');
      expect(resolved.updatedItem?.resolution).toBe('fasted');

      // Reopen
      const reopened = reopenFastingBacklogItem(resolved.state, added.item.id);
      expect(reopened.updatedItem?.status).toBe('missed');
      expect(reopened.updatedItem?.resolution).toBeNull();
    });

    it('rejects adding future fasting days', () => {
      const state = loadBacklogState();
      const future = new Date();
      future.setDate(future.getDate() + 2);
      expect(() =>
        addFastingBacklogItem(state, {
          fastingDate: toLocalDateString(future),
          fastingType: 'نذر',
        })
      ).toThrow('يرجى اختيار تاريخ صيام صحيح مش بعد النهارده.');
    });
  });

  describe('Backlog Summary Counter', () => {
    it('accurately computes summary metrics', () => {
      let state = loadBacklogState();
      const today = toLocalDateString();

      state = addPrayerBacklogItem(state, {
        prayerName: 'الفجر',
        prayerDate: today,
        status: 'unconfirmed',
      }).state;

      state = addPrayerBacklogItem(state, {
        prayerName: 'الظهر',
        prayerDate: today,
        status: 'missed',
      }).state;

      state = addPrayerBacklogItem(state, {
        prayerName: 'العصر',
        prayerDate: today,
      }).state;

      state = addFastingBacklogItem(state, {
        fastingDate: today,
        fastingType: 'قضاء رمضان',
      }).state;

      const summary = getBacklogSummary(state);
      expect(summary.pendingPrayersCount).toBe(3);
      expect(summary.unconfirmedPrayersCount).toBe(1);
      expect(summary.missedPrayersCount).toBe(2);
      expect(summary.pendingFastingCount).toBe(1);
      expect(summary.totalPendingCount).toBe(4);
      expect(summary.resolvedPrayersCount).toBe(0);

      // Now resolve one as made-up and one as excused
      const withResolutions = resolvePrayerBacklogItem(
        resolvePrayerBacklogItem(state, state.items[0].id, 'made-up').state,
        state.items[1].id,
        'excused'
      ).state;

      const resSummary = getBacklogSummary(withResolutions);
      expect(resSummary.resolvedPrayersCount).toBe(2);
      expect(resSummary.madeUpPrayersCount).toBe(1);
      expect(resSummary.excusedPrayersCount).toBe(1);
    });
  });

  describe('Worship Hub Helpers: Qibla, Suhoor, Hijri, and Monthly Calendar', () => {
    it('calculates Qibla bearing accurately for Cairo', () => {
      const qibla = calculateQibla(30.0444, 31.2357);
      expect(qibla.angle).toBe(136);
      expect(qibla.direction).toBe('جنوب شرق');
      expect(qibla.label).toContain('١٣٦° جنوب شرق');
    });

    it('calculates Suhoor alarm time based on lead time before Fajr', () => {
      // Fajr at 04:30 AM (270 minutes)
      const fajrMinutes = 270;
      expect(calculateSuhoorTime(fajrMinutes, 45)).toBe(225); // 03:45 AM
      expect(calculateSuhoorTime(fajrMinutes, 30)).toBe(240); // 04:00 AM
      expect(calculateSuhoorTime(fajrMinutes, 60)).toBe(210); // 03:30 AM
      // Handles midnight wrap-around
      expect(calculateSuhoorTime(20, 30)).toBe(1430);
    });

    it('converts Gregorian dates to Hijri dates correctly using Umm al-Qura calendar', () => {
      const date = new Date(2026, 8, 25); // September 25, 2026 -> 14 Rabi' al-Thani 1448
      const hijri = gregorianToHijri(date);
      expect(hijri.year).toBe(1448);
      expect(hijri.month).toBe(4);
      expect(hijri.day).toBe(14);
      expect(hijri.monthName).toBe('ربيع الآخر');

      // October 2026 White Days regression (hijri-calendar.com / Umm al-Qura):
      // Fri Oct 23, 2026 = 12 Jumada al-Ula 1448
      // Sat Oct 24, 2026 = 13 Jumada al-Ula 1448 (Day 1 of White Days)
      // Sun Oct 25, 2026 = 14 Jumada al-Ula 1448 (Day 2 of White Days)
      // Mon Oct 26, 2026 = 15 Jumada al-Ula 1448 (Day 3 of White Days)
      expect(gregorianToHijri(new Date(2026, 9, 23))).toEqual({
        year: 1448,
        month: 5,
        day: 12,
        monthName: 'جمادى الأولى',
      });
      expect(gregorianToHijri(new Date(2026, 9, 24))).toEqual({
        year: 1448,
        month: 5,
        day: 13,
        monthName: 'جمادى الأولى',
      });
      expect(gregorianToHijri(new Date(2026, 9, 25))).toEqual({
        year: 1448,
        month: 5,
        day: 14,
        monthName: 'جمادى الأولى',
      });
      expect(gregorianToHijri(new Date(2026, 9, 26))).toEqual({
        year: 1448,
        month: 5,
        day: 15,
        monthName: 'جمادى الأولى',
      });

      const oct24Info = getUpcomingSunnahDays(new Date(2026, 9, 24, 17, 20));
      expect(oct24Info.whiteDays.isCurrent).toBe(true);
      expect(oct24Info.whiteDays.currentDayNumber).toBe(1);
      expect(oct24Info.whiteDays.startDateStr).toBe('2026-10-24');
      expect(oct24Info.whiteDays.endDateStr).toBe('2026-10-26');
      expect(oct24Info.whiteDays.countdown).toContain('اليوم الأول من الأيام البيض');
      expect(oct24Info.whiteDays.items[0].dateStr).toBe('2026-10-24');
      expect(oct24Info.whiteDays.items[0].isToday).toBe(true);
      expect(oct24Info.whiteDays.items[0].isPassed).toBe(false);
    });

    it('calculates full monthly prayer table with all days and prayer times', () => {
      const table = calculateMonthPrayerTable(2026, 8, 30.0444, 31.2357, 3, 'egypt');
      expect(table).toHaveLength(30); // September has 30 days
      expect(table[0].day).toBe(1);
      expect(table[0].times).toHaveLength(6);
      expect(table[0].times.map((t) => t.key)).toEqual([
        'fajr',
        'sunrise',
        'dhuhr',
        'asr',
        'maghrib',
        'isha',
      ]);
    });

    it('calculates weekly prayer table containing 7 days and valid times', () => {
      const week = calculateWeekPrayerTable(new Date(2026, 8, 25), 30.0444, 31.2357, 3, 'egypt');
      expect(week).toHaveLength(7);
      expect(week[0].times).toHaveLength(6);
      expect(week[0].weekdayName).toBeDefined();
      expect(week.some((r) => r.isToday)).toBe(true);
    });

    it('calculates tomorrow prayer times row accurately', () => {
      const tomorrow = getTomorrowPrayerTimes(new Date(2026, 8, 25), 30.0444, 31.2357, 3, 'egypt');
      expect(tomorrow).not.toBeNull();
      expect(tomorrow?.day).toBe(26);
      expect(tomorrow?.times).toHaveLength(6);
      expect(tomorrow?.times.find((t) => t.key === 'fajr')?.minutes).toBeGreaterThan(0);
    });

    it('calculates upcoming Sunnah fasting days (Mondays, Thursdays, White Days)', () => {
      const info = getUpcomingSunnahDays(new Date(2026, 8, 25)); // Friday
      expect(info.nextMonday.dateStr).toBeDefined();
      expect(info.nextThursday.dateStr).toBeDefined();
      expect(info.whiteDays.days).toEqual([13, 14, 15]);
      expect(info.whiteDays.monthName).toBeDefined();
    });

    it('calculates accurate countdowns and nearest fast for Mondays, Thursdays, and White Days', () => {
      // 2026-09-29 is a Tuesday.
      // Next Thursday is 2026-10-01 (in 2 days).
      // Next Monday is 2026-10-05 (in 6 days).
      const info = getUpcomingSunnahDays(new Date(2026, 8, 29));
      expect(info.nextThursday.diffDays).toBe(2);
      expect(info.nextThursday.countdown).toContain('يومان');
      expect(info.nextMonday.diffDays).toBe(6);
      expect(info.nextMonday.countdown).toContain('٦ أيام');

      // Nearest fast is Thursday
      expect(info.nearestFast.name).toBe('صيام الخميس');
      expect(info.nearestFast.diffDays).toBe(2);

      // White days for upcoming month (since 18 Rabi' al-Thani has already passed day 15)
      expect(info.whiteDays.isCurrent).toBe(false);
      expect(info.whiteDays.monthName).toBe('جمادى الأولى');
      expect(info.whiteDays.startDateStr).toBeDefined();
      expect(info.whiteDays.endDateStr).toBeDefined();
      expect(info.whiteDays.diffDays).toBeGreaterThan(0);
      expect(info.whiteDays.countdown).toContain('متبقي');

      // Major occasions
      expect(info.majorOccasions.nearest).toBeDefined();
      expect(info.majorOccasions.nearest.countdownText).toBeDefined();
      expect(info.majorOccasions.items.length).toBeGreaterThan(0);

      const ramadan = info.majorOccasions.items.find((it) => it.id === 'ramadan');
      expect(ramadan).toBeDefined();
      expect(ramadan?.diffDays).toBeGreaterThan(30);
      expect(ramadan?.countdownText).toContain('متبقي');

      const arafah = info.majorOccasions.items.find((it) => it.id === 'arafah');
      expect(arafah).toBeDefined();
      expect(arafah?.countdownText).toContain('متبقي');

      // Religious Holidays & Occasions (Separate Non-Fasting Calendar)
      expect(info.religiousHolidays).toBeDefined();
      expect(info.religiousHolidays.nearest).toBeDefined();
      expect(info.religiousHolidays.items.length).toBeGreaterThan(0);

      const eidFitr = info.religiousHolidays.items.find((it) => it.id === 'eid_al_fitr');
      expect(eidFitr).toBeDefined();
      expect(eidFitr?.category).toBe('eid');
      expect(eidFitr?.virtue).toBeDefined();
      expect(eidFitr?.recommendedDeed).toBeDefined();

      const eidAdha = info.religiousHolidays.items.find((it) => it.id === 'eid_al_adha');
      expect(eidAdha).toBeDefined();
      expect(eidAdha?.category).toBe('eid');
      expect(eidAdha?.virtue).toContain('يحرم صيامه');
    });

    it('returns exact details for each of the 3 White Days and day names for Monday and Thursday', () => {
      const info = getUpcomingSunnahDays(new Date(2026, 8, 29));
      expect(info.nextMonday.dayName).toBe('الإثنين');
      expect(info.nextMonday.formattedDate).toBeDefined();
      expect(info.nextMonday.formattedDate).toContain('أكتوبر');
      expect(info.nextMonday.hijriDateStr).toBeDefined();
      expect(info.nextThursday.dayName).toBe('الخميس');
      expect(info.nextThursday.formattedDate).toBeDefined();
      expect(info.nextThursday.formattedDate).toContain('أكتوبر');
      expect(info.nextThursday.hijriDateStr).toBeDefined();

      expect(info.whiteDays.formattedStartDate).toBeDefined();
      expect(info.whiteDays.formattedEndDate).toBeDefined();
      expect(info.whiteDays.items).toHaveLength(3);
      const [d1, d2, d3] = info.whiteDays.items;
      expect(d1.dayNumber).toBe(1);
      expect(d1.hijriDay).toBe(13);
      expect(d1.dayLabel).toContain('اليوم الأول (١٣)');
      expect(d1.dayName).toBeDefined();
      expect(d1.dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d1.formattedDate).toBeDefined();
      expect(d1.formattedDate).toContain(d1.dayName);
      expect(d1.countdown).toBeDefined();

      expect(d2.dayNumber).toBe(2);
      expect(d2.hijriDay).toBe(14);
      expect(d2.dayLabel).toContain('اليوم الثاني (١٤)');
      expect(d2.formattedDate).toBeDefined();

      expect(d3.dayNumber).toBe(3);
      expect(d3.hijriDay).toBe(15);
      expect(d3.dayLabel).toContain('اليوم الثالث (١٥)');
      expect(d3.formattedDate).toBeDefined();

      // Major occasion has formatted date and dayName
      expect(info.majorOccasions.nearest.formattedDate).toBeDefined();
      expect(info.majorOccasions.nearest.dayName).toBeDefined();
    });

    it('rolls over White Days to next month when current day is 15th after 18:00', () => {
      // Find a Gregorian date corresponding to Hijri day 15
      const base = new Date(2026, 8, 20);
      let day15Date: Date | null = null;
      for (let i = 0; i < 40; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        if (gregorianToHijri(d).day === 15) {
          day15Date = d;
          break;
        }
      }
      expect(day15Date).not.toBeNull();

      // 1. Before 18:00 on day 15 -> isCurrent is true
      const morning15 = new Date(day15Date!);
      morning15.setHours(10, 0, 0, 0);
      const infoMorning = getUpcomingSunnahDays(morning15);
      expect(infoMorning.whiteDays.isCurrent).toBe(true);

      // 2. After 18:00 on day 15 -> isCurrent is false, looks forward to next month
      const evening15 = new Date(day15Date!);
      evening15.setHours(19, 0, 0, 0);
      const infoEvening = getUpcomingSunnahDays(evening15);
      expect(infoEvening.whiteDays.isCurrent).toBe(false);
      expect(infoEvening.whiteDays.diffDays).toBeGreaterThan(0);
    });

    it('records and checks fasting intentions correctly in persistent storage', () => {
      expect(getFastingIntentions()).toEqual({});
      const updated = saveFastingIntention('2026-10-05', true);
      expect(updated['2026-10-05']).toBe(true);
      expect(getFastingIntentions()['2026-10-05']).toBe(true);

      const cleared = saveFastingIntention('2026-10-05', false);
      expect(cleared['2026-10-05']).toBeUndefined();
      expect(getFastingIntentions()['2026-10-05']).toBeUndefined();
    });

    it('records fasting completion into checks, legacy accountability, and backlog', () => {
      const initialBacklog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-01T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      const dateStr = '2026-10-05';
      expect(isFastingDateCompleted(dateStr, {}, initialBacklog.fastingItems)).toBe(false);

      // 1. Mark completed
      const { nextBacklog, changed } = recordFastingCompletion(
        dateStr,
        'صيام الإثنين',
        true,
        initialBacklog
      );
      expect(changed).toBe(true);
      expect(nextBacklog.fastingItems).toHaveLength(1);
      expect(nextBacklog.fastingItems[0].status).toBe('resolved');
      expect(nextBacklog.fastingItems[0].resolution).toBe('fasted');
      expect(isFastingDateCompleted(dateStr, {}, nextBacklog.fastingItems)).toBe(true);

      // Verify localStorage wens-checks-${dateStr}
      const rawChecks = localStorage.getItem(`wens-checks-${dateStr}`);
      expect(rawChecks).not.toBeNull();
      expect(JSON.parse(rawChecks!).fasting).toBe(true);

      // Verify legacy accountability initialization even if previously empty
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      expect(legacyRaw).not.toBeNull();
      const legacy = JSON.parse(legacyRaw!);
      expect(legacy.accountability?.days?.[dateStr]?.fasting).toBe('yes');

      // 2. Unmark completion
      const res2 = recordFastingCompletion(dateStr, 'صيام الإثنين', false, nextBacklog);
      expect(res2.changed).toBe(true);
      expect(isFastingDateCompleted(dateStr, {}, res2.nextBacklog.fastingItems)).toBe(false);

      const rawChecks2 = localStorage.getItem(`wens-checks-${dateStr}`);
      expect(JSON.parse(rawChecks2!).fasting).toBe(false);

      const legacyRaw2 = localStorage.getItem(LEGACY_STORAGE_KEY);
      const legacy2 = JSON.parse(legacyRaw2!);
      expect(legacy2.accountability?.days?.[dateStr]?.fasting).toBe('no');
    });

    it('enforces full-year Hijri monotonicity, offset shift invariants, and occasion safety guardrails', () => {
      // 1. 365-day monotonicity & valid Umm al-Qura step transitions
      let prev = gregorianToHijri(new Date(2026, 0, 1));
      for (let i = 1; i <= 365; i++) {
        const curDate = new Date(2026, 0, 1 + i);
        const cur = gregorianToHijri(curDate);
        expect(cur.month).toBeGreaterThanOrEqual(1);
        expect(cur.month).toBeLessThanOrEqual(12);
        expect(cur.day).toBeGreaterThanOrEqual(1);
        expect(cur.day).toBeLessThanOrEqual(30);
        expect(cur.monthName).not.toBe('—');

        const isNextDayInSameMonth =
          cur.year === prev.year && cur.month === prev.month && cur.day === prev.day + 1;
        const isFirstOfNextMonth =
          cur.year === prev.year &&
          cur.month === prev.month + 1 &&
          cur.day === 1 &&
          (prev.day === 29 || prev.day === 30);
        const isFirstOfNewYear =
          cur.year === prev.year + 1 &&
          cur.month === 1 &&
          cur.day === 1 &&
          prev.month === 12 &&
          (prev.day === 29 || prev.day === 30);

        expect(isNextDayInSameMonth || isFirstOfNextMonth || isFirstOfNewYear).toBe(true);

        // Offset invariant: gregorianToHijri(d, -1) === prev
        expect(gregorianToHijri(curDate, -1)).toEqual(prev);
        prev = cur;
      }

      // 2. Religious holidays where fasting is forbidden must NEVER display 'اليوم هو موعد الصيام!'
      for (let i = 0; i < 365; i++) {
        const d = new Date(2026, 0, 1 + i);
        const h = gregorianToHijri(d);
        if (
          (h.month === 10 && h.day === 1) || // Eid al-Fitr
          (h.month === 12 && [10, 11, 12, 13].includes(h.day)) // Eid al-Adha & Tashreeq
        ) {
          const info = getUpcomingSunnahDays(d);
          expect(info.religiousHolidays.nearest.isToday).toBe(true);
          expect(info.religiousHolidays.nearest.countdownText).not.toContain('موعد الصيام');
        }
        // Multi-day Ashura (10 Muharram) must still be active on day 10
        if (h.month === 1 && h.day === 10) {
          const info = getUpcomingSunnahDays(d);
          const ashura = info.majorOccasions.items.find((it) => it.id === 'tasua_ashura');
          expect(ashura?.isToday).toBe(true);
          expect(ashura?.diffDays).toBe(0);
        }
      }

      // 3. All 5 calculation methods must be honored in calculateMonthPrayerTable
      const egyptRow = calculateMonthPrayerTable(2026, 9, 30.0444, 31.2357, 3, 'egypt')[0];
      const uqRow = calculateMonthPrayerTable(2026, 9, 30.0444, 31.2357, 3, 'umm_al_qura')[0];
      const mwlRow = calculateMonthPrayerTable(2026, 9, 30.0444, 31.2357, 3, 'muslim_world_league')[0];
      const karachiRow = calculateMonthPrayerTable(2026, 9, 30.0444, 31.2357, 3, 'karachi')[0];
      const isnaRow = calculateMonthPrayerTable(2026, 9, 30.0444, 31.2357, 3, 'north_america')[0];

      const getFajr = (r: typeof egyptRow) => r.times.find((t) => t.key === 'fajr')!.minutes;
      const getIsha = (r: typeof egyptRow) => r.times.find((t) => t.key === 'isha')!.minutes;

      expect(getFajr(egyptRow)).not.toBe(getFajr(isnaRow));
      expect(getFajr(egyptRow)).not.toBe(getFajr(mwlRow));
      expect(getIsha(uqRow)).not.toBe(getIsha(egyptRow));
      expect(getIsha(karachiRow)).not.toBe(getIsha(mwlRow));

      // 4. Fasting intention saved via saveFastingIntention must be tracked by reconcileFastingBacklog after Maghrib
      saveFastingIntention('2026-09-24', true);
      const state: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };
      const rec = reconcileFastingBacklog(state, null, {}, new Date(2026, 8, 24, 19, 30));
      expect(rec.changed).toBe(true);
      expect(rec.state.fastingItems).toHaveLength(1);
      expect(rec.state.fastingItems[0].fastingDate).toBe('2026-09-24');
      expect(rec.state.fastingItems[0].status).toBe('unconfirmed');
      saveFastingIntention('2026-09-24', false);

      // 5. Golden vectors from contracts/golden-astronomy-hijri-vectors.json
      const golden = [
        { gregorian: '2026-05-18', year: 1447, month: 12, day: 1 },
        { gregorian: '2026-05-26', year: 1447, month: 12, day: 9 },
        { gregorian: '2026-05-27', year: 1447, month: 12, day: 10 },
        { gregorian: '2026-06-16', year: 1448, month: 1, day: 1 },
        { gregorian: '2026-06-25', year: 1448, month: 1, day: 10 },
        { gregorian: '2026-10-23', year: 1448, month: 5, day: 12 },
        { gregorian: '2026-10-24', year: 1448, month: 5, day: 13 },
        { gregorian: '2026-10-25', year: 1448, month: 5, day: 14 },
        { gregorian: '2026-10-26', year: 1448, month: 5, day: 15 },
        { gregorian: '2027-02-08', year: 1448, month: 9, day: 1 },
      ];
      for (const v of golden) {
        const parts = v.gregorian.split('-').map(Number);
        const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        const h = gregorianToHijri(d);
        expect(h.year).toBe(v.year);
        expect(h.month).toBe(v.month);
        expect(h.day).toBe(v.day);
      }

      // 6. Time-of-day state machine guardrails (03:30, 10:00, 16:00, 19:30)
      // Day 13 at 19:30: White Day 1 must remain active and unpassed for evening logging
      const day13Evening = new Date(2026, 9, 24, 19, 30);
      const sunnahDay13 = getUpcomingSunnahDays(day13Evening, 0);
      expect(sunnahDay13.whiteDays.isCurrent).toBe(true);
      expect(sunnahDay13.whiteDays.currentDayNumber).toBe(1);
      expect(sunnahDay13.whiteDays.items[0].isToday).toBe(true);
      expect(sunnahDay13.whiteDays.items[0].isPassed).toBe(false);

      // Day 15 at 19:30: White Days for current month must have rolled over to next month
      const day15Evening = new Date(2026, 9, 26, 19, 30);
      const sunnahDay15 = getUpcomingSunnahDays(day15Evening, 0);
      expect(sunnahDay15.whiteDays.isCurrent).toBe(false);
      expect(sunnahDay15.whiteDays.diffDays).toBeGreaterThan(15);
    });
  });
});

