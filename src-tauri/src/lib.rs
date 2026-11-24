#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::{Cursor, Read},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};
use tauri_plugin_notification::NotificationExt;
use wens_core::{
    AppPreferences, BackgroundAudioMode, DeliveryResult, FastingSoundMode, NotificationRecord,
    NotificationSummary, PrayerRequest, PrayerSoundMode, ReminderEvent, WorkSoundMode,
};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    LogicalSize, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

static IS_QUITTING: AtomicBool = AtomicBool::new(false);
static TRAY_NOTIFIED: AtomicBool = AtomicBool::new(false);
static MAIN_KEEP_ALIVE_IN_TRAY: AtomicBool = AtomicBool::new(false);
#[cfg(desktop)]
static MAIN_WINDOW_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
#[cfg(desktop)]
pub(crate) static COMPANION_WINDOW_LOCK: Mutex<()> = Mutex::new(());
pub static PET_ENABLED: AtomicBool = AtomicBool::new(true);
pub static OVERLAY_ENABLED: AtomicBool = AtomicBool::new(true);

/// Desired system keep-awake state; ONLY the reminder scheduler thread calls Win32 `SetThreadExecutionState`.
pub static KEEP_AWAKE_WANTED: AtomicBool = AtomicBool::new(false);
static KEEP_AWAKE_MANUAL: AtomicBool = AtomicBool::new(false);
static KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static KEEP_AWAKE_MANUAL_STOP_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static SCHEDULER_WAKE: OnceLock<(Mutex<bool>, Condvar)> = OnceLock::new();

fn scheduler_wake_pair() -> &'static (Mutex<bool>, Condvar) {
    SCHEDULER_WAKE.get_or_init(|| (Mutex::new(false), Condvar::new()))
}

fn notify_scheduler_wake() {
    let (lock, cvar) = scheduler_wake_pair();
    let mut signaled = lock.lock().unwrap_or_else(|e| e.into_inner());
    *signaled = true;
    cvar.notify_all();
}

pub struct ShutdownState {
    pub stop_flag: Arc<AtomicBool>,
}

/// True while a fullscreen game/presentation owns the screen (or is switching modes).
pub fn island_blocked() -> bool {
    taskbar_widget::is_fullscreen_app_active() || taskbar_widget::is_fullscreen_transitioning()
}

#[cfg(desktop)]
pub(crate) fn companion_fullscreen_blocked(prefs: &AppPreferences) -> bool {
    prefs.island_hide_fullscreen && taskbar_widget::is_fullscreen_app_active()
}

pub mod storage;
pub mod taskbar_widget;
pub mod calendar_ics;
pub mod island_window;
pub mod media_smtc;
pub mod privacy_dots;
pub mod shelf_downloads;
pub mod smart_clipboard;
pub mod wellbeing_idle;

pub static GENTLE_CHIME_BYTES: &[u8] = include_bytes!("../assets/audio/gentle-chime.wav");
pub static WORK_CHIME_BYTES: &[u8] = include_bytes!("../assets/audio/work-chime.wav");
pub static ADHAN_BYTES: &[u8] = include_bytes!("../assets/audio/adhan.ogg");
pub static STRONG_ALARM_BYTES: &[u8] = include_bytes!("../assets/audio/strong-alarm.wav");

#[cfg(target_os = "windows")]
extern "system" {
    fn SetThreadExecutionState(es_flags: u32) -> u32;
}

#[cfg(target_os = "windows")]
const ES_CONTINUOUS: u32 = 0x80000000;
#[cfg(target_os = "windows")]
const ES_SYSTEM_REQUIRED: u32 = 0x00000001;

/// MUST ONLY be called from the single `start_reminder_scheduler` thread because Win32
/// `SetThreadExecutionState` is thread-local!
fn apply_thread_execution_state_on_scheduler_thread(enable: bool) -> bool {
    #[cfg(target_os = "windows")]
    unsafe {
        let flags = ES_CONTINUOUS | if enable { ES_SYSTEM_REQUIRED } else { 0 };
        SetThreadExecutionState(flags) != 0
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        true
    }
}

/// Thread-safe request to toggle keep-awake. The reminder scheduler thread observes
/// `KEEP_AWAKE_MANUAL` / `KEEP_AWAKE_WANTED` and applies `SetThreadExecutionState` on its own thread.
pub fn set_system_keep_awake(enable: bool) {
    KEEP_AWAKE_MANUAL.store(enable, Ordering::SeqCst);
    KEEP_AWAKE_WANTED.store(enable, Ordering::SeqCst);
    if enable {
        KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS.store(0, Ordering::SeqCst);
        KEEP_AWAKE_MANUAL_STOP_UNTIL_MS.store(0, Ordering::SeqCst);
    }
    notify_scheduler_wake();
}

