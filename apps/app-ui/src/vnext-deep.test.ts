import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { buildReminderEvents } from './main';
import { defaultPreferences } from './api';
import type { AppPreferences, PrayerDay } from './types';

const mockPrayerDay: PrayerDay = {
  date: '2026-09-24',
  fajr: '04:30',
  sunrise: '05:50',
  dhuhr: '12:00',
  asr: '15:30',
  maghrib: '18:10',
  isha: '19:30',
  times: [
    { key: 'fajr', nameAr: 'الفجر', minutesFromMidnight: 270 },
    { key: 'sunrise', nameAr: 'الشروق', minutesFromMidnight: 350 },
    { key: 'dhuhr', nameAr: 'الظهر', minutesFromMidnight: 720 },
    { key: 'asr', nameAr: 'العصر', minutesFromMidnight: 930 },
    { key: 'maghrib', nameAr: 'المغرب', minutesFromMidnight: 1090 },
    { key: 'isha', nameAr: 'العشاء', minutesFromMidnight: 1170 },
  ],
};

const mockTomorrowPrayerDay: PrayerDay = {
  ...mockPrayerDay,
  date: '2026-09-25',
};

describe('vNext Deep Verification Suite', () => {
  describe('Reminder Event Generation & Scheduling', () => {
    it('generates 48-hour horizon events for all obligatory prayers while excluding sunrise', () => {
      const prefs: AppPreferences = {
        ...defaultPreferences,
        wuduLeadMinutes: 15,
        notifications: {
          ...defaultPreferences.notifications,
          prePrayerEnabled: true,
          prayerAtTimeEnabled: true,
          fastingEnabled: true,
        },
      };

      const events = buildReminderEvents(prefs, mockPrayerDay, mockTomorrowPrayerDay);

      // Sunrise should NEVER generate an event
      const sunriseEvents = events.filter((e) => e.id.includes('sunrise'));
      expect(sunriseEvents).toHaveLength(0);

      // 5 obligatory prayers x 2 days x 2 kinds (prepare + at) = 20 prayer events
      const prayerEvents = events.filter((e) => e.id.startsWith('prayer-'));
      expect(prayerEvents).toHaveLength(20);

      const fastingEvents = events.filter((e) => e.id.startsWith('fasting-'));
      expect(fastingEvents).toHaveLength(6);
      expect(fastingEvents.map((e) => e.kind)).toContain('fasting-imsak-water');
      expect(fastingEvents.map((e) => e.kind)).toContain('fasting-iftar');
      expect(events).toHaveLength(26);
    });

    it('converts selected-city prayer time to the instant on both sides of a DST change', () => {
      const days = [
        { ...mockPrayerDay, date: '2026-03-07' },
        { ...mockPrayerDay, date: '2026-03-08' },
      ];
      const prefs = { ...defaultPreferences, timeZone: 'America/New_York' };
      const events = buildReminderEvents(prefs, days[0], days[1]);
      expect(events.find((e) => e.id === 'prayer-2026-03-07-fajr-at')?.dueAtMs)
        .toBe(Date.parse('2026-03-07T09:30:00Z'));
      expect(events.find((e) => e.id === 'prayer-2026-03-08-fajr-at')?.dueAtMs)
        .toBe(Date.parse('2026-03-08T08:30:00Z'));
    });

    it('respects wuduLeadMinutes configuration', () => {
      const prefs: AppPreferences = {
        ...defaultPreferences,
        wuduLeadMinutes: 20,
        notifications: {
          ...defaultPreferences.notifications,
          prePrayerEnabled: true,
          prayerAtTimeEnabled: false,
          fastingEnabled: false,
        },
      };

      const events = buildReminderEvents(prefs, mockPrayerDay, null);
      expect(events).toHaveLength(5);
      expect(events[0].id).toContain('prepare-20');
      expect(events[0].title).toContain('٢٠ دقيقة');
    });

    it('omits disabled notification classes', () => {
      const prefs: AppPreferences = {
        ...defaultPreferences,
        notifications: {
          ...defaultPreferences.notifications,
          prePrayerEnabled: false,
          prayerAtTimeEnabled: true,
          fastingEnabled: false,
        },
      };

      const events = buildReminderEvents(prefs, mockPrayerDay, null);
      // 5 at-time events, 0 prepare, 0 fasting
      expect(events).toHaveLength(5);
      expect(events.every((e) => e.kind === 'prayer-at')).toBe(true);
    });

    it('generates multi-lead cascade pre-prayer reminders when prePrayerLeads are configured', () => {
      const allLeads = [60, 30, 20, 15, 10, 5];
      const prefs: AppPreferences = {
        ...defaultPreferences,
        prePrayerLeads: allLeads,
        notifications: {
          ...defaultPreferences.notifications,
          prePrayerEnabled: true,
          prayerAtTimeEnabled: false,
          fastingEnabled: false,
        },
      };

      const events = buildReminderEvents(prefs, mockPrayerDay, null);
      // 5 obligatory prayers x 6 leads = 30 events
      expect(events).toHaveLength(30);

      // Verify each lead interval is represented
      for (const lead of allLeads) {
        const matching = events.filter((e) => e.id.includes(`prepare-${lead}`));
        expect(matching).toHaveLength(5);
      }

      // Verify subset configuration (e.g. 60, 20, 5)
      const subsetPrefs: AppPreferences = {
        ...prefs,
        prePrayerLeads: [60, 20, 5],
      };
      const subsetEvents = buildReminderEvents(subsetPrefs, mockPrayerDay, null);
      expect(subsetEvents).toHaveLength(15);
      expect(subsetEvents.filter((e) => e.id.includes('prepare-60'))).toHaveLength(5);
      expect(subsetEvents.filter((e) => e.id.includes('prepare-20'))).toHaveLength(5);
      expect(subsetEvents.filter((e) => e.id.includes('prepare-5'))).toHaveLength(5);
      expect(subsetEvents.filter((e) => e.id.includes('prepare-15'))).toHaveLength(0);
    });
  });

  describe('Project-Wide Typography Floor (Zero < 12px occurrences)', () => {
    const root = resolve(__dirname, '../../..');
    const cssFiles = [
      resolve(__dirname, 'styles.css'),
      resolve(root, 'pet.css'),
      resolve(root, 'overlay.css'),
      resolve(root, 'desktop-shell/public/pet.css'),
      resolve(root, 'desktop-shell/public/overlay.css'),
    ];

    it.each(cssFiles)('ensures %s has 0 font sizes under 12px', (file) => {
      const content = readFileSync(file, 'utf8');
      const matches = Array.from(content.matchAll(/font-size:\s*([0-9.]+)px/g));
      const violating = matches
        .map((m) => parseFloat(m[1]))
        .filter((sz) => sz < 12);
      expect(violating).toEqual([]);
    });
  });

  describe('Audio Assets and Third Party Notices', () => {
    const root = resolve(__dirname, '../../..');
    const manifestPath = resolve(root, 'contracts/audio-asset-manifest.json');
    const noticesPath = resolve(root, 'THIRD_PARTY_NOTICES.md');

    it('contracts/audio-asset-manifest.json exists and contains all required assets', () => {
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(manifest.assets).toHaveLength(3);
      const ids = manifest.assets.map((a: any) => a.id);
      expect(ids).toContain('gentle-chime');
      expect(ids).toContain('work-chime');
      expect(ids).toContain('adhan');
    });

    it('dist-vnext/audio files match SHA-1 in manifest', () => {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const distAudioDir = resolve(root, 'dist-vnext/audio');

      for (const asset of manifest.assets) {
        const filePath = resolve(distAudioDir, asset.filename);
        expect(existsSync(filePath)).toBe(true);
        const data = readFileSync(filePath);
        const hash = crypto.createHash('sha1').update(data).digest('hex');
        expect(hash).toBe(asset.sha1);
      }
    });

    it('THIRD_PARTY_NOTICES.md documents CC0 license and exact SHA-1 hashes', () => {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const notices = readFileSync(noticesPath, 'utf8');

      expect(notices).toContain('CC0');
      for (const asset of manifest.assets) {
        expect(notices).toContain(asset.sha1);
      }
    });
  });

  describe('Desktop Shell & Public Sync Alignment', () => {
    const root = resolve(__dirname, '../../..');

    it('keeps desktop-shell/public/ in perfect sync with root companions', () => {
      const pairs = [
        ['pet.html', 'desktop-shell/public/pet.html'],
        ['pet.css', 'desktop-shell/public/pet.css'],
        ['pet.js', 'desktop-shell/public/pet.js'],
        ['overlay.html', 'desktop-shell/public/overlay.html'],
        ['overlay.css', 'desktop-shell/public/overlay.css'],
        ['overlay.js', 'desktop-shell/public/overlay.js'],
      ];

      for (const [f1, f2] of pairs) {
        const p1 = resolve(root, f1);
        const p2 = resolve(root, f2);
        expect(readFileSync(p1, 'utf8')).toBe(readFileSync(p2, 'utf8'));
      }
    });
  });
});
