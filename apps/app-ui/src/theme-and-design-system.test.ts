import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Design Tokens & Typography Rules', () => {
  const cssPath = resolve(__dirname, 'styles.css');
  const css = readFileSync(cssPath, 'utf8').replace(/\r\n/g, '\n');

  it('contains all 5 required theme skins', () => {
    const requiredThemes = [
      'midnight-magenta',
      'dawn-sand',
      'nile-teal',
      'studio-voltage',
      'copper-garden',
    ];
    for (const theme of requiredThemes) {
      expect(css).toContain(`[data-theme="${theme}"]`);
    }
  });

  it('contains all 5 required contrast-safe accents', () => {
    const requiredAccents = ['rose', 'amber', 'aqua', 'violet', 'lime'];
    for (const accent of requiredAccents) {
      expect(css).toContain(`[data-accent="${accent}"]`);
    }
  });

  it('provides contrast-safe accent overrides for dawn-sand light theme', () => {
    expect(css).toContain('[data-theme="dawn-sand"][data-accent="rose"]');
    expect(css).toContain('[data-theme="dawn-sand"][data-accent="amber"]');
    expect(css).toContain('[data-theme="dawn-sand"][data-accent="aqua"]');
    expect(css).toContain('[data-theme="dawn-sand"][data-accent="violet"]');
    expect(css).toContain('[data-theme="dawn-sand"][data-accent="lime"]');
  });

  it('enforces typography floor: no font size smaller than 12px exists in styles.css', () => {
    const matches = Array.from(css.matchAll(/font-size:\s*([0-9.]+)px/g));
    expect(matches.length).toBeGreaterThan(0);

    const violatingSizes: number[] = [];
    for (const match of matches as any[]) {
      const size = parseFloat(match[1]);
      if (size < 12) {
        violatingSizes.push(size);
      }
    }

    expect(violatingSizes).toEqual([]);
  });

  it('enforces interactive targets meet the 44x44px floor', () => {
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('.icon-button');
    expect(css).toContain('width: 44px');
    expect(css).toContain('height: 44px');
    expect(css).toContain('.notif-trigger');
    expect(css).toContain('.check-button');
    expect(css).toContain('.toggle-switch');
  });

  it('hides close-nav on desktop viewports and reveals it on mobile', () => {
    expect(css).toContain('.close-nav {\n  display: none;');
    expect(css).toContain('.close-nav, .menu-button {\n    display: grid;\n  }');
  });

  it('adapts studio worksheets, project actions, and session list in narrow viewports', () => {
    expect(css).toContain('.matrix-grid {\n    grid-template-columns: 1fr;');
    expect(css).toContain('.metric-card-inputs {\n    grid-template-columns: 1fr;');
    expect(css).toContain('.storyboard-step-grid {\n    grid-template-columns: 1fr;');
    expect(css).toContain('.project-actions {\n    grid-column: 2;\n    flex-wrap: wrap;');
    expect(css).toContain('.studio-modal-footer {\n    flex-direction: column;\n    align-items: stretch;');
    expect(css).toContain('.saved-session-item {\n    flex-direction: column;\n    align-items: flex-start;');
  });

  it('strictly satisfies typography floor across all main.tsx components', () => {
    const mainPath = resolve(__dirname, 'main.tsx');
    const mainSrc = readFileSync(mainPath, 'utf8');
    const inlineMatches = Array.from(mainSrc.matchAll(/fontSize:\s*['"](\d+)px['"]/g));
    const violatingSizes: number[] = [];
    for (const m of inlineMatches) {
      const size = parseInt(m[1]);
      if (size < 12) violatingSizes.push(size);
    }
    expect(violatingSizes).toEqual([]);
  });

  it('enforces worship hub, timeline, sub-navigation, and suhoor controls styling standards', () => {
    // Worship sub-items in sidebar
    expect(css).toContain('.worship-sidebar-subitems');
    expect(css).toContain('.worship-sidebar-subitem');

    // Worship segmented tabs
    expect(css).toContain('.worship-tabs');
    expect(css).toContain('.worship-tab');

    // Section 1: Timeline & Qibla
    expect(css).toContain('.prayer-focus-hub');
    expect(css).toContain('.prayer-timeline-card');
    expect(css).toContain('.prayer-timeline-node');
    expect(css).toContain('.qibla-card');
    expect(css).toContain('.qibla-compass');

    // Section 2: Backlog & stats
    expect(css).toContain('.backlog-stats-grid');
    expect(css).toContain('.backlog-stat-card');

    // Section 3: Fasting & Suhoor
    expect(css).toContain('.fasting-hub-container');
    expect(css).toContain('.tomorrow-fasting-card');
    expect(css).toContain('.suhoor-alarm-panel');
    expect(css).toContain('.suhoor-lead-btn');
  });

  it('implements responsive font size scaling engine and reduced motion engine', () => {
    expect(css).toContain('html[data-font-size="small"]');
    expect(css).toContain('html[data-font-size="medium"]');
    expect(css).toContain('html[data-font-size="large"]');
    expect(css).toContain('[data-reduced-motion="true"]');
  });

  it('maintains strict high contrast in Settings across light and dark themes', () => {
    // Labels and text in Settings toggle info must use semantic tokens, not hardcoded white
    expect(css).toContain('.settings-toggle-info strong');
    expect(css).toContain('color: var(--ink');
    expect(css).toContain('.settings-toggle-info span');
    expect(css).toContain('color: var(--muted');
  });

  it('implements fluid animation system: click physics, menus, popovers, and holistic micro-interactions', () => {
    // 1. Click & Tactile Physics
    expect(css).toContain('button:active:not(:disabled)');
    expect(css).toContain('.primary-button:active');
    expect(css).toContain('scale(0.96)');
    expect(css).toContain('.icon-button:active');
    expect(css).toContain('scale(0.92)');
    expect(css).toContain('.check-chip:active');
    expect(css).toContain('.horizon-prayer-node:active');

    // 2. Menus & Popovers
    expect(css).toContain('.sidebar.open .nav-item');
    expect(css).toContain('@keyframes sidebar-nav-glide');
    expect(css).toContain('.notif-popover');
    expect(css).toContain('@keyframes popover-drop-in');
    expect(css).toContain('.palette');
    expect(css).toContain('@keyframes palette-drop-in');
    expect(css).toContain('.palette-results button.active');
    expect(css).toContain('.studio-modal');
    expect(css).toContain('@keyframes modal-spring-up');

    // 3. Holistic interactions (ولكل حاجة)
    expect(css).toContain('@keyframes view-in');
    expect(css).toContain('@keyframes tab-content-in');
    expect(css).toContain('@keyframes check-pop');
    expect(css).toContain('.check-chip.checked');
    expect(css).toContain('.sunnah-intent-btn.intended');
    expect(css).toContain('.worship-fasting-intent-btn.intended');
    expect(css).toContain('.horizon-day-card:hover');
    expect(css).toContain('@keyframes slide-in');
    expect(css).toContain('@keyframes audio-pulse-ring');
    expect(css).toContain('@keyframes compass-glow');
  });

  it('enforces horizon prayer timeline stability and instant hover tooltip physics', () => {
    // 1. Must never jump horizontally on click: active state retains translateX(-50%)
    expect(css).toContain('.horizon-prayer-node:active');
    expect(css).toMatch(/\.horizon-prayer-node:active\s*\{[^}]*translateX\(-50%\)/);

    // 2. Green checkmark transformation animation on the dot instead of shifting the node
    expect(css).toContain('@keyframes prayer-dot-done-transform');
    expect(css).toContain('@keyframes prayer-check-icon-in');
    expect(css).toContain('.prayer-dot.done');

    // 3. Instant hover tooltip with zero delay and >= 12px typography
    expect(css).toContain('.prayer-instant-tooltip');
    expect(css).toContain('.prayer-tooltip-time');
    expect(css).toContain('.prayer-tooltip-status');
    expect(css).toContain('transition-delay: 0s');
  });

  it('enforces horizon prayer timeline default legibility, high contrast, and non-occluded stacking', () => {
    // 1. Stacking order: horizon-five-prayers must have isolated z-index above celestial body
    expect(css).toMatch(/\.horizon-five-prayers\s*\{[^}]*z-index:\s*10/);
    expect(css).toMatch(/\.horizon-celestial-arc-wrap\s*\{[^}]*z-index:\s*2/);

    // 2. Baseline alignment & prominence
    expect(css).toMatch(/\.horizon-timeline-baseline\s*\{[^}]*top:\s*4\.5px/);
    expect(css).toMatch(/\.horizon-timeline-baseline\s*\{[^}]*z-index:\s*1/);

    // 3. Default prayer name is bright high-contrast and NOT washed-out #8b9baa
    expect(css).toMatch(/\.prayer-name\s*\{[^}]*color:\s*#f8fafc/);

    // 4. Passed/missed prayer names must be crisp high-contrast (#e2e8f0), NOT dim #8b9baa
    expect(css).toMatch(/\.horizon-prayer-node\.passed\s+\.prayer-name,\s*\n?\.horizon-prayer-node\.missed\s+\.prayer-name\s*\{[^}]*color:\s*#e2e8f0/);

    // 5. Default and passed prayer times must be high-contrast (#cbd5e1), NOT buried in dark #556677
    expect(css).toMatch(/\.prayer-time\s*\{[^}]*color:\s*#cbd5e1/);
    expect(css).toMatch(/\.horizon-prayer-node\.passed\s+\.prayer-time,\s*\n?\.horizon-prayer-node\.missed\s+\.prayer-time\s*\{[^}]*color:\s*#cbd5e1/);

    // 6. Active / next / done prayer names have vibrant colors
    expect(css).toContain('.horizon-prayer-node.next .prayer-name');
    expect(css).toContain('.horizon-prayer-node.done .prayer-name');
    expect(css).toContain('#4ade80');
    expect(css).toContain('#f97316');

    // 7. Sunrise when done must not be overridden by generic sunrise text styles
    expect(css).toContain('.horizon-prayer-node.sunrise:not(.done) .prayer-name');
    expect(css).toContain('.horizon-prayer-node.sunrise:not(.done) .prayer-time');

    // 8. Baseline must not intercept pointer events
    expect(css).toMatch(/\.horizon-timeline-baseline\s*\{[^}]*pointer-events:\s*none/);

    // 9. Worship view timeline text must also have bright, high-contrast defaults
    expect(css).toMatch(/\.worship-timeline-name\s*\{[^}]*color:\s*#f8fafc/);
    expect(css).toMatch(/\.worship-timeline-item\.missed\s+\.worship-timeline-name,\s*\n?\.worship-timeline-item\.passed\s+\.worship-timeline-name\s*\{[^}]*color:\s*#e2e8f0/);
    expect(css).toMatch(/\.worship-timeline-status\s*\{[^}]*color:\s*#cbd5e1/);
  });
});

