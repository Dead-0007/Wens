use serde::Serialize;
use std::sync::atomic::AtomicBool;
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
#[cfg(target_os = "windows")]
use std::sync::{Mutex, OnceLock};
#[cfg(target_os = "windows")]
use std::thread;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};
use tauri::AppHandle;
#[cfg(target_os = "windows")]
use tauri::Emitter;

#[cfg(target_os = "windows")]
static SELECTED_SESSION_OFFSET: AtomicUsize = AtomicUsize::new(0);
#[cfg(target_os = "windows")]
static CACHED_MEDIA: OnceLock<Mutex<MediaSessionInfo>> = OnceLock::new();

#[cfg(target_os = "windows")]
fn cached_media_lock() -> &'static Mutex<MediaSessionInfo> {
    CACHED_MEDIA.get_or_init(|| Mutex::new(MediaSessionInfo::default()))
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
pub struct MediaSessionInfo {
    pub has_session: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub source_app: String,
    pub is_playing: bool,
    pub position_seconds: u64,
    pub duration_seconds: u64,
    pub session_count: usize,
}

#[cfg(target_os = "windows")]
struct ComGuard {
    should_uninit: bool,
}

#[cfg(target_os = "windows")]
impl ComGuard {
    fn init_mta() -> Self {
        #[link(name = "ole32")]
        extern "system" {
            fn CoInitializeEx(pv_reserved: *mut core::ffi::c_void, dw_co_init: u32) -> i32;
        }
        const COINIT_MULTITHREADED: u32 = 0x0;
        const S_OK: i32 = 0;
        const S_FALSE: i32 = 1;

        let hr = unsafe { CoInitializeEx(std::ptr::null_mut(), COINIT_MULTITHREADED) };
        Self {
            should_uninit: hr == S_OK || hr == S_FALSE,
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninit {
            #[link(name = "ole32")]
            extern "system" {
                fn CoUninitialize();
            }
            unsafe {
                CoUninitialize();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn sleep_interruptible(total: Duration, stop_flag: &AtomicBool) {
    let step = Duration::from_millis(250);
    let mut remaining = total;
    while !remaining.is_zero() && !stop_flag.load(Ordering::Relaxed) {
        let chunk = remaining.min(step);
        thread::sleep(chunk);
        remaining = remaining.saturating_sub(chunk);
    }
}

#[cfg(target_os = "windows")]
fn friendly_app_name(raw_id: &str) -> String {
    let lower = raw_id.to_lowercase();
    if lower.contains("spotify") {
        "Spotify".to_string()
    } else if lower.contains("chrome") {
        "Chrome".to_string()
    } else if lower.contains("msedge") || lower.contains("edge") {
        "Edge".to_string()
    } else if lower.contains("brave") {
        "Brave".to_string()
    } else if lower.contains("firefox") || lower.contains("308046b0af4a39cb") {
        "Firefox".to_string()
    } else if lower.contains("opera") {
        "Opera".to_string()
    } else if lower.contains("vivaldi") {
        "Vivaldi".to_string()
    } else if lower.contains("vlc") {
        "VLC".to_string()
    } else if lower.contains("applemusic") || lower.contains("itunes") {
        "Apple Music".to_string()
    } else if lower.contains("zunemusic")
        || lower.contains("mediaplayer")
        || lower.contains("wmplayer")
    {
        "Media Player".to_string()
    } else if lower.contains("potplayer") {
        "PotPlayer".to_string()
    } else if lower.contains("mpc-hc") || lower.contains("mpc-be") {
        "MPC".to_string()
    } else if lower.contains("telegram") {
        "Telegram".to_string()
    } else if lower.contains("discord") {
        "Discord".to_string()
    } else if lower.contains("whatsapp") {
        "WhatsApp".to_string()
    } else if lower.contains("soundcloud") {
        "SoundCloud".to_string()
    } else if lower.contains("anghami") {
        "Anghami".to_string()
    } else if lower.contains("foobar") {
        "Foobar2000".to_string()
    } else if lower.contains("winamp") {
        "Winamp".to_string()
    } else {
        let cleaned = raw_id
            .rsplit(['\\', '/', '!'])
            .next()
            .unwrap_or(raw_id)
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE");
        if cleaned.is_empty() {
            "مشغل النظام".to_string()
        } else {
            cleaned.to_string()
        }
    }
}

#[cfg(target_os = "windows")]
fn read_session_details(
    session: &windows::Media::Control::GlobalSystemMediaTransportControlsSession,
) -> MediaSessionInfo {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    let mut info = MediaSessionInfo {
        has_session: true,
        ..Default::default()
    };

    if let Ok(source_id) = session.SourceAppUserModelId() {
        info.source_app = friendly_app_name(&source_id.to_string());
    }

    if let Ok(info_op) = session.GetPlaybackInfo() {
        if let Ok(status) = info_op.PlaybackStatus() {
            info.is_playing =
                status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing;
        }
    }

    if let Ok(props_op) = session.TryGetMediaPropertiesAsync() {
        if let Ok(props) = props_op.get() {
            info.title = props
                .Title()
                .map(|s| s.to_string().trim().to_string())
                .unwrap_or_default();
            info.artist = props
                .Artist()
                .map(|s| s.to_string().trim().to_string())
                .unwrap_or_default();
            info.album = props
                .AlbumTitle()
                .map(|s| s.to_string().trim().to_string())
                .unwrap_or_default();
        }
    }

    if let Ok(timeline) = session.GetTimelineProperties() {
        if let Ok(pos) = timeline.Position() {
            if pos.Duration > 0 {
                info.position_seconds = (pos.Duration / 10_000_000) as u64;
            }
        }
        if let Ok(end) = timeline.EndTime() {
            if end.Duration > 0 {
                info.duration_seconds = (end.Duration / 10_000_000) as u64;
            }
        }
    }

    info
}

#[cfg(target_os = "windows")]
fn find_fallback_window_media() -> Option<MediaSessionInfo> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    struct WindowCandidate {
        title: String,
        artist: String,
        source_app: String,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == std::process::id() {
            return 1;
        }

        // GetWindowTextW reads kernel-stored caption directly for other processes (no WM_GETTEXT IPC hang).
        let mut buf = [0u16; 256];
        let written = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if written <= 0 || (written as usize) >= buf.len() {
            return 1;
        }

        let raw_text = String::from_utf16_lossy(&buf[..written as usize]);
        let text: String = raw_text
            .chars()
            .filter(|&c| c != '\u{200e}' && c != '\u{200f}' && c != '\u{200b}')
            .collect();
        let text = text.trim();
        if text.is_empty() {
            return 1;
        }

        let candidates = &mut *(lparam as *mut Vec<WindowCandidate>);

        let media_markers = [
            (" - YouTube Music", "YouTube Music"),
            (" - YouTube", "YouTube"),
            (" - SoundCloud", "SoundCloud"),
            (" - Anghami", "Anghami"),
            (" | أنغامي", "Anghami"),
            (" - VLC media player", "VLC"),
            (" - PotPlayer", "PotPlayer"),
            (" - Media Player Classic", "MPC"),
            (" - Twitch", "Twitch"),
            (" - Spotify", "Spotify"),
        ];

        for (marker, app_label) in &media_markers {
            if let Some((track_part, _rest)) = text.split_once(marker) {
                let mut track = track_part
                    .trim()
                    .trim_start_matches('▶')
                    .trim_start_matches("🔊")
                    .trim();
                if track.starts_with('(') {
                    if let Some(close_idx) = track.find(')') {
                        let inside = &track[1..close_idx];
                        if !inside.is_empty() && inside.chars().all(|c| c.is_ascii_digit()) {
                            track = track[close_idx + 1..].trim();
                        }
                    }
                }
                if !track.is_empty() && track != "YouTube" && track != "SoundCloud" {
                    let (artist, song) = if let Some((a, b)) = track.split_once(" - ") {
                        (a.trim().to_string(), b.trim().to_string())
                    } else {
                        (app_label.to_string(), track.to_string())
                    };
                    candidates.push(WindowCandidate {
                        title: song,
                        artist,
                        source_app: app_label.to_string(),
                    });
                    // Stop enumeration as soon as we have our first valid candidate
                    return 0;
                }
            }
        }

        1
    }

    let mut candidates: Vec<WindowCandidate> = Vec::with_capacity(1);
    unsafe {
        EnumWindows(
            Some(enum_proc),
            &mut candidates as *mut Vec<WindowCandidate> as LPARAM,
        );
    }

    candidates.into_iter().next().map(|c| MediaSessionInfo {
        has_session: true,
        title: c.title,
        artist: c.artist,
        album: String::new(),
        source_app: c.source_app,
        is_playing: true,
        position_seconds: 0,
        duration_seconds: 0,
        session_count: 1,
    })
}

#[cfg(target_os = "windows")]
fn collect_sorted_sessions_from_manager(
    manager: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
) -> Result<
    Vec<(
        windows::Media::Control::GlobalSystemMediaTransportControlsSession,
        MediaSessionInfo,
    )>,
    String,
> {
    let sessions_res = manager.GetSessions();
    let current_res = manager.GetCurrentSession();

    // If both GetSessions and GetCurrentSession fail with COM/WinRT error, signal caller to re-acquire manager.
    if let (Err(err), Err(_)) = (&sessions_res, &current_res) {
        return Err(err.to_string());
    }

    let current_aumid = current_res
        .as_ref()
        .ok()
        .and_then(|s| s.SourceAppUserModelId().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let mut list = Vec::new();

    if let Ok(sessions) = sessions_res {
        let count = sessions.Size().unwrap_or(0);
        for i in 0..count {
            if let Ok(session) = sessions.GetAt(i) {
                let info = read_session_details(&session);
                list.push((session, info));
            }
        }
    }

    if list.is_empty() {
        if let Ok(session) = current_res {
            let info = read_session_details(&session);
            list.push((session, info));
        }
    }

    list.sort_by(|(s_a, a), (s_b, b)| {
        let a_cur = s_a
            .SourceAppUserModelId()
            .map(|id| id.to_string() == current_aumid)
            .unwrap_or(false);
        let b_cur = s_b
            .SourceAppUserModelId()
            .map(|id| id.to_string() == current_aumid)
            .unwrap_or(false);

        let score = |info: &MediaSessionInfo, is_cur: bool| -> u8 {
            match (info.is_playing, !info.title.is_empty(), is_cur) {
                (true, true, true) => 6,
                (true, true, false) => 5,
                (true, false, _) => 4,
                (false, true, true) => 3,
                (false, true, false) => 2,
                (false, false, true) => 1,
                (false, false, false) => 0,
            }
        };

        score(b, b_cur).cmp(&score(a, a_cur))
    });

    let valid_count = list
        .iter()
        .filter(|(_, info)| info.is_playing || !info.title.is_empty())
        .count();
    if valid_count > 0 {
        list.retain(|(_, info)| info.is_playing || !info.title.is_empty());
    }

    Ok(list)
}

#[cfg(target_os = "windows")]
fn acquire_smtc_manager(
) -> Result<windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager, String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;

    let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?;
    async_op.get().map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
pub fn get_current_media_session() -> MediaSessionInfo {
    cached_media_lock()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[cfg(not(target_os = "windows"))]
pub fn get_current_media_session() -> MediaSessionInfo {
    MediaSessionInfo::default()
}

#[cfg(target_os = "windows")]
fn send_hardware_media_key(command: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        keybd_event, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_MEDIA_NEXT_TRACK,
        VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
    };

    // NEVER send VK_MEDIA_PLAY_PAUSE for "pause" or "play" — it toggles paused players into playing!
    // Only explicit user toggle ("play_pause" / "toggle") or dedicated non-toggling track keys are allowed.
    let vk = match command {
        "play_pause" | "toggle" => VK_MEDIA_PLAY_PAUSE as u8,
        "next" => VK_MEDIA_NEXT_TRACK as u8,
        "previous" => VK_MEDIA_PREV_TRACK as u8,
        _ => return Ok(()),
    };

    unsafe {
        keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, 0);
        keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn control_media(command: &str) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

    if command == "switch_session" {
        SELECTED_SESSION_OFFSET.fetch_add(1, Ordering::Relaxed);
        return Ok(());
    }

    if !matches!(
        command,
        "play" | "pause" | "toggle" | "play_pause" | "next" | "previous"
    ) {
        return Err("Invalid media command".into());
    }

    let _com = ComGuard::init_mta();

    let sessions = match acquire_smtc_manager()
        .and_then(|mgr| collect_sorted_sessions_from_manager(&mgr))
    {
        Ok(list) => list,
        Err(_) => Vec::new(),
    };

    // P0-8: Explicit "pause" MUST verify PlaybackStatus == Playing BEFORE TryPauseAsync()
    // and MUST NEVER fall back to VK_MEDIA_PLAY_PAUSE (which would unpause paused music during Adhan!).
    if command == "pause" {
        for (session, _) in &sessions {
            let is_actively_playing = session
                .GetPlaybackInfo()
                .and_then(|info| info.PlaybackStatus())
                .map(|st| st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                .unwrap_or(false);

            if is_actively_playing {
                let _ = session.TryPauseAsync().and_then(|op| op.get());
            }
        }
        return Ok(());
    }

    if !sessions.is_empty() {
        let offset = SELECTED_SESSION_OFFSET.load(Ordering::Relaxed);
        let idx = offset % sessions.len();
        let (session, _) = &sessions[idx];

        let res = match command {
            "play" => session.TryPlayAsync().and_then(|op| op.get()),
            "toggle" | "play_pause" => session.TryTogglePlayPauseAsync().and_then(|op| op.get()),
            "next" => session.TrySkipNextAsync().and_then(|op| op.get()),
            "previous" => session.TrySkipPreviousAsync().and_then(|op| op.get()),
            _ => return Err("Invalid media command".into()),
        };

        if let Ok(true) = res {
            return Ok(());
        }
    }

    // Only explicit user toggle ("play_pause" / "toggle") and track skip may fall back to hardware keys.
    match command {
        "play_pause" | "toggle" | "next" | "previous" => send_hardware_media_key(command),
        _ => Ok(()),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn control_media(_command: &str) -> Result<(), String> {
    Err("Media controls unsupported on this OS".into())
}

#[cfg(target_os = "windows")]
fn media_state_changed(a: &MediaSessionInfo, b: &MediaSessionInfo) -> bool {
    a.has_session != b.has_session
        || a.title != b.title
        || a.artist != b.artist
        || a.source_app != b.source_app
        || a.is_playing != b.is_playing
        || a.session_count != b.session_count
}

#[cfg(target_os = "windows")]
pub fn start_media_monitor(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::Builder::new()
        .name("wens-media-smtc".to_string())
        .spawn(move || {
            // Initialize COM MTA ONCE for the lifetime of this monitor thread (ComGuard calls CoUninitialize on exit).
            let _com = ComGuard::init_mta();

            let mut cached_manager: Option<
                windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager,
            > = None;
            let mut backoff_secs: u64 = 2;
            let mut next_acquire_at = Instant::now();
            let mut logged_acquire_error = false;

            let mut last_state = MediaSessionInfo::default();
            let mut last_fallback_scan = Instant::now() - Duration::from_secs(10);
            let mut cached_fallback: Option<MediaSessionInfo> = None;

            while !stop_flag.load(Ordering::Relaxed) {
                let prefs = crate::storage::get_cached_preferences(&app);
                let enabled = prefs.media_pill_enabled
                    && crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    && !crate::island_blocked();

                if !enabled {
                    if !prefs.media_pill_enabled && last_state.has_session {
                        let empty = MediaSessionInfo::default();
                        *cached_media_lock()
                            .lock()
                            .unwrap_or_else(|e| e.into_inner()) = empty.clone();
                        let _ = app.emit("wens-media-update", &empty);
                        last_state = empty;
                    }
                    sleep_interruptible(Duration::from_millis(2000), &stop_flag);
                    continue;
                }

                // Acquire SMTC SessionManager ONCE and reuse across all iterations (re-acquire only on error with backoff 2s->10s).
                if cached_manager.is_none() && Instant::now() >= next_acquire_at {
                    match acquire_smtc_manager() {
                        Ok(mgr) => {
                            cached_manager = Some(mgr);
                            backoff_secs = 2;
                            logged_acquire_error = false;
                        }
                        Err(err) => {
                            if !logged_acquire_error {
                                crate::storage::log_line(
                                    "WARN",
                                    "media_smtc",
                                    &format!("SMTC manager acquisition failed (will retry with backoff): {err}"),
                                );
                                logged_acquire_error = true;
                            }
                            next_acquire_at = Instant::now() + Duration::from_secs(backoff_secs);
                            backoff_secs = (backoff_secs * 2).min(10);
                        }
                    }
                }

                let mut current = MediaSessionInfo::default();
                let mut smtc_had_session = false;

                if let Some(ref mgr) = cached_manager {
                    match collect_sorted_sessions_from_manager(mgr) {
                        Ok(sessions) => {
                            let total = sessions.len();
                            if total > 0 {
                                smtc_had_session = true;
                                let offset = SELECTED_SESSION_OFFSET.load(Ordering::Relaxed);
                                let idx = offset % total;
                                let (_, mut chosen) = sessions[idx].clone();
                                chosen.session_count = total;

                                if chosen.title.is_empty() {
                                    if last_fallback_scan.elapsed() >= Duration::from_secs(5) {
                                        cached_fallback = find_fallback_window_media();
                                        last_fallback_scan = Instant::now();
                                    }
                                    if let Some(ref fallback) = cached_fallback {
                                        chosen.title = fallback.title.clone();
                                        if chosen.artist.is_empty() {
                                            chosen.artist = fallback.artist.clone();
                                        }
                                    } else if !chosen.source_app.is_empty() {
                                        chosen.title = format!("مقطع صوتي ({})", chosen.source_app);
                                    }
                                }

                                if chosen.artist.is_empty() {
                                    chosen.artist = if !chosen.source_app.is_empty() {
                                        chosen.source_app.clone()
                                    } else {
                                        "تشغيل النظام".to_string()
                                    };
                                }

                                if !chosen.title.is_empty() {
                                    current = chosen;
                                }
                            }
                        }
                        Err(err) => {
                            crate::storage::log_line(
                                "WARN",
                                "media_smtc",
                                &format!("SMTC session query failed, resetting cached manager: {err}"),
                            );
                            cached_manager = None;
                            next_acquire_at = Instant::now() + Duration::from_secs(backoff_secs);
                            backoff_secs = (backoff_secs * 2).min(10);
                        }
                    }
                }

                // Rare fallback window title scan (at most once every 5s) only when SMTC has no session
                if !smtc_had_session {
                    if last_fallback_scan.elapsed() >= Duration::from_secs(5) {
                        cached_fallback = find_fallback_window_media();
                        last_fallback_scan = Instant::now();
                    }
                    if let Some(ref fallback) = cached_fallback {
                        current = fallback.clone();
                    }
                }

                *cached_media_lock()
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = current.clone();

                // Emit ONLY when observable media state actually changes
                if media_state_changed(&current, &last_state) {
                    let _ = app.emit("wens-media-update", &current);
                    last_state = current.clone();
                }

                // Poll every 1500ms when a session is active, 2500ms when idle
                let delay = if current.has_session {
                    Duration::from_millis(1500)
                } else {
                    Duration::from_millis(2500)
                };
                sleep_interruptible(delay, &stop_flag);
            }
        })
        .ok();
}

#[cfg(not(target_os = "windows"))]
pub fn start_media_monitor(_app: AppHandle, _stop_flag: Arc<AtomicBool>) {}
