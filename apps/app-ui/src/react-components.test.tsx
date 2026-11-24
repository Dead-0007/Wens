import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SettingsView, CommandPalette, Today, Worship, Work, Studio, App, TIMELINE_ANCHORS } from './main';
import * as api from './api';
import type { BootstrapPayload, PrayerDay } from './types';
import { toLocalDateString, type BacklogState } from './backlog';


const mockData: BootstrapPayload = {
  schemaVersion: 2,
  deviceId: 'dev-1',
  projects: [
    {
      id: 'proj-1',
      title: 'مشروع كتاب وِنس',
      description: 'كتابة الفصول الأولى',
      status: 'قيد التنفيذ',
      progress: 40,
      symbol: '✦',
      currentTask: 'إنهاء الفصل الثالث',
      deviceId: 'dev-1',
      createdAt: '2026-09-24T00:00:00Z',
      updatedAt: '2026-09-24T00:00:00Z',
      revision: 1,
    },
  ],
  ideas: [
    {
      id: 'idea-1',
      title: 'فكرة تطبيق عادات',
      tag: 'برمجة',
      body: 'تصميم واجهة بسيطة',
      deviceId: 'dev-1',
      createdAt: '2026-09-24T00:00:00Z',
      updatedAt: '2026-09-24T00:00:00Z',
      revision: 1,
    },
  ],
  settings: {
    ...api.defaultPreferences,
    themeId: 'midnight-magenta',
    accentId: 'amber',
  },
  notificationSummary: {
    status: 'armed',
    unreadCount: 3,
    lastRecoverableError: null,
  },
  migration: {
    fromVersion: 0,
    toVersion: 2,
    migrated: false,
    counts: {},
  },
};

const mockPrayer: PrayerDay = {
  date: '2026-09-24',
  calculationNoteAr: 'حساب محلي',
  times: [
    { key: 'fajr', nameAr: 'الفجر', minutesFromMidnight: 270 },
    { key: 'sunrise', nameAr: 'الشروق', minutesFromMidnight: 350 },
    { key: 'dhuhr', nameAr: 'الظهر', minutesFromMidnight: 720 },
    { key: 'asr', nameAr: 'العصر', minutesFromMidnight: 930 },
    { key: 'maghrib', nameAr: 'المغرب', minutesFromMidnight: 1090 },
    { key: 'isha', nameAr: 'العشاء', minutesFromMidnight: 1170 },
  ],
};

