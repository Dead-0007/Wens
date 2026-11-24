import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesCssPath = resolve('apps/app-ui/src/styles.css');
let css = readFileSync(stylesCssPath, 'utf8');

// 1. Force the root and midnight-magenta tokens to the exact graphite + amber palette
const rootTokensRegex = /:root\s*\{[\s\S]*?\n\}/;
const newRootTokens = `:root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  font-synthesis: none;

  /* Default theme: Today's Horizon (أفق اليوم) — Graphite & Restrained Amber */
  --bg: #0c1218;
  --bg-elevated: #111a22;
  --surface: #141f28;
  --surface-2: #1b2936;
  --border: rgba(255, 255, 255, 0.08);
  --border-focus: #d49748;
  --ink: #edf2f7;
  --muted: #8b9baa;
  --faint: #556677;
  --primary: #d49748;
  --primary-hover: #e2a85c;
  --primary-contrast: #0c1218;
  --accent: #d49748;
  --accent-contrast: #0c1218;
  --success: #4ade80;
  --danger: #ef4444;
  --warning: #f59e0b;
  --info: #38bdf8;
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --z-sidebar: 30;
  --z-popover: 50;
  --z-backdrop: 60;
  --z-modal: 70;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  color-scheme: dark;
}`;

css = css.replace(rootTokensRegex, newRootTokens);

// Also overwrite midnight-magenta
const midnightMagentaRegex = /\[data-theme="midnight-magenta"\]\s*\{[\s\S]*?\n\}/;
const newMidnightMagenta = `[data-theme="midnight-magenta"] {
  --bg: #0c1218;
  --bg-elevated: #111a22;
  --surface: #141f28;
  --surface-2: #1b2936;
  --border: rgba(255, 255, 255, 0.08);
  --border-focus: #d49748;
  --ink: #edf2f7;
  --muted: #8b9baa;
  --faint: #556677;
  --primary: #d49748;
  --primary-hover: #e2a85c;
  --primary-contrast: #0c1218;
  color-scheme: dark;
}`;
css = css.replace(midnightMagentaRegex, newMidnightMagenta);

// 2. Overwrite the entire horizon CSS section at the bottom
const horizonSectionStart = '/* أفق اليوم — Today\'s Horizon Modern Navigation & Layout */';
const horizonStartIndex = css.indexOf(horizonSectionStart);

