const fs = require('fs');

const APP_JS_PATH = 'app.js';
const INDEX_HTML_PATH = 'index.html';
const STYLES_CSS_PATH = 'styles.css';

let appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
let indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
let stylesCss = fs.readFileSync(STYLES_CSS_PATH, 'utf8');

// Phase 3.2: Part A - Link Studio Items to Projects

// Add projectId to briefToolModal
appJs = appJs.replace(
  `ensureToolModal('briefToolModal', \`<form method="dialog" class="modal-card tool-modal">`,
  `const briefOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => \`<option value="\${p.id}">\${escapeHtml(p.title)}</option>\`).join('');\n  ensureToolModal('briefToolModal', \`<form method="dialog" class="modal-card tool-modal">`
);
appJs = appJs.replace(
  `<div class="tool-form-grid"><label><span>المنتج</span>`,
  `<div class="tool-form-grid"><label><span>المشروع</span><select name="projectId" class="text-input">\${briefOptions}</select></label><label><span>المنتج</span>`
);

// Add projectId to matrixToolModal
appJs = appJs.replace(
  `const modal = ensureToolModal('matrixToolModal', \`<form method="dialog" class="modal-card tool-modal">`,
  `const matrixOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => \`<option value="\${p.id}">\${escapeHtml(p.title)}</option>\`).join('');\n  const modal = ensureToolModal('matrixToolModal', \`<form method="dialog" class="modal-card tool-modal">`
);
appJs = appJs.replace(
  `<div class="tool-form-grid"><label><span>الجمهور</span>`,
  `<div class="tool-form-grid"><label><span>المشروع</span><select name="projectId" class="text-input">\${matrixOptions}</select></label><label><span>الجمهور</span>`
);

// Add projectId to storyboardToolModal
appJs = appJs.replace(
  `ensureToolModal('storyboardToolModal', \`<form method="dialog" class="modal-card tool-modal">`,
  `const storyOptions = '<option value="">بدون مشروع</option>' + state.projects.map(p => \`<option value="\${p.id}">\${escapeHtml(p.title)}</option>\`).join('');\n  ensureToolModal('storyboardToolModal', \`<form method="dialog" class="modal-card tool-modal">`
);
appJs = appJs.replace(
  `<div class="storyboard-grid"><label><strong>01</strong>`,
  `<div class="storyboard-grid"><label><span>المشروع</span><select name="projectId" class="text-input">\${storyOptions}</select></label><label><strong>01</strong>`
);

// Replace angle wheel array
appJs = appJs.replace(
  `case 'spin-angle': showToast('زاوية اليوم', ['قبل / بعد', 'تجنب الخسارة', 'قصة العميل', 'كسر اعتقاد'][Math.floor(Math.random() * 4)] + ' — اكتب أول Hook.'); break;`,
  `case 'spin-angle': {
      const angles = ['قبل / بعد', 'تجنب الخسارة', 'قصة العميل', 'كسر اعتقاد', 'المقارنة الصادمة', 'السؤال المحرج', 'الدليل الاجتماعي', 'عكس المتوقع', 'التجربة الشخصية', 'الرقم المفاجئ', 'ماذا لو؟', 'التحدي المباشر', 'القصة القصيرة', 'السر المكشوف', 'الخطأ الشائع', 'المشكلة والحل', 'الشهادة الحية', 'التحول الدرامي', 'النتيجة أولاً', 'الوعد الجريء'];
      showToast('زاوية اليوم', angles[Math.floor(Math.random() * angles.length)] + ' — اكتب أول Hook.'); 
      break;
    }`
);