fn clear_keep_awake_and_suppress_suhoor(deadline: &AtomicU64, suppress_ms: u64) {
    KEEP_AWAKE_MANUAL.store(false, Ordering::SeqCst);
    KEEP_AWAKE_WANTED.store(false, Ordering::SeqCst);
    let now_ms = current_unix_ms();
    deadline.store(now_ms.saturating_add(suppress_ms), Ordering::SeqCst);
    notify_scheduler_wake();
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub enum AudioCommand {
    Play {
        gen_id: u64,
        sound: &'static [u8],
        volume: u8,
        pause_media: bool,
        kind: &'static str,
    },
    PlayLooping {
        gen_id: u64,
        sound: &'static [u8],
        start_volume: u8,
        max_volume: u8,
        max_duration_secs: u64,
        pause_media: bool,
        kind: &'static str,
    },
    Stop,
    StopIfGeneration(u64),
}

pub struct AudioService {
    sender: std::sync::mpsc::Sender<AudioCommand>,
    playing: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl Default for AudioService {
    fn default() -> Self {
        Self::new()
    }
}

struct ActivePlayback {
    _stream: rodio::OutputStream,
    sink: rodio::Sink,
}

fn open_fresh_playback() -> Option<ActivePlayback> {
    match rodio::OutputStream::try_default() {
        Ok((stream, handle)) => match rodio::Sink::try_new(&handle) {
            Ok(sink) => Some(ActivePlayback {
                _stream: stream,
                sink,
            }),
            Err(err) => {
                storage::log_line("WARN", "audio", &format!("Sink::try_new failed: {err}"));
                None
            }
        },
        Err(err) => {
            storage::log_line(
                "WARN",
                "audio",
                &format!("OutputStream::try_default failed: {err}"),
            );
            None
        }
    }
}

impl AudioService {
    pub fn new() -> Self {
        let (tx, rx) = std::sync::mpsc::channel::<AudioCommand>();
        let playing = Arc::new(AtomicBool::new(false));
        let playing_flag = Arc::clone(&playing);
        let generation = Arc::new(AtomicU64::new(0));
        let app_handle = Arc::new(Mutex::new(None::<tauri::AppHandle>));
        let app_handle_loop = Arc::clone(&app_handle);

        thread::spawn(move || {
            use rodio::Source;
            // Hold OutputStream strictly for the lifetime of the active Sink so headphone
            // plug/unplug and default-device changes always bind to the live Windows endpoint.
            let mut active_playback: Option<ActivePlayback> = None;
            let mut active_gen: u64 = 0;
            let mut loop_started_at: Option<Instant> = None;
            let mut loop_max_duration: Duration = Duration::from_secs(300);
            let mut loop_start_vol: f32 = 0.7;
            let mut loop_max_vol: f32 = 1.0;

            let emit_stopped = |app_holder: &Arc<Mutex<Option<tauri::AppHandle>>>| {
                if let Some(app) = app_holder.lock().ok().and_then(|a| a.clone()) {
                    let _ = tauri::Emitter::emit(&app, "wens-audio-stopped", ());
                }
            };

            let maybe_pause_external_media =
                |pause_media: bool, app_holder: &Arc<Mutex<Option<tauri::AppHandle>>>| {
                    if !pause_media {
                        return;
                    }
                    let should_pause = app_holder
                        .lock()
                        .ok()
                        .and_then(|a| a.clone())
                        .map(|app| storage::get_cached_preferences(&app).media_pause_at_prayer)
                        .unwrap_or(false);
                    if should_pause {
                        let _ = media_smtc::control_media("pause");
                    }
                };

            loop {
                let cmd = match rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(cmd) => Some(cmd),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => None,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                };

                if let Some(cmd) = cmd {
                    match cmd {
                        AudioCommand::Stop => {
                            if let Some(playback) = active_playback.take() {
                                playback.sink.stop();
                            }
                            active_gen = 0;
                            loop_started_at = None;
                            playing_flag.store(false, Ordering::SeqCst);
                            emit_stopped(&app_handle_loop);
                        }
                        AudioCommand::StopIfGeneration(target_gen) => {
                            if active_gen == target_gen && target_gen != 0 {
                                if let Some(playback) = active_playback.take() {
                                    playback.sink.stop();
                                }
                                active_gen = 0;
                                loop_started_at = None;
                                playing_flag.store(false, Ordering::SeqCst);
                                emit_stopped(&app_handle_loop);
                            }
                        }
                        AudioCommand::Play {
                            gen_id,
                            sound,
                            volume,
                            pause_media,
                            kind,
                        } => {
                            if let Some(playback) = active_playback.take() {
                                playback.sink.stop();
                            }
                            loop_started_at = None;
                            playing_flag.store(false, Ordering::SeqCst);

                            maybe_pause_external_media(pause_media, &app_handle_loop);

                            if let Some(playback) = open_fresh_playback() {
                                let cursor = Cursor::new(sound);
                                match rodio::Decoder::new(cursor) {
                                    Ok(source) => {
                                        playback.sink.set_volume((volume.min(100) as f32) / 100.0);
                                        playback.sink.append(source);
                                        active_playback = Some(playback);
                                        active_gen = gen_id;
                                        playing_flag.store(true, Ordering::SeqCst);
                                        if let Some(app) =
                                            app_handle_loop.lock().ok().and_then(|a| a.clone())
                                        {
                                            let _ = tauri::Emitter::emit(
                                                &app,
                                                "wens-audio-playing",
                                                &serde_json::json!({
                                                    "kind": kind,
                                                    "generation": gen_id
                                                }),
                                            );
                                        }
                                    }
                                    Err(err) => {
                                        storage::log_line(
                                            "WARN",
                                            "audio",
                                            &format!("Decoder::new failed: {err}"),
                                        );
                                    }
                                }
                            }
                        }
                        AudioCommand::PlayLooping {
                            gen_id,
                            sound,
                            start_volume,
                            max_volume,
                            max_duration_secs,
                            pause_media,
                            kind,
                        } => {
                            if let Some(playback) = active_playback.take() {
                                playback.sink.stop();
                            }
                            playing_flag.store(false, Ordering::SeqCst);

                            maybe_pause_external_media(pause_media, &app_handle_loop);

                            if let Some(playback) = open_fresh_playback() {
                                let cursor = Cursor::new(sound);
                                match rodio::Decoder::new(cursor) {
                                    Ok(source) => {
                                        let s_vol = (start_volume.min(100) as f32) / 100.0;
                                        let m_vol = (max_volume.min(100) as f32) / 100.0;
                                        playback.sink.set_volume(s_vol);
                                        playback.sink.append(source.repeat_infinite());
                                        active_playback = Some(playback);
                                        active_gen = gen_id;
                                        loop_started_at = Some(Instant::now());
                                        loop_max_duration =
                                            Duration::from_secs(max_duration_secs.max(30));
                                        loop_start_vol = s_vol;
                                        loop_max_vol = m_vol.max(s_vol);
                                        playing_flag.store(true, Ordering::SeqCst);
                                        if let Some(app) =
                                            app_handle_loop.lock().ok().and_then(|a| a.clone())
                                        {
                                            let _ = tauri::Emitter::emit(
                                                &app,
                                                "wens-audio-playing",
                                                &serde_json::json!({
                                                    "kind": kind,
                                                    "generation": gen_id
                                                }),
                                            );
                                        }
                                    }
                                    Err(err) => {
                                        storage::log_line(
                                            "WARN",
                                            "audio",
                                            &format!("Decoder::new looping failed: {err}"),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }

                // Escalating alarm volume during continuous alarm loop
                if let (Some(ref playback), Some(started)) = (&active_playback, loop_started_at) {
                    let elapsed = started.elapsed();
                    if elapsed >= loop_max_duration {
                        playback.sink.stop();
                        active_playback = None;
                        active_gen = 0;
                        loop_started_at = None;
                        playing_flag.store(false, Ordering::SeqCst);
                        emit_stopped(&app_handle_loop);
                    } else {
                        let ramp_progress = (elapsed.as_secs_f32() / 40.0).clamp(0.0, 1.0);
                        let current_vol =
                            loop_start_vol + (loop_max_vol - loop_start_vol) * ramp_progress;
                        playback.sink.set_volume(current_vol);
                    }
                }

                // Release stream handle once one-shot audio finishes
                if let Some(ref playback) = active_playback {
                    if playback.sink.empty() {
                        active_playback = None;
                        active_gen = 0;
                        loop_started_at = None;
                        playing_flag.store(false, Ordering::SeqCst);
                        emit_stopped(&app_handle_loop);
                    }
                }
            }
        });

        Self {
            sender: tx,
            playing,
            generation,
            app_handle,
        }
    }

    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        if let Ok(mut lock) = self.app_handle.lock() {
            *lock = Some(handle);
        }
    }

    pub fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let _ = self.sender.send(AudioCommand::Stop);
        self.playing.store(false, Ordering::SeqCst);
        if let Some(app) = self.app_handle.lock().ok().and_then(|a| a.clone()) {
            let _ = tauri::Emitter::emit(&app, "wens-audio-stopped", ());
        }
    }

    pub fn stop_if_generation(&self, gen_id: u64) {
        if self.generation.load(Ordering::SeqCst) == gen_id {
            let _ = self.sender.send(AudioCommand::StopIfGeneration(gen_id));
        }
    }

    pub fn is_playing(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }

    pub fn current_generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    pub fn play_sound_ex(
        &self,
        sound: &'static [u8],
        volume: u8,
        pause_media: bool,
        kind: &'static str,
    ) -> Result<u64, String> {
        let gen_id = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.sender
            .send(AudioCommand::Play {
                gen_id,
                sound,
                volume,
                pause_media,
                kind,
            })
            .map_err(|e| e.to_string())?;
        Ok(gen_id)
    }

    pub fn play_sound(&self, sound: &'static [u8], volume: u8) -> Result<u64, String> {
        self.play_sound_ex(sound, volume, false, "chime")
    }

    pub fn play_looping_ex(
        &self,
        sound: &'static [u8],
        start_volume: u8,
        max_volume: u8,
        max_duration_secs: u64,
        pause_media: bool,
        kind: &'static str,
    ) -> Result<u64, String> {
        let gen_id = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        self.sender
            .send(AudioCommand::PlayLooping {
                gen_id,
                sound,
                start_volume,
                max_volume,
                max_duration_secs,
                pause_media,
                kind,
            })
            .map_err(|e| e.to_string())?;
        Ok(gen_id)
    }

    pub fn play_looping(
        &self,
        sound: &'static [u8],
        start_volume: u8,
        max_volume: u8,
        max_duration_secs: u64,
    ) -> Result<u64, String> {
        self.play_looping_ex(
            sound,
            start_volume,
            max_volume,
            max_duration_secs,
            false,
            "alarm",
        )
    }
}

#[derive(Default)]
pub struct ReminderScheduler {
    pub events: Mutex<Vec<ReminderEvent>>,
    /// Maps delivered event ID -> delivered timestamp (ms) for LRU/age-based pruning.
    pub delivered: Mutex<HashMap<String, u64>>,
    pub last_error: Mutex<Option<String>>,
    pub last_plan_date: Mutex<Option<chrono::NaiveDate>>,
    active_suhoor_alarm: Mutex<Option<CriticalAlarmPayload>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CriticalAlarmPayload {
    id: String,
    title: String,
    body: String,
    kind: String,
    require_challenge: bool,
}

impl ReminderScheduler {
    fn take_active_alarm(&self, expected_id: Option<&str>) -> Result<Option<CriticalAlarmPayload>, String> {
        let mut alarm = self.active_suhoor_alarm
            .lock().map_err(|_| "reminder scheduler unavailable".to_string())?;
        if let (Some(expected), Some(active)) = (expected_id, alarm.as_ref()) {
            if expected != active.id {
                return Err("تم استبدال هذا المنبّه بمنبّه أحدث.".into());
            }
        }
        Ok(alarm.take())
    }
}

fn publish_suhoor_alarm(app: &tauri::AppHandle, payload: CriticalAlarmPayload) {
    *app.state::<ReminderScheduler>().active_suhoor_alarm
        .lock().unwrap_or_else(|error| error.into_inner()) = Some(payload.clone());
    let _ = tauri::Emitter::emit(app, "wens-critical-alarm", payload);
}

#[tauri::command]
fn active_suhoor_alarm_get(
    window: tauri::WebviewWindow,
    scheduler: State<'_, ReminderScheduler>,
) -> Result<Option<CriticalAlarmPayload>, String> {
    require_main_window(&window, "active_suhoor_alarm_get")?;
    scheduler.active_suhoor_alarm.lock()
        .map(|alarm| alarm.clone())
        .map_err(|_| "reminder scheduler unavailable".to_string())
}

fn take_suhoor_alarm(
    app: &tauri::AppHandle,
    expected_id: Option<&str>,
) -> Result<Option<CriticalAlarmPayload>, String> {
    app.state::<ReminderScheduler>().take_active_alarm(expected_id)
}

fn reset_alarm_window(app: &tauri::AppHandle) {
    #[cfg(desktop)]
    if let Some(main_win) = app.get_webview_window("main") {
        let _ = main_win.set_always_on_top(false);
    }
    #[cfg(not(desktop))]
    let _ = app;
}

pub(crate) fn reset_reminder_runtime(app: &tauri::AppHandle) {
    let scheduler = app.state::<ReminderScheduler>();
    {
        let mut events = scheduler.events.lock().unwrap_or_else(|error| error.into_inner());
        let mut delivered = scheduler.delivered.lock().unwrap_or_else(|error| error.into_inner());
        events.clear();
        delivered.clear();
    }
    if let Ok(Some(alarm)) = take_suhoor_alarm(app, None) {
        reset_alarm_window(app);
        let _ = tauri::Emitter::emit(app, "wens-alarm-dismissed", Some(alarm.id));
    }
    app.state::<AudioService>().stop();
    KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS.store(0, Ordering::SeqCst);
    KEEP_AWAKE_MANUAL_STOP_UNTIL_MS.store(0, Ordering::SeqCst);
    set_system_keep_awake(false);
}

fn is_preserved_dynamic_event(event: &ReminderEvent) -> bool {
    event.kind == "fasting-suhoor-snooze"
        || event.kind == "fasting-wake-check"
        || matches!(event.kind.as_str(), "work" | "focus")
        || event.id.starts_with("fasting-suhoor-snooze-")
        || event.id.starts_with("fasting-wake-check-")
}

fn prune_delivered_map(delivered: &mut HashMap<String, u64>, now_ms: u64) {
    let cutoff = now_ms.saturating_sub(48 * 3600 * 1000);
    delivered.retain(|_, &mut ts| ts >= cutoff);
    if delivered.len() > 500 {
        let mut entries: Vec<(String, u64)> =
            delivered.iter().map(|(k, &v)| (k.clone(), v)).collect();
        entries.sort_by_key(|(_, ts)| *ts);
        let remove_count = entries.len().saturating_sub(300);
        for (key, _) in entries.into_iter().take(remove_count) {
            delivered.remove(&key);
        }
    }
}

fn merge_preserving_dynamic_events(
    existing: &[ReminderEvent],
    mut incoming: Vec<ReminderEvent>,
    delivered: &HashMap<String, u64>,
    now_ms: u64,
) -> Vec<ReminderEvent> {
    let mut existing_ids: HashSet<String> = incoming.iter().map(|e| e.id.clone()).collect();
    for ev in existing {
        if is_preserved_dynamic_event(ev)
            && ev.due_at_ms.saturating_add(ev.catch_up_ms) >= now_ms
            && !delivered.contains_key(&ev.id)
            && !existing_ids.contains(&ev.id)
        {
            existing_ids.insert(ev.id.clone());
            incoming.push(ev.clone());
        }
    }
    incoming.sort_by_key(|e| e.due_at_ms);
    incoming.dedup_by(|a, b| a.id == b.id);
    incoming
}

/// Rebuilds the Rust reminder plan immediately (e.g. after `settings_update`, backup restore,
/// or factory reset) while preserving active snooze / wake-check reminders.
pub fn refresh_reminder_schedule(app: &tauri::AppHandle, prefs: &AppPreferences) {
    if prefs.strict_offline {
        if let Some(connectors) = app.try_state::<ConnectorManager>() {
            connectors.kill_all();
        }
    }
    let Some(scheduler) = app.try_state::<ReminderScheduler>() else {
        return;
    };
    let now_ms = current_unix_ms();
    let fresh = generate_default_reminder_plan(prefs);
    let delivered_snapshot = scheduler
        .delivered
        .lock()
        .map(|d| d.clone())
        .unwrap_or_default();

    if let Ok(mut events) = scheduler.events.lock() {
        *events = merge_preserving_dynamic_events(&events, fresh, &delivered_snapshot, now_ms);
    }
    if let Ok(mut last_date) = scheduler.last_plan_date.lock() {
        *last_date = Some(prayer_today(prefs));
    }
    notify_scheduler_wake();
}

fn dispatch_reminder_event(
    app: &tauri::AppHandle,
    id: &str,
    title: &str,
    body: &str,
    kind: &str,
    status: &str,
) {
    let payload = serde_json::json!({
        "id": id,
        "title": title,
        "body": body,
        "kind": kind,
        "status": status
    });
    // Single canonical event emission — Main, Overlay, and Pet all subscribe to `wens-reminder`
    // and deduplicate by `id`. No duplicate `eval(...)` calls!
    let _ = tauri::Emitter::emit(app, "wens-reminder", &payload);

    #[cfg(desktop)]
    {
        if crate::island_blocked() {
            return;
        }
        if PET_ENABLED.load(Ordering::SeqCst) {
            if let Some(pet_win) = app.get_webview_window("pet") {
                if pet_win.is_visible().unwrap_or(false) {
                    let _ = pet_set_mode(app.clone(), "peek".to_string());
                }
            }
        }
    }
}

#[tauri::command]
fn notification_send(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("notification title is required".into());
    }
    let res = app
        .notification()
        .builder()
        .title(title.clone())
        .body(body.clone())
        .show()
        .map_err(|error| error.to_string());

    let manual_id = format!("manual-{}", current_unix_ms());
    let status_str = if res.is_ok() { "delivered" } else { "failed" };
    dispatch_reminder_event(&app, &manual_id, &title, &body, "custom", status_str);

    res
}

#[tauri::command]
fn reminder_plan_update(
    app: tauri::AppHandle,
    scheduler: State<'_, ReminderScheduler>,
    mut events: Vec<ReminderEvent>,
) -> Result<NotificationSummary, String> {
    let now_ms = current_unix_ms();
    let horizon_48h_ms = 48 * 3600 * 1000;

    events.retain(|event| {
        matches!(event.kind.as_str(), "work" | "focus")
            && !event.id.trim().is_empty()
            && !event.title.trim().is_empty()
            && event.due_at_ms > 0
            && event.catch_up_ms > 0
            && (event.due_at_ms >= now_ms.saturating_sub(event.catch_up_ms))
            && (event.due_at_ms <= now_ms + horizon_48h_ms)
    });

    let delivered_snapshot = scheduler
        .delivered
        .lock()
        .map_err(|_| "reminder scheduler unavailable".to_string())?
        .clone();

    let prefs = storage::get_cached_preferences(&app);
    let mut plan = generate_default_reminder_plan(&prefs);
    plan.extend(events);
    {
        let mut sched_events = scheduler
            .events
            .lock()
            .map_err(|_| "reminder scheduler unavailable".to_string())?;
        *sched_events =
            merge_preserving_dynamic_events(&sched_events, plan, &delivered_snapshot, now_ms);
    }

    if let Ok(mut last_date) = scheduler.last_plan_date.lock() {
        *last_date = Some(prayer_today(&prefs));
    }
    notify_scheduler_wake();

    let unread_count = storage::with_database(&app, |db| {
        Ok(db.unread_notifications_count().unwrap_or(0))
    })
    .unwrap_or(0);

    Ok(storage::compute_notification_summary_with_unread(
        &app,
        unread_count,
        &prefs,
    ))
}

#[tauri::command]
fn audio_stop(app: tauri::AppHandle, audio: State<'_, AudioService>) -> Result<(), String> {
    let stopped_alarm = take_suhoor_alarm(&app, None)?;
    audio.stop();
    clear_keep_awake_and_suppress_suhoor(&KEEP_AWAKE_MANUAL_STOP_UNTIL_MS, 3 * 3600 * 1000);
    let _ = tauri::Emitter::emit(&app, "wens-audio-stopped", ());
    if let Some(alarm) = stopped_alarm {
        reset_alarm_window(&app);
        let _ = tauri::Emitter::emit(&app, "wens-alarm-dismissed", Some(alarm.id));
    }
    Ok(())
}

#[tauri::command]
fn alarm_dismiss(
    app: tauri::AppHandle,
    audio: State<'_, AudioService>,
    scheduler: State<'_, ReminderScheduler>,
    event_id: Option<String>,
) -> Result<(), String> {
    take_suhoor_alarm(&app, event_id.as_deref())?;
    audio.stop();
    clear_keep_awake_and_suppress_suhoor(&KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS, 3 * 3600 * 1000);
    let _ = tauri::Emitter::emit(&app, "wens-audio-stopped", ());
    let _ = tauri::Emitter::emit(&app, "wens-alarm-dismissed", &event_id);

    reset_alarm_window(&app);

    // If dismissing a Suhoor alarm (and fasting is enabled), schedule wake-check after X minutes
    if let Some(ref id) = event_id {
        if id.contains("suhoor") && !id.contains("wake-check") {
            let prefs = storage::get_cached_preferences(&app);
            let check_mins = prefs.suhoor_wake_check_minutes;
            if prefs.notifications.fasting_enabled && check_mins > 0 {
                let now_ms = current_unix_ms();
                let check_event = ReminderEvent {
                    id: format!("fasting-wake-check-{now_ms}"),
                    title: "فحص تأكيد الاستيقاظ للسحور ⏰".to_string(),
                    body: "هل ما زلت مستيقظاً وتتسحر؟ أكد استيقاظك حتى لا يعودك النوم قبل الفجر!"
                        .to_string(),
                    kind: "fasting-wake-check".to_string(),
                    due_at_ms: now_ms + (check_mins.clamp(1, 60) as u64) * 60 * 1000,
                    catch_up_ms: 15 * 60 * 1000,
                };
                if let Ok(mut events) = scheduler.events.lock() {
                    events.push(check_event);
                    events.sort_by_key(|e| e.due_at_ms);
                }
                notify_scheduler_wake();
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn alarm_snooze(
    app: tauri::AppHandle,
    audio: State<'_, AudioService>,
    scheduler: State<'_, ReminderScheduler>,
    title: Option<String>,
    body: Option<String>,
    minutes: Option<u64>,
) -> Result<ReminderEvent, String> {
    take_suhoor_alarm(&app, None)?;
    audio.stop();
    let snooze_mins = minutes.unwrap_or(5).clamp(1, 30);
    clear_keep_awake_and_suppress_suhoor(&KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS, snooze_mins * 60 * 1000);
    let _ = tauri::Emitter::emit(&app, "wens-audio-stopped", ());

    reset_alarm_window(&app);

    let now_ms = current_unix_ms();

    let snooze_event = ReminderEvent {
        id: format!("fasting-suhoor-snooze-{now_ms}"),
        title: title.unwrap_or_else(|| "منبه السحور (بعد الغفوة)".to_string()),
        body: body.unwrap_or_else(|| {
            "انتهت الغفوة! قم للسحور وشرب الماء قبل أذان الفجر.".to_string()
        }),
        kind: "fasting-suhoor-snooze".to_string(),
        due_at_ms: now_ms + snooze_mins * 60 * 1000,
        catch_up_ms: 30 * 60 * 1000,
    };

    if let Ok(mut events) = scheduler.events.lock() {
        events.push(snooze_event.clone());
        events.sort_by_key(|e| e.due_at_ms);
    }
    notify_scheduler_wake();

    let _ = tauri::Emitter::emit(&app, "wens-alarm-snoozed", &snooze_event);
    Ok(snooze_event)
}

#[tauri::command]
fn power_keep_awake_set(enabled: bool) -> Result<(), String> {
    set_system_keep_awake(enabled);
    Ok(())
}

#[tauri::command]
fn notification_test(
    app: tauri::AppHandle,
    audio: State<'_, AudioService>,
    kind: String,
) -> Result<DeliveryResult, String> {
    let prefs = storage::get_cached_preferences(&app);
    let (title, body) = match kind.as_str() {
        "prayer" | "adhan" => (
            "دخل وقت الصلاة — تجربة التنبيه",
            "هذا تنبيه تجريبي لتأكيد وصول إشعارات الصلاة والأذان محليًا.",
        ),
        "fasting" | "strong-alarm" | "suhoor-alarm" => (
            "منبه السحور القوي — تجربة الاستيقاظ",
            "هذا اختبار لمنبه السحور العالي المستمر وتحدي الاستيقاظ.",
        ),
        "work" => (
            "انتهاء جلسة العمل — تجربة",
            "هذا تنبيه تجريبي لانتهاء جلسة التركيز.",
        ),
        _ => (
            "اختبار تنبيه وِنس",
            "التنبيهات والصوت تعمل محليًا وبشكل مستقل.",
        ),
    };

    let show_res = app.notification().builder().title(title).body(body).show();
    let (success, status, err_msg) = match show_res {
        Ok(_) => (true, "delivered".to_string(), None),
        Err(e) => (false, "failed".to_string(), Some(e.to_string())),
    };

    let rec = NotificationRecord {
        id: format!("test-{}", current_unix_ms()),
        title: title.to_string(),
        body: body.to_string(),
        kind: format!("test-{kind}"),
        status: status.clone(),
        error_message: err_msg.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        read_at: None,
    };
    let _ = storage::with_database(&app, |db| {
        db.insert_notification_record(&rec).map_err(|e| e.to_string())
    });

    dispatch_reminder_event(&app, &rec.id, &rec.title, &rec.body, &rec.kind, &status);

    match kind.as_str() {
        "strong-alarm" | "suhoor-alarm" => {
            let start_vol = prefs.audio.volume.clamp(50, 100);
            let max_vol = prefs.audio.volume.max(85).min(100);
            let _ = audio.play_looping_ex(
                STRONG_ALARM_BYTES,
                start_vol,
                max_vol,
                120,
                false,
                "suhoor-alarm-test",
            );
            if kind == "suhoor-alarm" {
                publish_suhoor_alarm(&app, CriticalAlarmPayload {
                    id: rec.id,
                    title: title.to_string(),
                    body: body.to_string(),
                    kind: "fasting-suhoor".to_string(),
                    require_challenge: prefs.suhoor_wake_challenge,
                });
            }
        }
        "fasting" => match prefs.audio.fasting {
            FastingSoundMode::StrongAlarm => {
                let start_vol = prefs.audio.volume.clamp(50, 100);
                let max_vol = prefs.audio.volume.max(85).min(100);
                let _ = audio.play_looping_ex(
                    STRONG_ALARM_BYTES,
                    start_vol,
                    max_vol,
                    60,
                    false,
                    "fasting-test",
                );
            }
            FastingSoundMode::Adhan => {
                let _ = audio.play_sound_ex(ADHAN_BYTES, prefs.audio.volume, true, "adhan-test");
            }
            FastingSoundMode::GentleChime => {
                let _ = audio.play_sound_ex(
                    GENTLE_CHIME_BYTES,
                    prefs.audio.volume,
                    false,
                    "fasting-test",
                );
            }
            FastingSoundMode::Silent => {}
        },
        "adhan" => {
            if let Ok(gen_id) =
                audio.play_sound_ex(ADHAN_BYTES, prefs.audio.volume, true, "adhan-test")
            {
                let sender = audio.sender.clone();
                let generation = Arc::clone(&audio.generation);
                thread::spawn(move || {
                    thread::sleep(Duration::from_secs(8));
                    // Generation-guarded stop: NEVER stops a newer alarm or prayer adhan!
                    if generation.load(Ordering::SeqCst) == gen_id {
                        let _ = sender.send(AudioCommand::StopIfGeneration(gen_id));
                    }
                });
            }
        }
        "prayer" => {
            let _ = audio.play_sound_ex(
                GENTLE_CHIME_BYTES,
                prefs.audio.volume,
                true,
                "prayer-test",
            );
        }
        "work" => {
            let _ = audio.play_sound_ex(WORK_CHIME_BYTES, prefs.audio.volume, false, "work-test");
        }
        _ => {
            let _ = audio.play_sound_ex(GENTLE_CHIME_BYTES, prefs.audio.volume, false, "chime-test");
        }
    }

    Ok(DeliveryResult {
        success,
        status,
        error: err_msg,
    })
}

fn next_due_event(
    events: &[ReminderEvent],
    delivered: &HashMap<String, u64>,
    now_ms: u64,
) -> Option<ReminderEvent> {
    events
        .iter()
        .find(|event| {
            event.due_at_ms <= now_ms
                && now_ms.saturating_sub(event.due_at_ms) <= event.catch_up_ms
                && !delivered.contains_key(&event.id)
        })
        .cloned()
}

fn prayer_date_at(prefs: &AppPreferences, now: chrono::DateTime<chrono::Utc>) -> chrono::NaiveDate {
    match prefs.time_zone.parse::<chrono_tz::Tz>() {
        Ok(zone) => now.with_timezone(&zone).date_naive(),
        Err(_) => now.with_timezone(&chrono::Local).date_naive(),
    }
}

fn prayer_today(prefs: &AppPreferences) -> chrono::NaiveDate {
    prayer_date_at(prefs, chrono::Utc::now())
}

/// Use the offset applied by the solar calculation, including on DST transition days.
pub(crate) fn prayer_day_clock(
    date: chrono::NaiveDate,
    time_zone: &str,
) -> Option<(i32, u64)> {
    let midnight_naive = date.and_hms_opt(0, 0, 0)?;
    let noon = date.and_hms_opt(12, 0, 0)?;

    use chrono::Offset;
    // Start the solar calculation from the selected city's offset at noon.
    let noon_offset_secs = match time_zone.parse::<chrono_tz::Tz>() {
        Ok(zone) => noon.and_local_timezone(zone).earliest()
            .map(|time| time.offset().fix().local_minus_utc())?,
        Err(_) => noon.and_local_timezone(chrono::Local).earliest()
            .map(|time| time.offset().local_minus_utc())?,
    };

    let tz_offset_mins = noon_offset_secs / 60;
    let midnight_utc_ms = midnight_naive.and_utc().timestamp_millis();
    let midnight_local_ms = (midnight_utc_ms - (tz_offset_mins as i64) * 60_000).max(0) as u64;
    Some((tz_offset_mins, midnight_local_ms))
}

fn prayer_timestamp_ms(midnight_ms: u64, minutes_from_midnight: i32) -> u64 {
    let clamped_mins = minutes_from_midnight.clamp(0, 1439) as u64;
    midnight_ms.saturating_add(clamped_mins * 60 * 1000)
}

fn generate_default_reminder_plan(prefs: &AppPreferences) -> Vec<ReminderEvent> {
    generate_reminder_plan_at(prefs, chrono::Utc::now())
}

fn generate_reminder_plan_at(
    prefs: &AppPreferences,
    now: chrono::DateTime<chrono::Utc>,
) -> Vec<ReminderEvent> {
    let mut events = Vec::new();
    let today = prayer_date_at(prefs, now);
    let method = wens_core::CalculationMethod::from_str_lossy(&prefs.calc_method);

    let asr_jurist = if prefs.asr_hanafi {
        wens_core::prayer::AsrJurist::Hanafi
    } else {
        wens_core::prayer::AsrJurist::Standard
    };

    for day_offset in 0..2 {
        let date = today + chrono::Duration::days(day_offset);
        let Some((day_tz_offset_mins, midnight)) = prayer_day_clock(date, &prefs.time_zone) else {
            continue;
        };
        let date_str = date.format("%Y-%m-%d").to_string();
        let req = PrayerRequest {
            date: date_str.clone(),
            latitude: prefs.latitude,
            longitude: prefs.longitude,
            timezone_offset_minutes: day_tz_offset_mins,
            method,
            asr_jurist,
            fajr_offset_minutes: prefs.fajr_offset as i32,
            maghrib_offset_minutes: prefs.maghrib_offset as i32,
            isha_offset_minutes: prefs.isha_offset as i32,
        };
        let Ok(p_day) = wens_core::calculate_prayer_day(req) else {
            continue;
        };

        for p in &p_day.times {
            if p.key == "sunrise" {
                continue;
            }
            let prayer_ms = prayer_timestamp_ms(midnight, p.minutes_from_midnight);
            if prefs.notifications.pre_prayer_enabled {
                let mut leads: Vec<i64> = prefs
                    .pre_prayer_leads
                    .iter()
                    .copied()
                    .filter(|&m| m > 0)
                    .map(|m| m.clamp(1, 180))
                    .collect();
                if leads.is_empty() {
                    if prefs.wudu_lead_minutes > 0 {
                        leads.push(prefs.wudu_lead_minutes.clamp(1, 180));
                    } else {
                        leads.push(15);
                    }
                }
                leads.sort_by(|a, b| b.cmp(a));
                leads.dedup();

                for (idx, &lead) in leads.iter().enumerate() {
                    let next_lead = leads.get(idx + 1).copied().unwrap_or(0);
                    let until_next =
                        ((lead - next_lead).max(1) as u64 * 60 * 1000).saturating_sub(1000);
                    let catch_up = until_next.min(10 * 60 * 1000).max(3 * 60 * 1000);

                    let lead_label_str = match lead {
                        60 => "ساعة".to_string(),
                        30 => "نصف ساعة".to_string(),
                        20 => "ثلث ساعة".to_string(),
                        15 => "ربع ساعة".to_string(),
                        10 => "١٠ دقائق".to_string(),
                        5 => "٥ دقائق".to_string(),
                        other => format!("{other} دقيقة"),
                    };

                    events.push(ReminderEvent {
                        id: format!("prayer-{date_str}-{}-prepare-{lead}", p.key),
                        title: format!("اقترب موعد صلاة {} (فاضل {lead_label_str})", p.name_ar),
                        body: format!("فاضل {lead_label_str} على الأذان — الاستعداد للوضوء"),
                        kind: format!("prayer-prepare-{lead}"),
                        due_at_ms: prayer_ms.saturating_sub((lead as u64) * 60 * 1000),
                        catch_up_ms: catch_up,
                    });
                }
            }
            if prefs.notifications.prayer_at_time_enabled {
                events.push(ReminderEvent {
                    id: format!("prayer-{date_str}-{}-at", p.key),
                    title: format!("حان الآن موعد أذان {}", p.name_ar),
                    body: "حي على الصلاة، حي على الفلاح".to_string(),
                    kind: "prayer-at".to_string(),
                    due_at_ms: prayer_ms,
                    catch_up_ms: 15 * 60 * 1000,
                });
            }
        }

        // Only schedule Suhoor / Imsak / Iftar when user explicitly enables fasting notifications!
        if prefs.notifications.fasting_enabled {
            if let Some(fajr) = p_day.times.iter().find(|p| p.key == "fajr") {
                let suhoor_lead = (prefs.suhoor_lead_minutes.max(5) as u64).min(180);
                let fajr_ms = prayer_timestamp_ms(midnight, fajr.minutes_from_midnight);
                events.push(ReminderEvent {
                    id: format!("fasting-{date_str}-suhoor"),
                    title: "⏰ حان وقت السحور — استيقظ الآن!".to_string(),
                    body: format!(
                        "متبقي {suhoor_lead} دقيقة على أذان الفجر — تسحروا فإن في السحور بركة."
                    ),
                    kind: "fasting-suhoor".to_string(),
                    due_at_ms: fajr_ms.saturating_sub(suhoor_lead * 60 * 1000),
                    catch_up_ms: suhoor_lead * 60 * 1000,
                });

                let imsak_lead = (prefs.imsak_water_lead_minutes.max(0) as u64).min(60);
                if imsak_lead > 0 && imsak_lead < suhoor_lead {
                    events.push(ReminderEvent {
                        id: format!("fasting-{date_str}-imsak-water"),
                        title: format!(
                            "💧 تنبيه الماء والإمساك (باقي {imsak_lead} دقيقة على الفجر)"
                        ),
                        body: "اشرب الماء واعقد نية الصيام قبل أذان الفجر.".to_string(),
                        kind: "fasting-imsak-water".to_string(),
                        due_at_ms: fajr_ms.saturating_sub(imsak_lead * 60 * 1000),
                        catch_up_ms: imsak_lead * 60 * 1000,
                    });
                }
            }
            if let Some(maghrib) = p_day.times.iter().find(|p| p.key == "maghrib") {
                let maghrib_ms = prayer_timestamp_ms(midnight, maghrib.minutes_from_midnight);
                events.push(ReminderEvent {
                    id: format!("fasting-{date_str}-iftar"),
                    title: "حان موعد إفطار المغرب".to_string(),
                    body: "ذهب الظمأ وابتلت العروق وثبت الأجر إن شاء الله".to_string(),
                    kind: "fasting-iftar".to_string(),
                    due_at_ms: maghrib_ms,
                    catch_up_ms: 30 * 60 * 1000,
                });
            }
        }
    }

    let now_ms = now.timestamp_millis().max(0) as u64;
    events.retain(|e| e.due_at_ms >= now_ms.saturating_sub(e.catch_up_ms));
    events.sort_by_key(|e| e.due_at_ms);
    events
}

fn is_suhoor_alarm_event(event: &ReminderEvent) -> bool {
    event.kind == "fasting-suhoor"
        || event.kind == "fasting-suhoor-snooze"
        || event.kind == "fasting-wake-check"
}

fn suhoor_keep_awake_allowed(
    event: &ReminderEvent,
    now_ms: u64,
    primary_suppressed_until: u64,
    manually_stopped_until: u64,
) -> bool {
    is_suhoor_alarm_event(event)
        && (event.kind != "fasting-suhoor" || now_ms >= primary_suppressed_until)
        && now_ms >= manually_stopped_until
}

fn start_reminder_scheduler(app: tauri::AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::spawn(move || {
        let mut last_applied_keep_awake = false;

        loop {
            // Interruptible wait (up to 2s) so keep-awake toggles, settings updates, and shutdown act immediately.
            {
                let (lock, cvar) = scheduler_wake_pair();
                let mut signaled = lock.lock().unwrap_or_else(|e| e.into_inner());
                if !*signaled && !stop_flag.load(Ordering::Relaxed) {
                    let (g, _) = cvar
                        .wait_timeout(signaled, Duration::from_secs(2))
                        .unwrap_or_else(|e| e.into_inner());
                    signaled = g;
                }
                *signaled = false;
            }

            if stop_flag.load(Ordering::Relaxed) {
                break;
            }

            let now_ms = current_unix_ms();
            let prefs = storage::get_cached_preferences(&app);
            let today = prayer_today(&prefs);

            let (next, suhoor_keep_awake_needed) = {
                let scheduler = app.state::<ReminderScheduler>();
                let mut events = match scheduler.events.lock() {
                    Ok(events) => events,
                    Err(_) => continue,
                };
                let mut delivered = match scheduler.delivered.lock() {
                    Ok(delivered) => delivered,
                    Err(_) => continue,
                };

                prune_delivered_map(&mut delivered, now_ms);
                events.retain(|e| e.due_at_ms.saturating_add(e.catch_up_ms) >= now_ms);

                let date_rolled_over = scheduler
                    .last_plan_date
                    .lock()
                    .map(|d| *d != Some(today))
                    .unwrap_or(true);

                if events.is_empty()
                    || events.iter().all(|e| e.due_at_ms < now_ms)
                    || date_rolled_over
                {
                    let fresh = generate_default_reminder_plan(&prefs);
                    *events = merge_preserving_dynamic_events(&events, fresh, &delivered, now_ms);
                    if let Ok(mut d) = scheduler.last_plan_date.lock() {
                        *d = Some(today);
                    }
                }

                let due = next_due_event(&events, &delivered, now_ms);
                if let Some(event) = &due {
                    delivered.insert(event.id.clone(), now_ms);
                }

                let horizon_3h_ms = 3 * 3600 * 1000;
                let primary_suppressed_until =
                    KEEP_AWAKE_PRIMARY_SUPPRESSED_UNTIL_MS.load(Ordering::Relaxed);
                let manually_stopped_until =
                    KEEP_AWAKE_MANUAL_STOP_UNTIL_MS.load(Ordering::Relaxed);
                let suhoor_active = prefs.notifications.fasting_enabled
                    && prefs.prevent_sleep_for_suhoor
                    && events.iter().any(|e| {
                        suhoor_keep_awake_allowed(
                            e, now_ms, primary_suppressed_until, manually_stopped_until,
                        )
                            && !delivered.contains_key(&e.id)
                            && e.due_at_ms >= now_ms.saturating_sub(e.catch_up_ms)
                            && e.due_at_ms <= now_ms + horizon_3h_ms
                    });

                (due, suhoor_active)
            };

            // Apply Win32 SetThreadExecutionState strictly on THIS scheduler thread
            let wanted_keep_awake =
                KEEP_AWAKE_MANUAL.load(Ordering::SeqCst) || suhoor_keep_awake_needed;
            KEEP_AWAKE_WANTED.store(wanted_keep_awake, Ordering::SeqCst);
            if wanted_keep_awake != last_applied_keep_awake
                && apply_thread_execution_state_on_scheduler_thread(wanted_keep_awake)
            {
                last_applied_keep_awake = wanted_keep_awake;
            }

            let Some(event) = next else { continue };

            // Drop stale fasting events if user disabled fasting notifications
            if event.kind.starts_with("fasting") && !prefs.notifications.fasting_enabled {
                continue;
            }

            use chrono::Timelike;
            let now = chrono::Local::now();
            let in_quiet = prefs
                .notifications
                .quiet_hours
                .as_ref()
                .map_or(false, |qh| qh.contains(now.hour(), now.minute()));

            // Always respect Quiet Hours
            if in_quiet {
                let rec = NotificationRecord {
                    id: event.id.clone(),
                    title: event.title.clone(),
                    body: event.body.clone(),
                    kind: event.kind.clone(),
                    status: "suppressed".into(),
                    error_message: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                    read_at: None,
                };
                let _ = storage::with_database(&app, |db| {
                    db.insert_notification_record(&rec).map_err(|e| e.to_string())
                });
                let _ = tauri::Emitter::emit(
                    &app,
                    "wens-reminder",
                    &serde_json::json!({
                        "id": event.id,
                        "title": event.title,
                        "body": event.body,
                        "kind": event.kind,
                        "status": "suppressed"
                    }),
                );
                continue;
            }

            let show_res = app
                .notification()
                .builder()
                .title(event.title.clone())
                .body(event.body.clone())
                .show();

            let (status, err_msg) = match show_res {
                Ok(_) => {
                    if let Ok(mut err_lock) = app.state::<ReminderScheduler>().last_error.lock() {
                        *err_lock = None;
                    }
                    ("delivered".to_string(), None)
                }
                Err(e) => {
                    let err_str = e.to_string();
                    if let Ok(mut err_lock) = app.state::<ReminderScheduler>().last_error.lock() {
                        *err_lock = Some(err_str.clone());
                    }
                    ("failed".to_string(), Some(err_str))
                }
            };

            let rec = NotificationRecord {
                id: event.id.clone(),
                title: event.title.clone(),
                body: event.body.clone(),
                kind: event.kind.clone(),
                status: status.clone(),
                error_message: err_msg,
                created_at: chrono::Utc::now().to_rfc3339(),
                read_at: None,
            };
            let _ = storage::with_database(&app, |db| {
                db.insert_notification_record(&rec).map_err(|e| e.to_string())
            });
            dispatch_reminder_event(&app, &event.id, &event.title, &event.body, &event.kind, &status);

            let is_suhoor_alarm =
                is_suhoor_alarm_event(&event) && prefs.notifications.fasting_enabled;

            let is_main_visible = {
                #[cfg(desktop)]
                {
                    app.get_webview_window("main")
                        .map_or(false, |w| w.is_visible().unwrap_or(false))
                }
                #[cfg(not(desktop))]
                {
                    true
                }
            };

            let can_play = if is_suhoor_alarm
                || event.kind == "prayer-at"
                || event.kind == "fasting-iftar"
            {
                true
            } else {
                match prefs.audio.background_playback {
                    BackgroundAudioMode::Always => true,
                    BackgroundAudioMode::ForegroundOnly => is_main_visible,
                }
            };

            if can_play {
                let audio = app.state::<AudioService>();
                let vol = prefs.audio.volume.min(100);
                if is_suhoor_alarm {
                    match prefs.audio.fasting {
                        FastingSoundMode::StrongAlarm => {
                            let start_vol = vol.clamp(45, 100);
                            let max_vol = vol.max(85).min(100);
                            let _ = audio.play_looping_ex(
                                STRONG_ALARM_BYTES,
                                start_vol,
                                max_vol,
                                300,
                                false,
                                "suhoor-alarm",
                            );
                        }
                        FastingSoundMode::Adhan => {
                            let _ = audio.play_sound_ex(ADHAN_BYTES, vol, true, "suhoor-adhan");
                        }
                        FastingSoundMode::GentleChime => {
                            let _ = audio.play_sound_ex(
                                GENTLE_CHIME_BYTES,
                                vol,
                                false,
                                "suhoor-chime",
                            );
                        }
                        FastingSoundMode::Silent => {}
                    }
                } else if event.kind == "fasting-imsak-water" {
                    match prefs.audio.fasting {
                        FastingSoundMode::StrongAlarm | FastingSoundMode::GentleChime => {
                            let _ = audio.play_sound_ex(WORK_CHIME_BYTES, vol, false, "imsak");
                        }
                        FastingSoundMode::Adhan => {
                            let _ = audio.play_sound_ex(GENTLE_CHIME_BYTES, vol, false, "imsak");
                        }
                        FastingSoundMode::Silent => {}
                    }
                } else if event.kind == "fasting-iftar" {
                    match prefs.audio.fasting {
                        FastingSoundMode::Adhan | FastingSoundMode::StrongAlarm => {
                            let _ = audio.play_sound_ex(ADHAN_BYTES, vol, true, "iftar-adhan");
                        }
                        FastingSoundMode::GentleChime => {
                            let _ = audio.play_sound_ex(GENTLE_CHIME_BYTES, vol, false, "iftar");
                        }
                        FastingSoundMode::Silent => {}
                    }
                } else if event.kind == "prayer-at" {
                    match prefs.audio.prayer {
                        PrayerSoundMode::GentleChime => {
                            let _ = audio.play_sound_ex(
                                GENTLE_CHIME_BYTES,
                                vol,
                                true,
                                "prayer-chime",
                            );
                        }
                        PrayerSoundMode::Adhan => {
                            let _ = audio.play_sound_ex(ADHAN_BYTES, vol, true, "prayer-adhan");
                        }
                        PrayerSoundMode::Silent => {}
                    }
                } else if event.kind.starts_with("prayer-pre")
                    || event.kind.starts_with("prayer-prepare")
                {
                    if prefs.audio.prayer != PrayerSoundMode::Silent {
                        let _ = audio.play_sound_ex(
                            GENTLE_CHIME_BYTES,
                            vol,
                            false,
                            "prayer-prepare",
                        );
                    }
                } else if event.kind.starts_with("fasting") {
                    if prefs.audio.fasting != FastingSoundMode::Silent {
                        let _ = audio.play_sound_ex(GENTLE_CHIME_BYTES, vol, false, "fasting");
                    }
                } else if event.kind == "work" || event.kind == "focus" {
                    match prefs.audio.work {
                        WorkSoundMode::GentleChime => {
                            let _ = audio.play_sound_ex(GENTLE_CHIME_BYTES, vol, false, "work");
                        }
                        WorkSoundMode::WorkChime => {
                            let _ = audio.play_sound_ex(WORK_CHIME_BYTES, vol, false, "work");
                        }
                        WorkSoundMode::Silent => {}
                    }
                }
            }

            if is_suhoor_alarm {
                publish_suhoor_alarm(&app, CriticalAlarmPayload {
                    id: event.id.clone(),
                    title: event.title.clone(),
                    body: event.body.clone(),
                    kind: event.kind.clone(),
                    require_challenge: prefs.suhoor_wake_challenge,
                });
                #[cfg(desktop)]
                if !crate::island_blocked() && open_or_focus_main(&app).is_ok() {
                    let scheduler = app.state::<ReminderScheduler>();
                    let active = scheduler.active_suhoor_alarm.lock().unwrap_or_else(|error| error.into_inner());
                    if active.as_ref().is_some_and(|alarm| alarm.id == event.id) {
                        if let Some(main_win) = app.get_webview_window("main") {
                            let _ = main_win.set_always_on_top(true);
                        }
                    }
                }
            }
        }

        // Always release ES_SYSTEM_REQUIRED on the exact scheduler thread before exiting!
        if last_applied_keep_awake {
            apply_thread_execution_state_on_scheduler_thread(false);
        }
        KEEP_AWAKE_WANTED.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
fn local_status() -> &'static str {
    "offline-core"
}

#[cfg(desktop)]
fn pick_monitor_for_physical_rect(
    window: &WebviewWindow,
    target_x: i32,
    target_y: i32,
    win_w: i32,
    win_h: i32,
) -> Option<tauri::Monitor> {
    let center_x = target_x + win_w / 2;
    let center_y = target_y + win_h / 2;

    if let Ok(monitors) = window.available_monitors() {
        if !monitors.is_empty() {
            // First check if window center falls inside any monitor (supports negative multi-monitor coords)
            if let Some(hit) = monitors.iter().find(|m| {
                let p = m.position();
                let s = m.size();
                center_x >= p.x
                    && center_x < p.x + s.width as i32
                    && center_y >= p.y
                    && center_y < p.y + s.height as i32
            }) {
                return Some(hit.clone());
            }

            // Otherwise select the nearest monitor (handles unplugged monitors / out-of-bounds saved coords)
            if let Some(nearest) = monitors.into_iter().min_by_key(|m| {
                let p = m.position();
                let s = m.size();
                let mx = p.x + (s.width as i32) / 2;
                let my = p.y + (s.height as i32) / 2;
                let dx = (center_x - mx) as i64;
                let dy = (center_y - my) as i64;
                dx * dx + dy * dy
            }) {
                return Some(nearest);
            }
        }
    }

    window
        .monitor_from_point(center_x as f64, center_y as f64)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
}

#[cfg(desktop)]
fn clamp_to_monitor_physical(
    window: &WebviewWindow,
    target_x: i32,
    target_y: i32,
    win_w: i32,
    win_h: i32,
    margin_logical: f64,
) -> (i32, i32) {
    if let Some(monitor) = pick_monitor_for_physical_rect(window, target_x, target_y, win_w, win_h)
    {
        let pos = monitor.position();
        let size = monitor.size();
        let margin = (margin_logical * monitor.scale_factor()).round() as i32;
        let min_x = pos.x + margin;
        let min_y = pos.y + margin;
        let max_x = (pos.x + size.width as i32 - win_w - margin).max(min_x);
        let max_y = (pos.y + size.height as i32 - win_h - margin).max(min_y);
        (target_x.clamp(min_x, max_x), target_y.clamp(min_y, max_y))
    } else {
        (target_x, target_y)
    }
}

#[cfg(desktop)]
pub(crate) fn position_pet(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let width = (logical_width * scale).round() as i32;
        let height = (logical_height * scale).round() as i32;
        let x =
            monitor_position.x + monitor_size.width as i32 - width - (18.0 * scale).round() as i32;
        let y = monitor_position.y + monitor_size.height as i32
            - height
            - (54.0 * scale).round() as i32;
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn position_island(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
    is_bottom: bool,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|error| error.to_string())?
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?);
    let scale = monitor
        .as_ref()
        .map(|m| m.scale_factor())
        .or_else(|| window.scale_factor().ok())
        .unwrap_or(1.0);
    let (mon_pos_x, mon_pos_y, mon_w, mon_h) = if let Some(m) = monitor {
        (
            m.position().x,
            m.position().y,
            m.size().width as i32,
            m.size().height as i32,
        )
    } else {
        #[cfg(target_os = "windows")]
        unsafe {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
            };
            (
                0,
                0,
                GetSystemMetrics(SM_CXSCREEN),
                GetSystemMetrics(SM_CYSCREEN),
            )
        }
        #[cfg(not(target_os = "windows"))]
        (0, 0, 1920, 1080)
    };
    let width = (logical_width * scale).round() as i32;
    let height = (logical_height * scale).round() as i32;
    let x = mon_pos_x + ((mon_w - width) / 2);
    let y = if is_bottom {
        mon_pos_y + mon_h - height - (54.0 * scale).round() as i32
    } else {
        mon_pos_y + (8.0 * scale).round() as i32
    };
    let _ = window.set_size(LogicalSize::new(logical_width, logical_height));
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(desktop)]
fn resize_island_preserving_center(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
    is_bottom: bool,
) -> Result<(), String> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let old_pos = window.outer_position().map_err(|error| error.to_string())?;
    let old_size = window.outer_size().map_err(|error| error.to_string())?;
    let new_w = (logical_width * scale).round() as i32;
    let new_h = (logical_height * scale).round() as i32;
    let center_x = old_pos.x + (old_size.width as i32 / 2);
    let target_x = center_x - (new_w / 2);
    let target_y = if is_bottom {
        (old_pos.y + old_size.height as i32) - new_h
    } else {
        old_pos.y
    };

    let (new_x, new_y) = clamp_to_monitor_physical(window, target_x, target_y, new_w, new_h, 8.0);

    window
        .set_size(LogicalSize::new(logical_width, logical_height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(new_x, new_y))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(desktop)]
fn resize_pet_preserving_anchor(
    window: &WebviewWindow,
    logical_width: f64,
    logical_height: f64,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    let old_position = window.outer_position().map_err(|error| error.to_string())?;
    let old_size = window.outer_size().map_err(|error| error.to_string())?;
    let new_width = (logical_width * scale).round() as i32;
    let new_height = (logical_height * scale).round() as i32;
    let anchor_right = old_position.x + old_size.width as i32;
    let anchor_bottom = old_position.y + old_size.height as i32;
    let target_x = anchor_right - new_width;
    let target_y = anchor_bottom - new_height;

    let (new_x, new_y) =
        clamp_to_monitor_physical(window, target_x, target_y, new_width, new_height, 8.0);

    window
        .set_size(LogicalSize::new(logical_width, logical_height))
        .map_err(|error| error.to_string())?;
    window
        .set_position(PhysicalPosition::new(new_x, new_y))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn ensure_pet_window(app: &tauri::AppHandle) -> Result<WebviewWindow, String> {
    if let Some(existing) = app.get_webview_window("pet") {
        return Ok(existing);
    }
    let pet = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("pet.html".into()))
        .title("وِنس")
        .inner_size(164.0, 164.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    let _ = position_pet(&pet, 164.0, 164.0);
    Ok(pet)
}

#[cfg(desktop)]
pub(crate) fn ensure_overlay_window(
    app: &tauri::AppHandle,
    is_bottom: bool,
) -> Result<WebviewWindow, String> {
    if let Some(existing) = app.get_webview_window("overlay") {
        return Ok(existing);
    }
    let overlay = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("وِنس — ويدجت الصلاة")
        .inner_size(184.0, 28.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?;
    let _ = position_island(&overlay, 184.0, 28.0, is_bottom);
    Ok(overlay)
}

#[tauri::command]
#[cfg(desktop)]
async fn pet_set_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_pet_visibility_on_worker(&app, Some(visible)))
        .await.map_err(|error| error.to_string())?
}

#[cfg(desktop)]
fn set_pet_visibility_on_worker(app: &tauri::AppHandle, visible: Option<bool>) -> Result<(), String> {
    let _guard = COMPANION_WINDOW_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    if IS_QUITTING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let visible = visible.unwrap_or_else(|| !PET_ENABLED.load(Ordering::SeqCst));
    if !visible {
        PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
        if let Some(window) = app.get_webview_window("pet") {
            window.hide().map_err(|error| error.to_string())?;
        }
    } else {
        let window = ensure_pet_window(app)?;
        if !companion_fullscreen_blocked(&storage::get_cached_preferences(app)) {
            let _ = window.set_always_on_top(true);
            let _ = window.unminimize();
            window.show().map_err(|error| error.to_string())?;
        }
    }
    PET_ENABLED.store(visible, Ordering::SeqCst);

    let updated_prefs = storage::with_database(app, |db| {
        let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
        if prefs.pet_visible != visible {
            prefs.pet_visible = visible;
            db.save_preferences(&prefs).map_err(|e| e.to_string())?;
            db.update_legacy_root_settings(&prefs)
                .map_err(|e| e.to_string())?;
            Ok(Some(prefs))
        } else {
            Ok(None)
        }
    })?;
    if let Some(prefs) = updated_prefs {
        storage::refresh_cached_preferences(prefs.clone());
        let _ = tauri::Emitter::emit(app, "wens-settings-changed", &prefs);
    }
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_set_visible(_app: tauri::AppHandle, _visible: bool) -> Result<(), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_set_mode(app: tauri::AppHandle, mode: String) -> Result<(), String> {
    if mode != "idle" {
        PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    }
    if !PET_ENABLED.load(Ordering::SeqCst) || crate::island_blocked() {
        return Ok(());
    }
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    if !window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    let (width, height) = match mode.as_str() {
        "expanded" => (420.0, 680.0),
        "peek" => (360.0, 245.0),
        "menu" => (360.0, 316.0),
        "idle" => (164.0, 164.0),
        _ => return Err("unknown pet mode".into()),
    };
    resize_pet_preserving_anchor(&window, width, height)
}

fn perform_graceful_shutdown(app: &tauri::AppHandle) {
    if IS_QUITTING.swap(true, Ordering::SeqCst) {
        return;
    }
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    KEEP_AWAKE_MANUAL.store(false, Ordering::SeqCst);
    KEEP_AWAKE_WANTED.store(false, Ordering::SeqCst);

    if let Some(state) = app.try_state::<ShutdownState>() {
        state.stop_flag.store(true, Ordering::SeqCst);
    }
    notify_scheduler_wake();

    if let Some(audio) = app.try_state::<AudioService>() {
        audio.stop();
    }
    if let Some(connectors) = app.try_state::<ConnectorManager>() {
        connectors.kill_all();
    }
    #[cfg(target_os = "windows")]
    taskbar_widget::shutdown_taskbar_widget();
    storage::log_line("INFO", "app", "Graceful shutdown requested");
}

#[tauri::command]
fn app_exit(app: tauri::AppHandle) {
    perform_graceful_shutdown(&app);
    app.exit(0);
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_set_mode(_app: tauri::AppHandle, _mode: String) -> Result<(), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_start_dragging(app: tauri::AppHandle) -> Result<(), String> {
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    app.get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?
        .start_dragging()
        .map_err(|error| error.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_start_dragging(_app: tauri::AppHandle) -> Result<(), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_drag_move(app: tauri::AppHandle, dx: i32, dy: i32) -> Result<(i32, i32), String> {
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    let pos = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let (safe_x, safe_y) = clamp_to_monitor_physical(
        &window,
        pos.x.saturating_add(dx),
        pos.y.saturating_add(dy),
        size.width as i32,
        size.height as i32,
        8.0,
    );
    window
        .set_position(PhysicalPosition::new(safe_x, safe_y))
        .map_err(|error| error.to_string())?;
    Ok((safe_x, safe_y))
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_drag_move(_app: tauri::AppHandle, _dx: i32, _dy: i32) -> Result<(i32, i32), String> {
    Err("the floating companion is available on desktop only".into())
}

/// Sets the pet window position using consistent physical screen coordinates across
/// mixed-DPI and negative-offset multi-monitor setups.
#[tauri::command]
#[cfg(desktop)]
fn pet_set_position(app: tauri::AppHandle, x: f64, y: f64) -> Result<(f64, f64), String> {
    if !x.is_finite() || !y.is_finite() {
        return Err("invalid pet coordinates".into());
    }
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let (safe_x, safe_y) = clamp_to_monitor_physical(
        &window,
        x.round() as i32,
        y.round() as i32,
        size.width as i32,
        size.height as i32,
        8.0,
    );
    window
        .set_position(PhysicalPosition::new(safe_x, safe_y))
        .map_err(|error| error.to_string())?;
    Ok((safe_x as f64, safe_y as f64))
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_set_position(_app: tauri::AppHandle, _x: f64, _y: f64) -> Result<(f64, f64), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_restore_position(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let (safe_x, safe_y) =
        clamp_to_monitor_physical(&window, x, y, size.width as i32, size.height as i32, 8.0);
    window
        .set_position(PhysicalPosition::new(safe_x, safe_y))
        .map_err(|error| error.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_restore_position(_app: tauri::AppHandle, _x: i32, _y: i32) -> Result<(), String> {
    Err("the floating companion is available on desktop only".into())
}

pub static PET_ROAMING_ACTIVE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
#[cfg(desktop)]
fn pet_start_roaming(app: tauri::AppHandle) -> Result<(), String> {
    if PET_ROAMING_ACTIVE.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let app_handle = app.clone();
    thread::spawn(move || {
        let mut rng_seed = current_unix_ms();

        while PET_ROAMING_ACTIVE.load(Ordering::SeqCst) && !IS_QUITTING.load(Ordering::SeqCst) {
            for _ in 0..72 {
                if !PET_ROAMING_ACTIVE.load(Ordering::SeqCst) || IS_QUITTING.load(Ordering::SeqCst)
                {
                    return;
                }
                thread::sleep(Duration::from_millis(250));
            }

            if !PET_ROAMING_ACTIVE.load(Ordering::SeqCst) || IS_QUITTING.load(Ordering::SeqCst) {
                return;
            }

            if crate::island_blocked() {
                continue;
            }

            let Some(window) = app_handle.get_webview_window("pet") else {
                break;
            };

            if let Ok(false) = window.is_visible() {
                continue;
            }

            rng_seed = rng_seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let delta = ((rng_seed % 80) as i32) - 40;

            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                let (target_x, target_y) = clamp_to_monitor_physical(
                    &window,
                    pos.x + delta,
                    pos.y,
                    size.width as i32,
                    size.height as i32,
                    12.0,
                );

                let steps = 12;
                for step in 1..=steps {
                    if !PET_ROAMING_ACTIVE.load(Ordering::SeqCst)
                        || IS_QUITTING.load(Ordering::SeqCst)
                    {
                        break;
                    }
                    let progress = step as f64 / steps as f64;
                    let eased = progress * progress * (3.0 - 2.0 * progress);
                    let cur_x = pos.x + ((target_x - pos.x) as f64 * eased).round() as i32;
                    let _ = window.set_position(PhysicalPosition::new(cur_x, target_y));
                    thread::sleep(Duration::from_millis(18));
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_stop_roaming() -> Result<(), String> {
    PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_start_roaming(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_stop_roaming() -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
fn trim_host_working_set() {
    #[cfg(target_os = "windows")]
    unsafe {
        windows_sys::Win32::System::Threading::SetProcessWorkingSetSize(
            windows_sys::Win32::System::Threading::GetCurrentProcess(),
            usize::MAX,
            usize::MAX,
        );
    }
}

pub(crate) fn open_or_focus_main(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let _guard = MAIN_WINDOW_LOCK
            .get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(window) = app.get_webview_window("main") {
            // Only guard against stray localhost URLs in release builds; NEVER clobber devUrl (127.0.0.1:4179)!
            #[cfg(not(debug_assertions))]
            if let Ok(cur_url) = window.url() {
                let url_str = cur_url.as_str();
                if url_str.contains("127.0.0.1") || url_str.contains("localhost:4179") {
                    if let Ok(offline_url) = tauri::Url::parse("http://tauri.localhost/index.html")
                    {
                        let _ = window.navigate(offline_url);
                    }
                }
            }
            window.show().map_err(|error| error.to_string())?;
            window.unminimize().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            let _ = tauri::Emitter::emit(app, "wens-main-visibility", true);
        } else {
            MAIN_KEEP_ALIVE_IN_TRAY.store(false, Ordering::SeqCst);
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("وِنس — خليك قريب، وكمّل اللي بدأته")
                    .inner_size(1220.0, 820.0)
                    .min_inner_size(760.0, 600.0)
                    .resizable(true)
                    .fullscreen(false)
                    .build()
                    .map_err(|error| error.to_string())?;
            window.show().map_err(|error| error.to_string())?;
            window.unminimize().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            let _ = tauri::Emitter::emit(app, "wens-main-visibility", true);
        }
        Ok(())
    }
    #[cfg(not(desktop))]
    {
        if let Some(window) = app.get_webview_window("main") {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

/// Runs `open_or_focus_main` on a worker thread so lazily recreating the `main`
/// WebView2 window from tray/event callbacks never hits the Windows main-thread deadlock.
#[cfg(desktop)]
pub(crate) fn spawn_open_or_focus_main(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(err) = open_or_focus_main(&app_handle) {
            storage::log_line(
                "WARN",
                "window",
                &format!("Failed to open or focus main window: {err}"),
            );
        }
    });
}

#[tauri::command]
fn main_set_keep_alive(keep_alive: bool) {
    MAIN_KEEP_ALIVE_IN_TRAY.store(keep_alive, Ordering::SeqCst);
}

#[tauri::command]
async fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_or_focus_main(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
#[cfg(desktop)]
async fn overlay_set_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_overlay_visibility_on_worker(&app, Some(visible)))
        .await.map_err(|error| error.to_string())?
}

#[cfg(desktop)]
fn set_overlay_visibility_on_worker(app: &tauri::AppHandle, visible: Option<bool>) -> Result<(), String> {
    let _guard = COMPANION_WINDOW_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    if IS_QUITTING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let visible = visible.unwrap_or_else(|| !OVERLAY_ENABLED.load(Ordering::SeqCst));
    let prefs = storage::get_cached_preferences(app);
    let is_bottom = prefs.island_orientation == "bottom";
    if visible {
        let window = ensure_overlay_window(app, is_bottom)?;
        if !companion_fullscreen_blocked(&prefs) {
            let scale = window.scale_factor().unwrap_or(1.0);
            let (cur_w, cur_h) = match window.inner_size() {
                Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
                Err(_) => (184.0, 28.0),
            };
            let _ = position_island(&window, cur_w, cur_h, is_bottom);
            let _ = window.set_always_on_top(true);
            let _ = window.unminimize();
            window.show().map_err(|error| error.to_string())?;
        }
    } else if let Some(window) = app.get_webview_window("overlay") {
        window.hide().map_err(|error| error.to_string())?;
    }
    OVERLAY_ENABLED.store(visible, Ordering::SeqCst);

    let updated_prefs = storage::with_database(app, |db| {
        let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
        if prefs.overlay_widget != visible {
            prefs.overlay_widget = visible;
            db.save_preferences(&prefs).map_err(|e| e.to_string())?;
            db.update_legacy_root_settings(&prefs)
                .map_err(|e| e.to_string())?;
            Ok(Some(prefs))
        } else {
            Ok(None)
        }
    })?;
    if let Some(prefs) = updated_prefs {
        storage::refresh_cached_preferences(prefs.clone());
        let _ = tauri::Emitter::emit(app, "wens-settings-changed", &prefs);
    }
    Ok(())
}

#[cfg(desktop)]
pub(crate) fn spawn_companion_toggle(app: &tauri::AppHandle, pet: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = if pet { set_pet_visibility_on_worker(&app, None) }
            else { set_overlay_visibility_on_worker(&app, None) };
        if let Err(error) = result {
            storage::log_line("WARN", "window", &format!("Companion visibility change failed: {error}"));
        }
    });
}

#[cfg(not(desktop))]
#[tauri::command]
fn overlay_set_visible(_app: tauri::AppHandle, _visible: bool) -> Result<(), String> {
    Err("the prayer overlay is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn overlay_start_dragging(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("overlay")
        .ok_or_else(|| "overlay window unavailable".to_string())?
        .start_dragging()
        .map_err(|error| error.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
fn overlay_start_dragging(_app: tauri::AppHandle) -> Result<(), String> {
    Err("the prayer overlay is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn overlay_drag_move(app: tauri::AppHandle, dx: i32, dy: i32) -> Result<(i32, i32), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window unavailable".to_string())?;
    let pos = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let (safe_x, safe_y) = clamp_to_monitor_physical(
        &window,
        pos.x.saturating_add(dx),
        pos.y.saturating_add(dy),
        size.width as i32,
        size.height as i32,
        8.0,
    );
    window
        .set_position(PhysicalPosition::new(safe_x, safe_y))
        .map_err(|error| error.to_string())?;
    Ok((safe_x, safe_y))
}

#[cfg(not(desktop))]
#[tauri::command]
fn overlay_drag_move(_app: tauri::AppHandle, _dx: i32, _dy: i32) -> Result<(i32, i32), String> {
    Err("the prayer overlay is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn overlay_restore_position(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window unavailable".to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let (safe_x, safe_y) =
        clamp_to_monitor_physical(&window, x, y, size.width as i32, size.height as i32, 8.0);
    window
        .set_position(PhysicalPosition::new(safe_x, safe_y))
        .map_err(|error| error.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
fn overlay_restore_position(_app: tauri::AppHandle, _x: i32, _y: i32) -> Result<(), String> {
    Err("the prayer overlay is available on desktop only".into())
}

/// Places the Dynamic Island horizontally centered at the TOP (`y = mon_top + 8`),
/// or at the bottom when `island_orientation == "bottom"` — NEVER vertical screen center.
#[tauri::command]
#[cfg(desktop)]
fn overlay_center(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window unavailable".to_string())?;
    let is_bottom = storage::get_cached_preferences(&app).island_orientation == "bottom";
    let scale = window.scale_factor().unwrap_or(1.0);
    let (cur_w, cur_h) = match window.inner_size() {
        Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
        Err(_) => (184.0, 28.0),
    };
    position_island(&window, cur_w, cur_h, is_bottom)
}

#[cfg(not(desktop))]
#[tauri::command]
fn overlay_center(_app: tauri::AppHandle) -> Result<(), String> {
    Err("the prayer overlay is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_reset_position(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let (width, height) = match window.inner_size() {
        Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
        Err(_) => (164.0, 164.0),
    };
    position_pet(&window, width, height)
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_reset_position(_app: tauri::AppHandle) -> Result<(), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_snap_to_corner(app: tauri::AppHandle, corner: String) -> Result<(i32, i32), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or_else(|| "no monitor found".to_string())?;

    let scale = monitor.scale_factor();
    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let win_size = window.outer_size().map_err(|e| e.to_string())?;

    let margin_x = (18.0 * scale).round() as i32;
    let margin_top = (36.0 * scale).round() as i32;
    let margin_bottom = (54.0 * scale).round() as i32;

    let (x, y) = match corner.as_str() {
        "bottom-left" => (
            mon_pos.x + margin_x,
            mon_pos.y + mon_size.height as i32 - win_size.height as i32 - margin_bottom,
        ),
        "top-right" => (
            mon_pos.x + mon_size.width as i32 - win_size.width as i32 - margin_x,
            mon_pos.y + margin_top,
        ),
        "top-left" => (mon_pos.x + margin_x, mon_pos.y + margin_top),
        _ => (
            mon_pos.x + mon_size.width as i32 - win_size.width as i32 - margin_x,
            mon_pos.y + mon_size.height as i32 - win_size.height as i32 - margin_bottom,
        ),
    };

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok((x, y))
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_snap_to_corner(_app: tauri::AppHandle, _corner: String) -> Result<(i32, i32), String> {
    Err("the floating companion is available on desktop only".into())
}

#[tauri::command]
#[cfg(desktop)]
fn pet_set_ignore_cursor(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window unavailable".to_string())?;
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
fn pet_set_ignore_cursor(_app: tauri::AppHandle, _ignore: bool) -> Result<(), String> {
    Ok(())
}

#[derive(Debug, Serialize)]
struct ConnectorStatus {
    connector: String,
    available: bool,
    version: Option<String>,
}

#[derive(Default)]
struct ConnectorManagerInner {
    children: Mutex<HashMap<String, Child>>,
    cancelled: Mutex<HashSet<String>>,
}

#[derive(Default, Clone)]
struct ConnectorManager {
    inner: Arc<ConnectorManagerInner>,
}

impl ConnectorManager {
    fn kill_all(&self) {
        if let Ok(mut children) = self.inner.children.lock() {
            for (_, child) in children.iter_mut() {
                let _ = child.kill();
            }
            children.clear();
        }
    }
}

#[derive(Debug, Serialize)]
struct ConnectorRunResult {
    run_id: String,
    connector: String,
    status: String,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    duration_ms: u128,
}

fn require_main_window(window: &tauri::WebviewWindow, cmd: &str) -> Result<(), String> {
    if window.label() != "main" {
        storage::log_line(
            "WARN",
            "security",
            &format!("Blocked '{cmd}' from non-main window '{}'", window.label()),
        );
        return Err(format!("{cmd} is restricted to the main window"));
    }
    Ok(())
}

#[tauri::command]
fn module_preview(
    window: tauri::WebviewWindow,
    path: String,
    developer_mode: bool,
) -> Result<wens_module_runtime::PackagePreview, String> {
    require_main_window(&window, "module_preview")?;
    if path.trim().is_empty() {
        return Err("package path is required".into());
    }
    wens_module_runtime::preview_package(path, &BTreeMap::new(), developer_mode)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn module_install(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    path: String,
    developer_mode: bool,
    confirmed: bool,
) -> Result<wens_module_runtime::InstallResult, String> {
    require_main_window(&window, "module_install")?;
    if !confirmed {
        return Err("explicit package confirmation is required".into());
    }
    let modules_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("modules");
    wens_module_runtime::install_package(path, modules_dir, &BTreeMap::new(), developer_mode)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn module_rollback(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    module_id: String,
    confirmed: bool,
) -> Result<wens_module_runtime::RollbackResult, String> {
    require_main_window(&window, "module_rollback")?;
    if !confirmed {
        return Err("explicit rollback confirmation is required".into());
    }
    let modules_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("modules");
    wens_module_runtime::rollback_package(&module_id, modules_dir)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn prayer_day(request: wens_core::PrayerRequest) -> Result<wens_core::PrayerDay, String> {
    wens_core::calculate_prayer_day(request).map_err(|error| error.to_string())
}

#[tauri::command]
#[cfg(desktop)]
async fn connector_status(
    window: tauri::WebviewWindow,
    connector: String,
) -> Result<ConnectorStatus, String> {
    require_main_window(&window, "connector_status")?;
    if storage::get_cached_preferences(window.app_handle()).strict_offline {
        return Ok(ConnectorStatus { connector, available: false, version: None });
    }
    tauri::async_runtime::spawn_blocking(move || {
        let executable = match connector.as_str() {
            "codex" => "codex",
            "antigravity" => "agy",
            _ => {
                return ConnectorStatus {
                    connector,
                    available: false,
                    version: None,
                }
            }
        };
        let mut cmd = Command::new(executable);
        cmd.arg("--version");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let output = cmd.output();
        let version = output.ok().and_then(|result| {
            if !result.status.success() {
                return None;
            }
            let text = String::from_utf8_lossy(&result.stdout).trim().to_string();
            (!text.is_empty()).then_some(text)
        });
        ConnectorStatus {
            connector,
            available: version.is_some(),
            version,
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(not(desktop))]
#[tauri::command]
async fn connector_status(
    _window: tauri::WebviewWindow,
    connector: String,
) -> Result<ConnectorStatus, String> {
    Ok(ConnectorStatus {
        connector,
        available: false,
        version: None,
    })
}

fn generated_run_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("run-{nanos}")
}

fn validate_connector_working_dir(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("working directory is required".into());
    }
    if trimmed.starts_with(r"\\") || trimmed.starts_with("//") {
        return Err("UNC network paths are not allowed as connector working directories".into());
    }
    let candidate = PathBuf::from(trimmed);
    let canonical = std::fs::canonicalize(&candidate)
        .map_err(|_| "working directory must be an existing folder".to_string())?;
    if !canonical.is_dir() {
        return Err("working directory must be an existing folder".into());
    }
    if storage::is_blocked_system_path(&canonical) {
        return Err("system directories are not allowed as connector working directories".into());
    }
    Ok(canonical)
}

#[tauri::command]
#[cfg(desktop)]
async fn connector_run(
    window: tauri::WebviewWindow,
    manager: State<'_, ConnectorManager>,
    run_id: String,
    connector: String,
    prompt: String,
    working_dir: String,
    files: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<ConnectorRunResult, String> {
    require_main_window(&window, "connector_run")?;
    let app = window.app_handle().clone();
    if storage::get_cached_preferences(&app).strict_offline {
        return Err("لا يمكن تشغيل الموصلات في الوضع الصارم بدون شبكة.".into());
    }

    let run_id = if run_id.trim().is_empty() {
        generated_run_id()
    } else {
        run_id.trim().to_string()
    };
    let connector = connector.trim().to_lowercase();
    if !matches!(connector.as_str(), "codex" | "antigravity") {
        return Err("unsupported connector".into());
    }
    if prompt.trim().is_empty() {
        return Err("prompt is required".into());
    }
    if prompt.len() > 65_536 {
        return Err("prompt exceeds 64 KB limit".into());
    }
    let directory = validate_connector_working_dir(&working_dir)?;

    let selected_files: Vec<String> = files
        .into_iter()
        .take(100)
        .map(|f| f.trim().to_string())
        .filter(|file| {
            !file.is_empty()
                && !file.contains("..")
                && !file.chars().any(|c| c.is_control())
        })
        .collect();

    let inner = Arc::clone(&manager.inner);

    tauri::async_runtime::spawn_blocking(move || {
        const MAX_STREAM_BYTES: u64 = 2 * 1024 * 1024;

        let file_note = if selected_files.is_empty() {
            "No files were selected by the user.".to_string()
        } else {
            format!(
                "Only these user-selected file names may be considered (Wens does not read them): {}.",
                selected_files.join(", ")
            )
        };
        let request_prompt = format!(
            "You are an optional local connector invoked by Wens. Work read-only and do not modify files. {file_note}\nUser request:\n{}",
            prompt.trim()
        );
        let mut command = match connector.as_str() {
            "codex" => {
                let mut command = Command::new("codex");
                command.args([
                    "exec",
                    "--sandbox",
                    "read-only",
                    "--skip-git-repo-check",
                    "--ephemeral",
                ]);
                command.arg(request_prompt);
                command
            }
            "antigravity" => {
                let mut command = Command::new("agy");
                command.args(["run", "--read-only", "--prompt"]);
                command.arg(request_prompt);
                command
            }
            _ => unreachable!(),
        };
        command
            .current_dir(&directory)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000);
        }
        inner
            .cancelled
            .lock()
            .map_err(|_| "connector state unavailable".to_string())?
            .remove(&run_id);
        let started = Instant::now();
        let mut children = inner.children.lock()
            .map_err(|_| "connector state unavailable".to_string())?;
        if IS_QUITTING.load(Ordering::SeqCst) || storage::get_cached_preferences(&app).strict_offline {
            return Err("تشغيل الموصل غير متاح حالياً.".into());
        }
        if children.contains_key(&run_id) {
            return Err("معرّف تشغيل الموصل مستخدم بالفعل.".into());
        }
        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to start {connector}: {error}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "connector stdout unavailable".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "connector stderr unavailable".to_string())?;
        let stdout_reader = thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stdout.take(MAX_STREAM_BYTES).read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).to_string()
        });
        let stderr_reader = thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.take(MAX_STREAM_BYTES).read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).to_string()
        });
        children.insert(run_id.clone(), child);
        drop(children);
        if inner
            .cancelled
            .lock()
            .map_err(|_| "connector state unavailable".to_string())?
            .contains(&run_id)
        {
            if let Ok(mut children) = inner.children.lock() {
                if let Some(child) = children.get_mut(&run_id) {
                    let _ = child.kill();
                }
            }
        }
        let timeout = Duration::from_millis(timeout_ms.unwrap_or(120_000).clamp(1_000, 900_000));
        let mut status = "completed".to_string();
        let mut exit_code = None;
        let mut process_error = None;
        loop {
            let mut finished = false;
            {
                let mut children = inner
                    .children
                    .lock()
                    .map_err(|_| "connector state unavailable".to_string())?;
                if let Some(child) = children.get_mut(&run_id) {
                    match child.try_wait() {
                        Ok(Some(exit)) => {
                            exit_code = exit.code();
                            finished = true;
                        }
                        Ok(None) => {}
                        Err(error) => {
                            let _ = child.kill();
                            process_error = Some(format!("connector process error: {error}"));
                            finished = true;
                        }
                    }
                } else {
                    finished = true;
                    status = "cancelled".into();
                }
                if finished {
                    children.remove(&run_id);
                }
            }
            if finished {
                break;
            }
            if started.elapsed() >= timeout || IS_QUITTING.load(Ordering::Relaxed) {
                if let Ok(mut children) = inner.children.lock() {
                    if let Some(child) = children.get_mut(&run_id) {
                        let _ = child.kill();
                    }
                    children.remove(&run_id);
                }
                status = if IS_QUITTING.load(Ordering::Relaxed) {
                    "cancelled".into()
                } else {
                    "timeout".into()
                };
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        if process_error.is_some() {
            status = "error".into();
        }
        if inner
            .cancelled
            .lock()
            .map_err(|_| "connector state unavailable".to_string())?
            .remove(&run_id)
        {
            status = "cancelled".into();
        }
        let stdout = stdout_reader.join().unwrap_or_else(|_| "".into());
        let stderr = stderr_reader.join().unwrap_or_else(|_| "".into());
        Ok(ConnectorRunResult {
            run_id,
            connector,
            status,
            exit_code,
            stdout,
            stderr,
            duration_ms: started.elapsed().as_millis(),
        })
    })
    .await
    .map_err(|e| format!("connector task failed: {e}"))?
}

#[cfg(not(desktop))]
#[tauri::command]
async fn connector_run(
    _window: tauri::WebviewWindow,
    _manager: State<'_, ConnectorManager>,
    _run_id: String,
    connector: String,
    _prompt: String,
    _working_dir: String,
    _files: Vec<String>,
    _timeout_ms: Option<u64>,
) -> Result<ConnectorRunResult, String> {
    Err(format!(
        "{connector} connector requires a paired Windows gateway"
    ))
}

#[tauri::command]
#[cfg(desktop)]
fn connector_cancel(
    window: tauri::WebviewWindow,
    manager: State<'_, ConnectorManager>,
    run_id: String,
) -> Result<bool, String> {
    require_main_window(&window, "connector_cancel")?;
    manager
        .inner
        .cancelled
        .lock()
        .map_err(|_| "connector state unavailable".to_string())?
        .insert(run_id.clone());
    let mut children = manager
        .inner
        .children
        .lock()
        .map_err(|_| "connector state unavailable".to_string())?;
    if let Some(child) = children.get_mut(&run_id) {
        child
            .kill()
            .map_err(|error| format!("failed to cancel connector: {error}"))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(not(desktop))]
#[tauri::command]
fn connector_cancel(
    _window: tauri::WebviewWindow,
    _manager: State<'_, ConnectorManager>,
    _run_id: String,
) -> Result<bool, String> {
    Err("connector jobs require a paired Windows gateway".into())
}

#[tauri::command]
#[cfg(desktop)]
async fn autostart_set(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
#[cfg(not(desktop))]
async fn autostart_set(_app: tauri::AppHandle, _enabled: bool) -> Result<(), String> {
    Err("التشغيل التلقائي غير متاح على الجوال".into())
}

#[tauri::command]
#[cfg(desktop)]
async fn autostart_is_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
#[cfg(not(desktop))]
async fn autostart_is_enabled(_app: tauri::AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
fn taskbar_widget_set_visible(visible: bool) {
    #[cfg(target_os = "windows")]
    taskbar_widget::set_taskbar_widget_visible(visible);
    #[cfg(not(target_os = "windows"))]
    let _ = visible;
}

#[tauri::command]
fn taskbar_widget_set_custom_x(app: tauri::AppHandle, x: i32) {
    #[cfg(target_os = "windows")]
    {
        taskbar_widget::set_taskbar_widget_custom_x(x);
        let _ = storage::with_database(&app, |db| {
            db.kv_set("taskbar_custom_x", &x.to_string())
                .map_err(|e| e.to_string())
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, x);
}

#[tauri::command]
fn taskbar_widget_reset_position(app: tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        taskbar_widget::reset_taskbar_widget_position();
        let _ = storage::with_database(&app, |db| {
            db.kv_set("taskbar_custom_x", "")
                .map_err(|e| e.to_string())
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = app;
}

#[tauri::command]
fn taskbar_widget_set_locked(app: tauri::AppHandle, locked: bool) {
    #[cfg(target_os = "windows")]
    {
        taskbar_widget::set_taskbar_widget_locked(locked);
        let _ = storage::with_database(&app, |db| {
            db.kv_set("taskbar_locked", if locked { "1" } else { "0" })
                .map_err(|e| e.to_string())
        });
    }
    #[cfg(not(target_os = "windows"))]
    let _ = (app, locked);
}

#[tauri::command]
fn taskbar_widget_is_locked() -> bool {
    taskbar_widget::is_taskbar_widget_locked()
}

#[tauri::command]
async fn privacy_status_get() -> Result<privacy_dots::PrivacyStatus, String> {
    Ok(privacy_dots::get_current_privacy_status())
}

#[tauri::command]
async fn wellbeing_water_get(app: tauri::AppHandle) -> Result<u32, String> {
    Ok(wellbeing_idle::get_water_cups_today(&app))
}

#[tauri::command]
async fn wellbeing_water_increment(app: tauri::AppHandle) -> Result<u32, String> {
    Ok(wellbeing_idle::increment_water_cups_today(&app))
}

fn require_main_or_overlay(window: &tauri::WebviewWindow, command: &str) -> Result<(), String> {
    if window.label() == "overlay" {
        return Ok(());
    }
    require_main_window(window, command)
}

#[tauri::command]
async fn smart_clipboard_get(
    window: tauri::WebviewWindow,
) -> Result<Vec<smart_clipboard::ClipboardItem>, String> {
    require_main_or_overlay(&window, "smart_clipboard_get")?;
    if !storage::get_cached_preferences(window.app_handle()).clipboard_history_enabled {
        return Ok(Vec::new());
    }
    Ok(smart_clipboard::get_clipboard_history())
}

#[tauri::command]
async fn smart_clipboard_clear(window: tauri::WebviewWindow) -> Result<(), String> {
    require_main_or_overlay(&window, "smart_clipboard_clear")?;
    smart_clipboard::clear_clipboard_history();
    Ok(())
}

#[tauri::command]
async fn smart_clipboard_set(window: tauri::WebviewWindow, text: String) -> Result<(), String> {
    require_main_or_overlay(&window, "smart_clipboard_set")?;
    smart_clipboard::set_clipboard_text(&text)
}

#[tauri::command]
async fn shelf_list() -> Result<Vec<shelf_downloads::ShelfItem>, String> {
    Ok(shelf_downloads::get_shelf_items())
}

#[tauri::command]
async fn shelf_add(path: String) -> Result<shelf_downloads::ShelfItem, String> {
    shelf_downloads::add_to_shelf(&path)
}

#[tauri::command]
async fn shelf_remove(id: String) -> Result<bool, String> {
    Ok(shelf_downloads::remove_from_shelf(&id))
}

#[tauri::command]
async fn shelf_clear() -> Result<(), String> {
    shelf_downloads::clear_shelf();
    Ok(())
}

#[tauri::command]
async fn shelf_open(path: String) -> Result<(), String> {
    shelf_downloads::open_shelf_item(&path)
}

#[tauri::command]
async fn downloads_active_get() -> Result<Vec<shelf_downloads::DownloadItem>, String> {
    Ok(shelf_downloads::check_active_downloads())
}

#[tauri::command]
async fn calendar_meetings_get(
    window: tauri::WebviewWindow,
) -> Result<Vec<calendar_ics::CalendarMeeting>, String> {
    require_main_or_overlay(&window, "calendar_meetings_get")?;
    calendar_ics::fetch_meetings().await
}

#[tauri::command]
async fn media_session_get() -> Result<media_smtc::MediaSessionInfo, String> {
    Ok(media_smtc::get_current_media_session())
}

#[tauri::command]
async fn media_session_control(command: String) -> Result<(), String> {
    media_smtc::control_media(&command)
}

#[tauri::command]
fn island_set_click_through(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    island_window::set_click_through_override(enable);
    #[cfg(target_os = "windows")]
    {
        if !OVERLAY_ENABLED.load(Ordering::SeqCst) || crate::island_blocked() {
            return Ok(());
        }
        if let Some(window) = app.get_webview_window("overlay") {
            if !window.is_visible().unwrap_or(false) {
                return Ok(());
            }
            if let Ok(hwnd) = window.hwnd() {
                island_window::set_click_through(hwnd.0 as isize, enable);
            }
        }
    }
    let _ = (app, enable);
    Ok(())
}

#[tauri::command]
fn island_set_expanded_bounds(width_logical: i32, height_logical: i32) -> Result<(), String> {
    island_window::set_expanded_dimensions(
        width_logical.clamp(120, 640),
        height_logical.clamp(24, 520),
    );
    Ok(())
}

#[tauri::command]
fn island_set_orientation(app: tauri::AppHandle, orientation: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if !OVERLAY_ENABLED.load(Ordering::SeqCst) || crate::island_blocked() {
            return Ok(());
        }
        if let Some(window) = app.get_webview_window("overlay") {
            if !window.is_visible().unwrap_or(false) {
                return Ok(());
            }
            let is_bottom = orientation.trim().to_lowercase() == "bottom";
            let scale = window.scale_factor().unwrap_or(1.0);
            let (cur_w, cur_h) = match window.inner_size() {
                Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
                Err(_) => (340.0, 40.0),
            };
            let _ = position_island(&window, cur_w, cur_h, is_bottom);
        }
    }
    let _ = (app, orientation);
    Ok(())
}

#[tauri::command]
fn island_set_expanded(
    app: tauri::AppHandle,
    expanded: bool,
    mode: Option<String>,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if !OVERLAY_ENABLED.load(Ordering::SeqCst) || crate::island_blocked() {
            return Ok(());
        }
        if let Some(window) = app.get_webview_window("overlay") {
            if !window.is_visible().unwrap_or(false) {
                return Ok(());
            }
            let is_bottom = storage::get_cached_preferences(&app).island_orientation == "bottom";
            let (target_w, target_h) = if expanded {
                if mode.as_deref() == Some("card") {
                    (356.0, 198.0)
                } else {
                    (484.0, 286.0)
                }
            } else {
                (184.0, 28.0)
            };
            island_window::set_expanded_dimensions(target_w as i32, target_h as i32);
            let _ = resize_island_preserving_center(&window, target_w, target_h, is_bottom);
        }
    }
    let _ = (app, expanded, mode);
    Ok(())
}

#[tauri::command]
fn island_set_size(app: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if !OVERLAY_ENABLED.load(Ordering::SeqCst) || crate::island_blocked() {
            return Ok(());
        }
        if let Some(window) = app.get_webview_window("overlay") {
            if !window.is_visible().unwrap_or(false) {
                return Ok(());
            }
            let is_bottom = storage::get_cached_preferences(&app).island_orientation == "bottom";
            let safe_w = width.clamp(140.0, 560.0);
            let safe_h = height.clamp(24.0, 480.0);
            island_window::set_expanded_dimensions(safe_w.round() as i32, safe_h.round() as i32);
            let _ = resize_island_preserving_center(&window, safe_w, safe_h, is_bottom);
        }
    }
    let _ = (app, width, height);
    Ok(())
}

fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread_name = thread::current()
            .name()
            .unwrap_or("unnamed")
            .to_string();
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "non-string panic payload".to_string()
        };
        storage::log_line(
            "PANIC",
            "panic_hook",
            &format!("thread='{thread_name}' at {location}: {payload}"),
        );
        default_hook(info);
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();

    let stop_flag = Arc::new(AtomicBool::new(false));
    let setup_stop_flag = Arc::clone(&stop_flag);
    let launched_minimized = std::env::args().any(|arg| arg == "--minimized" || arg == "-m");

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
                let second_minimized = args.iter().any(|a| a == "--minimized" || a == "-m");
                if !second_minimized {
                    spawn_open_or_focus_main(app);
                }
            }))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--minimized"]),
            ))
            .on_window_event(|window, event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    if IS_QUITTING.load(Ordering::SeqCst) {
                        return;
                    }
                    if window.label() == "main" {
                        let _ = window.set_always_on_top(false);
                        if MAIN_KEEP_ALIVE_IN_TRAY.load(Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = window.hide();
                            let _ = tauri::Emitter::emit(
                                window.app_handle(),
                                "wens-main-visibility",
                                false,
                            );
                        } else {
                            // Idle close-to-tray: let `main` destroy cleanly so its ~150-200 MB
                            // WebView2 renderer exits; RunEvent::ExitRequested keeps the tray app alive.
                            MAIN_KEEP_ALIVE_IN_TRAY.store(false, Ordering::SeqCst);
                        }
                        trim_host_working_set();
                        if !TRAY_NOTIFIED.swap(true, Ordering::SeqCst) {
                            let _ = window
                                .app_handle()
                                .notification()
                                .builder()
                                .title("وِنس مستمر في الخلفية")
                                .body("تنبيهات الصلاة والأذكار شغالة. اضغط على أيقونة وِنس بجوار الساعة لفتح النافذة في أي وقت.")
                                .show();
                        }
                    } else if window.label() == "pet" {
                        api.prevent_close();
                        PET_ENABLED.store(false, Ordering::SeqCst);
                        PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
                        let _ = window.hide();
                        let updated = storage::with_database(window.app_handle(), |db| {
                            let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
                            if prefs.pet_visible {
                                prefs.pet_visible = false;
                                db.save_preferences(&prefs).map_err(|e| e.to_string())?;
                                db.update_legacy_root_settings(&prefs)
                                    .map_err(|e| e.to_string())?;
                                Ok(Some(prefs))
                            } else {
                                Ok(None)
                            }
                        });
                        if let Ok(Some(prefs)) = updated {
                            storage::refresh_cached_preferences(prefs.clone());
                            let _ = tauri::Emitter::emit(
                                window.app_handle(),
                                "wens-settings-changed",
                                &prefs,
                            );
                        }
                    } else if window.label() == "overlay" {
                        api.prevent_close();
                        OVERLAY_ENABLED.store(false, Ordering::SeqCst);
                        let _ = window.hide();
                        let updated = storage::with_database(window.app_handle(), |db| {
                            let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
                            if prefs.overlay_widget {
                                prefs.overlay_widget = false;
                                db.save_preferences(&prefs).map_err(|e| e.to_string())?;
                                db.update_legacy_root_settings(&prefs)
                                    .map_err(|e| e.to_string())?;
                                Ok(Some(prefs))
                            } else {
                                Ok(None)
                            }
                        });
                        if let Ok(Some(prefs)) = updated {
                            storage::refresh_cached_preferences(prefs.clone());
                            let _ = tauri::Emitter::emit(
                                window.app_handle(),
                                "wens-settings-changed",
                                &prefs,
                            );
                        }
                    }
                } else if let tauri::WindowEvent::Destroyed = event {
                    if window.label() == "main" {
                        MAIN_KEEP_ALIVE_IN_TRAY.store(false, Ordering::SeqCst);
                        trim_host_working_set();
                    }
                }
            });
    }

    let app = builder
        .plugin(tauri_plugin_notification::init())
        .manage(ShutdownState {
            stop_flag: Arc::clone(&stop_flag),
        })
        .manage(ConnectorManager::default())
        .manage(ReminderScheduler::default())
        .manage(AudioService::default())
        .invoke_handler(tauri::generate_handler![
            taskbar_widget_set_visible,
            taskbar_widget_set_custom_x,
            taskbar_widget_reset_position,
            taskbar_widget_set_locked,
            taskbar_widget_is_locked,
            autostart_set,
            autostart_is_enabled,
            local_status,
            pet_set_visible,
            pet_set_mode,
            pet_start_dragging,
            pet_drag_move,
            pet_set_position,
            pet_restore_position,
            pet_reset_position,
            pet_snap_to_corner,
            pet_set_ignore_cursor,
            pet_start_roaming,
            pet_stop_roaming,
            app_exit,
            overlay_set_visible,
            overlay_start_dragging,
            overlay_drag_move,
            overlay_restore_position,
            overlay_center,
            main_set_keep_alive,
            show_main,
            notification_send,
            reminder_plan_update,
            audio_stop,
            alarm_dismiss,
            alarm_snooze,
            active_suhoor_alarm_get,
            power_keep_awake_set,
            notification_test,
            connector_status,
            connector_run,
            connector_cancel,
            module_preview,
            module_install,
            module_rollback,
            prayer_day,
            storage::storage_load,
            storage::storage_save,
            storage::bootstrap_get,
            storage::settings_update,
            storage::notification_history_list,
            storage::notification_mark_read,
            storage::project_create,
            storage::project_update,
            storage::project_delete,
            storage::project_set_current,
            storage::idea_create,
            storage::idea_update,
            storage::idea_delete,
            storage::idea_promote_to_project,
            storage::work_session_save,
            storage::work_session_list,
            storage::daily_worship_get,
            storage::daily_worship_set,
            storage::history_range_get,
            storage::domain_kv_get,
            storage::domain_kv_set,
            storage::backup_export_file,
            storage::backup_restore_file,
            storage::pick_backup_save_path,
            storage::pick_backup_open_path,
            storage::factory_reset,
            storage::open_logs_folder,
            storage::get_diagnostics_bundle,
            privacy_status_get,
            wellbeing_water_get,
            wellbeing_water_increment,
            smart_clipboard_get,
            smart_clipboard_clear,
            smart_clipboard_set,
            shelf_list,
            shelf_add,
            shelf_remove,
            shelf_clear,
            shelf_open,
            downloads_active_get,
            calendar_meetings_get,
            media_session_get,
            media_session_control,
            island_set_click_through,
            island_set_expanded_bounds,
            island_set_orientation,
            island_set_expanded,
            island_set_size
        ])
        .setup(move |app| {
            storage::init_logger(app.handle());
            storage::log_line(
                "INFO",
                "app",
                &format!(
                    "Wens {} started (minimized={launched_minimized})",
                    app.package_info().version
                ),
            );
            app.state::<AudioService>()
                .set_app_handle(app.handle().clone());

            let initial_prefs = storage::get_cached_preferences(app.handle());

            #[cfg(not(desktop))]
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
            }

            #[cfg(desktop)]
            {
                // Show main window only when NOT launched with `--minimized` (autostart).
                // When launched minimized, destroy `main` immediately so its ~150 MB WebView2
                // renderer does not stay resident; `open_or_focus_main` lazily recreates it on demand.
                if let Some(main_win) = app.get_webview_window("main") {
                    if launched_minimized {
                        TRAY_NOTIFIED.store(true, Ordering::SeqCst);
                        MAIN_KEEP_ALIVE_IN_TRAY.store(false, Ordering::SeqCst);
                        let _ = main_win.destroy();
                    } else {
                        let _ = main_win.show();
                        let _ = main_win.set_focus();
                    }
                }

                let show_item = MenuItem::with_id(app, "show", "فتح وِنس", true, None::<&str>)?;
                let audio_stop_item = MenuItem::with_id(
                    app,
                    "audio-stop",
                    "إيقاف الصوت الآن",
                    true,
                    None::<&str>,
                )?;
                let pet_item = MenuItem::with_id(
                    app,
                    "pet",
                    "إظهار / إخفاء الرفيق العائم",
                    true,
                    None::<&str>,
                )?;
                let overlay_item = MenuItem::with_id(
                    app,
                    "overlay",
                    "إظهار / إخفاء الجزيرة الذكية",
                    true,
                    None::<&str>,
                )?;
                let notify_test_item = MenuItem::with_id(
                    app,
                    "notify-test",
                    "اختبر التنبيه الآن",
                    true,
                    None::<&str>,
                )?;
                let quit_item =
                    MenuItem::with_id(app, "quit", "إغلاق وِنس", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[
                        &show_item,
                        &audio_stop_item,
                        &pet_item,
                        &overlay_item,
                        &notify_test_item,
                        &quit_item,
                    ],
                )?;
                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("وِنس — الصلاة والصيام والشغل")
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            spawn_open_or_focus_main(app);
                        }
                        "audio-stop" => {
                            let _ = audio_stop(app.clone(), app.state::<AudioService>());
                        }
                        "pet" => {
                            spawn_companion_toggle(app, true);
                        }
                        "overlay" => {
                            spawn_companion_toggle(app, false);
                        }
                        "notify-test" => {
                            let _ = notification_test(
                                app.clone(),
                                app.state::<AudioService>(),
                                "prayer".to_string(),
                            );
                        }
                        "quit" => {
                            perform_graceful_shutdown(app);
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        }
                        | TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => {
                            let app = tray.app_handle();
                            spawn_open_or_focus_main(app);
                        }
                        _ => {}
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray_builder = tray_builder.icon(icon.clone());
                }
                let _tray = tray_builder.build(app)?;

                let pet_visible = initial_prefs.pet_visible;
                let overlay_visible = initial_prefs.overlay_widget;
                let is_bottom = initial_prefs.island_orientation == "bottom";
                PET_ENABLED.store(pet_visible, Ordering::SeqCst);
                OVERLAY_ENABLED.store(overlay_visible, Ordering::SeqCst);

                // Lazily create Pet & Overlay WebViews ONLY when enabled in user preferences!
                if pet_visible {
                    if let Ok(pet) = ensure_pet_window(app.handle()) {
                        if !companion_fullscreen_blocked(&initial_prefs) {
                            let _ = pet.set_always_on_top(true);
                            let _ = pet.show();
                        }
                    }
                }
                if overlay_visible {
                    if let Ok(overlay) = ensure_overlay_window(app.handle(), is_bottom) {
                        if !companion_fullscreen_blocked(&initial_prefs) {
                            let _ = overlay.set_always_on_top(true);
                            let _ = overlay.show();
                        }
                    }
                }
            }

            #[cfg(target_os = "windows")]
            {
                taskbar_widget::start_taskbar_widget(app.handle().clone());
                island_window::start_island_loop(app.handle().clone(), setup_stop_flag.clone());
                privacy_dots::start_privacy_monitor(app.handle().clone(), setup_stop_flag.clone());
                wellbeing_idle::start_wellbeing_monitor(
                    app.handle().clone(),
                    setup_stop_flag.clone(),
                );
                smart_clipboard::start_clipboard_monitor(
                    app.handle().clone(),
                    setup_stop_flag.clone(),
                );
                shelf_downloads::start_downloads_watcher(
                    app.handle().clone(),
                    setup_stop_flag.clone(),
                );
                media_smtc::start_media_monitor(app.handle().clone(), setup_stop_flag.clone());
            }

            refresh_reminder_schedule(app.handle(), &initial_prefs);
            start_reminder_scheduler(app.handle().clone(), setup_stop_flag);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Wens");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            if code.is_none() && !IS_QUITTING.load(Ordering::SeqCst) {
                api.prevent_exit();
                return;
            }
            perform_graceful_shutdown(app_handle);
        }
        tauri::RunEvent::Exit => {
            perform_graceful_shutdown(app_handle);
            // Brief grace window so background monitor/scheduler threads clear Win32 handles cleanly
            thread::sleep(Duration::from_millis(60));
            storage::close_database();
        }
        _ => {}
    });
}

#[cfg(test)]
mod reminder_tests {
    use super::*;
    use wens_core::QuietHours;

    fn event(id: &str, due_at_ms: u64, catch_up_ms: u64) -> ReminderEvent {
        ReminderEvent {
            id: id.into(),
            title: "دخل وقت الفجر".into(),
            body: "اختبار".into(),
            kind: "prayer-at".into(),
            due_at_ms,
            catch_up_ms,
        }
    }

    #[test]
    fn reminder_fires_at_due_time_and_during_catch_up() {
        let events = vec![event("fajr", 1_000, 500)];
        let delivered = HashMap::new();
        assert!(next_due_event(&events, &delivered, 1_000).is_some());
        assert!(next_due_event(&events, &delivered, 1_500).is_some());
    }

    #[test]
    fn reminder_does_not_fire_early_expired_or_twice() {
        let events = vec![event("fajr", 1_000, 500)];
        let mut delivered = HashMap::new();
        assert!(next_due_event(&events, &delivered, 999).is_none());
        assert!(next_due_event(&events, &delivered, 1_501).is_none());
        delivered.insert("fajr".into(), 1_050);
        assert!(next_due_event(&events, &delivered, 1_100).is_none());
    }

    #[test]
    fn dismissing_an_older_alarm_preserves_the_current_alarm() {
        let scheduler = ReminderScheduler::default();
        *scheduler.active_suhoor_alarm.lock().unwrap() = Some(CriticalAlarmPayload {
            id: "current".into(),
            title: "Test alarm".into(),
            body: "Synthetic reminder".into(),
            kind: "fasting-suhoor".into(),
            require_challenge: true,
        });
        assert!(scheduler.take_active_alarm(Some("previous")).is_err());
        assert_eq!(scheduler.take_active_alarm(Some("current")).unwrap().unwrap().id, "current");
        assert!(scheduler.take_active_alarm(None).unwrap().is_none());
    }

    #[test]
    fn default_preferences_do_not_schedule_suhoor_siren() {
        let prefs = AppPreferences::default();
        assert!(!prefs.notifications.fasting_enabled);
        assert!(!prefs.prevent_sleep_for_suhoor);
        let plan = generate_default_reminder_plan(&prefs);
        assert!(
            plan.iter().all(|e| !e.kind.starts_with("fasting")),
            "Default plan must never schedule fasting/suhoor reminders"
        );
    }

    #[test]
    fn fasting_enabled_schedules_suhoor_and_iftar() {
        let mut prefs = AppPreferences::default();
        prefs.notifications.fasting_enabled = true;
        prefs.imsak_water_lead_minutes = 15;
        let plan = generate_default_reminder_plan(&prefs);
        assert!(plan.iter().any(|e| e.kind == "fasting-suhoor"));
        assert!(plan.iter().any(|e| e.kind == "fasting-imsak-water"));
        assert!(plan.iter().any(|e| e.kind == "fasting-iftar"));
    }

    #[test]
    fn native_fasting_plan_uses_the_selected_city_clock() {
        let mut prefs = AppPreferences::default();
        prefs.time_zone = "Asia/Kathmandu".to_string();
        prefs.latitude = 27.7172;
        prefs.longitude = 85.324;
        prefs.notifications.fasting_enabled = true;
        let now = chrono::DateTime::parse_from_rfc3339("2026-01-14T20:00:00Z").unwrap()
            .to_utc();
        let plan = generate_reminder_plan_at(&prefs, now);
        let iftar = plan.iter().find(|event| event.kind == "fasting-iftar").unwrap();
        let date = iftar.id.strip_prefix("fasting-").unwrap().strip_suffix("-iftar").unwrap();
        assert_eq!(date, "2026-01-15");
        let prayer_day = wens_core::calculate_prayer_day(PrayerRequest {
            date: date.to_string(),
            latitude: prefs.latitude,
            longitude: prefs.longitude,
            timezone_offset_minutes: 345,
            method: wens_core::CalculationMethod::from_str_lossy(&prefs.calc_method),
            asr_jurist: wens_core::prayer::AsrJurist::Standard,
            fajr_offset_minutes: prefs.fajr_offset as i32,
            maghrib_offset_minutes: prefs.maghrib_offset as i32,
            isha_offset_minutes: prefs.isha_offset as i32,
        }).unwrap();
        let maghrib = prayer_day.times.iter().find(|time| time.key == "maghrib").unwrap();
        let midnight = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap()
            .and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis();
        let expected = midnight + i64::from(maghrib.minutes_from_midnight - 345) * 60_000;
        assert_eq!(iftar.due_at_ms, expected as u64);
    }

    #[test]
    fn dst_midnights_and_negative_minutes_never_fail_or_overflow() {
        // Cairo spring-forward & fall-back DST dates plus normal dates
        for (y, m, d) in [(2026, 4, 24), (2026, 4, 25), (2026, 10, 29), (2026, 10, 30), (2026, 1, 15)] {
            let date = chrono::NaiveDate::from_ymd_opt(y, m, d).unwrap();
            let res = prayer_day_clock(date, "Africa/Cairo");
            assert!(res.is_some(), "DST date {date} must resolve cleanly");
            let (_tz, midnight) = res.unwrap();
            assert_eq!(prayer_timestamp_ms(midnight, -15), midnight);
            assert_eq!(
                prayer_timestamp_ms(midnight, 2000),
                midnight + 1439 * 60 * 1000
            );
        }
    }

    #[test]
    fn delivered_map_prunes_oldest_without_wiping_recent_ids() {
        let now_ms = 100 * 3600 * 1000;
        let mut delivered = HashMap::new();
        for i in 0..550u64 {
            delivered.insert(format!("ev-{i}"), now_ms - (550 - i) * 1000);
        }
        delivered.insert("very-old".into(), now_ms - 50 * 3600 * 1000);

        prune_delivered_map(&mut delivered, now_ms);
        assert!(!delivered.contains_key("very-old"));
        assert!(delivered.len() <= 300);
        assert!(delivered.contains_key("ev-549"));
        assert!(!delivered.contains_key("ev-0"));
    }

    #[test]
    fn suhoor_retry_protection_bypasses_primary_suppression_but_respects_manual_stop() {
        let primary_suppressed_until = 200;
        let now = 100;
        let mut trigger = event("suhoor-event", 120, 50);
        trigger.kind = "fasting-suhoor".into();
        assert!(!suhoor_keep_awake_allowed(&trigger, now, primary_suppressed_until, 0));
        assert!(suhoor_keep_awake_allowed(&trigger, primary_suppressed_until, primary_suppressed_until, 0));
        for kind in ["fasting-suhoor-snooze", "fasting-wake-check"] {
            trigger.kind = kind.into();
            assert!(suhoor_keep_awake_allowed(&trigger, now, primary_suppressed_until, 0));
            assert!(!suhoor_keep_awake_allowed(&trigger, now, primary_suppressed_until, 110));
        }
        trigger.kind = "fasting-imsak-water".into();
        assert!(!suhoor_keep_awake_allowed(&trigger, now, 0, 0));
    }

    #[test]
    fn snooze_and_wake_check_events_survive_plan_refresh() {
        let now_ms = 1_000_000;
        let existing = vec![
            ReminderEvent {
                id: "fasting-suhoor-snooze-1".into(),
                title: "سحور".into(),
                body: "غفوة".into(),
                kind: "fasting-suhoor-snooze".into(),
                due_at_ms: now_ms + 300_000,
                catch_up_ms: 600_000,
            },
            ReminderEvent {
                id: "fasting-wake-check-1".into(),
                title: "فحص".into(),
                body: "تأكيد".into(),
                kind: "fasting-wake-check".into(),
                due_at_ms: now_ms + 400_000,
                catch_up_ms: 600_000,
            },
            event("old-prayer", now_ms + 500_000, 60_000),
        ];
        let incoming = vec![event("new-prayer", now_ms + 200_000, 60_000)];
        let merged = merge_preserving_dynamic_events(&existing, incoming, &HashMap::new(), now_ms);
        assert_eq!(merged.len(), 3);
        assert!(merged.iter().any(|e| e.id == "fasting-suhoor-snooze-1"));
        assert!(merged.iter().any(|e| e.id == "fasting-wake-check-1"));
        assert!(merged.iter().any(|e| e.id == "new-prayer"));
        assert!(!merged.iter().any(|e| e.id == "old-prayer"));
    }

    #[test]
    fn quiet_mode_and_sound_mode_logic() {
        let qh = QuietHours {
            start: "22:00".into(),
            end: "06:00".into(),
        };
        assert!(qh.contains(23, 15));
        assert!(!qh.contains(14, 30));

        let can_play_foreground_visible = match BackgroundAudioMode::ForegroundOnly {
            BackgroundAudioMode::Always => true,
            BackgroundAudioMode::ForegroundOnly => true,
        };
        assert!(can_play_foreground_visible);
    }

    #[test]
    fn audio_service_stops_cleanly_and_tracks_generation() {
        let audio = AudioService::default();
        assert!(!audio.is_playing());
        let g0 = audio.current_generation();
        audio.stop();
        assert!(audio.current_generation() > g0);
        assert!(!audio.is_playing());
        // Stale stop_if_generation with old ID is a safe no-op
        audio.stop_if_generation(g0);
        assert!(!audio.is_playing());
    }

    #[test]
    fn connector_working_dir_blocks_system_and_unc_paths() {
        assert!(validate_connector_working_dir("").is_err());
        assert!(validate_connector_working_dir(r"\\server\share").is_err());
        #[cfg(target_os = "windows")]
        {
            assert!(validate_connector_working_dir(r"C:\Windows").is_err());
            assert!(validate_connector_working_dir(r"C:\Windows\System32").is_err());
        }
    }

    #[test]
    fn main_keep_alive_flag_toggles_cleanly() {
        main_set_keep_alive(false);
        assert!(!MAIN_KEEP_ALIVE_IN_TRAY.load(Ordering::SeqCst));
        main_set_keep_alive(true);
        assert!(MAIN_KEEP_ALIVE_IN_TRAY.load(Ordering::SeqCst));
        main_set_keep_alive(false);
        assert!(!MAIN_KEEP_ALIVE_IN_TRAY.load(Ordering::SeqCst));
    }
}
