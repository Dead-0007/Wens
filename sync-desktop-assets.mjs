import { access, mkdir, copyFile, cp } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// 1. Build Wens vNext official interface into dist-vnext
console.log('Building Wens vNext desktop frontend...');
execSync('npm run build:vnext', { cwd: root, stdio: 'inherit' });

// 2. Sync companion (pet.*) and prayer overlay (overlay.*) into dist-vnext
const destination = resolve(root, 'dist-vnext');
await mkdir(destination, { recursive: true });

const syncFiles = [
  'pet.html',
  'pet.css',
  'pet.js',
  'overlay.html',
  'overlay.css',
  'overlay.js',
  'shared.js',
  'companion-sounds.js',
  'island-data.js',
];

const publicDestination = resolve(root, 'desktop-shell/public');
await mkdir(publicDestination, { recursive: true });

for (const file of syncFiles) {
  await copyFile(resolve(root, file), resolve(destination, file));
  await copyFile(resolve(root, file), resolve(publicDestination, file));
  try {
    await copyFile(resolve(root, file), resolve(root, 'dist', file));
  } catch {}
}

// Ensure desktop-shell/public/shared.js is kept in sync and copied to dist-vnext
await copyFile(resolve(root, 'shared.js'), resolve(root, 'desktop-shell/public/shared.js'));
await copyFile(resolve(root, 'desktop-shell/public/shared.js'), resolve(destination, 'shared.js'));

// 3. Ensure audio directory + strong-alarm.wav are synced into both desktop-shell/public/audio and dist-vnext/audio
const audioPublicDest = resolve(publicDestination, 'audio');
const audioDest = resolve(destination, 'audio');
await mkdir(audioPublicDest, { recursive: true });
await mkdir(audioDest, { recursive: true });

const tauriAudioSrc = resolve(root, 'src-tauri/assets/audio');
if (await fileExists(tauriAudioSrc)) {
  await cp(tauriAudioSrc, audioPublicDest, { recursive: true });
}
const strongAlarmCandidates = [
  resolve(root, 'src-tauri/assets/audio/strong-alarm.wav'),
  resolve(root, 'audio/strong-alarm.wav'),
];
for (const candidate of strongAlarmCandidates) {
  if (await fileExists(candidate)) {
    await copyFile(candidate, resolve(audioPublicDest, 'strong-alarm.wav'));
    break;
  }
}
await cp(audioPublicDest, audioDest, { recursive: true });

// 4. Ensure icons/icon.png is synced into both desktop-shell/public/icons and dist-vnext/icons
const iconSrc = resolve(root, 'src-tauri/icons/icon.png');
if (await fileExists(iconSrc)) {
  const iconsPublicDest = resolve(publicDestination, 'icons');
  const iconsDest = resolve(destination, 'icons');
  await mkdir(iconsPublicDest, { recursive: true });
  await mkdir(iconsDest, { recursive: true });
  await copyFile(iconSrc, resolve(iconsPublicDest, 'icon.png'));
  await copyFile(iconSrc, resolve(iconsDest, 'icon.png'));
}

// 5. Ensure fonts directory is synced into dist-vnext/fonts and desktop-shell/public/fonts
const fontsSrc = resolve(root, 'fonts');
if (await fileExists(fontsSrc)) {
  const fontsDest = resolve(destination, 'fonts');
  await mkdir(fontsDest, { recursive: true });
  await cp(fontsSrc, fontsDest, { recursive: true });
  const fontsPublicDest = resolve(publicDestination, 'fonts');
  await mkdir(fontsPublicDest, { recursive: true });
  await cp(fontsSrc, fontsPublicDest, { recursive: true });
}

console.log(`Synced desktop assets to ${destination}`);
