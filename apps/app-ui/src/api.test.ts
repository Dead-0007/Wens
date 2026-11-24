import { describe, it, expect, beforeEach } from 'vitest';
import {
  defaultPreferences,
  getBootstrap,
  listWorkSessions,
  mergePatches,
  updateProject,
  updateSettings,
} from './api';
import {
  calculateMonthPrayerTable,
  getTimeZoneOffsetHours,
  normalizeCalcMethod,
} from './domain/astronomy';
import { getDailyChecks } from './repository/worship-storage';

describe('AppPreferences & API Fallback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('default preferences adhere to v1.0.0 specifications', () => {
    expect(defaultPreferences.themeId).toBe('midnight-magenta');
    expect(defaultPreferences.accentId).toBe('amber');
    expect(defaultPreferences.audio.prayer).toBe('silent');
    expect(defaultPreferences.audio.fasting).toBe('silent');
    expect(defaultPreferences.audio.work).toBe('silent');
    expect(defaultPreferences.audio.backgroundPlayback).toBe('always');
    expect(defaultPreferences.audio.volume).toBe(80);
    expect(defaultPreferences.notifications.fastingEnabled).toBe(false);
    expect(defaultPreferences.notifications.quietHours).toBeNull();
    expect(defaultPreferences.preventSleepForSuhoor).toBe(false);
    expect(defaultPreferences.onboardingCompleted).toBe(false);
    expect(defaultPreferences.quranRadioEnabled).toBe(true);
    expect(defaultPreferences.quranRadioDefaultStation).toBe('cairo');
  });

  it('survives corrupted localStorage payloads ("null", strings, [null]) without throwing', async () => {
    localStorage.setItem('wens-vnext-fallback-settings', 'null');
    localStorage.setItem('wens-local-v1', '"not-an-object"');
    localStorage.setItem('wens-work-sessions', '[null, 42, "bad"]');
    localStorage.setItem('wens-checks-2026-04-01', 'null');

    const boot = await getBootstrap();
    expect(boot.settings.themeId).toBe('midnight-magenta');
    expect(Array.isArray(boot.projects)).toBe(true);
    expect(Array.isArray(boot.ideas)).toBe(true);

    const sessions = await listWorkSessions(50);
    expect(sessions).toEqual([]);

    const checks = getDailyChecks('2026-04-01');
    expect(Boolean(checks.fajr)).toBe(false);
  });

  it('updateProject merges existing fields instead of blanking omitted title', async () => {
    localStorage.setItem(
      'wens-local-v1',
      JSON.stringify({
        projects: [
          {
            id: 'p-merge-1',
            title: 'مشروع وِنس الرئيسي',
            description: 'وصف أصلي',
            status: 'قيد التنفيذ',
            progress: 25,
          },
        ],
      })
    );

    const updated = await updateProject({ id: 'p-merge-1', status: 'مكتمل', progress: 100 });
    expect(updated.title).toBe('مشروع وِنس الرئيسي');
    expect(updated.description).toBe('وصف أصلي');
    expect(updated.status).toBe('مكتمل');
    expect(updated.progress).toBe(100);
  });

  it('normalizes calc methods, supports Hanafi Asr, 0° coords, IANA timezones, and polar fallbacks', () => {
    expect(normalizeCalcMethod('makkah')).toBe('umm_al_qura');
    expect(normalizeCalcMethod('ummalqura')).toBe('umm_al_qura');
    expect(normalizeCalcMethod('mwl')).toBe('muslim_world_league');
    expect(normalizeCalcMethod('isna')).toBe('north_america');

    const shafiTable = calculateMonthPrayerTable(2026, 5, 30.0444, 31.2357, 3, 'egypt', 0, 0, 0, false, 'Africa/Cairo');
    const hanafiTable = calculateMonthPrayerTable(2026, 5, 30.0444, 31.2357, 3, 'egypt', 0, 0, 0, true, 'Africa/Cairo');
    const shafiAsr = shafiTable[20].times.find((t) => t.key === 'asr')!.minutes;
    const hanafiAsr = hanafiTable[20].times.find((t) => t.key === 'asr')!.minutes;
    expect(hanafiAsr).toBeGreaterThan(shafiAsr + 30);

    // 0° equator/prime meridian preserved and finite
    const equator = calculateMonthPrayerTable(2026, 5, 0, 0, 0, 'mwl', 0, 0, 0, false, 'UTC')[20].times;
    expect(equator.every((t) => Number.isFinite(t.minutes))).toBe(true);
    for (let i = 1; i < equator.length; i++) {
      expect(equator[i].minutes).toBeGreaterThan(equator[i - 1].minutes);
    }

    // Polar Antarctica & NaN inputs produce finite, strictly ordered times (never NaN)
    const antarctica = calculateMonthPrayerTable(2026, 5, -78.5, 166.7, 12, 'mwl', 0, 0, 0, false)[20].times;
    expect(antarctica.every((t) => Number.isFinite(t.minutes) && !t.formatted.includes('NaN'))).toBe(true);
    for (let i = 1; i < antarctica.length; i++) {
      expect(antarctica[i].minutes).toBeGreaterThan(antarctica[i - 1].minutes);
    }

    const nanTimes = calculateMonthPrayerTable(2026, 5, Number.NaN, Number.POSITIVE_INFINITY, 3, 'makkah')[20].times;
    expect(nanTimes.every((t) => Number.isFinite(t.minutes))).toBe(true);

    // IANA timezone offset calculation works independently of OS timezone
    const testDate = new Date(2026, 5, 21);
    expect(getTimeZoneOffsetHours(testDate, 'Asia/Riyadh')).toBe(3);
  });

  it('updates preferences cleanly with partial patches', async () => {
    const res = await updateSettings({
      themeId: 'dawn-sand',
      accentId: 'lime',
      audio: {
        prayer: 'gentle-chime',
        fasting: 'silent',
        work: 'work-chime',
        volume: 90,
        backgroundPlayback: 'always',
      },
    });

    expect(res.settings.themeId).toBe('dawn-sand');
    expect(res.settings.accentId).toBe('lime');
    expect(res.settings.audio.prayer).toBe('gentle-chime');
    expect(res.settings.audio.work).toBe('work-chime');
    expect(res.settings.audio.volume).toBe(90);
    expect(res.settings.audio.backgroundPlayback).toBe('always');
  });

  it('preserves previously modified settings across sequential partial patch updates (Issue 1)', async () => {
    localStorage.clear();

    // Step 1: Change theme only
    const step1 = await updateSettings({ themeId: 'copper-garden' });
    expect(step1.settings.themeId).toBe('copper-garden');
    expect(step1.settings.notifications.prePrayerEnabled).toBe(true);

    // Step 2: Change prePrayerEnabled notification only - theme must NOT reset
    const step2 = await updateSettings({
      notifications: { prePrayerEnabled: false },
    });
    expect(step2.settings.themeId).toBe('copper-garden');
    expect(step2.settings.notifications.prePrayerEnabled).toBe(false);
    expect(step2.settings.notifications.prayerAtTimeEnabled).toBe(true);

    // Step 3: Change audio sound only - theme and notifications must NOT reset
    const step3 = await updateSettings({
      audio: { prayer: 'gentle-chime' },
    });
    expect(step3.settings.themeId).toBe('copper-garden');
    expect(step3.settings.notifications.prePrayerEnabled).toBe(false);
    expect(step3.settings.audio.prayer).toBe('gentle-chime');
    expect(step3.settings.audio.volume).toBe(80);

    // Step 4: Change quietHours start only - end must be preserved and other settings kept
    const step4 = await updateSettings({
      notifications: { quietHours: { start: '23:15', end: '05:45' } },
    });
    expect(step4.settings.notifications.quietHours).toEqual({
      start: '23:15',
      end: '05:45',
    });
    const step4b = await updateSettings({
      notifications: { quietHours: { start: '23:30' } },
    });
    expect(step4b.settings.notifications.quietHours).toEqual({
      start: '23:30',
      end: '05:45',
    });

    // Step 5: Toggle offline & bubbles - all prior settings remain intact
    const step5 = await updateSettings({ strictOffline: true, bubbles: false });
    expect(step5.settings.strictOffline).toBe(true);
    expect(step5.settings.bubbles).toBe(false);
    expect(step5.settings.themeId).toBe('copper-garden');
    expect(step5.settings.audio.prayer).toBe('gentle-chime');
    expect(step5.settings.notifications.prePrayerEnabled).toBe(false);

    // Step 6: Disable quiet hours
    const step6 = await updateSettings({
      notifications: { quietHours: null },
    });
    expect(step6.settings.notifications.quietHours).toBeNull();
    expect(step6.settings.themeId).toBe('copper-garden');
  });

  it('mergePatches merges partial patches without synthesizing null or empty structures', () => {
    const p1 = { themeId: 'dawn-sand' as const };
    const p2 = { accentId: 'lime' as const };
    const merged = mergePatches(p1, p2);
    expect(merged).toEqual({ themeId: 'dawn-sand', accentId: 'lime' });
    expect(merged.notifications).toBeUndefined();
    expect(merged.audio).toBeUndefined();

    const p3 = { notifications: { prePrayerEnabled: false } };
    const p4 = { notifications: { fastingEnabled: false } };
    const mergedNotifs = mergePatches(p3, p4);
    expect(mergedNotifs.notifications).toEqual({
      prePrayerEnabled: false,
      fastingEnabled: false,
    });
    expect((mergedNotifs.notifications as any).quietHours).toBeUndefined();
  });
});
