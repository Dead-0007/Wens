import React, { useState } from 'react';
import { Play, Pause, Check, Clock3, CalendarDays } from 'lucide-react';
import { PageTitle, digits } from '../shared-ui';
import { syncStorage } from '../api';
import type { BootstrapPayload } from '../types';

export function Work({
  timerStarted,
  setTimerStarted,
  workTime,
  projects,
  onResetTimer,
}: {
  timerStarted: number | null;
  setTimerStarted: (n: number | null) => void;
  workTime: string;
  projects: BootstrapPayload['projects'];
  onResetTimer?: () => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [savedSessions, setSavedSessions] = useState<Array<{
    id: string;
    projectId: string | null;
    projectTitle: string;
    duration: string;
    timestamp: string;
  }>>(() => {
    try {
      const raw = localStorage.getItem('wens-work-sessions');
      if (raw) return JSON.parse(raw);
      const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
      if (Array.isArray(legacy.workSessions)) {
        return legacy.workSessions.map((s: any, idx: number) => ({
          id: `legacy-${idx}`,
          projectId: s.projectId || null,
          projectTitle: s.projectTitle || 'جلسة سابقة',
          duration: s.duration || `${Math.round((s.durationMs || 0) / 60000)} دقيقة`,
          timestamp: s.startedAt || s.timestamp || new Date().toISOString(),
        }));
      }
      return [];
    } catch {
      return [];
    }
  });
  const [saveFeedback, setSaveFeedback] = useState<string>('');

  const finishAndSaveSession = () => {
    const chosenProject = projects.find((p) => p.id === selectedProjectId);
    const nowIso = new Date().toISOString();
    const sessionRecord = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      projectId: selectedProjectId || null,
      projectTitle: chosenProject ? chosenProject.title : 'بدون مشروع محدد',
      duration: workTime,
      timestamp: nowIso,
    };
    const nextSessions = [sessionRecord, ...savedSessions].slice(0, 100);
    setSavedSessions(nextSessions);
    try {
      localStorage.setItem('wens-work-sessions', JSON.stringify(nextSessions));
      const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
      legacy.workSessions = legacy.workSessions || [];
      legacy.workSessions.unshift({
        duration: workTime,
        projectId: selectedProjectId || null,
        projectTitle: sessionRecord.projectTitle,
        startedAt: nowIso,
        endedAt: nowIso,
        timestamp: nowIso,
      });
      legacy.workSessions = legacy.workSessions.slice(0, 100);
      const json = JSON.stringify(legacy);
      localStorage.setItem('wens-local-v1', json);
      void syncStorage(json);
    } catch {}

    if (timerStarted) {
      setTimerStarted(null);
    }
    if (onResetTimer) {
      onResetTimer();
    }
    setSaveFeedback(`تم إنهاء الجلسة وحفظها (${workTime} · ${sessionRecord.projectTitle})`);
  };

  return (
    <>
      <PageTitle
        title="الشغل"
        copy="جلسة عمل واحدة واضحة، مع مؤقت هادئ وخطوات محددة بدقة."
      />
      <section className={`timer-stage ${timerStarted ? 'timer-active' : ''}`}>
        <span>الجلسة الحالية</span>
        <strong>{workTime}</strong>
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
            className={`primary-button large ${timerStarted ? 'running' : ''}`}
            onClick={() => setTimerStarted(timerStarted ? null : Date.now())}
          >
            {timerStarted ? <Pause size={20} /> : <Play size={20} />}
            {timerStarted ? 'إيقاف مؤقت للجلسة' : 'ابدأ جلسة العمل'}
          </button>
          <button
            className="secondary-button"
            onClick={finishAndSaveSession}
          >
            <Check size={18} />
            إنهاء الجلسة وحفظها
          </button>
        </div>
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
            <strong>جلسة مركزة</strong>
            <span>ابدأ بـ ٢٥ دقيقة وافصل بعدها بدقائق راحة.</span>
          </div>
        </article>
        <article>
          <CalendarDays size={24} />
          <div>
            <strong>مراجعة الوقت</strong>
            <span>يتم تسجيل مدة كل جلسة محليًا في سجل إنجازاتك.</span>
          </div>
        </article>
      </div>

      {savedSessions.length > 0 && (
        <section className="saved-sessions-list surface" style={{ marginTop: '24px', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>الجلسات المسجلة حديثًا ({digits(savedSessions.length)})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {savedSessions.slice(0, 5).map((s) => (
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
                  <strong>{s.projectTitle}</strong>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--faint)' }}>
                    {new Date(s.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{s.duration}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
