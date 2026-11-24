# Changelog

All notable changes to **Wens Desktop (`وِنس`)** are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

- Licensed Wens source code and documentation under MIT.
- Switched the overlay’s bundled Quran font to Amiri Quran 1.003 under SIL Open Font License 1.1.

## [1.0.0] — Windows Desktop Release

First production release of **Wens PC (`com.wens.offline`)** uniting the React 19 / TypeScript desktop UI, SQLite v3 local engine, Dynamic Island capsule, Native Win32 Taskbar Widget & Flyout, and Companion Pet.

### Added
- **Unified Desktop UI (`apps/app-ui` → `dist-vnext`)**: Official shipping desktop interface with unified Today hub, Worship center (5 prayers, Qibla compass, missed-prayer & missed-fasting review, Khatma with `KFGQPC Uthmanic Script HAFS`, Adhkar, Hijri calendar), Projects & Ideas full SQLite v3 CRUD, Focus Timer, multi-day History (`السجل`), Creative Studio, Notification Center, and 90-second First-Run Onboarding Wizard with an offline Arabic & international city catalog.
- **Native Win32 Taskbar Strip & Interactive Flyout (`src-tauri/src/taskbar_widget.rs`)**: Lightweight native Win32 GDI widget docked inside `Shell_TrayWnd` displaying next prayer and countdown, with `explorer.exe` restart recovery (`TaskbarCreated`), dynamic DPI scaling (`WM_DPICHANGED`), Windows dark/light theme detection, and an interactive left-click Prayer Flyout popup.
- **Dynamic Island Capsule (`overlay.*`, `island_window.rs`)**: Always-on-top transparent capsule (`Ctrl+Alt+I`, top/bottom orientation) with click-through synchronization, prayer alerts, dhikr cards, opt-in Quran Radio (33 HTTPS stations with fallback), Windows SMTC Media Controller, RAM-only Smart Clipboard, Downloads File Shelf, Camera/Microphone Privacy Dots, Wellbeing (Water tracker, 20-20-20 Eye Care, Welcome Back), and opt-in HTTPS `.ics` Meetings Calendar.
- **Data Safety & Diagnostics**: Native Win32 file-picker JSON Backup/Restore (`pick_backup_save_path`, `pick_backup_open_path`), Factory Reset with automatic `pre-reset-backup.json` snapshot, `ConfirmModal` delete confirmation, `AppErrorBoundary`, 2 MB rotating local logs (`wens.log`) with panic hook, Open Logs Folder action, and sanitized Copy Diagnostics bundle.
- **Release & Signing Tooling**: Portable Cargo build configuration (`.cargo/config.toml` + `run-tauri.mjs`), Authenticode signing & verification script (`scripts/sign-release.ps1` supporting local `.pfx`, Certificate Store, and Azure Trusted Signing), [`PRIVACY.md`](PRIVACY.md), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

### Changed
- **Storage Engine (`SQLite v3`)**: Upgraded schema to v3 (`daily_worship_logs`, `work_session_records`, `domain_kv_store`, project `goal`) with automatic v1/v2 → v3 migration, single shared guarded connection (`with_database`), in-memory preferences cache (`get_cached_preferences`), `WAL` + `busy_timeout(5000ms)` + `BEGIN IMMEDIATE` atomic transactions, and automatic corrupt-DB quarantine/recovery.
- **Safe Fresh-Install Defaults**: Disabled fasting/Suhoor wake alarms (`fasting_enabled = false`, `prevent_sleep_for_suhoor = false`) on fresh installs so Wens never triggers unexpected night alarms or blocks Windows sleep unless explicitly opted in.
- **Release Binary Size**: Enabled `[profile.release]` (`strip = "symbols"`, `lto = "thin"`, `opt-level = "s"`, `codegen-units = 1`) and unified Common Controls v6 manifest embedding (`0` `.rsrc` warnings), reducing `wens-desktop.exe` from `38.50 MB` to `13.17 MB` (`-65.8%`) and the NSIS installer to `8.25 MB`.
- **Portable Build Layout**: Removed hardcoded `D:/cargo-target-wens` from `.cargo/config.toml` so builds work out of the box on any Windows machine or CI runner, while `run-tauri.mjs` preserves local cache reuse when `D:\cargo-target-wens` exists and `CARGO_TARGET_DIR` is unset.

