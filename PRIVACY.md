# Wens PC Privacy Policy & Local-Only Architecture (`PRIVACY.md`)

**Version:** 1.0.0  
**Effective Scope:** Wens Desktop for Windows (`com.wens.offline`)

Wens (وِنس) is built from the ground up as a **local-first, offline-capable desktop companion**. We do not operate user accounts, cloud servers, telemetry pipelines, crash-reporting beacons, or advertising trackers.

---

## 1. Zero Telemetry & Zero Cloud Sync

- **No accounts or sign-in:** Wens never asks for an email address, phone number, or account registration.
- **No analytics or telemetry:** Wens sends zero usage metrics, diagnostics, or crash reports over the network.
- **Local storage:** Wens keeps prayer logs, fasting records, Khatma progress, notes, projects, ideas, sessions, drafts, and preferences on your PC. Its SQLite v3 database is at `%APPDATA%\com.wens.offline\wens.sqlite3` or under `%LOCALAPPDATA%`, depending on Windows configuration. Some settings and interface caches also live in the local WebView profile.
- **User-controlled backups:** Backup export/restore writes and reads plain `.json` files strictly to paths explicitly chosen by you via the Windows File Picker.

---

## 2. How Every Dynamic Island & Desktop Module Handles Data

Wens includes optional productivity and worship widgets integrated into the Dynamic Island capsule, floating companion, and Windows taskbar strip. Every module can be toggled off independently in **Settings → Dynamic Island (الكبسولة الذكية)**:

| Module | What It Reads | Storage & Persistence | Network Activity |
|---|---|---|---|
| **Prayer Times & Qibla Engine** | Your manually selected city or latitude/longitude coordinates | Saved locally in SQLite v3 | **None (100% offline solar calculation)** |
| **Media Controller (Windows SMTC)** | Now-playing track title, artist, and playback state from Windows Global System Media Transport Controls | Held transiently in memory only; never written to disk | **None** |
| **Smart Clipboard** | When enabled, keeps up to ten recent clipboard text entries and can calculate expressions or preview colors. Turn it off in Dynamic Island settings | History stays in memory and clears when Wens exits or when you click Clear. Wens skips entries carrying the Windows `CanIncludeInClipboardHistory = 0` or `ExcludeClipboardContentFromMonitorProcessing` flags. Whether a password manager sets those flags depends on that app | **None** |
| **File Shelf & Downloads Watcher** | Filenames and sizes of active browser downloads in your local Windows `Downloads` folder | Local path metadata in memory; opening files is strictly restricted to canonicalized files inside your `Downloads` directory | **None** |
| **Camera & Microphone Privacy Dots** | Read-only check of Windows CapabilityAccessManager registry keys (`LastUsedTimeStop == 0`) to detect whether an app is actively using your camera or microphone | Transient status in memory only. Wens **never** accesses, records, or opens your camera or microphone stream | **None** |
| **Wellbeing (Water Tracker & 20-20-20 Eye Care)** | Windows idle duration (`GetLastInputInfo`) to pause reminders while you are away and track daily water cup count | Water cup count saved locally in SQLite v3 | **None** |
| **Meetings Calendar (iCal / `.ics`)** | **Opt-in only:** fetches an `https://` iCal feed URL only if you explicitly paste one in Settings | Parsed in memory to display today's upcoming meetings. Private/loopback network addresses and arbitrary local file reads are blocked to prevent SSRF; only `https://` meeting links are accepted | **Optional HTTPS GET** to your configured calendar URL (disabled in Strict Offline mode) |
| **Quran Radio Live Streams** | **Opt-in only:** connects to public HTTPS Quran radio streams (`*.qurango.net`, `*.radiojar.com`, `*.mp3quran.net`) strictly when you press Play | Station preference saved locally in SQLite v3 | **Optional HTTPS audio stream** (blocked immediately in Strict Offline mode) |

---

## 3. Strict Offline Mode (`strictOffline`)

When you enable **Strict Offline Mode (الوضع الصارم بدون شبكة)** in Settings:
1. Wens stops its Quran Radio players and blocks new playback.
2. External iCal calendar fetches are disabled. In-flight fetches are canceled and their pending results are discarded.
3. Prayer calculations, Qibla compass, Hijri calendar, notifications, audio alerts (Adhan/chimes), Dynamic Island local tools, Taskbar strip, Projects, Ideas, Focus Timer, Studio, and History continue working **100% offline**.

This setting controls Wens features. Windows, the WebView2 runtime, and applications you open separately control their own network activity. The experimental CLI connector commands are outside the release interface. If used in a development integration, they are disabled in Strict Offline mode. The CLI provider governs any processing while those commands are enabled.

---

## 4. Diagnostics & Data Erasure

- **Logs:** Local application logs stay on your machine. You can inspect them at any time via **Settings → Open Logs Folder (فتح مجلد السجلات)**.
- **Diagnostics Bundle:** Clicking **Copy Diagnostics (نسخ تقرير التشخيص)** copies a local JSON summary (app version, OS/runtime info, non-sensitive config flags) to your clipboard only when you request it — it is never transmitted automatically.
- **Factory Reset:** Use **Settings → Factory Reset (إعادة ضبط المصنع)** to clear active local records and preferences. This removes any old automatic pre-reset snapshot. Explicit exports, diagnostic logs, and historical migration or database recovery files remain on disk. To remove those files too, close Wens and delete its AppData directory and any exports you saved elsewhere.
