use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock, RwLock};
use tauri::{AppHandle, Manager};
use wens_core::{
    AppPreferences, BootstrapPayload, CreateIdea, CreateProject, DailyWorshipRecord, Database,
    Idea, NotificationRecord, NotificationSummary, Project, UpdateIdea, UpdateProject,
    WorkSessionRecord, CURRENT_SCHEMA_VERSION,
};

const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
const MAX_BACKUP_BYTES: u64 = 25 * 1024 * 1024;

static DB_POOL: OnceLock<Mutex<Option<Database>>> = OnceLock::new();
static PREFS_CACHE: OnceLock<RwLock<Option<AppPreferences>>> = OnceLock::new();
static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();
static LOG_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static BACKUP_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn db_pool() -> &'static Mutex<Option<Database>> {
    DB_POOL.get_or_init(|| Mutex::new(None))
}

fn prefs_cache() -> &'static RwLock<Option<AppPreferences>> {
    PREFS_CACHE.get_or_init(|| RwLock::new(None))
}

fn log_lock() -> &'static Mutex<()> {
    LOG_LOCK.get_or_init(|| Mutex::new(()))
}

pub fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("wens.sqlite3"))
}

pub fn logs_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

pub fn init_logger(app: &AppHandle) {
    if let Ok(dir) = logs_dir_path(app) {
        let _ = LOG_DIR.set(dir);
    }
}

pub fn log_line(level: &str, module: &str, msg: &str) {
    let sanitized = msg.replace(['\r', '\n'], " ");
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f %:z");
    let line = format!("[{ts}] [{level}] [{module}] {sanitized}\n");

    let Some(dir) = LOG_DIR.get() else {
        #[cfg(debug_assertions)]
        eprint!("{line}");
        return;
    };

    let _guard = log_lock().lock().unwrap_or_else(|e| e.into_inner());
    let log_path = dir.join("wens.log");
    let rotated_path = dir.join("wens.log.1");

    if let Ok(meta) = fs::metadata(&log_path) {
        if meta.len() >= MAX_LOG_BYTES {
            let _ = fs::remove_file(&rotated_path);
            let _ = fs::rename(&log_path, &rotated_path);
        }
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Shared single-connection SQLite accessor. Opens SQLite once per process.
pub fn with_database<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    F: FnOnce(&Database) -> Result<T, String>,
{
    let mut guard = db_pool().lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let path = database_path(app)?;
        let db = Database::open(&path).map_err(|error| {
            log_line("ERROR", "storage", &format!("Database::open failed: {error}"));
            error.to_string()
        })?;
        *guard = Some(db);
    }
    let db = guard
        .as_ref()
        .ok_or_else(|| "database unavailable".to_string())?;
    f(db)
}

/// Closes the shared SQLite connection cleanly on shutdown so WAL checkpoints flush.
pub fn close_database() {
    let mut guard = db_pool().lock().unwrap_or_else(|e| e.into_inner());
    *guard = None;
}

/// Compatibility wrapper for any external caller expecting an owned `Database`.
pub fn open_database(app: &AppHandle) -> Result<Database, String> {
    Database::open(database_path(app)?).map_err(|error| error.to_string())
}

/// O(1) RAM preference reader backed by process-wide RwLock cache.
pub fn get_cached_preferences(app: &AppHandle) -> AppPreferences {
    if let Some(prefs) = prefs_cache()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
    {
        return prefs.clone();
    }

    let loaded = with_database(app, |db| db.get_preferences().map_err(|e| e.to_string()))
        .unwrap_or_default();
    refresh_cached_preferences(loaded.clone());
    loaded
}

pub fn refresh_cached_preferences(prefs: AppPreferences) {
    let mut guard = prefs_cache().write().unwrap_or_else(|e| e.into_inner());
    crate::calendar_ics::update_calendar_policy(&prefs);
    *guard = Some(prefs);
}

fn ensure_main_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        log_line(
            "WARN",
            "security",
            &format!(
                "Blocked privileged IPC command from non-main window '{}'",
                window.label()
            ),
        );
        return Err("هذا الإجراء متاح فقط من نافذة التطبيق الرئيسية.".into());
    }
    Ok(())
}