### Fixed
- **Idle CPU, Thread & Handle Exhaustion (`media_smtc.rs`, `island_window.rs`, `taskbar_widget.rs`)**: Initialized COM MTA once per worker thread, reused the WinRT SMTC `SessionManager` with backoff instead of polling `RequestAsync().get()` every 800ms, eliminated per-tick SQLite opens, paused hidden overlay/pet timers and CSS animations, and added coordinated clean shutdown via `ShutdownState`.
- **Prayer Time Math & Extreme Coordinates (`prayer.rs`, `astronomy.ts`, `shared.js`)**: Normalized all 18 calculation method IDs/aliases, wired Hanafi/Standard Asr, fixed per-date IANA timezone/DST calculation (including Cairo DST and Southern Hemisphere cities like Sydney), guarded `0°`/`NaN`/`Infinity` coordinates, and added polar/high-latitude fallback guaranteeing strictly ordered daily prayer times.
- **Companion Pet (`pet.*`, `companion-sounds.js`, `lib.rs`)**: Fixed `SyntaxError` in `companion-sounds.js`, extracted exact prayer name from active reminder payloads, compacted `.wens-context-menu` so all 8 menu items fit cleanly at `360×260`, unified physical multi-monitor drag/restore coordinates across mixed DPIs, and wired `work_session_save` + `daily_worship_set` directly to SQLite v3.
- **Scheduler, Sleep Prevention & Audio (`lib.rs`)**: Restricted `SetThreadExecutionState` to the single scheduler thread so sleep inhibition is reliably cleared on dismiss/exit, respected Quiet Hours consistently, reopened `rodio::OutputStream` per playback to survive audio device changes, and prevented `control_media("pause")` from toggling paused media back on.
- **UI Resilience, Accessibility & Layout (`apps/app-ui`)**: Guarded all `localStorage` reads/writes against corrupt payloads and `QuotaExceededError`, fixed Settings clipping at `760×600` and `200%` zoom via `@container` queries, achieved WCAG AA contrast across light theme `dawn-sand`, fixed Notification Bell icon sizing, restored native context menu inside `<input>`/`<textarea>`, eliminated inline `<script>` CSP violations, and made Quran Radio load/stall states cancelable with automatic HTTPS fallback.

### Security
- **Dynamic Island XSS Elimination (`overlay.js`)**: Replaced unescaped `innerHTML` rendering in Smart Clipboard, `.ics` Meetings, and Downloads Shelf with safe DOM/textContent construction and strict `https://` URL validation.
- **SSRF & RFC 5545 Hardening (`calendar_ics.rs`)**: Enforced `https://`-only calendar feeds, blocked loopback/RFC1918/link-local/CGNAT/IPv6 private addresses across DNS resolution and redirects (max 3 hops), enforced `10s` timeout and `2 MB` body cap, and enforced `Strict Offline` mode.
- **File Shelf & Backup Path Hardening (`shelf_downloads.rs`, `storage.rs`)**: Restricted File Shelf opening to canonicalized files inside the user's `Downloads` directory and restricted Backup/Restore to `.json`/`.wensbackup` paths outside Windows/Program Files/UNC directories with a `25 MB` read cap.
- **Clipboard Privacy (`smart_clipboard.rs`)**: Enforced a `64 KB` read cap, kept clipboard history strictly in volatile RAM, and honored Windows password-manager clipboard exclusion formats (`CanIncludeInClipboardHistory = 0`, `ExcludeClipboardContentFromMonitorProcessing`).
- **Cryptography & `.wenspack` Hardening (`lan.rs`, `module-runtime`)**: Switched LAN `ChaCha20-Poly1305` frames to per-message random 12-byte nonces from `OsRng`, enforced canonical Ed25519 signing over `(manifest.json + content_hash)`, blocked Zip Bombs via bounded streaming decompression, and rejected script/shortcut/NTFS ADS archive entries.
- **HTTPS-Only Radio Streams (`island-data.js`)**: Upgraded remaining `http://` Quran radio URLs to `https://` across all 33 stations.

---

## [0.4.x] — Transitional Foundations (Historical)
- **0.4.7**: Added opt-in developer/user challenges (`.wenschallenge.json` v1) and fixed experimental Android debug build cross-compilation issues.
- **0.4.4 – 0.4.5**: Added missed-prayer review, missed-fasting log, Quran Khatma/Adhkar tracking, and Hijri occasion reminders.
- **0.4.0 – 0.4.2**: Introduced Cargo workspace (`wens-core`, `wens-module-runtime`, `src-tauri`), SQLite v2 normalized storage, React/TypeScript vNext preview, and Cairo official prayer regression suite.
