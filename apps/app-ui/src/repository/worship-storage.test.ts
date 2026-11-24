import { describe, it, expect, beforeEach } from 'vitest';
import { setDailyWorship } from '../api';
import { hydrateDailyChecksFromSqlite } from './worship-storage';
import {
  getDailyChecks,
  setDailyCheck,
  saveDailyChecks,
  sanitizeTodayChecks,
  getKhatmaState,
  saveKhatmaState,
  getEffectiveHijriOffset,
} from './worship-storage';

describe('worship-storage repository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps a restored unchecked value over a stale checked value', async () => {
    const date = '2026-11-04';
    localStorage.setItem(`wens-checks-${date}`, JSON.stringify({ fajr: true }));
    await setDailyWorship({
      date, fajr: false, sunrise: false, dhuhr: true, asr: false, maghrib: false,
      isha: false, fasting: false, note: null, updatedAt: '2026-11-04T12:00:00Z',
    });
    const checks = await hydrateDailyChecksFromSqlite(date);
    expect(checks.fajr).toBe(false);
    expect(checks.dhuhr).toBe(true);
    expect(getDailyChecks(date).fajr).toBe(false);
  });

  it('reads empty checks by default and updates check state atomically', () => {
    const initial = getDailyChecks('2026-10-24');
    expect(initial.fajr).toBeUndefined();

    const updated = setDailyCheck('2026-10-24', 'fajr', true);
    expect(updated.fajr).toBe(true);

    const reloaded = getDailyChecks('2026-10-24');
    expect(reloaded.fajr).toBe(true);

    // Verify legacy accountability synchronization
    const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
    expect(legacy.accountability.days['2026-10-24'].prayers['الفجر']).toBe('done');
  });

  it('sanitizes stale future prayer checks from today while keeping completed past prayers', () => {
    const todayStr = '2026-11-04';
    const corruptedChecks = {
      fajr: true,
      dhuhr: true,
      asr: true,
      maghrib: true,
    };
    saveDailyChecks(todayStr, corruptedChecks);
    localStorage.setItem(
      'wens-local-v1',
      JSON.stringify({
        accountability: {
          days: {
            [todayStr]: {
              prayers: {
                'الفجر': 'done',
                'الظهر': 'done',
                'العصر': 'done',
                'المغرب': 'done',
              },
            },
          },
        },
      })
    );

    const prayerTimes = [
      { key: 'fajr', minutesFromMidnight: 283 }, // 04:43 AM
      { key: 'sunrise', minutesFromMidnight: 371 }, // 06:11 AM
      { key: 'dhuhr', minutesFromMidnight: 699 }, // 11:39 AM
      { key: 'asr', minutesFromMidnight: 883 }, // 02:43 PM
      { key: 'maghrib', minutesFromMidnight: 1026 }, // 05:06 PM
      { key: 'isha', minutesFromMidnight: 1105 }, // 06:25 PM
    ];

    // At 05:45 AM (minuteNow = 345), only Fajr has entered; Dhuhr/Asr/Maghrib are in the future
    const { cleaned, changed } = sanitizeTodayChecks(todayStr, corruptedChecks, prayerTimes, 345);
    expect(changed).toBe(true);
    expect(cleaned).toEqual({ fajr: true });

    // Verify both storage stores are cleaned
    expect(getDailyChecks(todayStr)).toEqual({ fajr: true });
    const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
    expect(legacy.accountability.days[todayStr].prayers).toEqual({ 'الفجر': 'done' });
  });

  it('synchronizes fasting check to legacy accountability correctly', () => {
    setDailyCheck('2026-10-24', 'fasting', true);
    const checks = getDailyChecks('2026-10-24');
    expect(checks.fasting).toBe(true);

    const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
    expect(legacy.accountability.days['2026-10-24'].fasting).toBe('yes');

    setDailyCheck('2026-10-24', 'fasting', false);
    const legacyAfter = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
    expect(legacyAfter.accountability.days['2026-10-24'].fasting).toBe('no');
  });

  it('manages Khatma state with validation bounds', () => {
    const initial = getKhatmaState();
    expect(initial.currentJuz).toBe(1);
    expect(initial.currentPage).toBe(1);
    expect(initial.targetDays).toBe(30);

    const saved = saveKhatmaState({ currentJuz: 15, currentPage: 310, targetDays: 20 });
    expect(saved.currentJuz).toBe(15);
    expect(saved.currentPage).toBe(310);
    expect(saved.targetDays).toBe(20);

    // Clamp out-of-range values
    const clamped = saveKhatmaState({ currentJuz: 99, currentPage: 1000 });
    expect(clamped.currentJuz).toBe(30);
    expect(clamped.currentPage).toBe(604);
  });

  it('reads effective hijri offset with clamping', () => {
    expect(getEffectiveHijriOffset()).toBe(0);
    expect(getEffectiveHijriOffset({ hijriDateOffset: 2 })).toBe(2);
    expect(getEffectiveHijriOffset({ hijriDateOffset: 10 })).toBe(5);
    expect(getEffectiveHijriOffset({ hijriDateOffset: -10 })).toBe(-5);
  });
});