fn normalize_path_for_prefix_check(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let stripped = raw
        .strip_prefix(r"\\?\")
        .or_else(|| raw.strip_prefix("//?/"))
        .unwrap_or(&raw);
    stripped
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

pub fn is_blocked_system_path(path: &Path) -> bool {
    let norm = normalize_path_for_prefix_check(path);
    if norm.is_empty() {
        return true;
    }

    #[cfg(target_os = "windows")]
    {
        let mut blocked_roots: Vec<String> = vec![
            r"c:\windows".to_string(),
            r"c:\program files".to_string(),
            r"c:\program files (x86)".to_string(),
            r"c:\programdata".to_string(),
            r"c:\system volume information".to_string(),
            r"c:\$recycle.bin".to_string(),
            r"c:\recovery".to_string(),
        ];

        for env_key in ["SystemRoot", "WINDIR", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"] {
            if let Ok(val) = std::env::var(env_key) {
                let n = normalize_path_for_prefix_check(Path::new(&val));
                if !n.is_empty() && !blocked_roots.contains(&n) {
                    blocked_roots.push(n);
                }
            }
        }

        // Also block <any_drive>:\windows and <any_drive>:\program files
        if norm.len() >= 2 && norm.as_bytes()[1] == b':' {
            let after_drive = &norm[2..];
            for suffix in [
                r"\windows",
                r"\program files",
                r"\program files (x86)",
                r"\programdata",
                r"\system volume information",
                r"\$recycle.bin",
            ] {
                if after_drive == suffix
                    || after_drive.starts_with(&format!("{suffix}\\"))
                {
                    return true;
                }
            }
        }

        for root in &blocked_roots {
            if norm == *root || norm.starts_with(&format!("{root}\\")) {
                return true;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for root in ["/etc", "/usr", "/bin", "/sbin", "/sys", "/proc", "/dev", "/boot"] {
            let r = root.replace('/', "\\");
            if norm == r || norm.starts_with(&format!("{r}\\")) {
                return true;
            }
        }
    }

    false
}

fn validate_backup_path(raw: &str, must_exist: bool) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("مسار الملف مطلوب.".into());
    }
    if trimmed.contains('\0') {
        return Err("مسار الملف غير صالح.".into());
    }
    if trimmed.starts_with(r"\\") || trimmed.starts_with("//") {
        return Err("مسارات الشبكة (UNC) غير مسموح بها للنسخ الاحتياطي.".into());
    }

    let path = PathBuf::from(trimmed);
    for component in path.components() {
        if matches!(component, Component::ParentDir) {
            return Err("مسار النسخ الاحتياطي لا يمكن أن يحتوي على '..'.".into());
        }
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    if ext != "json" && ext != "wensbackup" {
        return Err("يُسمح فقط بملفات النسخ الاحتياطي بامتداد .json أو .wensbackup.".into());
    }

    if is_blocked_system_path(&path) {
        return Err("لا يُسمح بالقراءة أو الكتابة في مجلدات النظام.".into());
    }

    if must_exist {
        let canonical = fs::canonicalize(&path)
            .map_err(|_| "ملف النسخة الاحتياطية غير موجود أو لا يمكن الوصول إليه.".to_string())?;
        if is_blocked_system_path(&canonical) {
            return Err("لا يُسمح بقراءة ملفات من مجلدات النظام.".into());
        }
        let meta = fs::metadata(&canonical).map_err(|e| e.to_string())?;
        if !meta.is_file() {
            return Err("المسار المحدد ليس ملفاً صالحاً.".into());
        }
        if meta.len() > MAX_BACKUP_BYTES {
            return Err("حجم ملف النسخة الاحتياطية يتجاوز الحد الأقصى المسموح (25 ميجابايت).".into());
        }
        Ok(canonical)
    } else {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                if is_blocked_system_path(parent) {
                    return Err("لا يُسمح بالحفظ داخل مجلدات النظام.".into());
                }
                if parent.exists() {
                    let canonical_parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
                    if is_blocked_system_path(&canonical_parent) {
                        return Err("لا يُسمح بالحفظ داخل مجلدات النظام.".into());
                    }
                }
            }
        }
        Ok(path)
    }
}

fn write_file_atomic(target: &Path, content: &str) -> Result<(), String> {
    if content.len() as u64 > MAX_BACKUP_BYTES {
        return Err("حجم ملف النسخة الاحتياطية يتجاوز الحد الأقصى المسموح (25 ميجابايت).".into());
    }

    let directory = target
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let sequence = BACKUP_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let temp = directory.join(format!(".wens-backup-{}-{sequence}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|error| error.to_string())?;
    let written = file.write_all(content.as_bytes()).and_then(|()| file.sync_all());
    drop(file);

    // Rename from the same directory, preserving the previous backup on failure.
    let result = written.and_then(|()| fs::rename(&temp, target));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|error| error.to_string())
}

#[cfg(desktop)]
fn apply_desktop_window_prefs(app: &AppHandle, prefs: &AppPreferences, patch: Option<&serde_json::Value>) {
    use std::sync::atomic::Ordering;

    let pet_changed = patch
        .map(|p| p.get("petVisible").is_some())
        .unwrap_or(true);
    let overlay_changed = patch
        .map(|p| p.get("overlayWidget").is_some())
        .unwrap_or(true);
    let orientation_changed = patch
        .map(|p| p.get("islandOrientation").is_some())
        .unwrap_or(true);
    let taskbar_changed = patch
        .map(|p| p.get("taskbarWidgetEnabled").is_some())
        .unwrap_or(true);

    if pet_changed || overlay_changed || orientation_changed {
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _guard = crate::COMPANION_WINDOW_LOCK.lock().unwrap_or_else(|error| error.into_inner());
            if crate::IS_QUITTING.load(Ordering::SeqCst) {
                return;
            }
            let app = &handle;
            let prefs = get_cached_preferences(app);
            if pet_changed {
                let pv = prefs.pet_visible;
                crate::PET_ENABLED.store(pv, Ordering::SeqCst);
                if !pv {
                    crate::PET_ROAMING_ACTIVE.store(false, Ordering::SeqCst);
                    if let Some(win) = app.get_webview_window("pet") {
                        let _ = win.hide();
                    }
                } else if let Ok(win) = crate::ensure_pet_window(app) {
                    if !crate::companion_fullscreen_blocked(&prefs) {
                        let _ = win.set_always_on_top(true);
                        let _ = win.unminimize();
                        let _ = win.show();
                    }
                }
            }

            if overlay_changed {
                let ow = prefs.overlay_widget;
                crate::OVERLAY_ENABLED.store(ow, Ordering::SeqCst);
                let is_bottom = prefs.island_orientation == "bottom";
                if !ow {
                    if let Some(win) = app.get_webview_window("overlay") {
                        let _ = win.hide();
                    }
                } else if let Ok(win) = crate::ensure_overlay_window(app, is_bottom) {
                    if !crate::companion_fullscreen_blocked(&prefs) {
                        let scale = win.scale_factor().unwrap_or(1.0);
                        let (cur_w, cur_h) = match win.inner_size() {
                            Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
                            Err(_) => (184.0, 28.0),
                        };
                        let _ = crate::position_island(&win, cur_w, cur_h, is_bottom);
                        let _ = win.set_always_on_top(true);
                        let _ = win.unminimize();
                        let _ = win.show();
                    }
                }
            } else if orientation_changed && prefs.overlay_widget {
                if let Some(win) = app.get_webview_window("overlay") {
                    if win.is_visible().unwrap_or(false) && !crate::island_blocked() {
                        let is_bottom = prefs.island_orientation == "bottom";
                        let scale = win.scale_factor().unwrap_or(1.0);
                        let (cur_w, cur_h) = match win.inner_size() {
                            Ok(phys) => (phys.width as f64 / scale, phys.height as f64 / scale),
                            Err(_) => (184.0, 28.0),
                        };
                        let _ = crate::position_island(&win, cur_w, cur_h, is_bottom);
                    }
                }
            }
        });
    }

    #[cfg(target_os = "windows")]
    {
        if taskbar_changed {
            crate::taskbar_widget::set_taskbar_widget_visible(prefs.taskbar_widget_enabled);
        }
        crate::taskbar_widget::notify_settings_changed(app);
    }
    #[cfg(not(target_os = "windows"))]
    let _ = taskbar_changed;
}