describe('React / Testing Library Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.dataset.theme = 'midnight-magenta';
    document.documentElement.dataset.accent = 'amber';
  });

  describe('SettingsView: Save states, feedback, and skin/accent previews', () => {
    it('applies theme preview instantly and shows saved feedback on success', async () => {
      const updateSettingsSpy = vi.spyOn(api, 'updateSettings').mockResolvedValue({
        settings: { ...mockData.settings, themeId: 'dawn-sand' },
        notificationSummary: { status: 'armed', unreadCount: 0 },
      });

      const setDataMock = vi.fn();
      const setAudioPlayingMock = vi.fn();
      const syncReminderMock = vi.fn().mockResolvedValue(undefined);

      render(
        <SettingsView
          data={mockData}
          setData={setDataMock}
          setAudioPlaying={setAudioPlayingMock}
          prayer={mockPrayer}
          syncReminderPlan={syncReminderMock}
        />
      );

      // Verify 5 theme swatches exist
      expect(screen.getByText('أفق الليل')).toBeDefined();
      const dawnSandBtn = screen.getByText('رمل الفجر');
      expect(dawnSandBtn).toBeDefined();

      // Click to change theme to dawn-sand
      fireEvent.click(dawnSandBtn);

      // Verify dataset.theme immediately updated for preview
      expect(document.documentElement.dataset.theme).toBe('dawn-sand');

      // Verify updateSettings was called with themeId: dawn-sand
      expect(updateSettingsSpy).toHaveBeenCalledWith({ themeId: 'dawn-sand' });

      // Verify success state pill appears
      await waitFor(() => {
        expect(screen.getByText('تم الحفظ محليًا')).toBeDefined();
      });
    });

    it('shows failed state with retry button when settings_update fails', async () => {
      const updateSettingsSpy = vi
        .spyOn(api, 'updateSettings')
        .mockRejectedValue(new Error('Storage failure'));

      const setDataMock = vi.fn();
      const setAudioPlayingMock = vi.fn();
      const syncReminderMock = vi.fn();

      render(
        <SettingsView
          data={mockData}
          setData={setDataMock}
          setAudioPlaying={setAudioPlayingMock}
          prayer={mockPrayer}
          syncReminderPlan={syncReminderMock}
        />
      );

      const limeAccentBtn = screen.getByLabelText('تحديد لون ليموني');
      fireEvent.click(limeAccentBtn);

      // Verify dataset.accent updated immediately for preview
      expect(document.documentElement.dataset.accent).toBe('lime');

      // Verify failure indicator appears along with retry button
      await waitFor(() => {
        expect(screen.getByText('فشل الحفظ')).toBeDefined();
        expect(screen.getByText('أعد المحاولة')).toBeDefined();
      });

      // Clicking retry triggers updateSettings again
      updateSettingsSpy.mockResolvedValueOnce({
        settings: { ...mockData.settings, accentId: 'lime' },
        notificationSummary: { status: 'armed', unreadCount: 0 },
      });

      fireEvent.click(screen.getByText('أعد المحاولة'));
      await waitFor(() => {
        expect(screen.getByText('تم الحفظ محليًا')).toBeDefined();
      });
    });

    it('contains all 5 clearly organized sections', () => {
      render(
        <SettingsView
          data={mockData}
          setData={vi.fn()}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn()}
        />
      );

      expect(screen.getByRole('heading', { name: 'المظهر والسمات' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'التنبيهات والصوت' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'الموقع والمواقيت' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'الرفيق والنوافذ العائمة' })).toBeDefined();
      expect(screen.getByRole('heading', { name: 'الخصوصية والعمل دون اتصال' })).toBeDefined();
    });

    it('applies sequential changes without resetting previous settings (Issue 1)', async () => {
      let currentSettings = { ...mockData.settings };
      const updateSettingsSpy = vi
        .spyOn(api, 'updateSettings')
        .mockImplementation(async (patch) => {
          currentSettings = api.deepMergePreferences(currentSettings, patch);
          return {
            settings: currentSettings,
            notificationSummary: { status: 'armed', unreadCount: 0 },
          };
        });

      let testData = { ...mockData, settings: currentSettings };
      const setDataMock = vi.fn().mockImplementation((updater) => {
        if (typeof updater === 'function') {
          testData = updater(testData);
        } else {
          testData = updater;
        }
      });

      const { rerender } = render(
        <SettingsView
          data={testData}
          setData={setDataMock}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn().mockResolvedValue(undefined)}
        />
      );

      // 1. Change theme to dawn-sand
      const dawnSandBtn = screen.getByText('رمل الفجر');
      fireEvent.click(dawnSandBtn);

      expect(updateSettingsSpy).toHaveBeenCalledWith({ themeId: 'dawn-sand' });
      await waitFor(() => {
        expect(testData.settings.themeId).toBe('dawn-sand');
      });

      // Rerender with updated data
      rerender(
        <SettingsView
          data={testData}
          setData={setDataMock}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn().mockResolvedValue(undefined)}
        />
      );

      // 2. Change second setting: companion toggle
      const toggles = screen.getAllByRole('button').filter(b => b.classList.contains('toggle-switch'));
      expect(toggles.length).toBeGreaterThan(0);
      fireEvent.click(toggles[0]);

      await waitFor(() => {
        expect(testData.settings.themeId).toBe('dawn-sand');
        expect(testData.settings.notifications.prePrayerEnabled).toBe(false);
      });
    });

    it('handles rapid consecutive clicks without awaiting each save, cleanly preserving all changes (Issue 1)', async () => {
      let currentSettings = { ...mockData.settings };
      const calls: any[] = [];
      vi.spyOn(api, 'updateSettings').mockImplementation(async (patch) => {
        calls.push(patch);
        await new Promise((r) => setTimeout(r, 25));
        currentSettings = api.deepMergePreferences(currentSettings, patch);
        return {
          settings: currentSettings,
          notificationSummary: { status: 'armed', unreadCount: 0 },
        };
      });

      let testData = { ...mockData, settings: currentSettings };
      const setDataMock = vi.fn().mockImplementation((updater) => {
        if (typeof updater === 'function') {
          testData = updater(testData);
        } else {
          testData = updater;
        }
      });

      render(
        <SettingsView
          data={testData}
          setData={setDataMock}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn().mockResolvedValue(undefined)}
        />
      );

      // Rapidly fire multiple clicks without awaiting
      const dawnSandBtn = screen.getByText('رمل الفجر');
      fireEvent.click(dawnSandBtn);

      const limeAccentBtn = screen.getByLabelText('تحديد لون ليموني');
      fireEvent.click(limeAccentBtn);

      const toggles = screen.getAllByRole('button').filter((b) =>
        b.classList.contains('toggle-switch')
      );
      fireEvent.click(toggles[0]);
      fireEvent.click(toggles[2]);

      // All optimistic previews should be applied immediately
      expect(document.documentElement.dataset.theme).toBe('dawn-sand');
      expect(document.documentElement.dataset.accent).toBe('lime');
      expect(toggles[0].getAttribute('aria-pressed')).toBe('false');
      // fastingEnabled defaults to false in v1.0.0 so clicking toggles[2] enables it
      expect(toggles[2].getAttribute('aria-pressed')).toBe('true');

      // Wait for queue processing to complete
      await waitFor(
        () => {
          expect(screen.getByText('تم الحفظ محليًا')).toBeDefined();
        },
        { timeout: 3000 }
      );

      // Verify all changes were preserved and none reset
      expect(currentSettings.themeId).toBe('dawn-sand');
      expect(currentSettings.accentId).toBe('lime');
      expect(currentSettings.notifications.prePrayerEnabled).toBe(false);
      expect(currentSettings.notifications.fastingEnabled).toBe(true);
      expect(testData.settings.themeId).toBe('dawn-sand');
      expect(testData.settings.accentId).toBe('lime');
      expect(testData.settings.notifications.prePrayerEnabled).toBe(false);
      expect(testData.settings.notifications.fastingEnabled).toBe(true);
    });
  });

  describe('CommandPalette: Focus trap, arrow navigation, escape and close', () => {
    it('focuses search input on mount, handles Escape, and executes selection', () => {
      const closeMock = vi.fn();
      const goMock = vi.fn();
      const setQueryMock = vi.fn();

      render(
        <CommandPalette
          query=""
          setQuery={setQueryMock}
          go={goMock}
          close={closeMock}
          data={mockData}
        />
      );

      const input = screen.getByLabelText('مدخل البحث') as HTMLInputElement;
      expect(input).toBeDefined();

      // Escape calls close
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(closeMock).toHaveBeenCalledTimes(1);

      // Close button with accessible name exists
      const closeBtn = screen.getByLabelText('إغلاق لوحة الأوامر');
      expect(closeBtn).toBeDefined();
      fireEvent.click(closeBtn);
      expect(closeMock).toHaveBeenCalledTimes(2);
    });

    it('shows curated suggested actions when search query is empty', () => {
      render(
        <CommandPalette
          query=""
          setQuery={vi.fn()}
          go={vi.fn()}
          close={vi.fn()}
          data={mockData}
        />
      );

      expect(screen.getByText('استئناف جلسة الشغل والتايمر')).toBeDefined();
      expect(screen.getByText('مواقيت الصلاة والقبلة')).toBeDefined();
      expect(screen.getByText('تدوين فكرة سريعة جديدة')).toBeDefined();
      expect(screen.getAllByText('إجراء مقترح').length).toBeGreaterThan(0);
    });
  });

  describe('Today: Contextual Key Decision and Expandable Checklist', () => {
    it('displays single contextual action and expandable daily checklist', () => {
      const toggleMock = vi.fn();
      const goMock = vi.fn();

      render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]} // Dhuhr
          following={mockPrayer.times[3]} // Asr
          checks={{}}
          toggle={toggleMock}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={goMock}
        />
      );

      // Contextual action banner displays resuming current project task
      expect(screen.getByText(/استئناف جلسة العمل — مشروع كتاب وِنس/)).toBeDefined();
      expect(screen.getByText('استئناف الشغل')).toBeDefined();

      // Checklist summary and expand toggle
      const expandBtn = screen.getByLabelText('عرض تفاصيل علامات اليوم');
      expect(expandBtn).toBeDefined();
      expect(screen.getByText('عرض وتعديل')).toBeDefined();

      // Clicking expand reveals individual check buttons
      fireEvent.click(expandBtn);
      expect(screen.getByText('إخفاء التفاصيل')).toBeDefined();
      expect(screen.getAllByText('الفجر').length).toBeGreaterThan(0);
      expect(screen.getAllByText('الظهر').length).toBeGreaterThan(0);
      expect(screen.getByText('صمت اليوم')).toBeDefined();
      expect(screen.getByText('أنجزت خطوتي')).toBeDefined();

      // Sunrise is correctly excluded from the daily prayer checklist chips
      const expandedChecklist = document.querySelector('.horizon-checklist-expanded');
      expect(expandedChecklist).not.toBeNull();
      const chipTexts = Array.from(expandedChecklist!.querySelectorAll('.check-chip')).map((el) => el.textContent);
      expect(chipTexts.some((t) => t?.includes('الشروق'))).toBe(false);
    });

    it('interacts with living companion node on click: shows speech bubble and triggers bounce state', () => {
      render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
        />
      );

      const companionNode = screen.getByRole('button', { name: 'رفيق وِنس التفاعلي' });
      expect(companionNode).toBeDefined();

      // Before tap, no speech bubble
      expect(document.querySelector('.horizon-companion-speech-bubble')).toBeNull();

      // Tap companion
      fireEvent.click(companionNode);

      // Speech bubble appears with text
      const bubble = document.querySelector('.horizon-companion-speech-bubble');
      expect(bubble).not.toBeNull();
      expect(bubble?.textContent).toContain('وِنس');

      // Avatar receives is-tapped bounce class
      const avatar = companionNode.querySelector('.wens-avatar');
      expect(avatar?.classList.contains('is-tapped')).toBe(true);

      // Keyboard accessibility (Space / Enter)
      fireEvent.keyDown(companionNode, { key: 'Enter' });
      expect(avatar?.classList.contains('is-tapped')).toBe(true);
    });
  });

  describe('WorshipView: Missed Prayers & Fasting Backlog', () => {
    it('renders all 3 tabs and switches between Prayer Times, Backlog, and Fasting Hub', () => {
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
        />
      );

      // Verify all 3 tabs exist
      const todayTab = screen.getByRole('tab', { name: /مواقيت اليوم|مواعيد الصلاة/ });
      const backlogTab = screen.getByRole('tab', { name: /قضاء الفوائت والمعلّق/ });
      const fastingTab = screen.getByRole('tab', { name: /الصيام والسحور والمنبهات/ });
      expect(todayTab).toBeDefined();
      expect(backlogTab).toBeDefined();
      expect(fastingTab).toBeDefined();

      // Today view shows prayer times & Qibla compass
      expect(screen.getAllByText('الفجر').length).toBeGreaterThan(0);
      expect(screen.getByText(/اتجاه القبلة/)).toBeDefined();
      expect(screen.getByText('أنا صائم اليوم')).toBeDefined();

      // Click on Backlog tab
      fireEvent.click(backlogTab);

      // Backlog panel is now visible
      expect(screen.getByText('الصلوات الفائتة والمحتاجة تأكيد')).toBeDefined();
      expect(screen.getByText('أيام الصيام الفائتة والمحتاجة قضاء')).toBeDefined();
      expect(screen.getByText('مراجعة تلقائية عند انتهاء الوقت')).toBeDefined();

      // Click on Fasting tab
      fireEvent.click(fastingTab);

      // Fasting & Suhoor Hub is now visible
      expect(screen.getByText(/منبه وتذكير السحور/)).toBeDefined();
      expect(screen.getByText(/وقت التنبيه قبل أذان الفجر/)).toBeDefined();
      expect(screen.getByText('تقويم صيام السُنن')).toBeDefined();
    });

    it('renders Qibla compass needle and angle pill accurately in Section 1', () => {
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          settings={{
            ...mockData.settings,
            latitude: 30.0444,
            longitude: 31.2357,
          }}
        />
      );

      expect(screen.getByText(/اتجاه القبلة/)).toBeDefined();
      expect(screen.getByText(/١٣٦° جنوب شرق/)).toBeDefined();
      const compassEl = screen.getByLabelText(/بوصلة القبلة بزاوية 136 درجة/);
      expect(compassEl).toBeDefined();
    });

    it('renders Visual Timeline, Next Prayer focus, and Wudu preparation window in Section 1', () => {
      const toggleMock = vi.fn();
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={toggleMock}
          settings={{
            ...mockData.settings,
            wuduLeadMinutes: 15,
          }}
        />
      );

      // Verify Next Prayer and Wudu window
      expect(screen.getByText(/الصلاة القادمة/)).toBeDefined();
      expect(screen.getByText(/نافذة الاستعداد والوضوء/)).toBeDefined();

      // Verify Visual Timeline
      expect(screen.getByText('الخط الزمني لصلوات اليوم')).toBeDefined();
      const timelineCheckBtns = screen.getAllByRole('button', { name: /تأكيد أداء/ });
      expect(timelineCheckBtns.length).toBeGreaterThanOrEqual(5);

      // Click check button on timeline
      fireEvent.click(timelineCheckBtns[0]);
      expect(toggleMock).toHaveBeenCalled();
    });

    it('toggles between daily prayer times, weekly calendar, and monthly calendar table view in Section 1', () => {
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
        />
      );

      // By default shows daily times
      expect(screen.getAllByText('الفجر').length).toBeGreaterThan(0);
      const weekBtn = screen.getByText('جدول الأسبوع (٧ أيام)');
      const monthBtn = screen.getByText('جدول الشهر بالكامل');
      expect(weekBtn).toBeDefined();
      expect(monthBtn).toBeDefined();

      // Switch to weekly table view
      fireEvent.click(weekBtn);
      expect(screen.getByText(/مواقيت الأسبوع الحالي/)).toBeDefined();
      expect(screen.getByText('الرجوع لمواقيت اليوم')).toBeDefined();

      // Click back
      fireEvent.click(screen.getByText('الرجوع لمواقيت اليوم'));
      expect(screen.getAllByText('الفجر').length).toBeGreaterThan(0);

      // Click to switch to month view
      fireEvent.click(monthBtn);
      expect(screen.getByText(/مواقيت شهر/)).toBeDefined();
      expect(screen.getByText('الرجوع لمواقيت اليوم')).toBeDefined();

      // Click back
      fireEvent.click(screen.getByText('الرجوع لمواقيت اليوم'));
      expect(screen.getAllByText('الفجر').length).toBeGreaterThan(0);
    });

    it('controls Suhoor alarm settings (toggle, lead time selector, gentle chime preview) and tomorrow preview in Section 3', async () => {
      const updateSettingsSpy = vi.spyOn(api, 'updateSettings').mockResolvedValue({
        settings: {
          ...mockData.settings,
          notifications: {
            ...mockData.settings.notifications,
            fastingEnabled: true,
          },
        },
        notificationSummary: { status: 'armed', unreadCount: 0 },
      });
      const testNotifSpy = vi.spyOn(api, 'testNotification').mockResolvedValue(undefined as any);
      const syncReminderMock = vi.fn().mockResolvedValue(undefined);

      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          activeTab="fasting"
          settings={{
            ...mockData.settings,
            notifications: {
              ...mockData.settings.notifications,
              fastingEnabled: false,
            },
          }}
          syncReminderPlan={syncReminderMock}
        />
      );

      // Verify fasting hub and tomorrow card are rendered
      expect(screen.getByText(/منبه وتذكير السحور/)).toBeDefined();
      expect(screen.getByText(/سحور وصيام الغد/)).toBeDefined();
      expect(screen.getByText(/موعد منبه سحور الغد/)).toBeDefined();

      // Click lead time 30 mins with act
      const lead30Btn = screen.getByText(/٣٠ دقيقة/);
      await act(async () => {
        fireEvent.click(lead30Btn);
      });
      expect(localStorage.getItem('wens-suhoor-lead')).toBe('30');
      expect(syncReminderMock).toHaveBeenCalled();

      // Click Test Audio Preview with act
      const testSoundBtn = screen.getByText('تجربة نغمة السحور');
      await act(async () => {
        fireEvent.click(testSoundBtn);
      });
      expect(testNotifSpy).toHaveBeenCalledWith('gentle');

      // Toggle fasting reminder on with act
      const suhoorToggle = screen.getByLabelText('تشغيل منبه السحور');
      await act(async () => {
        fireEvent.click(suhoorToggle);
      });
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        notifications: { fastingEnabled: true },
      });
    });

    it('renders Sunnah Fasting calendar with remaining time countdowns for Monday/Thursday, White Days, and Major Occasions', () => {
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          activeTab="fasting"
          settings={mockData.settings}
        />
      );

      // Verify Sunnah calendar section heading
      expect(screen.getByText('تقويم صيام السُنن')).toBeDefined();

      // Card 1: Monday & Thursday countdowns
      expect(screen.getByText('صيام الإثنين والخميس')).toBeDefined();
      expect(screen.getByText('الإثنين القادم')).toBeDefined();
      expect(screen.getByText('الخميس القادم')).toBeDefined();

      // Card 2: White Days countdown
      expect(screen.getAllByText(/الأيام البيض/).length).toBeGreaterThan(0);
      expect(screen.getByText(/تاريخ البداية/)).toBeDefined();
      expect(screen.getByText(/تاريخ النهاية/)).toBeDefined();

      // Card 3: Major Fasting Occasions with countdown
      expect(screen.getByText('سنن ومواسم الصيام الكبرى')).toBeDefined();
      expect(screen.getByText(/أقرب موسم صيام:/)).toBeDefined();
      expect(screen.getAllByText(/متبقي/).length).toBeGreaterThan(0);

      // Dedicated Bridge banner to Islamic Religious Holidays & Occasions Section
      expect(screen.getByText('تقويم الأعياد والمناسبات والنفحات الدينية')).toBeDefined();
      expect(screen.getByText('فتح تقويم المناسبات')).toBeDefined();
    });

    it('renders dedicated Islamic Religious Holidays and Occasions calendar when activeTab is occasions', () => {
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          activeTab="occasions"
          settings={mockData.settings}
        />
      );

      // Verify Dedicated Occasions Hub
      expect(screen.getByText('تقويم الأعياد والمناسبات والنفحات الدينية')).toBeDefined();
      expect(screen.getByText(/أقرب مناسبة دينية قادمة/)).toBeDefined();
      expect(screen.getByText(/عيد الفطر المبارك/)).toBeDefined();
      expect(screen.getByText(/عيد الأضحى المبارك/)).toBeDefined();
      expect(screen.getByText('جميع المناسبات')).toBeDefined();
      expect(screen.getByText('الأعياد الكبرى وأيام التشريق')).toBeDefined();
    });

    it('displays clear dates and allows setting intentions and recording completion for Sunnah days', async () => {
      const initialBacklog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      const setBacklogMock = vi.fn();
      const toastMock = vi.fn();
      const toggleMock = vi.fn();

      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={toggleMock}
          backlog={initialBacklog}
          setBacklog={setBacklogMock}
          activeTab="fasting"
          triggerToast={toastMock}
        />
      );

      // Verify the 3 individual White Days are clearly visible with day labels
      expect(screen.getByText(/اليوم الأول \(١٣\)/)).toBeDefined();
      expect(screen.getByText(/اليوم الثاني \(١٤\)/)).toBeDefined();
      expect(screen.getByText(/اليوم الثالث \(١٥\)/)).toBeDefined();

      // Verify human Arabic dates are rendered with weekday names and Arabic numerals
      expect(screen.getAllByText(/الميلادي:/).length).toBeGreaterThanOrEqual(5);
      expect(screen.getAllByText(/الهجري:/).length).toBeGreaterThanOrEqual(5);
      expect(screen.getAllByText(/الموعد:/).length).toBeGreaterThanOrEqual(1);

      // Verify interactive intention and completion buttons are rendered
      const intentButtons = screen.getAllByRole('button', { name: /أنوي الصيام/ });
      expect(intentButtons.length).toBeGreaterThanOrEqual(5);

      const completeButtons = screen.getAllByRole('button', { name: /صمت هذا اليوم/ });
      expect(completeButtons.length).toBeGreaterThanOrEqual(5);

      // 1. Set fasting intention
      fireEvent.click(intentButtons[0]);
      expect(toastMock).toHaveBeenCalledWith(
        'نية الصيام',
        expect.stringContaining('ثبت الله أجرك ونواك بالخير')
      );

      // Verify button reflects intended state (may match both Monday and White Day 15 when they fall on the same date)
      expect(screen.getAllByText('نويت الصيام').length).toBeGreaterThanOrEqual(1);

      // Toggle off fasting intention
      fireEvent.click(screen.getAllByText('نويت الصيام')[0]);
      expect(toastMock).toHaveBeenCalledWith(
        'نية الصيام',
        expect.stringContaining('تم إلغاء تحديد نية')
      );

      // 2. Future day completion button is disabled to prevent marking future days as completed
      const futureButton = (completeButtons.find((btn) => (btn as HTMLButtonElement).disabled) || completeButtons[0]) as HTMLButtonElement;
      expect(futureButton.disabled).toBe(true);
      expect(futureButton.getAttribute('title')).toContain('لا يمكن تسجيل إتمام الصيام قبل حلول اليوم');

      // Clicking disabled button is blocked by DOM and does not alter backlog
      fireEvent.click(futureButton);
      expect(setBacklogMock).not.toHaveBeenCalled();
    });

    it('adds a missed prayer manually and resolves it with قضيتها', async () => {
      const initialBacklog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      const setBacklogMock = vi.fn();
      const toastMock = vi.fn();

      const { rerender } = render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={initialBacklog}
          setBacklog={setBacklogMock}
          activeTab="backlog"
          triggerToast={toastMock}
        />
      );

      // Verify empty state initially
      expect(screen.getByText('مفيش صلوات في هذا القسم حاليًا.')).toBeDefined();

      // Fill add prayer form
      const notesInput = screen.getByPlaceholderText('مثال: نوم، سفر، نسيان...');
      fireEvent.change(notesInput, { target: { value: 'نوم عميق' } });

      const submitBtn = screen.getByText('سجّلها كفائتة');
      fireEvent.click(submitBtn);

      expect(setBacklogMock).toHaveBeenCalled();
      const updatedBacklog = setBacklogMock.mock.calls[0][0];
      expect(updatedBacklog.items).toHaveLength(1);
      expect(updatedBacklog.items[0].prayerName).toBe('الفجر');
      expect(updatedBacklog.items[0].status).toBe('missed');
      expect(updatedBacklog.items[0].notes).toBe('نوم عميق');

      // Now rerender with this missed item
      rerender(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={updatedBacklog}
          setBacklog={setBacklogMock}
          activeTab="backlog"
          triggerToast={toastMock}
        />
      );

      expect(screen.getByText('صلاة الفجر')).toBeDefined();
      expect(screen.getByText('نوم عميق')).toBeDefined();
      expect(screen.getByText('قضيتها')).toBeDefined();
      expect(screen.getByText('صليتها في وقتها')).toBeDefined();
      expect(screen.getByText('عذر شرعي')).toBeDefined();
      expect(screen.queryByText('حذف')).toBeNull();

      // Resolve it with "قضيتها"
      fireEvent.click(screen.getByText('قضيتها'));

      expect(setBacklogMock).toHaveBeenCalledTimes(2);
      const resolvedBacklog = setBacklogMock.mock.calls[1][0];
      expect(resolvedBacklog.items[0].status).toBe('resolved');
      expect(resolvedBacklog.items[0].resolution).toBe('made-up');
    });

    it('resolves unconfirmed prayers with صليتها في وقتها and عذر شرعي', () => {
      const backlogWithUnconfirmed: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'unconfirmed-dhuhr',
            prayerName: 'الظهر',
            prayerDate: '2026-09-24',
            source: 'automatic',
            status: 'unconfirmed',
            reason: 'window-ended',
            createdAt: '2026-09-24T12:00:00.000Z',
            updatedAt: '2026-09-24T12:00:00.000Z',
          },
        ],
        fastingItems: [],
      };

      const setBacklogMock = vi.fn();
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={backlogWithUnconfirmed}
          setBacklog={setBacklogMock}
          activeTab="backlog"
        />
      );

      expect(screen.getByText('صلاة الظهر')).toBeDefined();
      expect(screen.getByText('؟ غير مؤكدة')).toBeDefined();
      expect(screen.getByText('صليتها في وقتها')).toBeDefined();
      expect(screen.getByText('فاتتني')).toBeDefined();
      expect(screen.getByText('عذر شرعي')).toBeDefined();
      expect(screen.queryByText('حذف')).toBeNull();

      // Click "صليتها في وقتها"
      const prayedBtn = screen.getByText('صليتها في وقتها');
      fireEvent.click(prayedBtn);

      expect(setBacklogMock).toHaveBeenCalled();
      const updated = setBacklogMock.mock.calls[0][0];
      expect(updated.items[0].status).toBe('resolved');
      expect(updated.items[0].resolution).toBe('done');
    });

    it('adds and resolves missed fasting day', () => {
      const initialBacklog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [],
        fastingItems: [],
      };

      const setBacklogMock = vi.fn();
      const { rerender } = render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={initialBacklog}
          setBacklog={setBacklogMock}
          activeTab="backlog"
        />
      );

      // Submit fasting add form
      const fastingSubmit = screen.getByText('سجّله كفائت');
      fireEvent.click(fastingSubmit);

      expect(setBacklogMock).toHaveBeenCalled();
      const updated = setBacklogMock.mock.calls[0][0];
      expect(updated.fastingItems).toHaveLength(1);
      expect(updated.fastingItems[0].fastingType).toBe('قضاء رمضان');

      // Rerender and resolve
      rerender(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={updated}
          setBacklog={setBacklogMock}
          activeTab="backlog"
        />
      );

      expect(screen.getByText('! صيام مطلوب قضاؤه')).toBeDefined();
      expect(screen.getByText('قضيته')).toBeDefined();
      expect(screen.getByText('صمته في وقته')).toBeDefined();
      expect(screen.getByText('عذر شرعي')).toBeDefined();
      expect(screen.queryByText('حذف')).toBeNull();
      const madeUpBtn = screen.getByText('قضيته');
      fireEvent.click(madeUpBtn);

      expect(setBacklogMock).toHaveBeenCalledTimes(2);
      const resolved = setBacklogMock.mock.calls[1][0];
      expect(resolved.fastingItems[0].status).toBe('resolved');
      expect(resolved.fastingItems[0].resolution).toBe('made-up');
    });

    it('does not display any "حذف" button on prayer or fasting backlog items', () => {
      const backlog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'unconf-1',
            prayerName: 'الفجر',
            prayerDate: '2026-09-24',
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: '2026-09-24T04:00:00.000Z',
            updatedAt: '2026-09-24T04:00:00.000Z',
          },
          {
            id: 'missed-1',
            prayerName: 'الظهر',
            prayerDate: '2026-09-24',
            source: 'manual',
            status: 'missed',
            createdAt: '2026-09-24T12:00:00.000Z',
            updatedAt: '2026-09-24T12:00:00.000Z',
          },
        ],
        fastingItems: [
          {
            id: 'fasting-1',
            fastingDate: '2026-09-24',
            fastingType: 'قضاء رمضان',
            source: 'manual',
            status: 'missed',
            createdAt: '2026-09-24T00:00:00.000Z',
            updatedAt: '2026-09-24T00:00:00.000Z',
          },
        ],
      };

      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={backlog}
          setBacklog={vi.fn()}
          activeTab="backlog"
        />
      );

      // Verify legitimate resolution buttons are rendered
      expect(screen.getByText('قضيتها')).toBeDefined();
      expect(screen.getByText('فاتتني')).toBeDefined();
      expect(screen.getByText('قضيته')).toBeDefined();
      expect(screen.getByText('صمته في وقته')).toBeDefined();

      // Ensure no arbitrary 'حذف' button exists
      expect(screen.queryAllByText('حذف')).toHaveLength(0);
    });

    it('renders 4 summary cards (معلقة، مقضية، عذر شرعي) and filters by excused in Section 2', () => {
      const backlog: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'unconf-1',
            prayerName: 'الفجر',
            prayerDate: '2026-09-24',
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: '2026-09-24T04:00:00.000Z',
            updatedAt: '2026-09-24T04:00:00.000Z',
          },
          {
            id: 'excused-1',
            prayerName: 'الظهر',
            prayerDate: '2026-09-24',
            source: 'manual',
            status: 'resolved',
            resolution: 'excused',
            createdAt: '2026-09-24T12:00:00.000Z',
            updatedAt: '2026-09-24T12:00:00.000Z',
          },
        ],
        fastingItems: [],
      };

      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={backlog}
          setBacklog={vi.fn()}
          activeTab="backlog"
        />
      );

      // Verify all 4 cards exist
      expect(screen.getByText('صلوات وأيام صيام معلّقة')).toBeDefined();
      expect(screen.getByText('صلوات مسجلة كفائتة')).toBeDefined();
      expect(screen.getByText('فوائت تم قضاؤها (مقضية)')).toBeDefined();
      expect(screen.getByText('مسجلة بعذر شرعي')).toBeDefined();

      // Verify excused filter button exists and filters
      const excusedFilterBtn = screen.getByRole('button', { name: /عذر شرعي \(/ });
      expect(excusedFilterBtn).toBeDefined();
      fireEvent.click(excusedFilterBtn);
      expect(screen.getByText('صلاة الظهر')).toBeDefined();
    });

    it('triggers onCheckPrayer and onCheckFasting when today items are resolved in backlog', () => {
      const todayStr = toLocalDateString();
      const backlogWithToday: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'unconf-today-asr',
            prayerName: 'العصر',
            prayerDate: todayStr,
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: '2026-09-24T16:00:00.000Z',
            updatedAt: '2026-09-24T16:00:00.000Z',
          },
        ],
        fastingItems: [
          {
            id: 'unconf-today-fast',
            fastingDate: todayStr,
            fastingType: 'قضاء رمضان',
            source: 'manual',
            status: 'missed',
            createdAt: '2026-09-24T10:00:00.000Z',
            updatedAt: '2026-09-24T10:00:00.000Z',
          },
        ],
      };

      const setBacklogMock = vi.fn();
      const onCheckPrayerMock = vi.fn();
      const onCheckFastingMock = vi.fn();

      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={backlogWithToday}
          setBacklog={setBacklogMock}
          activeTab="backlog"
          onCheckPrayer={onCheckPrayerMock}
          onCheckFasting={onCheckFastingMock}
        />
      );

      // Click "صليتها في وقتها" on Asr
      const prayedBtn = screen.getByText('صليتها في وقتها');
      fireEvent.click(prayedBtn);
      expect(onCheckPrayerMock).toHaveBeenCalledWith('asr');

      // Click "قضيته" on fasting
      const fastMadeUpBtn = screen.getByText('قضيته');
      fireEvent.click(fastMadeUpBtn);
      expect(onCheckFastingMock).toHaveBeenCalled();
    });

    it('finds backlog in CommandPalette when searching for قضاء or فوائت', () => {
      const goMock = vi.fn();
      const closeMock = vi.fn();
      const onOpenBacklogMock = vi.fn();

      render(
        <CommandPalette
          query="قضاء"
          setQuery={vi.fn()}
          go={goMock}
          close={closeMock}
          data={mockData}
          onOpenBacklog={onOpenBacklogMock}
        />
      );

      const backlogOption = screen.getByText('قضاء الفوائت والصلوات الفائتة');
      expect(backlogOption).toBeDefined();

      fireEvent.click(backlogOption);
      expect(onOpenBacklogMock).toHaveBeenCalled();
      expect(goMock).toHaveBeenCalledWith('worship');
    });
  });

  describe('Section 3 Prayer minute offset inputs and Work stopwatch', () => {
    it('renders prayer minute offsets in Section 3 and updates on change', async () => {
      const updateSettingsSpy = vi.spyOn(api, 'updateSettings').mockResolvedValue({
        settings: { ...mockData.settings, fajrOffset: 5, maghribOffset: -2, ishaOffset: 3 },
        notificationSummary: { status: 'armed', unreadCount: 0 },
      });

      render(
        <SettingsView
          data={mockData}
          setData={vi.fn()}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn()}
        />
      );

      expect(screen.getByText(/فارق دقائق صلاة الفجر/)).toBeDefined();
      expect(screen.getByText(/فارق دقائق صلاة المغرب/)).toBeDefined();
      expect(screen.getByText(/فارق دقائق صلاة العشاء/)).toBeDefined();

      const fajrInput = screen.getByLabelText('فارق دقائق صلاة الفجر') as HTMLInputElement;
      fireEvent.change(fajrInput, { target: { value: '5' } });

      await waitFor(() => {
        expect(updateSettingsSpy).toHaveBeenCalledWith(
          expect.objectContaining({ fajrOffset: 5 })
        );
      });
    });

    it('Work stopwatch toggles between start and pause cleanly', () => {
      const setTimerStartedMock = vi.fn();
      const { rerender } = render(
        <Work
          timerStarted={null}
          setTimerStarted={setTimerStartedMock}
          workTime="00:00:00"
          projects={mockData.projects}
        />
      );

      const startBtn = screen.getByText('ابدأ جلسة العمل');
      expect(startBtn).toBeDefined();
      fireEvent.click(startBtn);
      expect(setTimerStartedMock).toHaveBeenCalled();

      // Rerender as running
      rerender(
        <Work
          timerStarted={Date.now()}
          setTimerStarted={setTimerStartedMock}
          workTime="00:15:30"
          projects={mockData.projects}
        />
      );

      const pauseBtn = screen.getByText('إيقاف مؤقت للجلسة');
      expect(pauseBtn).toBeDefined();
      fireEvent.click(pauseBtn);
      expect(setTimerStartedMock).toHaveBeenCalled();
    });

    it('handles negative offsets and zero properly in SettingsView', async () => {
      const updateSettingsSpy = vi.spyOn(api, 'updateSettings').mockResolvedValue({
        settings: { ...mockData.settings, maghribOffset: -3 },
        notificationSummary: { status: 'armed', unreadCount: 0 },
      });

      render(
        <SettingsView
          data={mockData}
          setData={vi.fn()}
          setAudioPlaying={vi.fn()}
          prayer={mockPrayer}
          syncReminderPlan={vi.fn()}
        />
      );

      const maghribInput = screen.getByLabelText('فارق دقائق صلاة المغرب') as HTMLInputElement;
      fireEvent.change(maghribInput, { target: { value: '-3' } });

      await waitFor(() => {
        expect(updateSettingsSpy).toHaveBeenCalledWith(
          expect.objectContaining({ maghribOffset: -3 })
        );
      });
    });
  });

  describe('Astronomical Sun Reality & Prayer Click Completion', () => {
    it('renders upcoming prayer as green done when checks has it true', () => {
      const toggleMock = vi.fn();
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]} // Dhuhr
          following={mockPrayer.times[3]}
          checks={{ dhuhr: true }}
          toggle={toggleMock}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
        />
      );

      const dhuhrNode = container.querySelector('.horizon-prayer-node.done');
      expect(dhuhrNode).not.toBeNull();
      const doneDot = container.querySelector('.prayer-dot.done');
      expect(doneDot).not.toBeNull();
      // Beam should be hidden when done
      expect(container.querySelector('.prayer-vertical-beam')).toBeNull();
    });

    it('allows toggling sunrise and renders it as green done when checked', () => {
      const toggleMock = vi.fn();
      const { container, rerender } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={toggleMock}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
        />
      );

      const sunriseNode = container.querySelector('.horizon-prayer-node.sunrise') as HTMLElement;
      expect(sunriseNode).not.toBeNull();
      fireEvent.click(sunriseNode);
      expect(toggleMock).toHaveBeenCalledWith('sunrise');

      rerender(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{ sunrise: true }}
          toggle={toggleMock}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
        />
      );

      const doneSunrise = container.querySelector('.horizon-prayer-node.sunrise.done');
      expect(doneSunrise).not.toBeNull();
      const doneDot = doneSunrise?.querySelector('.prayer-dot.done');
      expect(doneDot).not.toBeNull();
    });

    it('marks missed prayers and sunrise with red passed missed indicator when time has passed without completion', () => {
      const toggleMock = vi.fn();
      const { rerender } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]} // Maghrib (1090)
          following={mockPrayer.times[5]}
          checks={{ fajr: true }} // Fajr done, Sunrise and others not done
          toggle={toggleMock}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1000} // Passed Fajr, Sunrise, Dhuhr, Asr
        />
      );

      expect(screen.getByTitle('تمت صلاة الفجر (٠٤:٣٠ ص)')).toBeDefined();

      const missedSunrise = screen.getByTitle('فائتة لم تُصلَ: الشروق (٠٥:٥٠ ص) (انقر للتسجيل)');
      expect(missedSunrise).toBeDefined();
      expect(missedSunrise.classList.contains('passed')).toBe(true);
      expect(missedSunrise.classList.contains('missed')).toBe(true);
      expect(missedSunrise.querySelector('.prayer-dot.passed.missed')).not.toBeNull();

      // Clicking missed prayer invokes toggle
      fireEvent.click(missedSunrise);
      expect(toggleMock).toHaveBeenCalledWith('sunrise');

      // Once marked done in checks, turns into green done
      rerender(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{ fajr: true, sunrise: true }}
          toggle={toggleMock}
          completed={2}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1000}
        />
      );

      const doneSunrise = screen.getByTitle('تمت صلاة الشروق (٠٥:٥٠ ص)');
      expect(doneSunrise).toBeDefined();
      expect(doneSunrise.classList.contains('done')).toBe(true);
      expect(doneSunrise.querySelector('.prayer-dot.done')).not.toBeNull();
    });

    it('marks Fajr as missed after Isha rollover when unperformed and does not falsely highlight it as next', () => {
      const toggleMock = vi.fn();
      // At 23:00 (1380 mins), Isha was 1170 mins. Next wraps around to Fajr (270 mins).
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[0]} // Fajr of tomorrow
          following={mockPrayer.times[2]}
          checks={{}} // Nothing prayed today
          toggle={toggleMock}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1380} // 23:00 late night
        />
      );

      // Fajr on today's timeline MUST be marked passed/missed, NOT next!
      const fajrNode = screen.getByTitle('فائتة لم تُصلَ: الفجر (٠٤:٣٠ ص) (انقر للتسجيل)');
      expect(fajrNode).toBeDefined();
      expect(fajrNode.classList.contains('passed')).toBe(true);
      expect(fajrNode.classList.contains('missed')).toBe(true);
      expect(fajrNode.classList.contains('next')).toBe(false);
      expect(fajrNode.querySelector('.prayer-vertical-beam')).toBeNull();
      expect(fajrNode.querySelector('.prayer-dot.passed.missed')).not.toBeNull();

      // All 6 unprayed milestones (including Sunrise) should be marked passed/missed
      const missedNodes = container.querySelectorAll('.horizon-prayer-node.passed.missed');
      expect(missedNodes.length).toBe(6);
    });

    it('displays prayer time in hover tooltip for upcoming prayers and sunrise on horizon timeline', () => {
      // Fajr is 270 mins (04:30 ص), Sunrise is 350 mins (05:50 ص), Dhuhr is 720 mins (12:00 م) in mockPrayer
      render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[0]} // Fajr is next
          following={mockPrayer.times[1]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={200}
        />
      );

      // Fajr title must include its formatted time
      const fajrNode = screen.getByTitle('تسجيل صلاة الفجر (٠٤:٣٠ ص)');
      expect(fajrNode).toBeDefined();

      // Sunrise title must include its formatted time
      const sunriseNode = screen.getByTitle('موعد الشروق (٠٥:٥٠ ص)');
      expect(sunriseNode).toBeDefined();

      // Dhuhr title must include its formatted time
      const dhuhrNode = screen.getByTitle('تسجيل صلاة الظهر (١٢:٠٠ م)');
      expect(dhuhrNode).toBeDefined();

      // Asr title must include its formatted time
      const asrNode = screen.getByTitle('تسجيل صلاة العصر (٠٣:٣٠ م)');
      expect(asrNode).toBeDefined();

      // Maghrib title must include its formatted time
      const maghribNode = screen.getByTitle('تسجيل صلاة المغرب (٠٦:١٠ م)');
      expect(maghribNode).toBeDefined();

      // Isha title must include its formatted time
      const ishaNode = screen.getByTitle('تسجيل صلاة العشاء (٠٧:٣٠ م)');
      expect(ishaNode).toBeDefined();
    });

    it('displays prayer time in hover tooltip for completed and missed prayers on Today and Worship timelines', () => {
      // In mockPrayer: Fajr is 270 (04:30 ص), Sunrise is 350 (05:50 ص), Dhuhr is 720 (12:00 م)
      const { rerender } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]} // Dhuhr
          following={mockPrayer.times[3]}
          checks={{ fajr: true }} // Fajr completed
          toggle={vi.fn()}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={800} // Past Fajr, Sunrise, Dhuhr
        />
      );

      // Completed Fajr tooltip must include time
      expect(screen.getByTitle('تمت صلاة الفجر (٠٤:٣٠ ص)')).toBeDefined();

      // Missed Sunrise tooltip must include time
      expect(screen.getByTitle('فائتة لم تُصلَ: الشروق (٠٥:٥٠ ص) (انقر للتسجيل)')).toBeDefined();

      // Missed Dhuhr tooltip must include time
      expect(screen.getByTitle('فائتة لم تُصلَ: الظهر (١٢:٠٠ م) (انقر للتسجيل)')).toBeDefined();

      // Verify Worship timeline tooltips across all states (completed, current, missed, upcoming)
      rerender(
        <Worship
          prayer={mockPrayer}
          checks={{ fajr: true, dhuhr: true }}
          toggle={vi.fn()}
          activeTab="times"
          minuteNow={1100} // 18:20, between Maghrib (1090) and Isha (1170)
        />
      );

      // Fajr is completed:
      expect(screen.getByTitle('تمت صلاة الفجر (٠٤:٣٠ ص)')).toBeDefined();
      // Dhuhr is completed:
      expect(screen.getByTitle('تمت صلاة الظهر (١٢:٠٠ م)')).toBeDefined();
      // Asr was missed:
      expect(screen.getByTitle('فائتة لم تُصلَ: العصر (٠٣:٣٠ م) (انقر للتسجيل)')).toBeDefined();
      // Isha is upcoming/current:
      expect(screen.getByTitle('صلاة العشاء الآن (٠٧:٣٠ م) (انقر للتسجيل)')).toBeDefined();
    });

    it('renders instant hover tooltips with accurate prayer times and checkmark icon animation classes', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{ fajr: true }}
          toggle={vi.fn()}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={300}
        />
      );

      const instantTooltips = container.querySelectorAll('.prayer-instant-tooltip');
      expect(instantTooltips.length).toBe(6);

      // Verify Fajr instant tooltip content
      const fajrTooltip = instantTooltips[0];
      expect(fajrTooltip.querySelector('.prayer-tooltip-time')?.textContent).toBe('٠٤:٣٠ ص');
      expect(fajrTooltip.querySelector('.prayer-tooltip-status')?.textContent).toBe('تمت الصلاة ✓');

      // Verify animated check icon on done prayer
      const fajrCheckSvg = container.querySelector('.prayer-dot.done .prayer-check-icon');
      expect(fajrCheckSvg).not.toBeNull();

      // Verify prayer-time element is present below prayer name
      const prayerTimes = container.querySelectorAll('.prayer-time');
      expect(prayerTimes.length).toBe(6);
      expect(prayerTimes[0].textContent).toBe('٠٤:٣٠ ص');
    });

    it('computes astronomical phases for sun and crescent moon correctly across the day', () => {
      // 1. Fajr dawn (300 mins: between fajr 270 and sunrise 350)
      const { container: fajrContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={300}
        />
      );
      expect(fajrContainer.querySelector('.horizon-sun-disc.phase-fajr')).not.toBeNull();

      // 2. Sunrise rising dome (360 mins: within 40m after sunrise 350)
      const { container: sunriseContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={360}
        />
      );
      expect(sunriseContainer.querySelector('.horizon-sun-disc.phase-sunrise')).not.toBeNull();

      // 3. Morning ascending sun (500 mins)
      const { container: morningContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={500}
        />
      );
      expect(morningContainer.querySelector('.horizon-sun-disc.phase-morning')).not.toBeNull();

      // 4. Solar Noon / Dhuhr zenith (750 mins)
      const { container: dhuhrContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[3]}
          following={mockPrayer.times[4]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={750}
        />
      );
      expect(dhuhrContainer.querySelector('.horizon-sun-disc.phase-dhuhr')).not.toBeNull();

      // 5. Asr afternoon (950 mins)
      const { container: asrContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={950}
        />
      );
      expect(asrContainer.querySelector('.horizon-sun-disc.phase-asr')).not.toBeNull();

      // 6. Maghrib sunset dome (1100 mins: within 40m after maghrib 1090)
      const { container: sunsetContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[5]}
          following={null}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1100}
        />
      );
      expect(sunsetContainer.querySelector('.horizon-sun-disc.phase-sunset')).not.toBeNull();

      // 7. Isha & Night (1250 mins): Sun is hidden, moon is radiant is-night
      const { container: nightContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[0]}
          following={null}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1250}
        />
      );
      expect(nightContainer.querySelector('.horizon-sun-disc')).toBeNull();
      expect(nightContainer.querySelector('.horizon-moon-crescent.is-night')).not.toBeNull();

      // Eliminate artificial laser lines and submerged smudges across all phases
      expect(fajrContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(sunriseContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(morningContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(dhuhrContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(asrContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(sunsetContainer.querySelector('.horizon-sun-arc-bloom')).toBeNull();

      expect(fajrContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(sunriseContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(morningContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(dhuhrContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(asrContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(sunsetContainer.querySelector('.horizon-sun-submerged-glow')).toBeNull();

      // Eliminate artificial zenith beam and duplicate thick blur aura
      expect(dhuhrContainer.querySelector('.sun-zenith-beam')).toBeNull();
      expect(asrContainer.querySelector('.sun-zenith-beam')).toBeNull();
      expect(dhuhrContainer.querySelector('.horizon-celestial-arc-aura')).toBeNull();
      expect(asrContainer.querySelector('.horizon-celestial-arc-aura')).toBeNull();

      // Ensure brilliant inner core exists for luminous sun across all phases
      expect(fajrContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
      expect(sunriseContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
      expect(morningContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
      expect(dhuhrContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
      expect(asrContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
      expect(sunsetContainer.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
    });

    it('anchors the sun disc to the celestial arc with continuous mathematical bottom style', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={360}
        />
      );

      const sunDisc = container.querySelector('.horizon-sun-disc');
      expect(sunDisc).not.toBeNull();
      const bottomStyle = (sunDisc as HTMLElement).style.bottom;
      expect(bottomStyle).toMatch(/\d+(\.\d+)?px/);
      const bottomVal = parseFloat(bottomStyle);
      // At sunrise (X~22%), arc bottom should be ~16px
      expect(bottomVal).toBeGreaterThan(14);
      expect(bottomVal).toBeLessThan(18);
    });

    it('renders ambient footer with balance quote and step encouragement', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={750}
        />
      );

      const footer = container.querySelector('.horizon-ambient-footer');
      expect(footer).not.toBeNull();
      expect(footer?.textContent).toContain('بالنية نصنع توازناً');
      expect(footer?.textContent).toContain('خطوة جيدة ... يوم أفضل');
      expect(footer?.querySelector('.horizon-footer-emblem')).not.toBeNull();
    });

    it('positions all 6 prayer nodes at exact TIMELINE_ANCHORS percentages', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1075}
        />
      );

      expect(TIMELINE_ANCHORS).toEqual({
        fajr: 7,
        sunrise: 22,
        dhuhr: 50,
        asr: 68,
        maghrib: 84,
        isha: 94,
      });

      const nodes = container.querySelectorAll('.horizon-prayer-node');
      expect(nodes.length).toBe(6);

      const prayerKeys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
      prayerKeys.forEach((key) => {
        const expectedLeft = `${TIMELINE_ANCHORS[key]}%`;
        const node = Array.from(nodes).find((el) => (el as HTMLElement).style.left === expectedLeft);
        expect(node).toBeDefined();
      });
    });

    it('guarantees sun is strictly to the left of Maghrib node and round in Asr phase 15 minutes before Maghrib', () => {
      // Maghrib is at 1090 minutes in mockPrayer; 15 mins before is 1075 mins (~18:32 scenario)
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1075}
        />
      );

      // Sun must still be a round amber sphere (phase-asr), NOT a prematurely sunken sunset dome
      const sunDisc = container.querySelector('.horizon-sun-disc');
      expect(sunDisc).not.toBeNull();
      expect(sunDisc?.classList.contains('phase-asr')).toBe(true);
      expect(sunDisc?.classList.contains('phase-sunset')).toBe(false);

      // Sun position must be strictly to the left of Maghrib node (84%)
      const sunLeft = parseFloat((sunDisc as HTMLElement).style.left);
      expect(sunLeft).toBeLessThan(TIMELINE_ANCHORS.maghrib);
      // At minute 1075 (145/160 progress from Asr 930 to Maghrib 1090):
      // sunX = 68 + (145/160) * (84 - 68) = 68 + 14.5 = 82.5%
      expect(sunLeft).toBeCloseTo(82.5, 1);

      // Verify no artificial laser lines or submerged smudges exist
      expect(container.querySelector('.horizon-sun-arc-bloom')).toBeNull();
      expect(container.querySelector('.horizon-sun-submerged-glow')).toBeNull();
      expect(container.querySelector('.horizon-sun-disc .sun-inner-core')).not.toBeNull();
    });

    it('transitions to phase-sunset within 6 minutes of Maghrib and reaches exactly 84% at Maghrib', () => {
      // 1. Within 6 minutes of Maghrib (minuteNow = 1085: 5 minutes before Maghrib 1090)
      const { container: preSunsetContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1085}
        />
      );
      const preSunsetDisc = preSunsetContainer.querySelector('.horizon-sun-disc');
      expect(preSunsetDisc?.classList.contains('phase-sunset')).toBe(true);
      const preSunsetLeft = parseFloat((preSunsetDisc as HTMLElement).style.left);
      expect(preSunsetLeft).toBeLessThan(TIMELINE_ANCHORS.maghrib);

      // 2. At exactly Maghrib (minuteNow = 1090)
      const { container: maghribContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[4]}
          following={mockPrayer.times[5]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1090}
        />
      );
      const maghribSunDisc = maghribContainer.querySelector('.horizon-sun-disc');
      expect(maghribSunDisc?.classList.contains('phase-sunset')).toBe(true);
      const maghribSunLeft = parseFloat((maghribSunDisc as HTMLElement).style.left);
      expect(maghribSunLeft).toBe(TIMELINE_ANCHORS.maghrib); // Exact 1:1 alignment with Maghrib marker!

      // 3. 30 minutes after Maghrib (minuteNow = 1120): sun dome is still sinking into dusk twilight
      const { container: twilightContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[5]}
          following={null}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1120}
        />
      );
      const twilightSunDisc = twilightContainer.querySelector('.horizon-sun-disc');
      expect(twilightSunDisc).not.toBeNull();
      expect(twilightSunDisc?.classList.contains('phase-sunset')).toBe(true);
      const twilightSunLeft = parseFloat((twilightSunDisc as HTMLElement).style.left);
      expect(twilightSunLeft).toBeGreaterThan(TIMELINE_ANCHORS.maghrib);
      expect(twilightSunLeft).toBeLessThan(TIMELINE_ANCHORS.isha);
      // Moon should not yet be in night mode during twilight
      expect(twilightContainer.querySelector('.horizon-moon-crescent.is-night')).toBeNull();

      // 4. 35 minutes and beyond after Maghrib (minuteNow = 1125, 1126): transitions to phase-night
      const { container: nightContainer } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[5]}
          following={null}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={1126}
        />
      );
      expect(nightContainer.querySelector('.horizon-sun-disc')).toBeNull();
      expect(nightContainer.querySelector('.horizon-moon-crescent.is-night')).not.toBeNull();
    });

    it('renders front celestial horizon strip that occludes the lower portion of the sun along the exact arc curve', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{}}
          toggle={vi.fn()}
          completed={0}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={750}
        />
      );

      // Verify front strip SVG exists with correct classes and layered structure
      const frontSvg = container.querySelector('.horizon-celestial-strip-front');
      expect(frontSvg).not.toBeNull();

      // Verify the occluding horizon body path covers below the arc
      const bodyPath = frontSvg?.querySelector('.horizon-celestial-body');
      expect(bodyPath).not.toBeNull();
      expect(bodyPath?.getAttribute('d')).toBe('M 0,54 L 20,54 Q 500,6 980,54 L 1000,54 L 1000,120 L 0,120 Z');

      // Verify the front golden rail path and localized glow
      const frontPath = frontSvg?.querySelector('.horizon-celestial-front-path');
      expect(frontPath).not.toBeNull();
      expect(frontPath?.getAttribute('d')).toBe('M 20,54 Q 500,6 980,54');

      const frontGlow = frontSvg?.querySelector('.horizon-celestial-front-glow');
      expect(frontGlow).not.toBeNull();

      // Verify sun contains all realism elements: core, corona flare, horizon flare
      const sunDisc = container.querySelector('.horizon-sun-disc');
      expect(sunDisc).not.toBeNull();
      expect(sunDisc?.querySelector('.sun-inner-core')).not.toBeNull();
      expect(sunDisc?.querySelector('.sun-corona-flare')).not.toBeNull();
      expect(sunDisc?.querySelector('.sun-horizon-flare')).not.toBeNull();

      // Verify prayer node elements and time labels have proper DOM structure
      const prayerNodes = container.querySelectorAll('.horizon-prayer-node');
      expect(prayerNodes.length).toBe(6);
      prayerNodes.forEach((node) => {
        expect(node.querySelector('.prayer-name')).not.toBeNull();
        expect(node.querySelector('.prayer-time')).not.toBeNull();
        expect(node.querySelector('.prayer-dot')).not.toBeNull();
      });
    });
  });

  describe('Polish Fixes: Persistent Workspace Subnav, Window Controls, Calm Prayers', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getBootstrap').mockResolvedValue(mockData);
      vi.spyOn(api, 'getPrayerDay').mockResolvedValue(mockPrayer);
    });

    it('leaves the current prayer checks alone when a companion completes yesterday’s prayer', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-22T12:00:00Z'));
      try {
        vi.spyOn(api, 'getPrayerDay').mockResolvedValue({ ...mockPrayer, date: '2026-11-22' });
        const save = vi.spyOn(api, 'setDailyWorship').mockResolvedValue(undefined);
        render(<App />);
        await screen.findByRole('button', { name: 'الإعدادات' });
        await act(async () => {
          await api.emitEvent('wens-prayer-completed', {
            source: 'pet', prayerKey: 'fajr', date: '2026-11-21',
          });
        });
        expect(save).not.toHaveBeenCalled();
        await act(async () => {
          await api.emitEvent('wens-prayer-completed', {
            source: 'pet', prayerKey: 'fajr', date: '2026-11-22',
          });
        });
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-22', fajr: true }));
      } finally {
        vi.useRealTimers();
      }
    });

    it('hydrates an already-ringing Suhoor alarm and clears it on snooze', async () => {
      vi.spyOn(api, 'getActiveSuhoorAlarm').mockResolvedValue({
        id: 'alarm-suhoor', title: 'اختبار استعادة المنبه', body: 'السحور', kind: 'fasting-suhoor',
      });
      render(<App />);
      expect(await screen.findByRole('dialog', { name: /اختبار استعادة المنبه/ })).toBeDefined();
      await act(async () => {
        await api.emitEvent('wens-alarm-snoozed', {});
      });
      expect(screen.queryByRole('dialog', { name: /اختبار استعادة المنبه/ })).toBeNull();
    });

    it('loads a backed-up Studio brief from SQLite over stale browser data', async () => {
      localStorage.setItem('wens-studio-brief-title', 'old local draft');
      await api.setDomainKv('studio_drafts', JSON.stringify({ briefTitle: 'restored brief' }));
      render(<Studio />);
      expect(await screen.findByDisplayValue('restored brief')).toBeDefined();
    });

    it('keeps the running Pomodoro when navigating to Projects and back', async () => {
      localStorage.setItem('wens-onboarding-completed', 'true');
      let now = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      const saveSession = vi.spyOn(api, 'saveWorkSession').mockImplementation(async (record) => record);
      render(<App />);
      await screen.findByText('المشروعات والأفكار');
      fireEvent.click(screen.getByText('المشروعات والأفكار'));
      fireEvent.click(screen.getByText('جلسة تركيز'));
      fireEvent.click(screen.getByRole('tab', { name: /بومودورو/ }));
      fireEvent.click(screen.getByRole('button', { name: 'ابدأ جلسة العمل' }));
      fireEvent.click(screen.getByRole('button', { name: 'المشروعات', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: 'جلسة تركيز', exact: true }));
      expect(screen.getByRole('button', { name: 'إيقاف مؤقت للجلسة' })).toBeDefined();
      fireEvent.click(screen.getByRole('button', { name: 'المشروعات', exact: true }));
      now += 25 * 60 * 1000;
      fireEvent(document, new Event('visibilitychange'));
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() => expect(saveSession).toHaveBeenCalledTimes(1));
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ durationSecs: 1500 }));
    });

    it('renders horizon-topbar without faux window controls', async () => {
      const { container } = render(<App />);
      await waitFor(() => {
        expect(container.querySelector('.horizon-topbar')).not.toBeNull();
      });

      expect(container.querySelector('.horizon-window-controls')).toBeNull();
      expect(container.querySelector('.win-min')).toBeNull();
      expect(container.querySelector('.win-max')).toBeNull();
      expect(container.querySelector('.win-close')).toBeNull();
      expect(container.querySelector('.horizon-gear-btn')).not.toBeNull();
      expect(container.querySelector('.horizon-brand')).not.toBeNull();
    });

    it('maintains unified, persistent 4-pill subnav across projects, work, ideas, and studio views', async () => {
      const { container } = render(<App />);
      await waitFor(() => {
        expect(container.querySelector('.horizon-topbar')).not.toBeNull();
      });

      // Navigate to المشروعات والأفكار
      const workspaceBtn = screen.getByText('المشروعات والأفكار');
      fireEvent.click(workspaceBtn);

      // Verify 4-pill bar is present with consistent labels
      const getPillLabels = () => {
        const pillNav = container.querySelector('.workspace-subnav-pills');
        expect(pillNav).not.toBeNull();
        const pills = container.querySelectorAll('.workspace-nav-pill');
        return Array.from(pills).map((p) => p.textContent?.trim());
      };

      expect(getPillLabels()).toEqual(['المشروعات', 'جلسة تركيز', 'الأفكار', 'الاستوديو']);

      // 1. In Projects: active pill is المشروعات, no duplicate pill bars
      expect(container.querySelectorAll('.workspace-subnav-pills').length).toBe(1);
      expect(container.querySelector('.workspace-nav-pill.active')?.textContent?.trim()).toBe('المشروعات');

      // 2. Click جلسة تركيز: subnav remains identical, active is جلسة تركيز
      const focusPill = Array.from(container.querySelectorAll('.workspace-subnav-pills .workspace-nav-pill')).find((p) =>
        p.textContent?.includes('جلسة تركيز')
      )!;
      fireEvent.click(focusPill);
      expect(getPillLabels()).toEqual(['المشروعات', 'جلسة تركيز', 'الأفكار', 'الاستوديو']);
      expect(container.querySelector('.workspace-nav-pill.active')?.textContent?.trim()).toBe('جلسة تركيز');

      // 3. Click الأفكار: subnav remains identical, active is الأفكار
      const ideasPill = Array.from(container.querySelectorAll('.workspace-subnav-pills .workspace-nav-pill')).find((p) =>
        p.textContent?.includes('الأفكار')
      )!;
      fireEvent.click(ideasPill);
      expect(getPillLabels()).toEqual(['المشروعات', 'جلسة تركيز', 'الأفكار', 'الاستوديو']);
      expect(container.querySelector('.workspace-nav-pill.active')?.textContent?.trim()).toBe('الأفكار');

      // 4. Click الاستوديو: subnav remains identical, active is الاستوديو, no 2-tab line
      const studioPill = Array.from(container.querySelectorAll('.workspace-subnav-pills .workspace-nav-pill')).find((p) =>
        p.textContent?.includes('الاستوديو')
      )!;
      fireEvent.click(studioPill);
      expect(getPillLabels()).toEqual(['المشروعات', 'جلسة تركيز', 'الأفكار', 'الاستوديو']);
      expect(container.querySelector('.workspace-nav-pill.active')?.textContent?.trim()).toBe('الاستوديو');
      expect(container.querySelector('.studio-nav-tabs-line')).toBeNull();
    });

    it('renders serene green dot with checkmark SVG for completed prayers', () => {
      const { container } = render(
        <Today
          data={mockData}
          prayer={mockPrayer}
          next={mockPrayer.times[2]}
          following={mockPrayer.times[3]}
          checks={{ fajr: true }}
          toggle={vi.fn()}
          completed={1}
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:00"
          go={vi.fn()}
          minuteNow={600}
        />
      );

      const doneNode = container.querySelector('.horizon-prayer-node.done');
      expect(doneNode).not.toBeNull();
      const doneDot = doneNode?.querySelector('.prayer-dot.done');
      expect(doneDot).not.toBeNull();
      // Check that the checkmark SVG is rendered inside the done dot
      expect(doneDot?.querySelector('svg')).not.toBeNull();
    });

    it('shows toast when option is changed and auto-dismisses after timeout', async () => {
      vi.spyOn(api, 'updateReminderPlan').mockResolvedValue({ status: 'armed', unreadCount: 0 });
      vi.useFakeTimers();
      const { container } = render(<App />);
      await act(async () => {
        await Promise.resolve();
      });

      // Navigate to worship
      const worshipNav = screen.getByText('العبادة');
      fireEvent.click(worshipNav);

      // Switch to fasting tab
      const fastingTab = screen.getByRole('tab', { name: /الصيام والسحور/ });
      fireEvent.click(fastingTab);

      // Change suhoor lead time option
      const leadBtn = screen.getByRole('button', { name: /٦٠ دقيقة/ });
      await act(async () => {
        fireEvent.click(leadBtn);
      });

      // Toast should now be visible
      expect(container.querySelector('.live-reminder-toast')).not.toBeNull();
      expect(screen.getByText('تم ضبط وقت السحور')).toBeDefined();

      // Fast forward past the 4000ms auto-dismiss timer
      act(() => {
        vi.advanceTimersByTime(4500);
      });

      // Toast should now be automatically dismissed
      expect(container.querySelector('.live-reminder-toast')).toBeNull();
      vi.useRealTimers();
    });

    it('does NOT automatically mark past prayers as done (أُدّيت) unless explicitly marked in checks', () => {
      // Setup checks where user marked only fajr, dhuhr, asr, but NOT maghrib
      // Time is 19:00 (minuteNow = 1140), between Maghrib (1090 = 18:10) and Isha (1170 = 19:30)
      const checks = { fajr: true, dhuhr: true, asr: true };
      const toggleMock = vi.fn();

      const { container } = render(
        <Worship
          prayer={mockPrayer}
          checks={checks}
          toggle={toggleMock}
          activeTab="times"
          minuteNow={1140}
        />
      );

      const items = container.querySelectorAll('.worship-timeline-item');
      expect(items.length).toBe(5);

      // Fajr, Dhuhr, Asr should be completed with checkmarks and 'أُدّيت'
      expect(items[0].classList.contains('completed')).toBe(true);
      expect(items[0].querySelector('.worship-timeline-status')?.textContent).toBe('أُدّيت');
      expect(items[0].querySelector('.worship-timeline-dot svg')).not.toBeNull();

      expect(items[1].classList.contains('completed')).toBe(true);
      expect(items[1].querySelector('.worship-timeline-status')?.textContent).toBe('أُدّيت');

      expect(items[2].classList.contains('completed')).toBe(true);
      expect(items[2].querySelector('.worship-timeline-status')?.textContent).toBe('أُدّيت');

      // Maghrib was NOT checked by user! It must NOT be marked as completed ('أُدّيت')
      // Instead it must be marked as missed ('فائتة')
      expect(items[3].classList.contains('completed')).toBe(false);
      expect(items[3].classList.contains('missed')).toBe(true);
      expect(items[3].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');
      expect(items[3].querySelector('.worship-timeline-dot svg')).toBeNull();

      // Isha is the upcoming prayer ('الآن')
      expect(items[4].classList.contains('current')).toBe(true);
      expect(items[4].querySelector('.worship-timeline-status')?.textContent).toBe('الآن');

      // Clicking on Maghrib should call toggle with 'maghrib'
      fireEvent.click(items[3]);
      expect(toggleMock).toHaveBeenCalledWith('maghrib');
    });

    it('displays passed prayers as missed when unchecked in Worship timeline', () => {
      // Empty checks: no prayers were marked, minuteNow = 1140 (19:00, after Maghrib)
      const { container } = render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          activeTab="times"
          minuteNow={1140}
        />
      );

      const items = container.querySelectorAll('.worship-timeline-item');
      // No prayers should be marked as completed ('أُدّيت')
      items.forEach((item) => {
        expect(item.classList.contains('completed')).toBe(false);
        expect(item.querySelector('.worship-timeline-status')?.textContent).not.toBe('أُدّيت');
        expect(item.querySelector('.worship-timeline-dot svg')).toBeNull();
      });

      // Fajr, Dhuhr, Asr, Maghrib should be missed ('فائتة')
      expect(items[0].classList.contains('missed')).toBe(true);
      expect(items[0].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');
      expect(items[1].classList.contains('missed')).toBe(true);
      expect(items[1].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');
      expect(items[2].classList.contains('missed')).toBe(true);
      expect(items[2].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');
      expect(items[3].classList.contains('missed')).toBe(true);
      expect(items[3].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');

      // Isha is upcoming/current ('الآن')
      expect(items[4].classList.contains('current')).toBe(true);
      expect(items[4].querySelector('.worship-timeline-status')?.textContent).toBe('الآن');
    });

    it('correctly marks all unchecked prayers as missed late at night after Isha without falsely highlighting Fajr', () => {
      // Late night at 22:30 (minuteNow = 1350), past Isha (1170)
      const checks = { fajr: true, dhuhr: true };
      const { container } = render(
        <Worship
          prayer={mockPrayer}
          checks={checks}
          toggle={vi.fn()}
          activeTab="times"
          minuteNow={1350}
        />
      );

      const items = container.querySelectorAll('.worship-timeline-item');
      // Fajr and Dhuhr were checked -> completed ('أُدّيت')
      expect(items[0].classList.contains('completed')).toBe(true);
      expect(items[0].querySelector('.worship-timeline-status')?.textContent).toBe('أُدّيت');

      expect(items[1].classList.contains('completed')).toBe(true);
      expect(items[1].querySelector('.worship-timeline-status')?.textContent).toBe('أُدّيت');

      // Asr, Maghrib, Isha were not checked -> missed ('فائتة'), NOT 'الآن'
      expect(items[2].classList.contains('missed')).toBe(true);
      expect(items[2].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');

      expect(items[3].classList.contains('missed')).toBe(true);
      expect(items[3].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');

      expect(items[4].classList.contains('missed')).toBe(true);
      expect(items[4].querySelector('.worship-timeline-status')?.textContent).toBe('فائتة');

      // None of the items should be marked as current ('الآن') at night after Isha
      items.forEach((item) => {
        expect(item.classList.contains('current')).toBe(false);
      });
    });

    it('never leaks yesterday backlog resolutions into today checks', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = toLocalDateString(yesterday);

      const backlogWithYesterday: BacklogState = {
        autoTrack: true,
        autoReviewFasting: true,
        trackingStartedAt: '2026-09-24T00:00:00.000Z',
        items: [
          {
            id: 'unconf-yesterday-dhuhr',
            prayerName: 'الظهر',
            prayerDate: yesterdayStr,
            source: 'automatic',
            status: 'unconfirmed',
            createdAt: '2026-09-24T12:00:00.000Z',
            updatedAt: '2026-09-24T12:00:00.000Z',
          },
        ],
        fastingItems: [],
      };

      const onCheckPrayerMock = vi.fn();
      render(
        <Worship
          prayer={mockPrayer}
          checks={{}}
          toggle={vi.fn()}
          backlog={backlogWithYesterday}
          setBacklog={vi.fn()}
          activeTab="backlog"
          onCheckPrayer={onCheckPrayerMock}
        />
      );

      const prayedBtn = screen.getByText('صليتها في وقتها');
      fireEvent.click(prayedBtn);

      // Must NOT mark today's check state when resolving yesterday's prayer
      expect(onCheckPrayerMock).not.toHaveBeenCalled();
      // Yesterday's own daily check record is updated
      const yesterdayChecks = JSON.parse(localStorage.getItem(`wens-checks-${yesterdayStr}`) || '{}');
      expect(yesterdayChecks.dhuhr).toBe(true);
    });
  });
});

