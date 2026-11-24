import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const tauriAudioDir = resolve(root, 'src-tauri/assets/audio');
const appUiAudioDir = resolve(root, 'apps/app-ui/public/audio');
const desktopShellAudioDir = resolve(root, 'desktop-shell/public/audio');
const distVnextAudioDir = resolve(root, 'dist-vnext/audio');

mkdirSync(tauriAudioDir, { recursive: true });
mkdirSync(appUiAudioDir, { recursive: true });
mkdirSync(desktopShellAudioDir, { recursive: true });
mkdirSync(distVnextAudioDir, { recursive: true });

function encodeWavPcm16Mono(samples, sampleRate) {
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // mono (1 channel)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16 bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.floor(val), 44 + i * 2);
  }

  return buffer;
}

function generateGentleChime() {
  const sampleRate = 44100;
  const duration = 2.4;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  // Harmonious bell tone at 528 Hz (healing/peace frequency) + mellow overtone 792 Hz & 1056 Hz
  const freqs = [
    { f: 528, a: 0.55, decay: 1.4 },
    { f: 792, a: 0.28, decay: 1.8 },
    { f: 1056, a: 0.15, decay: 2.2 },
    { f: 1584, a: 0.08, decay: 2.8 },
  ];

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Fast attack (15ms)
    const attack = Math.min(1, t / 0.015);
    let sample = 0;

    for (const h of freqs) {
      const envelope = attack * Math.exp(-h.decay * t);
      sample += Math.sin(2 * Math.PI * h.f * t) * h.a * envelope;
    }

    samples[i] = sample;
  }

  return encodeWavPcm16Mono(samples, sampleRate);
}

function generateWorkChime() {
  const sampleRate = 44100;
  const duration = 2.0;
  const totalSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(totalSamples);

  // Clean uplifting two-tone chime: Note 1 (E5 = 659.25Hz) at t=0, Note 2 (A5 = 880Hz) at t=0.25
  const note1Time = 0.0;
  const note2Time = 0.22;

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let s = 0;

    // Note 1
    if (t >= note1Time) {
      const dt = t - note1Time;
      const attack = Math.min(1, dt / 0.012);
      const env = attack * Math.exp(-2.2 * dt);
      s += Math.sin(2 * Math.PI * 659.25 * dt) * 0.45 * env;
      s += Math.sin(2 * Math.PI * 1318.5 * dt) * 0.15 * env;
    }

    // Note 2
    if (t >= note2Time) {
      const dt = t - note2Time;
      const attack = Math.min(1, dt / 0.012);
      const env = attack * Math.exp(-1.8 * dt);
      s += Math.sin(2 * Math.PI * 880.0 * dt) * 0.55 * env;
      s += Math.sin(2 * Math.PI * 1760.0 * dt) * 0.18 * env;
      s += Math.sin(2 * Math.PI * 1320.0 * dt) * 0.10 * env;
    }

    samples[i] = s;
  }

  return encodeWavPcm16Mono(samples, sampleRate);
}

