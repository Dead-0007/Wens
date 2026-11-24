import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  ChevronLeft,
  FileText,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Save,
  Sliders,
  X,
} from 'lucide-react';
import { digits } from '../shared-ui';

export function Studio({ go }: { go?: (v: any) => void } = {}) {
  type StudioToolType = 'brief' | 'matrix' | 'storyboard' | 'metrics' | null;
  const [activeTool, setActiveTool] = useState<StudioToolType>(null);
  const [draftFeedback, setDraftFeedback] = useState<string>('');

  useEffect(() => {
    if (!activeTool) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool]);

  // 1. Campaign Brief / ورقة عمل جديدة
  const [briefTitle, setBriefTitle] = useState(() => localStorage.getItem('wens-studio-brief-title') || '');
  const [briefAudience, setBriefAudience] = useState(() => localStorage.getItem('wens-studio-brief-audience') || '');
  const [briefKeyMessage, setBriefKeyMessage] = useState(() => localStorage.getItem('wens-studio-brief-message') || '');
  const [briefCta, setBriefCta] = useState(() => localStorage.getItem('wens-studio-brief-cta') || '');

  const saveBriefDraft = () => {
    localStorage.setItem('wens-studio-brief-title', briefTitle);
    localStorage.setItem('wens-studio-brief-audience', briefAudience);
    localStorage.setItem('wens-studio-brief-message', briefKeyMessage);
    localStorage.setItem('wens-studio-brief-cta', briefCta);
    setDraftFeedback('تم حفظ مسودة ورقة العمل محليًا بنجاح.');
    setTimeout(() => setDraftFeedback(''), 4000);
  };

  // 2. Creative Matrix 2x2
  const [matrixQ1, setMatrixQ1] = useState(() => localStorage.getItem('wens-studio-matrix-q1') || '');
  const [matrixQ2, setMatrixQ2] = useState(() => localStorage.getItem('wens-studio-matrix-q2') || '');
  const [matrixQ3, setMatrixQ3] = useState(() => localStorage.getItem('wens-studio-matrix-q3') || '');
  const [matrixQ4, setMatrixQ4] = useState(() => localStorage.getItem('wens-studio-matrix-q4') || '');

  const saveMatrixDraft = () => {
    localStorage.setItem('wens-studio-matrix-q1', matrixQ1);
    localStorage.setItem('wens-studio-matrix-q2', matrixQ2);
    localStorage.setItem('wens-studio-matrix-q3', matrixQ3);
    localStorage.setItem('wens-studio-matrix-q4', matrixQ4);
    setDraftFeedback('تم حفظ مصفوفة الأفكار محليًا بنجاح.');
    setTimeout(() => setDraftFeedback(''), 4000);
  };

  // 3. Storyboard
  interface StoryboardStep {
    id: string;
    scene: string;
    audio: string;
  }
  const [storyboardSteps, setStoryboardSteps] = useState<StoryboardStep[]>(() => {
    try {
      const raw = localStorage.getItem('wens-studio-storyboard');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      { id: 'step-1', scene: 'المشهد الافتتاحي: مشكلة العميل الحالية والصعوبة التي تواجهه', audio: 'موسيقى هادئة مع صوت الراوي يشرح الواقع' },
      { id: 'step-2', scene: 'نقطة التحول: ظهور الحل والخدمة وطريقة عملها بوضوح', audio: 'نبرة محفزة وشرح سريع ومباشر' },
    ];
  });

  const saveStoryboardDraft = () => {
    localStorage.setItem('wens-studio-storyboard', JSON.stringify(storyboardSteps));
    setDraftFeedback('تم حفظ تسلسل المشاهد محليًا بنجاح.');
    setTimeout(() => setDraftFeedback(''), 4000);
  };

  // 4. Campaign Metrics
  const [roasRevenue, setRoasRevenue] = useState(() => localStorage.getItem('wens-studio-metric-rev') || '15000');
  const [roasSpend, setRoasSpend] = useState(() => localStorage.getItem('wens-studio-metric-spend') || '3000');
  const [ctrClicks, setCtrClicks] = useState(() => localStorage.getItem('wens-studio-metric-clicks') || '450');
  const [ctrImpressions, setCtrImpressions] = useState(() => localStorage.getItem('wens-studio-metric-impr') || '12000');
  const [cplCost, setCplCost] = useState(() => localStorage.getItem('wens-studio-metric-cpl-cost') || '3000');
  const [cplConversions, setCplConversions] = useState(() => localStorage.getItem('wens-studio-metric-cpl-conv') || '75');

  const roasValue = useMemo(() => {
    const spend = parseFloat(roasSpend);
    const rev = parseFloat(roasRevenue);
    if (!spend || spend <= 0 || isNaN(rev)) return '0.00x';
    return (rev / spend).toFixed(2) + 'x';
  }, [roasRevenue, roasSpend]);

  const ctrValue = useMemo(() => {
    const impr = parseFloat(ctrImpressions);
    const clicks = parseFloat(ctrClicks);
    if (!impr || impr <= 0 || isNaN(clicks)) return '0.00%';
    return ((clicks / impr) * 100).toFixed(2) + '%';
  }, [ctrClicks, ctrImpressions]);

  const cplValue = useMemo(() => {
    const cost = parseFloat(cplCost);
    const conv = parseFloat(cplConversions);
    if (!conv || conv <= 0 || isNaN(cost)) return '0.00';
    return (cost / conv).toFixed(2);
  }, [cplCost, cplConversions]);

  const saveMetricsDraft = () => {
    localStorage.setItem('wens-studio-metric-rev', roasRevenue);
    localStorage.setItem('wens-studio-metric-spend', roasSpend);
    localStorage.setItem('wens-studio-metric-clicks', ctrClicks);
    localStorage.setItem('wens-studio-metric-impr', ctrImpressions);
    localStorage.setItem('wens-studio-metric-cpl-cost', cplCost);
    localStorage.setItem('wens-studio-metric-cpl-conv', cplConversions);
    setDraftFeedback('تم حفظ بيانات وحسابات المقاييس محليًا بنجاح.');
    setTimeout(() => setDraftFeedback(''), 4000);
  };

  return (
    <>
      <div className="studio-unified-container">
        {/* Header with celestial arc and sun matching Screen 3 */}
        <div className="studio-unified-header">
          <h1>المشروعات والأفكار</h1>
          <p>من الفكرة إلى أثر واقعي</p>
          <div className="studio-header-arc-wrap">
            <svg viewBox="0 0 600 38" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <path d="M 0 35 Q 300 -10 600 35" fill="none" stroke="rgba(212, 151, 72, 0.4)" strokeWidth="1.5" />
            </svg>
            <div className="studio-header-arc-sun" />
          </div>
        </div>

        {/* Mid Grid: Right Column (Draft Card) + Left Column (Studio Tools) */}
        <div className="studio-mid-grid">
          {/* Right Column: Draft Card */}
          <div className="studio-draft-card">
            <div className="studio-draft-head">
              <div className="studio-draft-title-block">
                <strong>
                  <FileText size={18} style={{ color: '#d49748' }} />
                  <span>مسودة حملة جديدة</span>
                </strong>
                <span>حوّل فكرتك إلى خطة واضحة قابلة للتنفيذ.</span>
              </div>
              <div className="studio-autosave-badge">
                <span className="studio-autosave-dot" />
                <span>تم الحفظ محلياً منذ دقائق</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-title-input">
                العنوان
              </label>
              <div className="studio-field-content">
                <input
                  id="studio-title-input"
                  className="studio-input"
                  value={briefTitle}
                  onChange={(e) => setBriefTitle(e.target.value)}
                  placeholder="حملة الوعي بالقراءة"
                  maxLength={100}
                />
                <span className="studio-char-counter">{briefTitle ? briefTitle.length : 18}/100</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-audience-input">
                الجمهور
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-audience-input"
                  className="studio-textarea"
                  value={briefAudience}
                  onChange={(e) => setBriefAudience(e.target.value)}
                  placeholder="الشباب من عمر 16 إلى 25 سنة، مهتمون بالتطوير الذاتي والمحتوى العربي."
                  maxLength={300}
                  rows={2}
                />
                <span className="studio-char-counter">{briefAudience ? briefAudience.length : 62}/300</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-message-input">
                الفكرة الأساسية
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-message-input"
                  className="studio-textarea"
                  value={briefKeyMessage}
                  onChange={(e) => setBriefKeyMessage(e.target.value)}
                  placeholder="محتوى قصير وملهم يربط القراءة بحياة أفضل، عبر قصص حقيقية وتجارب ملهمة."
                  maxLength={300}
                  rows={3}
                />
                <span className="studio-char-counter">{briefKeyMessage ? briefKeyMessage.length : 71}/300</span>
              </div>
            </div>

            <div className="studio-form-row">
              <label className="studio-field-label" htmlFor="studio-cta-input">
                الدعوة للفعل
              </label>
              <div className="studio-field-content">
                <textarea
                  id="studio-cta-input"
                  className="studio-textarea"
                  value={briefCta}
                  onChange={(e) => setBriefCta(e.target.value)}
                  placeholder="ابدأ بكتاب واحد هذا الشهر وشاركنا رحلتك."
                  maxLength={300}
                  rows={2}
                />
                <span className="studio-char-counter">{briefCta ? briefCta.length : 35}/300</span>
              </div>
            </div>

            <div className="studio-draft-footer">
              <button
                type="button"
                className="studio-btn-save"
                onClick={saveBriefDraft}
              >
                <Save size={16} />
                <span>حفظ المسودة</span>
              </button>
              {!activeTool && draftFeedback && (
                <span style={{ fontSize: '12.5px', color: '#22c55e', fontWeight: 700 }}>
                  {draftFeedback}
                </span>
              )}
            </div>
          </div>

          {/* Left Column: Tools Card */}
          <div className="studio-tools-card">
            <div className="studio-tools-head">
              <strong>
                <Sliders size={18} style={{ color: '#d49748' }} />
                <span>أدوات الاستوديو</span>
              </strong>
              <span>أدوات عملية تساعدك على تطوير فكرتك.</span>
            </div>

            <div className="studio-tools-list">
              <div
                className="studio-tool-item active"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('matrix');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTool('matrix')}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <LayoutGrid size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>مصفوفة الأفكار</strong>
                    <span>وضع الاحتمالات ورتّب الأفكار.</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>

              <div
                className="studio-tool-item"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('storyboard');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTool('storyboard')}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <FileText size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>سيناريو</strong>
                    <span>حوّل الفكرة إلى تسلسل واضح.</span>
                    <span className="sr-only">تسلسل المشاهد</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>

              <div
                className="studio-tool-item"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveTool('metrics');
                  setDraftFeedback('');
                }}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setActiveTool('metrics')}
              >
                <div className="studio-tool-info">
                  <div className="studio-tool-icon-wrap">
                    <BarChart3 size={22} />
                  </div>
                  <div className="studio-tool-texts">
                    <strong>قياس بسيط</strong>
                    <span>حدّد ما الذي ستقيسه للنجاح.</span>
                    <span className="sr-only">مقاييس الحملة</span>
                  </div>
                </div>
                <ChevronLeft size={18} style={{ color: 'var(--muted)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Toolbar matching Screen 3 */}
        <div className="studio-bottom-toolbar">
          <div className="studio-toolbar-group-end">
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => {
                setActiveTool('brief');
                setDraftFeedback('');
              }}
            >
              <FileText size={16} />
              <span>مسودة جديدة</span>
              <span className="sr-only">فتح ورقة عمل جديدة</span>
            </button>
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => go?.('projects')}
            >
              <FolderKanban size={16} />
              <span>فتح مشروع موجود</span>
            </button>
          </div>

          <div className="studio-toolbar-group-start">
            <button
              type="button"
              className="studio-toolbar-btn"
              onClick={() => {
                setBriefTitle('');
                setBriefAudience('');
                setBriefKeyMessage('');
                setBriefCta('');
                setDraftFeedback('تمت تهيئة مسودة جديدة فارغة.');
                setTimeout(() => setDraftFeedback(''), 3000);
              }}
            >
              <MoreHorizontal size={18} />
              <span>المزيد</span>
            </button>
          </div>
        </div>
      </div>

      {activeTool && (
        <div className="studio-modal-backdrop" onClick={() => setActiveTool(null)}>
          <div
            className="studio-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="studio-modal-header">
              <div>
                <h2>
                  {activeTool === 'brief' && 'ورقة عمل جديدة / Campaign Brief'}
                  {activeTool === 'matrix' && 'مصفوفة الإبداع 2x2 (Creative Matrix)'}
                  {activeTool === 'storyboard' && 'لوحة تسلسل المشاهد (Storyboard)'}
                  {activeTool === 'metrics' && 'حاسبة مقاييس الحملات (Campaign Metrics)'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                  {activeTool === 'brief' && 'تثبيت العنوان، الجمهور، الرسالة الأساسية، والدعوة للإجراء.'}
                  {activeTool === 'matrix' && 'شبكة 2x2 لتوليد الأفكار بربط الجماهير بالزوايا الإبداعية.'}
                  {activeTool === 'storyboard' && 'ترتيب لقطات العمل ومشاهده بصريًا وصوتيًا خطوة بخطوة.'}
                  {activeTool === 'metrics' && 'حساب فوري محلي لمقاييس العائد، النقرات، وتكلفة الاكتساب.'}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setActiveTool(null)}
                aria-label="إغلاق ورقة العمل"
              >
                <X size={20} />
              </button>
            </div>

            <div className="studio-modal-body">
              {/* Campaign Brief */}
              {activeTool === 'brief' && (
                <>
                  <label>
                    عنوان الحملة / المشروع
                    <input
                      value={briefTitle}
                      onChange={(e) => setBriefTitle(e.target.value)}
                      placeholder="مثلاً: حملة إطلاق المساعد وِنس للإشراق والتركيز"
                    />
                  </label>
                  <label>
                    الجمهور المستهدف (Audience)
                    <textarea
                      value={briefAudience}
                      onChange={(e) => setBriefAudience(e.target.value)}
                      placeholder="من هو المستهدف بالتحديد؟ ما هي مشكلته اليومية واحتياجه الفعلي؟"
                      rows={3}
                    />
                  </label>
                  <label>
                    الرسالة الأساسية (Key Message)
                    <textarea
                      value={briefKeyMessage}
                      onChange={(e) => setBriefKeyMessage(e.target.value)}
                      placeholder="ما هي الفكرة الواحدة التي يجب أن يتذكرها بعد مشاهدة الحملة؟"
                      rows={3}
                    />
                  </label>
                  <label>
                    ملاحظة الدعوة للإجراء (Call To Action / CTA)
                    <textarea
                      value={briefCta}
                      onChange={(e) => setBriefCta(e.target.value)}
                      placeholder="ما هو الفعل الفوري المطلوب منه؟ (تحميل، تجربة، اشتراك...)"
                      rows={2}
                    />
                  </label>
                </>
              )}

              {/* Creative Matrix */}
              {activeTool === 'matrix' && (
                <div className="matrix-grid">
                  <div className="matrix-quadrant">
                    <h4>الربع الأول: جمهور حالي × مشكلة شائعة</h4>
                    <textarea
                      value={matrixQ1}
                      onChange={(e) => setMatrixQ1(e.target.value)}
                      placeholder="سجّل أفكار الربط هنا..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الثاني: جمهور حالي × زاوية غير متوقعة</h4>
                    <textarea
                      value={matrixQ2}
                      onChange={(e) => setMatrixQ2(e.target.value)}
                      placeholder="سجّل أفكار الطرح الإبداعي هنا..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الثالث: جمهور جديد × حاجة أساسية</h4>
                    <textarea
                      value={matrixQ3}
                      onChange={(e) => setMatrixQ3(e.target.value)}
                      placeholder="سجّل أفكار الوصول للجمهور الجديد..."
                    />
                  </div>
                  <div className="matrix-quadrant">
                    <h4>الربع الرابع: جمهور جديد × أسلوب سرد قصصي جريء</h4>
                    <textarea
                      value={matrixQ4}
                      onChange={(e) => setMatrixQ4(e.target.value)}
                      placeholder="سجّل الأفكار الجريئة هنا..."
                    />
                  </div>
                </div>
              )}

              {/* Storyboard */}
              {activeTool === 'storyboard' && (
                <div className="storyboard-steps">
                  {storyboardSteps.map((step, idx) => (
                    <div key={step.id} className="storyboard-step">
                      <div className="storyboard-step-header">
                        <strong>اللقطة #{digits(idx + 1)}</strong>
                        {storyboardSteps.length > 1 && (
                          <button
                            type="button"
                            className="icon-button danger"
                            onClick={() => setStoryboardSteps((steps) => steps.filter((s) => s.id !== step.id))}
                            aria-label="حذف اللقطة"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <div className="storyboard-step-grid">
                        <label>
                          المشهد / اللقطة البصرية
                          <textarea
                            value={step.scene}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStoryboardSteps((steps) =>
                                steps.map((s) => (s.id === step.id ? { ...s, scene: val } : s))
                              );
                            }}
                            placeholder="وصف المشهد البصري وحركة الكاميرا..."
                            rows={2}
                          />
                        </label>
                        <label>
                          الصوت / الحوار المصاحب
                          <textarea
                            value={step.audio}
                            onChange={(e) => {
                              const val = e.target.value;
                              setStoryboardSteps((steps) =>
                                steps.map((s) => (s.id === step.id ? { ...s, audio: val } : s))
                              );
                            }}
                            placeholder="الكلام المنطوق أو المؤثرات الصوتية..."
                            rows={2}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      setStoryboardSteps((steps) => [
                        ...steps,
                        { id: `step-${Date.now()}`, scene: '', audio: '' },
                      ])
                    }
                  >
                    <Plus size={16} />
                    إضافة لقطة جديدة
                  </button>
                </div>
              )}

              {/* Campaign Metrics */}
              {activeTool === 'metrics' && (
                <div className="metrics-calculator-grid">
                  <div className="metric-card">
                    <h3>حاسبة العائد على الإنفاق الإعلاني (ROAS)</h3>
                    <p>مقياس يعكس كفاءة الإعلان وقدرته على توليد إيرادات مقابل كل جنيه أو دولار ينفق.</p>
                    <div className="metric-card-inputs">
                      <label>
                        العائد الكلي (Revenue)
                        <input
                          type="number"
                          value={roasRevenue}
                          onChange={(e) => setRoasRevenue(e.target.value)}
                        />
                      </label>
                      <label>
                        الإنفاق الإعلاني (Ad Spend)
                        <input
                          type="number"
                          value={roasSpend}
                          onChange={(e) => setRoasSpend(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>النتيجة الحالية</span>
                        <strong>{roasValue}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="metric-card">
                    <h3>معدل النقر إلى الظهور (CTR %)</h3>
                    <p>النسبة المئوية للأشخاص الذين نقروا على إعلانك بعد رؤيته.</p>
                    <div className="metric-card-inputs">
                      <label>
                        عدد النقرات (Clicks)
                        <input
                          type="number"
                          value={ctrClicks}
                          onChange={(e) => setCtrClicks(e.target.value)}
                        />
                      </label>
                      <label>
                        مرات الظهور (Impressions)
                        <input
                          type="number"
                          value={ctrImpressions}
                          onChange={(e) => setCtrImpressions(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>نسبة النقر</span>
                        <strong>{ctrValue}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="metric-card">
                    <h3>تكلفة الاكتساب / التحويل (CPL / CAC)</h3>
                    <p>متوسط التكلفة للحصول على عميل محتمل أو عملية تحويل ناجحة.</p>
                    <div className="metric-card-inputs">
                      <label>
                        التكلفة الإجمالية
                        <input
                          type="number"
                          value={cplCost}
                          onChange={(e) => setCplCost(e.target.value)}
                        />
                      </label>
                      <label>
                        عدد التحويلات / العملاء
                        <input
                          type="number"
                          value={cplConversions}
                          onChange={(e) => setCplConversions(e.target.value)}
                        />
                      </label>
                      <div className="metric-result-badge">
                        <span>التكلفة للتحويل</span>
                        <strong>{cplValue}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="studio-modal-footer">
              <div>
                {draftFeedback ? (
                  <span style={{ color: 'var(--primary-hover)', fontWeight: 600, fontSize: '13px' }}>
                    {draftFeedback}
                  </span>
                ) : (
                  <span style={{ color: 'var(--faint)', fontSize: '12px' }}>
                    تُحفظ المسودة محليًا على هذا الجهاز فقط
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (activeTool === 'brief') saveBriefDraft();
                    if (activeTool === 'matrix') saveMatrixDraft();
                    if (activeTool === 'storyboard') saveStoryboardDraft();
                    if (activeTool === 'metrics') saveMetricsDraft();
                  }}
                >
                  حفظ المسودة محليًا
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setActiveTool(null)}
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
