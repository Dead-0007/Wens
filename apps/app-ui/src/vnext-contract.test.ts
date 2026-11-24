import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vNext Desktop Packaging Contract', () => {
  const root = resolve(__dirname, '../../..');

  it('verifies tauri.conf.json sets frontendDist to ../dist-vnext', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
    expect(config.build?.frontendDist).toBe('../dist-vnext');
    expect(config.identifier).toBe('com.wens.offline');
  });

  it('verifies sync-desktop-assets.mjs copies companion and overlay into dist-vnext', () => {
    const syncScript = readFileSync(resolve(root, 'sync-desktop-assets.mjs'), 'utf8');
    expect(syncScript).toContain('dist-vnext');
    expect(syncScript).toContain('pet.html');
    expect(syncScript).toContain('pet.css');
    expect(syncScript).toContain('pet.js');
    expect(syncScript).toContain('overlay.html');
    expect(syncScript).toContain('overlay.css');
    expect(syncScript).toContain('overlay.js');
    expect(syncScript).toContain('npm run build:vnext');
  });

  it('verifies all 10 views and accessible dialogs are defined in main.tsx', () => {
    const mainTsx = readFileSync(resolve(__dirname, 'main.tsx'), 'utf8');
    const expectedViews = [
      'today',
      'worship',
      'work',
      'projects',
      'ideas',
      'studio',
      'history',
      'devices',
      'modules',
      'settings',
    ];
    for (const v of expectedViews) {
      expect(mainTsx).toContain(`id:'${v}'`);
    }

    // Accessible attributes
    expect(mainTsx).toContain('aria-label="القائمة الجانبية"');
    expect(mainTsx).toContain('aria-label="مركز التنبيهات"');
    expect(mainTsx).toContain('role="dialog"');
    expect(mainTsx).toContain('aria-modal="true"');
    expect(mainTsx).toContain('role="status"');
    expect(mainTsx).toContain('aria-live="polite"');
  });
});
