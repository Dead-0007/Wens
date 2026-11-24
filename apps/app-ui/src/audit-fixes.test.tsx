import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Studio, Modules, Work, Projects, Ideas } from './main';
import { OnboardingWizard } from './components/OnboardingWizard';
import * as api from './api';
import type { BootstrapPayload } from './types';

const mockData: BootstrapPayload = {
  schemaVersion: 2,
  deviceId: 'dev-test-1',
  projects: [
    {
      id: 'proj-1',
      title: 'مشروع كتاب وِنس',
      description: 'كتابة الفصول الأولى',
      status: 'قيد التنفيذ',
      progress: 40,
      symbol: '✦',
      currentTask: 'إنهاء الفصل الثالث',
      deviceId: 'dev-test-1',
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
      deviceId: 'dev-test-1',
      createdAt: '2026-09-24T00:00:00Z',
      updatedAt: '2026-09-24T00:00:00Z',
      revision: 1,
    },
  ],
  settings: api.defaultPreferences,
};

describe('Audit Fixes Verification Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Studio View Interactivity & Worksheets', () => {
    it('opens Campaign Brief worksheet when "فتح ورقة عمل جديدة" is clicked and saves draft locally', () => {
      render(<Studio />);

      const openNewBtn = screen.getByText('فتح ورقة عمل جديدة');
      fireEvent.click(openNewBtn);

      expect(screen.getByText('ورقة عمل جديدة / Campaign Brief')).toBeDefined();

      const titleInput = screen.getByPlaceholderText('مثلاً: حملة إطلاق المساعد وِنس للإشراق والتركيز');
      fireEvent.change(titleInput, { target: { value: 'حملة رمضان الإبداعية' } });

      const saveDraftBtn = screen.getByText('حفظ المسودة محليًا');
      fireEvent.click(saveDraftBtn);

      expect(localStorage.getItem('wens-studio-brief-title')).toBe('حملة رمضان الإبداعية');
      expect(screen.getByText('تم حفظ مسودة ورقة العمل محليًا بنجاح.')).toBeDefined();

      // Close modal with button
      const closeBtn = screen.getByText('إغلاق');
      fireEvent.click(closeBtn);
      expect(screen.queryByText('ورقة عمل جديدة / Campaign Brief')).toBeNull();

      // Re-open and verify Escape key closes modal
      fireEvent.click(openNewBtn);
      expect(screen.getByText('ورقة عمل جديدة / Campaign Brief')).toBeDefined();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText('ورقة عمل جديدة / Campaign Brief')).toBeNull();
    });

    it('opens Creative Matrix 2x2 grid, allows quadrant editing, and saves draft locally', () => {
      render(<Studio />);

      const matrixCard = screen.getByText('مصفوفة الأفكار');
      fireEvent.click(matrixCard);

      expect(screen.getByText('مصفوفة الإبداع 2x2 (Creative Matrix)')).toBeDefined();
      expect(screen.getByText('الربع الأول: جمهور حالي × مشكلة شائعة')).toBeDefined();
      expect(screen.getByText('الربع الرابع: جمهور جديد × أسلوب سرد قصصي جريء')).toBeDefined();

      const q1Input = screen.getByPlaceholderText('سجّل أفكار الربط هنا...');
      fireEvent.change(q1Input, { target: { value: 'طرح زاوية جديدة للمهنيين' } });

      fireEvent.click(screen.getByText('حفظ المسودة محليًا'));
      expect(localStorage.getItem('wens-studio-matrix-q1')).toBe('طرح زاوية جديدة للمهنيين');
      expect(screen.getByText('تم حفظ مصفوفة الأفكار محليًا بنجاح.')).toBeDefined();
    });

    it('opens Storyboard sequence, allows adding new step, and saves draft locally', () => {
      render(<Studio />);

      fireEvent.click(screen.getByText('تسلسل المشاهد'));
      expect(screen.getByText('لوحة تسلسل المشاهد (Storyboard)')).toBeDefined();

      const addStepBtn = screen.getByText('إضافة لقطة جديدة');
      fireEvent.click(addStepBtn);

      expect(screen.getByText('اللقطة #٣')).toBeDefined();

      fireEvent.click(screen.getByText('حفظ المسودة محليًا'));
      expect(localStorage.getItem('wens-studio-storyboard')).toContain('step-1');
      expect(screen.getByText('تم حفظ تسلسل المشاهد محليًا بنجاح.')).toBeDefined();
    });

    it('opens Campaign Metrics, calculates ROAS, CTR %, and CPL/CAC live, and saves draft', () => {
      render(<Studio />);

      fireEvent.click(screen.getByText('مقاييس الحملة'));
      expect(screen.getByText('حاسبة مقاييس الحملات (Campaign Metrics)')).toBeDefined();

      // Default ROAS with 15000 rev and 3000 spend is 5.00x
      expect(screen.getByText('5.00x')).toBeDefined();
      // Default CTR with 450 clicks and 12000 impr is 3.75%
      expect(screen.getByText('3.75%')).toBeDefined();
      // Default CPL with 3000 cost and 75 conv is 40.00
      expect(screen.getByText('40.00')).toBeDefined();

      fireEvent.click(screen.getByText('حفظ المسودة محليًا'));
      expect(localStorage.getItem('wens-studio-metric-rev')).toBe('15000');
      expect(screen.getByText('تم حفظ بيانات وحسابات المقاييس محليًا بنجاح.')).toBeDefined();
    });
  });

  describe('2. Module Rollback in Frontend UI', () => {
    it('shows clean empty state on fresh install with zero fake demo modules', () => {
      render(<Modules />);
      expect(screen.getByText('الحزم المثبتة والمجهزة (Installed & Staged)')).toBeDefined();
      expect(screen.queryByText('قوالب وأدوات التسويق العربي')).toBeNull();
      expect(screen.getByText(/لا توجد حزم مثبتة بعد/)).toBeDefined();
    });

    it('displays installed module list and performs rollback successfully', async () => {
      localStorage.setItem(
        'wens-installed-modules',
        JSON.stringify([
          {
            id: 'com.wens.arabic-marketing',
            name: 'قوالب وأدوات التسويق العربي',
            version: '1.2.0',
            hasRollback: true,
          },
        ])
      );
      const rollbackSpy = vi.spyOn(api, 'rollbackModule').mockResolvedValue({
        moduleId: 'com.wens.arabic-marketing',
        version: '1.1.0',
        installPath: '/mock/path',
        displacedPath: null,
      });

      render(<Modules />);

      expect(screen.getByText('الحزم المثبتة والمجهزة (Installed & Staged)')).toBeDefined();
      expect(screen.getByText('قوالب وأدوات التسويق العربي')).toBeDefined();

      const rollbackButtons = screen.getAllByText('تراجع للإصدار السابق (Rollback)');
      expect(rollbackButtons.length).toBeGreaterThan(0);

      fireEvent.click(rollbackButtons[0]);

      await waitFor(() => {
        expect(rollbackSpy).toHaveBeenCalledWith('com.wens.arabic-marketing');
      });

      await waitFor(() => {
        expect(
          screen.getByText(/تم التراجع للإصدار السابق بنجاح: الحزمة com.wens.arabic-marketing أصبحت الآن بالإصدار v1.1.0/i)
        ).toBeDefined();
      });
    });

    it('handles rollback errors and displays failure feedback', async () => {
      localStorage.setItem(
        'wens-installed-modules',
        JSON.stringify([
          {
            id: 'com.wens.arabic-marketing',
            name: 'قوالب وأدوات التسويق العربي',
            version: '1.2.0',
            hasRollback: true,
          },
        ])
      );
      vi.spyOn(api, 'rollbackModule').mockRejectedValue(new Error('no rollback version available'));

      render(<Modules />);

      const rollbackButtons = screen.getAllByText('تراجع للإصدار السابق (Rollback)');
      fireEvent.click(rollbackButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/فشل التراجع للإصدار السابق: Error: no rollback version available/i)).toBeDefined();
      });
    });
  });

  describe('3. Work Session Saving & Project Binding', () => {
    it('binds project select to controlled state and saves work session locally', () => {
      const setTimerStartedMock = vi.fn();
      const onResetTimerMock = vi.fn();
      render(
        <Work
          timerStarted={Date.now()}
          setTimerStarted={setTimerStartedMock}
          workTime="00:25:00"
          projects={mockData.projects}
          onResetTimer={onResetTimerMock}
        />
      );

      const select = screen.getByLabelText('المشروع المرتبط بالجلسة') as HTMLSelectElement;
      expect(select.value).toBe('');

      fireEvent.change(select, { target: { value: 'proj-1' } });
      expect(select.value).toBe('proj-1');

      const finishBtn = screen.getByText('إنهاء الجلسة وحفظها');
      fireEvent.click(finishBtn);

      expect(setTimerStartedMock).toHaveBeenCalledWith(null);
      expect(onResetTimerMock).toHaveBeenCalled();

      const savedSessions = JSON.parse(localStorage.getItem('wens-work-sessions') || '[]');
      expect(savedSessions.length).toBe(1);
      expect(savedSessions[0].projectId).toBe('proj-1');
      expect(savedSessions[0].projectTitle).toBe('مشروع كتاب وِنس');
      expect(savedSessions[0].duration).toBe('00:25:00');

      expect(screen.getByText(/تم إنهاء الجلسة وحفظها/i)).toBeDefined();
    });

    it('caps work sessions to at most 100 to prevent local storage quota bloat', () => {
      const seedSessions = Array.from({ length: 105 }, (_, i) => ({
        id: `seed-${i}`,
        projectId: null,
        projectTitle: 'جلسة قديمة',
        duration: '00:10:00',
        timestamp: new Date().toISOString(),
      }));
      localStorage.setItem('wens-work-sessions', JSON.stringify(seedSessions));

      render(
        <Work
          timerStarted={null}
          setTimerStarted={vi.fn()}
          workTime="00:30:00"
          projects={mockData.projects}
        />
      );

      const finishBtn = screen.getByText('إنهاء الجلسة وحفظها');
      fireEvent.click(finishBtn);

      const stored = JSON.parse(localStorage.getItem('wens-work-sessions') || '[]');
      expect(stored.length).toBe(100);
      expect(stored[0].duration).toBe('00:30:00');
    });
  });

  describe('4. Projects & Ideas Actions (SQLite CRUD + P0-6 Safe Confirmation)', () => {
    it('creates a new project via "+ مشروع جديد", toggles status, and requires confirmation before deleting', async () => {
      let stateData: BootstrapPayload = { ...mockData, projects: [...mockData.projects] };
      const setDataMock = vi.fn((updater) => {
        stateData = typeof updater === 'function' ? updater(stateData) : updater;
      });

      const { rerender } = render(<Projects data={stateData} setData={setDataMock} />);

      // P0-1: Prominent "+ مشروع جديد" button opens creation form
      const newProjBtn = screen.getByText('+ مشروع جديد');
      fireEvent.click(newProjBtn);
      const titleInput = screen.getByLabelText('اسم المشروع');
      fireEvent.change(titleInput, { target: { value: 'مشروع التطوير الجديد' } });
      fireEvent.click(screen.getByText('حفظ المشروع'));

      await waitFor(() => {
        expect(stateData.projects.some((p) => p.title === 'مشروع التطوير الجديد')).toBe(true);
      });

      rerender(<Projects data={stateData} setData={setDataMock} />);

      // Toggle status on the first project in list
      const targetProjId = stateData.projects[0].id;
      const toggleBtn = screen.getAllByText('تحديد كـ مكتمل')[0];
      fireEvent.click(toggleBtn);

      await waitFor(() => {
        const updatedProject = stateData.projects.find((p) => p.id === targetProjId);
        expect(updatedProject?.status).toBe('مكتمل');
        expect(updatedProject?.progress).toBe(100);
      });

      rerender(<Projects data={stateData} setData={setDataMock} />);
      expect(screen.getByText('تحديد كـ قيد التنفيذ')).toBeDefined();

      // P0-6: Clicking delete opens confirmation modal and does NOT delete immediately
      const beforeCount = stateData.projects.length;
      const deleteButtons = screen.getAllByTitle('حذف المشروع');
      fireEvent.click(deleteButtons[0]);
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(stateData.projects.length).toBe(beforeCount);

      // Confirm deletion inside modal
      fireEvent.click(screen.getByText('نعم، احذف المشروع'));
      await waitFor(() => {
        expect(stateData.projects.length).toBe(beforeCount - 1);
      });
    });

    it('requires confirmation modal before deleting an idea from Ideas view', async () => {
      let stateData: BootstrapPayload = { ...mockData, ideas: [...mockData.ideas] };
      const setDataMock = vi.fn((updater) => {
        stateData = typeof updater === 'function' ? updater(stateData) : updater;
      });

      render(<Ideas data={stateData} setData={setDataMock} />);

      expect(screen.getByText('فكرة تطبيق عادات')).toBeDefined();
      const deleteIdeaBtn = screen.getByTitle('حذف الفكرة');
      fireEvent.click(deleteIdeaBtn);

      // Must NOT delete immediately without confirming modal
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(stateData.ideas.find((i) => i.id === 'idea-1')).toBeDefined();

      fireEvent.click(screen.getByText('نعم، احذف الفكرة'));
      await waitFor(() => {
        expect(stateData.ideas.find((i) => i.id === 'idea-1')).toBeUndefined();
      });
    });
  });

  describe('5. OnboardingWizard City Search Filter Sync', () => {
    it('updates saved city to the filtered search result when search excludes initial city', async () => {
      const onComplete = vi.fn();
      render(
        <OnboardingWizard
          isOpen={true}
          onClose={vi.fn()}
          onComplete={onComplete}
          initialCityId="eg-cairo"
        />
      );

      const searchInput = screen.getByLabelText('ابحث عن مدينة أو دولة');
      fireEvent.change(searchInput, { target: { value: 'الرياض' } });

      fireEvent.click(screen.getByText('حفظ والإطلاق إلى وِنس'));

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });
      expect(onComplete.mock.calls[0][0].city.id).toBe('sa-riyadh');
      expect(onComplete.mock.calls[0][0].city.calcMethod).toBe('umm_al_qura');
    });
  });
});
