import React, { useState } from 'react';
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  FileText,
  Lightbulb,
  ListTodo,
  MoreHorizontal,
  Pencil,
  Play,
  Target,
} from 'lucide-react';
import { createProject, createIdea, syncStorage } from '../api';
import type { BootstrapPayload } from '../types';

export function Projects({
  data,
  setData,
  go,
}: {
  data: BootstrapPayload;
  setData: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  go?: (view: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [task, setTask] = useState('');
  const [quickIdea, setQuickIdea] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const project = await createProject(title, task);
    setData({ ...data, projects: [project, ...data.projects] });
    setTitle('');
    setTask('');
    setOpen(false);
  };

  const toggleProjectStatus = (id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedProjects = prev.projects.map((p) => {
        if (p.id !== id) return p;
        const nextStatus = p.status === 'مكتمل' ? 'قيد التنفيذ' : 'مكتمل';
        return {
          ...p,
          status: nextStatus,
          progress: nextStatus === 'مكتمل' ? 100 : p.progress === 100 ? 50 : p.progress,
          updatedAt: new Date().toISOString(),
        };
      });
      try {
        const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
        legacy.projects = updatedProjects;
        const json = JSON.stringify(legacy);
        localStorage.setItem('wens-local-v1', json);
        void syncStorage(json);
      } catch {}
      return { ...prev, projects: updatedProjects };
    });
  };

  const deleteProject = (id: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const updatedProjects = prev.projects.filter((p) => p.id !== id);
      try {
        const legacy = JSON.parse(localStorage.getItem('wens-local-v1') || '{}');
        legacy.projects = updatedProjects;
        const json = JSON.stringify(legacy);
        localStorage.setItem('wens-local-v1', json);
        void syncStorage(json);
      } catch {}
      return { ...prev, projects: updatedProjects };
    });
  };

  const saveQuickIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIdea.trim()) return;
    const idea = await createIdea(quickIdea.trim(), 'فكرة سريعة');
    setData((prev) => (prev ? { ...prev, ideas: [idea, ...prev.ideas] } : prev));
    setQuickIdea('');
  };

  const currentProject = data.projects[0];

  const projectsToDisplay =
    data.projects.length > 0
      ? data.projects.map((p, idx) => {
          if (idx === 0) {
            return {
              ...p,
              displayTitle: p.id === 'proj-1' ? 'قراءة الكتب' : p.title,
              displayDesc:
                p.id === 'proj-1'
                  ? 'إنهاء 3 كتب هذا العام'
                  : p.currentTask || p.description || 'إنهاء 3 كتب هذا العام',
              statusType: p.status === 'مكتمل' ? 'pending' : 'active',
              statusLabel: p.status === 'مكتمل' ? 'مكتمل' : 'قيد التنفيذ',
            };
          }
          return {
            ...p,
            displayTitle: p.title,
            displayDesc: p.currentTask || p.description || '',
            statusType: p.status === 'مكتمل' ? 'pending' : 'active',
            statusLabel: p.status,
          };
        })
      : [];

  return (
    <div className="projects-container">
      {open && (
        <form className="inline-form" onSubmit={submit} style={{ margin: '8px 0 16px' }}>
          <label>
            اسم المشروع
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="مثلاً: دليل إطلاق المنتج الجديد"
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="primary-button">
              حفظ المشروع
            </button>
            <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
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
            <span className="project-current-sub">المشروع الحالي</span>
            <h2 className="project-current-title">
              {currentProject?.title || 'لا يوجد مشروع نشط حالياً'}
            </h2>
            <p className="project-current-desc">
              {currentProject?.description || 'اختر مشروعاً أو أضف مشروعاً جديداً للتركيز عليه'}
            </p>

            {/* Arc Sun Wrap */}
            <div className="project-arc-wrap">
              <svg
                viewBox="0 0 400 40"
                preserveAspectRatio="none"
                style={{ width: '100%', height: '100%' }}
              >
                <path
                  d="M 0 35 Q 200 -10 400 35"
                  fill="none"
                  stroke="rgba(212, 151, 72, 0.4)"
                  strokeWidth="1.5"
                />
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
                {(currentProject as any)?.goal || 'حدّد هدفاً واضحاً للمشروع'}
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
                onKeyDown={(e) =>
                  (e.key === 'Enter' || e.key === ' ') &&
                  currentProject &&
                  toggleProjectStatus(currentProject.id)
                }
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
              <span>جلسة تركيز لمدة 25 دقيقة</span>
            </div>
          </div>
        </div>

        {/* Left Card: Other Projects */}
        <div className="projects-other-card">
          <div>
            <div className="projects-other-head">
              <strong>
                <BriefcaseBusiness size={18} style={{ color: '#d49748' }} />
                <span>مشروعاتي الأخرى</span>
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
                    </div>
                    <span className="projects-other-desc">{project.displayDesc}</span>
                  </div>
                  <div className="projects-other-actions">
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
                        {project.status === 'مكتمل' ? 'متابعة' : 'فتح'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="projects-btn-more"
                      onClick={() => deleteProject(project.id)}
                      aria-label={`حذف مشروع ${project.displayTitle}`}
                      title="حذف المشروع"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {projectsToDisplay.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px 12px',
                    color: 'var(--muted)',
                    fontSize: '0.88rem',
                  }}
                >
                  لا توجد مشروعات أخرى بعد. أضف مشروعاً جديداً للبدء.
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
          <label className="sr-only" htmlFor="quick-project-idea">
            فكرة سريعة
          </label>
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
    </div>
  );
}