async function fetchAdhan() {
  const targetUrl = 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Beautiful_adhan.ogg';
  const expectedSha1 = 'a1fa4fd942401922c5c3301816384aae86956522';

  const tauriDest = resolve(tauriAudioDir, 'adhan.ogg');
  if (existsSync(tauriDest)) {
    const existing = readFileSync(tauriDest);
    const existingHash = crypto.createHash('sha1').update(existing).digest('hex');
    if (existingHash === expectedSha1) {
      console.log('Adhan audio file already cached and verified.');
      return existing;
    }
  }

  console.log(`Downloading adhan from ${targetUrl}...`);
  const response = await fetch(targetUrl, {
    headers: { 'User-Agent': 'WensDesktop/1.0.0 (https://github.com/wens-offline)' }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch adhan audio: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const hash = crypto.createHash('sha1').update(buffer).digest('hex');
  if (hash !== expectedSha1) {
    throw new Error(`Adhan SHA-1 mismatch! Expected ${expectedSha1}, got ${hash}`);
  }

  console.log(`Verified adhan SHA-1: ${hash}`);
  return buffer;
}

async function main() {
  console.log('Generating procedural WAV chimes...');
  const gentleChime = generateGentleChime();
  const workChime = generateWorkChime();

  const gentleChimeHash = crypto.createHash('sha1').update(gentleChime).digest('hex');
  const workChimeHash = crypto.createHash('sha1').update(workChime).digest('hex');

  const allAudioDirs = [tauriAudioDir, appUiAudioDir, desktopShellAudioDir, distVnextAudioDir];

  // Save chimes
  for (const dir of allAudioDirs) {
    writeFileSync(resolve(dir, 'gentle-chime.wav'), gentleChime);
    writeFileSync(resolve(dir, 'work-chime.wav'), workChime);
  }
  console.log(`Generated gentle-chime.wav (SHA-1: ${gentleChimeHash})`);
  console.log(`Generated work-chime.wav (SHA-1: ${workChimeHash})`);

  // Download and verify adhan
  const adhan = await fetchAdhan();
  const adhanHash = crypto.createHash('sha1').update(adhan).digest('hex');
  for (const dir of allAudioDirs) {
    writeFileSync(resolve(dir, 'adhan.ogg'), adhan);
  }

  // Update asset manifest
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    assets: [
      {
        id: 'gentle-chime',
        filename: 'gentle-chime.wav',
        format: 'audio/wav',
        durationSec: 2.4,
        descriptionAr: 'نغمة هادئة للتنبيه غير اللفظي لأوقات الصلاة والسحور والوضوء',
        license: 'CC0-1.0',
        author: 'Wens Project (Procedurally Generated)',
        sha1: gentleChimeHash
      },
      {
        id: 'work-chime',
        filename: 'work-chime.wav',
        format: 'audio/wav',
        durationSec: 2.0,
        descriptionAr: 'نغمة عمل ثنائية النغمات لانتهاء جلسة التركيز',
        license: 'CC0-1.0',
        author: 'Wens Project (Procedurally Generated)',
        sha1: workChimeHash
      },
      {
        id: 'adhan',
        filename: 'adhan.ogg',
        format: 'audio/ogg; codecs=vorbis',
        durationSec: 154.0,
        descriptionAr: 'تسجيل الأذان الكامل عند اختيار وضع الأذان لصلاة الفريضة',
        license: 'CC0-1.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg',
        author: 'Wikimedia Commons User / Public Domain Dedication',
        sha1: adhanHash
      }
    ]
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  writeFileSync(resolve(root, 'contracts/audio-asset-manifest.json'), manifestJson);
  for (const dir of allAudioDirs) {
    writeFileSync(resolve(dir, 'manifest.json'), manifestJson);
  }

  // Update THIRD_PARTY_NOTICES
  const notices = `# Third-Party Notices & Audio Asset Attributions

## 1. Adhan Audio Recording (\`adhan.ogg\`)
- **Title**: Beautiful adhan
- **Source**: https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg
- **Direct URL**: https://upload.wikimedia.org/wikipedia/commons/b/b0/Beautiful_adhan.ogg
- **License**: Creative Commons CC0 1.0 Universal Public Domain Dedication
- **License URL**: https://creativecommons.org/publicdomain/zero/1.0/
- **Format**: Ogg Vorbis (154.02 seconds)
- **SHA-1**: \`${adhanHash}\`
- **Use in Wens**: Played only when user explicitly selects the "adhan" audio mode for obligatory prayer times. May be stopped instantly at any time.

## 2. Gentle Chime (\`gentle-chime.wav\`)
- **Origin**: Procedurally generated by \`scripts/generate-audio.mjs\` using mathematical synthesis (528Hz harmonic bell with exponential decay).
- **License**: Creative Commons CC0 1.0 Universal (Dedicated to the Public Domain)
- **Format**: 16-bit PCM WAV, 44.1kHz mono (2.4 seconds)
- **SHA-1**: \`${gentleChimeHash}\`

## 3. Work Focus Chime (\`work-chime.wav\`)
- **Origin**: Procedurally generated by \`scripts/generate-audio.mjs\` using mathematical synthesis (two-tone chord transition E5 -> A5).
- **License**: Creative Commons CC0 1.0 Universal (Dedicated to the Public Domain)
- **Format**: 16-bit PCM WAV, 44.1kHz mono (2.0 seconds)
- **SHA-1**: \`${workChimeHash}\`
`;
  writeFileSync(resolve(root, 'THIRD_PARTY_NOTICES.md'), notices);
  console.log('Audio generation and verification completed successfully.');
}

main().catch(err => {
  console.error('Error generating audio:', err);
  process.exit(1);
});
