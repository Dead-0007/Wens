import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (!args.length) throw new Error('Usage: node run-tauri.mjs <dev|build> [options]');

const candidates = [
  process.env.TAURI_CLI,
  process.platform === 'win32' && process.env.USERPROFILE ? join(process.env.USERPROFILE, '.cargo', 'bin', 'cargo-tauri.exe') : null,
  'cargo-tauri'
].filter(Boolean);
const executable = candidates.find((candidate) => candidate === 'cargo-tauri' || existsSync(candidate));
if (!executable) throw new Error('Tauri CLI not found. Install it with: cargo install tauri-cli --version "^2.0.0" --locked');

const env = { ...process.env };
if (!env.CARGO_TARGET_DIR && process.platform === 'win32' && existsSync('D:\\cargo-target-wens')) {
  env.CARGO_TARGET_DIR = 'D:/cargo-target-wens';
}

const result = spawnSync(executable, args, { stdio: 'inherit', shell: false, env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