if (horizonStartIndex !== -1) {
  const newHorizonCss = `${horizonSectionStart}
/* ==================================================== */

.horizon-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 28px;
  background: #0c1218;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 58px;
  position: sticky;
  top: 0;
  z-index: 25;
}

.horizon-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.horizon-brand strong {
  font-size: 19px;
  font-weight: 800;
  color: #edf2f7;
  letter-spacing: -0.01em;
}

.horizon-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  padding: 0;
  border: none;
}

.horizon-nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 6px 18px;
  border-radius: 20px;
  border: 1px solid transparent;
  background: transparent;
  color: #8b9baa;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 180ms var(--ease);
  user-select: none;
}

.horizon-nav-btn:hover {
  color: #edf2f7;
  background: rgba(255, 255, 255, 0.04);
}

.horizon-nav-btn.active {
  color: #edf2f7;
  background: rgba(212, 151, 72, 0.1);
  border-color: #d49748;
  box-shadow: 0 0 12px rgba(212, 151, 72, 0.18);
}

.horizon-nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 6px;
  border-radius: 10px;
  background: #d49748;
  color: #0c1218;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.horizon-top-controls,
.horizon-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.horizon-gear-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #8b9baa;
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.horizon-gear-btn:hover {
  color: #edf2f7;
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.secondary-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.secondary-tool-btn {
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.secondary-tool-btn:hover {
  color: var(--ink);
  background: var(--surface-2);
  border-color: var(--border-focus);
}

.secondary-tool-btn.active {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--surface-2);
}

.secondary-search-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.secondary-search-btn:hover {
  color: var(--ink);
  background: var(--surface-2);
  border-color: var(--border-focus);
}

.secondary-search-btn kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  color: var(--faint);
}

.stop-audio-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--danger);
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  animation: pulse-danger 2s infinite ease-in-out;
}

@keyframes pulse-danger {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 40%, transparent); }
  50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 0%, transparent); }
}

.stop-audio-btn:hover {
  background: var(--danger);
  color: #fff;
}

.workspace-subtabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-bottom: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}

.workspace-subtab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms var(--ease);
  white-space: nowrap;
}

.workspace-subtab:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.workspace-subtab.active {
  color: var(--primary);
  background: var(--surface-2);
  border-color: var(--border-focus);
}

.secondary-header-crumb {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.secondary-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  transition: all 160ms var(--ease);
}

.secondary-back-btn:hover {
  color: var(--ink);
  background: var(--surface-2);
  border-color: var(--border-focus);
}

.secondary-crumb-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.secondary-crumb-text strong {
  font-size: 16px;
  color: var(--ink);
}

.secondary-crumb-text span {
  font-size: 12px;
  color: var(--muted);
}

/* ==================================================== */
/* 2. Today View (أفق اليوم) matching 02-time-horizon.png */
/* ==================================================== */

.horizon-today-wrapper {
  max-width: 1160px;
  margin: 0 auto;
  padding: 16px 24px 36px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  direction: rtl;
}

/* Timeline Card */
.horizon-timeline-card {
  position: relative;
  background: #111a22;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 22px 28px 18px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

.horizon-card-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 4px;
}

.horizon-date-block {
  text-align: right;
  min-width: 160px;
}

.horizon-weekday {
  font-size: 24px;
  font-weight: 800;
  color: #edf2f7;
  margin: 0 0 2px;
  letter-spacing: -0.02em;
}

.horizon-hijri-date {
  font-size: 13px;
  font-weight: 600;
  color: #8b9baa;
  margin-bottom: 1px;
}

.horizon-gregorian-date {
  font-size: 12px;
  font-weight: 500;
  color: #556677;
}

.horizon-center-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 1px;
}

.horizon-countdown-kicker {
  font-size: 14px;
  font-weight: 700;
  color: #d49748;
  letter-spacing: 0.01em;
}

.horizon-countdown-val {
  font-size: 38px;
  font-weight: 900;
  color: #e5a650;
  line-height: 1.1;
  text-shadow: 0 0 24px rgba(212, 151, 72, 0.45);
  letter-spacing: -0.02em;
}

.horizon-wudu-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(212, 151, 72, 0.14);
  border: 1px solid rgba(212, 151, 72, 0.3);
  color: #e5a650;
  font-size: 11.5px;
  font-weight: 700;
  margin-top: 4px;
}

.horizon-reflection-block {
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 160px;
  gap: 2px;
}

.horizon-quote-line {
  font-size: 13.5px;
  color: #8b9baa;
  font-weight: 500;
}

.horizon-quote-line.bold {
  font-size: 15px;
  font-weight: 800;
  color: #edf2f7;
}

/* Celestial Arc */
.horizon-celestial-arc-wrap {
  position: relative;
  width: 100%;
  height: 52px;
  margin: 2px 0 10px;
}

.horizon-celestial-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.horizon-celestial-arc-path {
  fill: none;
  stroke: rgba(212, 151, 72, 0.32);
  stroke-width: 1.5;
  filter: drop-shadow(0 0 4px rgba(212, 151, 72, 0.25));
}

.horizon-sun-disc {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff2d6, #e5a650 60%, #c4822f);
  box-shadow: 0 0 14px rgba(229, 166, 80, 0.9), 0 0 32px rgba(229, 166, 80, 0.5);
  transform: translate(-50%, 50%);
  pointer-events: none;
  transition: left 300ms ease, bottom 300ms ease;
}

.horizon-moon-crescent {
  position: absolute;
  right: 12px;
  top: 16px;
  font-size: 16px;
  color: #8b9baa;
  opacity: 0.75;
  transform: rotate(-15deg);
}

/* 5 Prayers on Horizon Line */
.horizon-five-prayers {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 24px 20px 4px;
  direction: rtl;
}

.horizon-timeline-baseline {
  position: absolute;
  left: 32px;
  right: 32px;
  top: 28px;
  height: 1.5px;
  background: rgba(255, 255, 255, 0.12);
  z-index: 1;
}

.horizon-prayer-node {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  padding: 0;
  min-width: 64px;
  text-align: center;
}

.prayer-vertical-beam {
  position: absolute;
  bottom: calc(100% - 7px);
  left: 50%;
  transform: translateX(-50%);
  width: 1.5px;
  height: 38px;
  background: linear-gradient(to top, rgba(234, 88, 12, 0.85), transparent);
  pointer-events: none;
}

.prayer-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #526577;
  transition: all 200ms ease;
  z-index: 3;
}

.prayer-dot.obligatory {
  background: #607386;
}

.prayer-dot.done {
  background: #4ade80;
  box-shadow: 0 0 8px #4ade80;
}

.prayer-dot.sunrise {
  width: 7px;
  height: 7px;
  background: transparent;
  border: 1.5px solid #607386;
}

.prayer-dot.next {
  width: 13px;
  height: 13px;
  background: #ea580c;
  border: 2px solid #fdba74;
  box-shadow: 0 0 14px #ea580c;
}

.prayer-name {
  font-size: 13px;
  font-weight: 600;
  color: #8b9baa;
  transition: color 180ms ease;
  margin-top: 4px;
}

.horizon-prayer-node.next .prayer-name {
  color: #ea580c;
  font-weight: 800;
  font-size: 14px;
}

.prayer-time {
  font-size: 12px;
  font-weight: 500;
  color: #556677;
}

.horizon-prayer-node.next .prayer-time {
  color: #ea580c;
  font-weight: 700;
}

/* In-Window Foreground Reminder Banner */
.horizon-single-reminder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: #131d26;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.reminder-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reminder-bell {
  color: #d49748;
  flex-shrink: 0;
}

.reminder-text {
  font-size: 13.5px;
  font-weight: 600;
  color: #edf2f7;
}

.reminder-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.reminder-snooze-btn {
  background: #1c2a36;
  border: 1px solid rgba(212, 151, 72, 0.35);
  color: #d49748;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms ease;
}

.reminder-snooze-btn:hover {
  background: #233444;
  border-color: #d49748;
  color: #e5a650;
}

.reminder-dismiss-btn {
  background: transparent;
  border: none;
  color: #8b9baa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
}

.reminder-dismiss-btn:hover {
  color: #edf2f7;
  background: rgba(255, 255, 255, 0.06);
}

/* Two-Zone Balanced Layout */
.horizon-zones-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  direction: rtl;
}

.horizon-work-card,
.horizon-review-card {
  background: #111a22;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
}

.zone-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.horizon-project-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  border-radius: 14px;
  background: #162430;
  border: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  font-weight: 600;
  color: #8b9baa;
}

.horizon-project-badge .badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
}

.horizon-work-body {
  margin: 18px 0;
}

.horizon-step-kicker {
  font-size: 13px;
  font-weight: 600;
  color: #8b9baa;
  display: block;
  margin-bottom: 4px;
}

.horizon-step-title {
  font-size: 22px;
  font-weight: 800;
  color: #edf2f7;
  margin: 0 0 8px;
  line-height: 1.25;
}

.horizon-step-desc {
  font-size: 13px;
  color: #8b9baa;
  line-height: 1.55;
  margin: 0;
}

.horizon-work-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: auto;
}

.horizon-all-steps-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  background: #172430;
  border: 1px solid rgba(255, 255, 255, 0.09);
  color: #edf2f7;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms ease;
}

.horizon-all-steps-btn:hover {
  background: #1e3040;
  border-color: rgba(255, 255, 255, 0.16);
}

.horizon-focus-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 8px;
  background: #d49748;
  border: none;
  color: #0c1218;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: all 160ms ease;
  box-shadow: 0 4px 14px rgba(212, 151, 72, 0.3);
}

.horizon-focus-btn:hover {
  background: #e2a85c;
  box-shadow: 0 6px 18px rgba(212, 151, 72, 0.45);
  transform: translateY(-1px);
}

.horizon-review-body {
  margin: 18px 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.horizon-review-empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: #0c141c;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
  color: #8b9baa;
  min-height: 120px;
}

.empty-state-icon {
  color: #556677;
  opacity: 0.85;
}

.horizon-review-empty-state p {
  font-size: 13px;
  color: #8b9baa;
  margin: 0;
}

.horizon-add-note-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  background: #162430;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8b9baa;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 160ms ease;
  text-align: center;
}

.horizon-add-note-btn:hover {
  background: #1c2e3e;
  color: #edf2f7;
  border-color: rgba(255, 255, 255, 0.14);
}

.horizon-saved-note-wrap {
  background: #0c141c;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 14px 16px;
}

.horizon-saved-note-text {
  font-size: 13.5px;
  color: #edf2f7;
  line-height: 1.5;
  margin: 0;
}

.horizon-note-input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.horizon-note-input-row textarea {
  width: 100%;
  min-height: 70px;
  background: #0c141c;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px;
  color: #edf2f7;
  font-size: 13px;
  resize: vertical;
}

.horizon-note-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Ambient Horizon Footer */
.horizon-ambient-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px 12px;
  margin-top: 8px;
  direction: rtl;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.horizon-footer-side {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #8b9baa;
}

.horizon-footer-emblem {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
}

.emblem-halo {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(212, 151, 72, 0.35), transparent 70%);
  filter: blur(6px);
}

.emblem-disc {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #e2a85c, #d49748 65%, #9a6620);
  box-shadow: 0 0 16px rgba(212, 151, 72, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.emblem-leaf-svg {
  color: #0c1218;
}

@media (max-width: 900px) {
  .horizon-today-wrapper {
    padding: 14px;
  }
  .horizon-card-topbar {
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
  }
  .horizon-date-block,
  .horizon-reflection-block {
    text-align: center;
    align-items: center;
    min-width: 0;
  }
  .horizon-five-prayers {
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .horizon-zones-grid {
    grid-template-columns: 1fr;
  }
  .horizon-ambient-footer {
    flex-direction: column;
    gap: 12px;
  }
}
`;

  css = css.slice(0, horizonStartIndex) + newHorizonCss;
  console.log('✓ Overwrote horizon CSS section');
} else {
  console.error('✗ Failed to find horizonSectionStart');
}

writeFileSync(stylesCssPath, css, 'utf8');
console.log('Finished updating apps/app-ui/src/styles.css');