// Show linked project in vault card
appJs = appJs.replace(
  `const list = $('#vaultContentList');`,
  `const getProjectBadge = (pid) => pid ? \`<span class="badge" style="background:var(--w-bg-sub);padding:2px 6px;border-radius:4px;font-size:0.75rem;margin-right:8px;">\${escapeHtml(state.projects.find(p => p.id === pid)?.title || 'مشروع محذوف')}\</span>\` : '';\n  const list = $('#vaultContentList');`
);
appJs = appJs.replace(
  `<strong>\${escapeHtml(b.product || 'حملة بدون اسم')}</strong>`,
  `<strong>\${escapeHtml(b.product || 'حملة بدون اسم')}</strong>\${getProjectBadge(b.projectId)}`
);
appJs = appJs.replace(
  `<strong>مصفوفة #\${arabicDigits(i + 1)}</strong>`,
  `<strong>مصفوفة #\${arabicDigits(i + 1)}</strong>\${getProjectBadge(m.projectId)}`
);
appJs = appJs.replace(
  `<strong>لوحة #\${arabicDigits(i + 1)}</strong>`,
  `<strong>لوحة #\${arabicDigits(i + 1)}</strong>\${getProjectBadge(s.projectId)}`
);


// Phase 3.4: Part B - Quran Tracking

// Add to default state
appJs = appJs.replace(
  `devotion: { quranEnabled: false, quranTarget: 'ayah-1', adhkarEnabled: false, adhkarGroups: { morning: true, evening: true, afterPrayer: false, sleep: false } },`,
  `devotion: { quranEnabled: false, quranTarget: 'ayah-1', quranLog: {}, adhkarEnabled: false, adhkarGroups: { morning: true, evening: true, afterPrayer: false, sleep: false } },`
);

// Add global toggle Quran daily function mapping
appJs = appJs.replace(
  `function toggleQuranToday() {`,
  `function updateQuranCounter(delta) {
  const quranTargetVal = state.devotion.quranTarget || 'ayah-1';
  let targetNum = 1;
  if (quranTargetVal === 'ayah-3') targetNum = 3;
  if (quranTargetVal === 'ayah-5') targetNum = 5;
  if (quranTargetVal === 'ayah-10') targetNum = 10;
  if (quranTargetVal === 'page-1') targetNum = 1; // page
  if (quranTargetVal === 'page-half') targetNum = 1; // logical target 1 segment
  if (quranTargetVal === 'page-quarter') targetNum = 1;

  const todayStr = currentDay().date;
  state.devotion.quranLog = state.devotion.quranLog || {};
  let currentLog = state.devotion.quranLog[todayStr] || { done: false, count: 0 };
  
  currentLog.count = Math.max(0, (currentLog.count || 0) + delta);
  if (currentLog.count >= targetNum) {
    currentLog.done = true;
  } else {
    currentLog.done = false;
  }
  
  state.devotion.quranLog[todayStr] = currentLog;
  
  // Keep day.devotion.quranDone in sync for backwards compatibility / alerts
  const day = currentDay();
  day.devotion.quranDone = currentLog.done;
  if (currentLog.done) {
    day.devotion.quranCompletedAt = new Date().toISOString();
  } else {
    day.devotion.quranCompletedAt = null;
  }
  day.updatedAt = new Date().toISOString();
  saveState();
  renderDevotion();
}
window.updateQuranCounter = updateQuranCounter;

function toggleQuranToday() {`
);

