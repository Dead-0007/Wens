import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

describe('Audio Assets and Integrity Manifest', () => {
  const root = resolve(__dirname, '../../..');
  const manifestPath = resolve(root, 'contracts/audio-asset-manifest.json');
  const noticesPath = resolve(root, 'THIRD_PARTY_NOTICES.md');

  it('verifies manifest exists and contains 3 audio files', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(Array.isArray(manifest.assets)).toBe(true);
    expect(manifest.assets.length).toBe(3);
    const filenames = manifest.assets.map((a: any) => a.filename);
    expect(filenames).toContain('gentle-chime.wav');
    expect(filenames).toContain('work-chime.wav');
    expect(filenames).toContain('adhan.ogg');
  });

  it('verifies generated and CC0 audio files exist in src-tauri/assets/audio and public/audio', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const tauriAudioDir = resolve(root, 'src-tauri/assets/audio');
    const appUiAudioDir = resolve(root, 'apps/app-ui/public/audio');

    for (const asset of manifest.assets) {
      const filename = asset.filename;
      const tauriFile = resolve(tauriAudioDir, filename);
      const appUiFile = resolve(appUiAudioDir, filename);

      expect(existsSync(tauriFile)).toBe(true);
      expect(existsSync(appUiFile)).toBe(true);

      const tauriBuffer = readFileSync(tauriFile);
      const sha1 = createHash('sha1').update(tauriBuffer).digest('hex');
      expect(sha1).toBe(asset.sha1);
    }
  });

  it('verifies dist-vnext/audio contains all manifest assets and strong-alarm.wav matching source hashes', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const distAudioDir = resolve(root, 'dist-vnext/audio');
    const tauriAudioDir = resolve(root, 'src-tauri/assets/audio');

    for (const asset of manifest.assets) {
      const distFile = resolve(distAudioDir, asset.filename);
      expect(existsSync(distFile)).toBe(true);
      const sha1 = createHash('sha1').update(readFileSync(distFile)).digest('hex');
      expect(sha1).toBe(asset.sha1);
    }

    const strongAlarmSrc = existsSync(resolve(tauriAudioDir, 'strong-alarm.wav'))
      ? resolve(tauriAudioDir, 'strong-alarm.wav')
      : resolve(root, 'audio/strong-alarm.wav');
    const strongAlarmDist = resolve(distAudioDir, 'strong-alarm.wav');
    expect(existsSync(strongAlarmSrc)).toBe(true);
    expect(existsSync(strongAlarmDist)).toBe(true);
    const srcBuf = readFileSync(strongAlarmSrc);
    const distBuf = readFileSync(strongAlarmDist);
    expect(distBuf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(createHash('sha256').update(distBuf).digest('hex')).toBe(
      createHash('sha256').update(srcBuf).digest('hex'),
    );
  });

  it('verifies CC0 adhan attribution is documented in THIRD_PARTY_NOTICES.md', () => {
    const notices = readFileSync(noticesPath, 'utf8');
    expect(notices).toContain('Beautiful_adhan.ogg');
    expect(notices).toContain('Creative Commons CC0');
    expect(notices).toContain('a1fa4fd942401922c5c3301816384aae86956522');
  });
});