#[tauri::command]
pub fn storage_load(app: AppHandle) -> Result<Option<String>, String> {
    with_database(&app, |db| {
        db.legacy_snapshot().map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn storage_save(app: AppHandle, state_json: String) -> Result<(), String> {
    let maybe_prefs = with_database(&app, |db| {
        db.save_compatibility_snapshot(&state_json)
            .map_err(|error| error.to_string())?;
        Ok(db.get_preferences().ok())
    })?;

    if let Some(prefs) = maybe_prefs {
        refresh_cached_preferences(prefs.clone());
        crate::refresh_reminder_schedule(&app, &prefs);
        #[cfg(target_os = "windows")]
        crate::taskbar_widget::notify_settings_changed(&app);
    }
    Ok(())
}

pub fn compute_notification_summary_with_unread(
    app: &AppHandle,
    unread_count: usize,
    prefs: &AppPreferences,
) -> NotificationSummary {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let (next_reminder, last_error) =
        if let Some(scheduler) = app.try_state::<crate::ReminderScheduler>() {
            let events = scheduler
                .events
                .lock()
                .map(|evs| evs.clone())
                .unwrap_or_default();
            let next = events.into_iter().find(|e| e.due_at_ms >= now_ms);
            let err = scheduler
                .last_error
                .lock()
                .map(|e| e.clone())
                .unwrap_or(None);
            (next, err)
        } else {
            (None, None)
        };

    use chrono::Timelike;
    let now = chrono::Local::now();
    let in_quiet = prefs
        .notifications
        .quiet_hours
        .as_ref()
        .map_or(false, |qh| qh.contains(now.hour(), now.minute()));

    let status = if last_error.is_some() {
        "failed".to_string()
    } else if in_quiet {
        "quiet".to_string()
    } else if !prefs.notifications.prayer_at_time_enabled
        && !prefs.notifications.pre_prayer_enabled
        && !prefs.notifications.fasting_enabled
    {
        "silent".to_string()
    } else {
        "armed".to_string()
    };

    NotificationSummary {
        next_reminder,
        status,
        unread_count,
        last_recoverable_error: last_error,
    }
}

pub fn compute_notification_summary(
    app: &AppHandle,
    db: &Database,
    prefs: &AppPreferences,
) -> NotificationSummary {
    let unread_count = db.unread_notifications_count().unwrap_or(0);
    compute_notification_summary_with_unread(app, unread_count, prefs)
}

/// Typed bootstrap for the React/Android clients. SQLite never leaks through IPC.
#[tauri::command]
pub fn bootstrap_get(app: AppHandle) -> Result<BootstrapPayload, String> {
    let (mut payload, unread_count) = with_database(&app, |db| {
        let payload = db.bootstrap().map_err(|error| error.to_string())?;
        let unread = db.unread_notifications_count().unwrap_or(0);
        Ok((payload, unread))
    })?;
    refresh_cached_preferences(payload.settings.clone());
    payload.notification_summary =
        compute_notification_summary_with_unread(&app, unread_count, &payload.settings);
    Ok(payload)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdateResponse {
    pub settings: AppPreferences,
    pub notification_summary: NotificationSummary,
}

#[tauri::command]
pub fn settings_update(
    app: AppHandle,
    patch: serde_json::Value,
) -> Result<SettingsUpdateResponse, String> {
    let (current, unread_count) = with_database(&app, |db| {
        let mut current = db.get_preferences().map_err(|e| e.to_string())?;
        current.apply_patch(&patch)?;
        db.save_preferences(&current).map_err(|e| e.to_string())?;
        db.update_legacy_root_settings(&current)
            .map_err(|e| e.to_string())?;
        let unread = db.unread_notifications_count().unwrap_or(0);
        Ok((current, unread))
    })?;

    refresh_cached_preferences(current.clone());

    #[cfg(desktop)]
    apply_desktop_window_prefs(&app, &current, Some(&patch));

    crate::refresh_reminder_schedule(&app, &current);

    let _ = tauri::Emitter::emit(&app, "wens-settings-changed", &current);

    let notification_summary =
        compute_notification_summary_with_unread(&app, unread_count, &current);

    Ok(SettingsUpdateResponse {
        settings: current,
        notification_summary,
    })
}

#[tauri::command]
pub fn notification_history_list(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<NotificationRecord>, String> {
    with_database(&app, |db| {
        db.list_notification_records(limit.unwrap_or(50))
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn notification_mark_read(app: AppHandle, ids: serde_json::Value) -> Result<(), String> {
    with_database(&app, |db| {
        if let Some(s) = ids.as_str() {
            if s == "all" {
                db.mark_all_notifications_read()
                    .map_err(|e| e.to_string())?;
                return Ok(());
            } else {
                db.mark_notification_read(s).map_err(|e| e.to_string())?;
                return Ok(());
            }
        }
        if let Some(arr) = ids.as_array() {
            for id_val in arr {
                if let Some(id) = id_val.as_str() {
                    let _ = db.mark_notification_read(id);
                }
            }
        }
        Ok(())
    })
}

#[tauri::command]
pub fn project_create(app: AppHandle, input: CreateProject) -> Result<Project, String> {
    with_database(&app, |db| {
        db.create_project(input).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn project_update(app: AppHandle, input: UpdateProject) -> Result<Project, String> {
    with_database(&app, |db| {
        db.update_project(input).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn project_delete(app: AppHandle, id: String) -> Result<bool, String> {
    with_database(&app, |db| {
        db.delete_project(&id).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn project_set_current(app: AppHandle, id: String) -> Result<(), String> {
    with_database(&app, |db| {
        db.set_current_project(&id)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn idea_create(app: AppHandle, input: CreateIdea) -> Result<Idea, String> {
    with_database(&app, |db| {
        db.create_idea(input).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn idea_update(app: AppHandle, input: UpdateIdea) -> Result<Idea, String> {
    with_database(&app, |db| {
        db.update_idea(input).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn idea_delete(app: AppHandle, id: String) -> Result<bool, String> {
    with_database(&app, |db| {
        db.delete_idea(&id).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn idea_promote_to_project(app: AppHandle, id: String) -> Result<Project, String> {
    with_database(&app, |db| {
        db.promote_idea_to_project(&id)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn work_session_save(
    app: AppHandle,
    record: WorkSessionRecord,
) -> Result<WorkSessionRecord, String> {
    with_database(&app, |db| {
        db.save_work_session(record)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn work_session_list(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<WorkSessionRecord>, String> {
    with_database(&app, |db| {
        db.list_work_sessions(limit.unwrap_or(100))
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn daily_worship_get(
    app: AppHandle,
    date: String,
) -> Result<Option<DailyWorshipRecord>, String> {
    with_database(&app, |db| {
        db.get_daily_worship(&date)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn daily_worship_set(app: AppHandle, record: DailyWorshipRecord) -> Result<(), String> {
    with_database(&app, |db| {
        db.set_daily_worship(record)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn history_range_get(
    app: AppHandle,
    days: Option<u32>,
) -> Result<Vec<DailyWorshipRecord>, String> {
    with_database(&app, |db| {
        db.get_history_range(days.unwrap_or(30))
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn domain_kv_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    with_database(&app, |db| {
        db.kv_get(&key).map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn domain_kv_set(app: AppHandle, key: String, value_json: String) -> Result<(), String> {
    with_database(&app, |db| {
        db.kv_set(&key, &value_json)
            .map_err(|error| error.to_string())
    })
}

#[tauri::command]
pub fn backup_export_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
    target_path: Option<String>,
) -> Result<String, String> {
    ensure_main_window(&window)?;

    let out_path = if let Some(p) = target_path {
        validate_backup_path(&p, false)?
    } else {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("backups");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        dir.join(format!(
            "wens-backup-{}.json",
            chrono::Utc::now().format("%Y%m%dT%H%M%SZ")
        ))
    };

    let backup_json = with_database(&app, |db| db.export_backup().map_err(|e| e.to_string()))?;
    write_file_atomic(&out_path, &backup_json)?;
    log_line(
        "INFO",
        "storage",
        &format!("Exported backup ({} bytes)", backup_json.len()),
    );
    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn backup_restore_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
    source_path: String,
) -> Result<(), String> {
    ensure_main_window(&window)?;
    let validated_path = validate_backup_path(&source_path, true)?;

    let file = fs::File::open(&validated_path).map_err(|e| e.to_string())?;
    let mut raw_bytes = Vec::new();
    file.take(MAX_BACKUP_BYTES + 1)
        .read_to_end(&mut raw_bytes)
        .map_err(|e| e.to_string())?;
    if raw_bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err("حجم ملف النسخة الاحتياطية يتجاوز الحد الأقصى المسموح (25 ميجابايت).".into());
    }
    let payload = String::from_utf8(raw_bytes)
        .map_err(|_| "ملف النسخة الاحتياطية ليس نص UTF-8 صالحاً.".to_string())?;

    let prefs = with_database(&app, |db| {
        db.restore_backup(&payload).map_err(|e| e.to_string())?;
        db.get_preferences().map_err(|e| e.to_string())
    })?;

    refresh_cached_preferences(prefs.clone());
    #[cfg(desktop)]
    apply_desktop_window_prefs(&app, &prefs, None);
    crate::refresh_reminder_schedule(&app, &prefs);

    let _ = tauri::Emitter::emit(&app, "wens-settings-changed", &prefs);
    let _ = tauri::Emitter::emit(
        &app,
        "wens-state-sync",
        &serde_json::json!({ "source": "backup-restore" }),
    );
    log_line(
        "INFO",
        "storage",
        "Restored backup",
    );
    Ok(())
}

#[cfg(target_os = "windows")]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn pick_file_dialog_win32(
    owner_hwnd: isize,
    initial_dir: Option<PathBuf>,
    default_filename: Option<&str>,
    is_save: bool,
) -> Result<Option<String>, String> {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::Controls::Dialogs::{
        GetOpenFileNameW, GetSaveFileNameW, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR,
        OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST, OPENFILENAMEW,
    };

    let filter_str =
        "Wens Backup (*.json;*.wensbackup)\0*.json;*.wensbackup\0JSON Files (*.json)\0*.json\0\0";
    let filter_wide: Vec<u16> = filter_str.encode_utf16().collect();
    let title_wide = to_wide_null(if is_save {
        "حفظ نسخة احتياطية — وِنس"
    } else {
        "اختيار نسخة احتياطية للاستعادة — وِنس"
    });
    let def_ext_wide = to_wide_null("json");
    let initial_dir_wide = initial_dir.as_ref().map(|d| {
        let s = d.to_string_lossy();
        let cleaned = s.strip_prefix(r"\\?\").unwrap_or(&s);
        to_wide_null(cleaned)
    });

    let mut file_buf = vec![0u16; 4096];
    if let Some(name) = default_filename {
        let encoded: Vec<u16> = name.encode_utf16().collect();
        let copy_len = encoded.len().min(file_buf.len() - 1);
        file_buf[..copy_len].copy_from_slice(&encoded[..copy_len]);
    }

    let mut ofn: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    ofn.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    ofn.hwndOwner = owner_hwnd as HWND;
    ofn.lpstrFilter = filter_wide.as_ptr();
    ofn.nFilterIndex = 1;
    ofn.lpstrFile = file_buf.as_mut_ptr();
    ofn.nMaxFile = file_buf.len() as u32;
    ofn.lpstrInitialDir = initial_dir_wide
        .as_ref()
        .map_or(std::ptr::null(), |v| v.as_ptr());
    ofn.lpstrTitle = title_wide.as_ptr();
    ofn.lpstrDefExt = def_ext_wide.as_ptr();
    ofn.Flags = if is_save {
        OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_OVERWRITEPROMPT
    } else {
        OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST | OFN_FILEMUSTEXIST
    };

    let ok = unsafe {
        if is_save {
            GetSaveFileNameW(&mut ofn)
        } else {
            GetOpenFileNameW(&mut ofn)
        }
    };

    if ok == 0 {
        return Ok(None);
    }

    let end = file_buf.iter().position(|&c| c == 0).unwrap_or(file_buf.len());
    let chosen = String::from_utf16_lossy(&file_buf[..end]).trim().to_string();
    if chosen.is_empty() {
        Ok(None)
    } else {
        Ok(Some(chosen))
    }
}

#[tauri::command]
pub async fn pick_backup_save_path(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    ensure_main_window(&window)?;

    #[cfg(target_os = "windows")]
    {
        let initial_dir = app.path().app_data_dir().ok().map(|d| {
            let b = d.join("backups");
            let _ = fs::create_dir_all(&b);
            b
        });
        let owner_hwnd = window.hwnd().ok().map(|h| h.0 as isize).unwrap_or(0);
        let default_name = format!(
            "wens-backup-{}.json",
            chrono::Local::now().format("%Y%m%d-%H%M")
        );
        tauri::async_runtime::spawn_blocking(move || {
            pick_file_dialog_win32(owner_hwnd, initial_dir, Some(&default_name), true)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[tauri::command]
pub async fn pick_backup_open_path(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    ensure_main_window(&window)?;

    #[cfg(target_os = "windows")]
    {
        let initial_dir = app.path().app_data_dir().ok().map(|d| {
            let b = d.join("backups");
            let _ = fs::create_dir_all(&b);
            b
        });
        let owner_hwnd = window.hwnd().ok().map(|h| h.0 as isize).unwrap_or(0);
        tauri::async_runtime::spawn_blocking(move || {
            pick_file_dialog_win32(owner_hwnd, initial_dir, None, false)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Ok(None)
    }
}

#[tauri::command]
pub fn factory_reset(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<BootstrapPayload, String> {
    ensure_main_window(&window)?;

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let previous_automatic_backup = app_data.join("pre-reset-backup.json");
    let (mut payload, unread_count) = with_database(&app, |db| {
        if let Err(error) = fs::remove_file(&previous_automatic_backup) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(format!("تعذر إزالة النسخة الاحتياطية التلقائية القديمة: {error}"));
            }
        }

        db.factory_reset().map_err(|e| e.to_string())?;
        let payload = db.bootstrap().map_err(|e| e.to_string())?;
        let unread = db.unread_notifications_count().unwrap_or(0);
        Ok((payload, unread))
    })?;

    refresh_cached_preferences(payload.settings.clone());
    crate::smart_clipboard::clear_clipboard_history();
    crate::shelf_downloads::clear_shelf();
    #[cfg(desktop)]
    apply_desktop_window_prefs(&app, &payload.settings, None);
    crate::reset_reminder_runtime(&app);
    crate::refresh_reminder_schedule(&app, &payload.settings);

    payload.notification_summary =
        compute_notification_summary_with_unread(&app, unread_count, &payload.settings);

    let _ = tauri::Emitter::emit(&app, "wens-settings-changed", &payload.settings);
    let _ = tauri::Emitter::emit(
        &app,
        "wens-state-sync",
        &serde_json::json!({ "source": "factory-reset" }),
    );
    log_line("WARN", "storage", "Factory reset completed successfully");
    Ok(payload)
}

#[tauri::command]
pub fn open_logs_folder(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    ensure_main_window(&window)?;
    let dir = logs_dir_path(&app)?;
    let canonical = fs::canonicalize(&dir).unwrap_or(dir);
    if !canonical.is_dir() {
        return Err("مجلد السجلات غير متاح.".into());
    }
    let clean_path = {
        let s = canonical.to_string_lossy();
        s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
    };

    #[cfg(target_os = "windows")]
    {
        if clean_path.starts_with('-') || clean_path.starts_with('/') {
            return Err("مسار مجلد السجلات غير صالح.".into());
        }
        std::process::Command::new("explorer.exe")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&clean_path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_diagnostics_bundle(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    ensure_main_window(&window)?;

    let db_path = database_path(&app)?;
    let db_meta = fs::metadata(&db_path).ok();
    let prefs = get_cached_preferences(&app);

    let windows_info: Vec<serde_json::Value> = app
        .webview_windows()
        .into_iter()
        .map(|(label, win)| {
            let visible = win.is_visible().unwrap_or(false);
            let scale = win.scale_factor().unwrap_or(1.0);
            let size = win
                .outer_size()
                .map(|s| serde_json::json!({ "width": s.width, "height": s.height }))
                .unwrap_or(serde_json::Value::Null);
            serde_json::json!({
                "label": label,
                "visible": visible,
                "scaleFactor": scale,
                "size": size
            })
        })
        .collect();

    #[cfg(desktop)]
    let monitors_info: Vec<serde_json::Value> = window
        .available_monitors()
        .unwrap_or_default()
        .into_iter()
        .map(|m| {
            serde_json::json!({
                "position": { "x": m.position().x, "y": m.position().y },
                "size": { "width": m.size().width, "height": m.size().height },
                "scaleFactor": m.scale_factor()
            })
        })
        .collect();
    #[cfg(not(desktop))]
    let monitors_info: Vec<serde_json::Value> = Vec::new();

    // Strictly sanitized summary: ZERO user notes, ZERO project/idea text, ZERO ICS URLs, ZERO clipboard data.
    let settings_summary = serde_json::json!({
        "themeId": prefs.theme_id,
        "accentId": prefs.accent_id,
        "calcMethod": wens_core::CalculationMethod::from_str_lossy(&prefs.calc_method),
        "asrHanafi": prefs.asr_hanafi,
        "strictOffline": prefs.strict_offline,
        "onboardingCompleted": prefs.onboarding_completed,
        "petVisible": prefs.pet_visible,
        "overlayWidget": prefs.overlay_widget,
        "taskbarWidgetEnabled": prefs.taskbar_widget_enabled,
        "islandHideFullscreen": prefs.island_hide_fullscreen,
        "quranRadioEnabled": prefs.quran_radio_enabled,
        "mediaPillEnabled": prefs.media_pill_enabled,
        "mediaPauseAtPrayer": prefs.media_pause_at_prayer,
        "clipboardHistoryEnabled": prefs.clipboard_history_enabled,
        "downloadsWatcherEnabled": prefs.downloads_watcher_enabled,
        "privacyDotsEnabled": prefs.privacy_dots_enabled,
        "meetingsIcalEnabled": prefs.meetings_ical_enabled,
        "meetingsIcalConfigured": !prefs.meetings_ical_url.trim().is_empty(),
        "notifications": {
            "prePrayerEnabled": prefs.notifications.pre_prayer_enabled,
            "prayerAtTimeEnabled": prefs.notifications.prayer_at_time_enabled,
            "fastingEnabled": prefs.notifications.fasting_enabled,
            "focusCompletionEnabled": prefs.notifications.focus_completion_enabled,
            "quietHoursConfigured": prefs.notifications.quiet_hours.is_some(),
        },
        "audio": {
            "prayer": prefs.audio.prayer,
            "fasting": prefs.audio.fasting,
            "work": prefs.audio.work,
            "volume": prefs.audio.volume,
            "backgroundPlayback": prefs.audio.background_playback,
        },
        "preventSleepForSuhoor": prefs.prevent_sleep_for_suhoor
    });

    Ok(serde_json::json!({
        "appVersion": app.package_info().version.to_string(),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "database": {
            "exists": db_meta.is_some(),
            "sizeBytes": db_meta.map(|m| m.len()).unwrap_or(0),
            "schemaVersion": CURRENT_SCHEMA_VERSION,
        },
        "settingsSummary": settings_summary,
        "windows": windows_info,
        "monitors": monitors_info
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oversized_backup_leaves_previous_file_intact() {
        let path = std::env::temp_dir().join(format!(
            "wens-backup-size-test-{}-{}.json",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        fs::write(&path, "previous backup").unwrap();
        let oversized = "x".repeat(MAX_BACKUP_BYTES as usize + 1);
        let export = write_file_atomic(&path, &oversized);
        let contents = fs::read(&path);
        fs::remove_file(&path).unwrap();
        assert!(export.is_err());
        assert_eq!(contents.unwrap(), b"previous backup");
    }

    #[test]
    fn replacing_backup_commits_complete_file_contents() {
        let path = std::env::temp_dir().join(format!(
            "wens-backup-replace-test-{}-{}.json",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        fs::write(&path, "previous backup").unwrap();
        let export = write_file_atomic(&path, "new backup");
        let contents = fs::read(&path);
        fs::remove_file(&path).unwrap();
        export.unwrap();
        assert_eq!(contents.unwrap(), b"new backup");
    }

    #[test]
    fn backup_path_validation_rejects_system_paths_traversal_and_bad_extensions() {
        assert!(validate_backup_path("", false).is_err());
        assert!(validate_backup_path(r"\\server\share\backup.json", false).is_err());
        assert!(validate_backup_path(r"C:\Users\me\..\secret.json", false).is_err());
        assert!(validate_backup_path(r"C:\Users\me\backup.exe", false).is_err());
        assert!(validate_backup_path(r"C:\Windows\System32\backup.json", false).is_err());
        assert!(validate_backup_path(r"C:\Program Files\Wens\backup.json", false).is_err());
        assert!(validate_backup_path(r"C:\Program Files (x86)\Wens\backup.wensbackup", false).is_err());
        assert!(validate_backup_path(r"C:\Users\me\Documents\wens-backup.json", false).is_ok());
        assert!(validate_backup_path(r"C:\Users\me\Documents\wens-backup.wensbackup", false).is_ok());
    }
}