// Replace Quran rendering in renderDevotion()
appJs = appJs.replace(
  `const quranButton = $('#quranCompleteButton');
  if (quranButton) { quranButton.disabled = !quranEnabled; quranButton.textContent = day.devotion.quranDone ? 'رجّع الورد لسه' : 'علّم ورد اليوم تم'; quranButton.className = \`button \${day.devotion.quranDone ? 'primary' : 'secondary'}\`; }
  const quranStatus = $('#quranTodayStatus');
  if (quranStatus) quranStatus.textContent = !quranEnabled ? 'الورد مقفول حاليًا.' : day.devotion.quranDone ? \`\${QURAN_TARGET_LABELS[state.devotion.quranTarget]} تمت النهارده.\` : \`المطلوب اليوم: \${QURAN_TARGET_LABELS[state.devotion.quranTarget] || 'آية واحدة'}.\`;`,
  `const trackerCont = $('#quranTrackerContainer');
  if (trackerCont) {
    if (!quranEnabled) {
      trackerCont.innerHTML = '<p class="devotion-inline-status">الورد مقفول حاليًا.</p>';
    } else {
      const todayStr = day.date;
      const log = (state.devotion.quranLog || {})[todayStr] || { count: 0, done: false };
      
      const quranTargetVal = state.devotion.quranTarget || 'ayah-1';
      let targetNum = 1; let unit = 'آية';
      if (quranTargetVal === 'ayah-3') { targetNum = 3; unit = 'آيات'; }
      if (quranTargetVal === 'ayah-5') { targetNum = 5; unit = 'آيات'; }
      if (quranTargetVal === 'ayah-10') { targetNum = 10; unit = 'آيات'; }
      if (quranTargetVal === 'page-1') { targetNum = 1; unit = 'صفحة'; }
      
      let gridHtml = '<div class="quran-7day-grid">';
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const dLog = (state.devotion.quranLog || {})[dStr] || { done: false };
        gridHtml += \`<span class="quran-dot \${dLog.done ? 'done' : 'missed'}" title="\${dStr}"></span>\`;
      }
      gridHtml += '</div>';

      const progressPerc = Math.min(100, Math.round((log.count / targetNum) * 100));

      trackerCont.innerHTML = \`
        <div class="quran-counter-ui">
          <div class="quran-counter-actions">
            <button class="button ghost small-button" onclick="updateQuranCounter(-1)">-</button>
            <div class="quran-count-display">\${log.count} / \${targetNum} <span>\${unit}</span></div>
            <button class="button secondary small-button" onclick="updateQuranCounter(1)">+</button>
          </div>
          <div class="quran-progress-wrap"><div class="quran-progress-bar" style="width: \${progressPerc}%"></div></div>
          \${gridHtml}
          <p class="devotion-inline-status">\${log.done ? 'ورد اليوم تم.' : \`المطلوب اليوم: \${QURAN_TARGET_LABELS[quranTargetVal] || 'آية واحدة'}\`}</p>
        </div>
      \`;
    }
  }`
);

// Update index.html
indexHtml = indexHtml.replace(
  `<button class="button secondary" type="button" id="quranCompleteButton">علّم ورد اليوم تم</button>
              </div>
              <p class="devotion-inline-status" id="quranTodayStatus">الورد مقفول حاليًا.</p>`,
  `<div id="quranTrackerContainer"></div>
              </div>`
);

// Remove Prayer panel from Home (Phase 2.1)
indexHtml = indexHtml.replace(
  /<article class="panel next-prayer-panel reveal delay-2">[\s\S]*?<\/article>/,
  ''
);

// Append CSS for Quran counter
stylesCss += `
.quran-counter-ui {
  display: flex; flex-direction: column; gap: 12px; margin-top: 12px;
}
.quran-counter-actions {
  display: flex; align-items: center; justify-content: center; gap: 16px;
}
.quran-count-display {
  font-size: 1.5rem; font-weight: bold; font-family: var(--w-font-sans); color: var(--w-text-base);
}
.quran-count-display span {
  font-size: 0.9rem; font-weight: normal; color: var(--w-text-sub);
}
.quran-progress-wrap {
  width: 100%; height: 6px; background: var(--w-bg-sub); border-radius: 4px; overflow: hidden;
}
.quran-progress-bar {
  height: 100%; background: var(--w-accent-success); transition: width 0.3s ease;
}
.quran-7day-grid {
  display: flex; gap: 6px; justify-content: center; margin-top: 8px;
}
.quran-dot {
  width: 10px; height: 10px; border-radius: 50%; background: var(--w-border-base);
}
.quran-dot.done {
  background: var(--w-accent-success);
}
.quran-dot.missed {
  opacity: 0.5;
}
`;

fs.writeFileSync(APP_JS_PATH, appJs);
fs.writeFileSync(INDEX_HTML_PATH, indexHtml);
fs.writeFileSync(STYLES_CSS_PATH, stylesCss);
console.log('Done!');
