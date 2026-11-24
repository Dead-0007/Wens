use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShelfItem {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub extension: String,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DownloadItem {
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub is_downloading: bool,
}

static SHELF_ITEMS: Mutex<Option<VecDeque<ShelfItem>>> = Mutex::new(None);

pub fn get_shelf_items() -> Vec<ShelfItem> {
    let mut lock = SHELF_ITEMS.lock().unwrap_or_else(|e| e.into_inner());
    let shelf = lock.get_or_insert_with(|| VecDeque::with_capacity(24));
    shelf.iter().cloned().collect()
}

pub fn add_to_shelf(path_str: &str) -> Result<ShelfItem, String> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() || trimmed.contains('\0') {
        return Err("Invalid file path".into());
    }
    let path = Path::new(trimmed);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_size = meta.len();
    let now_ms = chrono::Utc::now().timestamp_millis();

    let canonical_str = std::fs::canonicalize(path)
        .map(|p| strip_verbatim_prefix(&p))
        .unwrap_or_else(|_| path.to_string_lossy().to_string());

    let item = ShelfItem {
        id: format!("shelf_{}", now_ms),
        file_name,
        file_path: canonical_str,
        file_size,
        extension,
        added_at: now_ms,
    };

    let mut lock = SHELF_ITEMS.lock().unwrap_or_else(|e| e.into_inner());
    let shelf = lock.get_or_insert_with(|| VecDeque::with_capacity(24));

    shelf.retain(|i| i.file_path != item.file_path);

    if shelf.len() >= 24 {
        shelf.pop_back();
    }
    shelf.push_front(item.clone());

    Ok(item)
}

pub fn remove_from_shelf(id: &str) -> bool {
    let mut lock = SHELF_ITEMS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(shelf) = lock.as_mut() {
        let initial_len = shelf.len();
        shelf.retain(|i| i.id != id);
        return shelf.len() < initial_len;
    }
    false
}

pub fn clear_shelf() {
    let mut lock = SHELF_ITEMS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(shelf) = lock.as_mut() {
        shelf.clear();
    }
}

fn strip_verbatim_prefix(path: &Path) -> String {
    let raw = path.to_string_lossy();
    if let Some(stripped) = raw.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        raw.into_owned()
    }
}

/// Validates that `path_str` is a safe, canonicalized path strictly inside the user's Downloads
/// folder — blocking path traversal (`..`), UNC network paths (`\\server\...`), leading `/` or `-`
/// argument injection, and symlinks pointing outside Downloads.
fn validate_path_inside_downloads(path_str: &str, downloads_dir: &Path) -> Result<String, String> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() {
        return Err("مسار الملف فارغ".into());
    }
    if trimmed.contains('\0') || trimmed.contains('\r') || trimmed.contains('\n') {
        return Err("مسار الملف يحتوي على رموز غير مسموح بها".into());
    }
    // Reject leading `/`, `\\` (UNC), or `-` (CLI flag injection)
    if trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.starts_with('-')
    {
        return Err("مسار غير مسموح به".into());
    }

    let raw_path = Path::new(trimmed);
    for comp in raw_path.components() {
        if matches!(comp, Component::ParentDir) {
            return Err("لا يُسمح بالتنقل خارج مجلد التنزيلات (..)".into());
        }
    }

    let canon_downloads = std::fs::canonicalize(downloads_dir)
        .map_err(|_| "تعذر التحقق من مجلد التنزيلات".to_string())?;
    let canon_target = std::fs::canonicalize(raw_path)
        .map_err(|_| "الملف غير موجود أو تعذر الوصول إليه".to_string())?;

    if !canon_target.exists() {
        return Err("الملف غير موجود".into());
    }
    if !canon_target.starts_with(&canon_downloads) {
        return Err("يُسمح فقط بفتح الملفات الموجودة داخل مجلد التنزيلات".into());
    }

    let raw_canon = canon_target.to_string_lossy();
    if raw_canon.starts_with(r"\\?\UNC\") || raw_canon.starts_with(r"\\?\unc\") {
        return Err("لا يُسمح بفتح مسارات الشبكة UNC".into());
    }

    let clean = strip_verbatim_prefix(&canon_target);
    if clean.starts_with('/') || clean.starts_with('\\') || clean.starts_with('-') {
        return Err("مسار غير صالح".into());
    }
    Ok(clean)
}

#[cfg(target_os = "windows")]
fn select_file_in_explorer_safe(clean_canonical_path: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{
        ILCreateFromPathW, ILFree, SHOpenFolderAndSelectItems,
    };

    #[link(name = "ole32")]
    extern "system" {
        fn CoInitializeEx(pv_reserved: *mut core::ffi::c_void, dw_co_init: u32) -> i32;
        fn CoUninitialize();
    }
    const COINIT_APARTMENTTHREADED: u32 = 0x2;
    const S_OK: i32 = 0;
    const S_FALSE: i32 = 1;

    let wide: Vec<u16> = clean_canonical_path
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    // Primary path: Win32 SHOpenFolderAndSelectItems — direct Shell API with ZERO command-line parsing!
    let shell_ok = unsafe {
        let hr_com = CoInitializeEx(std::ptr::null_mut(), COINIT_APARTMENTTHREADED);
        let should_uninit = hr_com == S_OK || hr_com == S_FALSE;
        let pidl = ILCreateFromPathW(wide.as_ptr());
        let ok = if !pidl.is_null() {
            let hr = SHOpenFolderAndSelectItems(pidl, 0, std::ptr::null(), 0);
            ILFree(pidl);
            hr == 0
        } else {
            false
        };
        if should_uninit {
            CoUninitialize();
        }
        ok
    };

    if shell_ok {
        return Ok(());
    }

    // Fallback: explorer.exe with verified canonical `\\?\`-stripped path strictly inside Downloads
    use std::process::Command;
    Command::new("explorer.exe")
        .arg(format!("/select,{}", clean_canonical_path))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn open_shelf_item(path_str: &str) -> Result<(), String> {
    let downloads_dir = get_downloads_dir().ok_or_else(|| "مجلد التنزيلات غير موجود".to_string())?;
    let clean_path = validate_path_inside_downloads(path_str, &downloads_dir)?;

    #[cfg(target_os = "windows")]
    {
        select_file_in_explorer_safe(&clean_path)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = clean_path;
        Err("Unsupported on this OS".into())
    }
}

// -------------------------------------------------------------
// Downloads Folder Active Progress Watcher
// -------------------------------------------------------------

fn get_downloads_dir() -> Option<PathBuf> {
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let p = PathBuf::from(user_profile).join("Downloads");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

pub fn check_active_downloads() -> Vec<DownloadItem> {
    let mut active = Vec::new();
    let Some(dir) = get_downloads_dir() else {
        return active;
    };

    let Ok(entries) = std::fs::read_dir(dir) else {
        return active;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if ext_lower == "crdownload" || ext_lower == "part" || ext_lower == "download" {
                let file_name = path
                    .file_stem()
                    .and_then(|n| n.to_str())
                    .unwrap_or("downloading...")
                    .to_string();

                let downloaded_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
                active.push(DownloadItem {
                    file_name,
                    downloaded_bytes,
                    is_downloading: true,
                });
            }
        }
    }

    active
}

fn sleep_interruptible(total: Duration, stop_flag: &AtomicBool) {
    let step = Duration::from_millis(250);
    let mut remaining = total;
    while !remaining.is_zero() && !stop_flag.load(Ordering::Relaxed) {
        let chunk = remaining.min(step);
        thread::sleep(chunk);
        remaining = remaining.saturating_sub(chunk);
    }
}

pub fn start_downloads_watcher(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::Builder::new()
        .name("wens-downloads-watcher".to_string())
        .spawn(move || {
            let mut last_active: Vec<DownloadItem> = Vec::new();

            while !stop_flag.load(Ordering::Relaxed) {
                sleep_interruptible(Duration::from_millis(1500), &stop_flag);
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                // O(1) RAM preference read — ZERO SQLite opens! Respect `downloads_watcher_enabled`!
                let prefs = crate::storage::get_cached_preferences(&app);
                if !prefs.downloads_watcher_enabled
                    || !crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    || crate::island_blocked()
                {
                    if !prefs.downloads_watcher_enabled && !last_active.is_empty() {
                        last_active.clear();
                        let _ = app.emit("wens-download-progress", &last_active);
                    }
                    if !prefs.downloads_watcher_enabled {
                        sleep_interruptible(Duration::from_millis(1500), &stop_flag);
                    }
                    continue;
                }

                let active = check_active_downloads();
                if active != last_active {
                    let _ = app.emit("wens-download-progress", &active);
                    last_active = active;
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_unc_and_flag_injection() {
        let temp_dir = std::env::temp_dir().join("wens_shelf_test_dl");
        let _ = std::fs::create_dir_all(&temp_dir);
        let inside_file = temp_dir.join("sample.txt");
        let _ = std::fs::write(&inside_file, b"ok");

        assert!(validate_path_inside_downloads(r"\\evil\share\a.exe", &temp_dir).is_err());
        assert!(validate_path_inside_downloads("/select,C:\\Windows\\notepad.exe", &temp_dir).is_err());
        assert!(validate_path_inside_downloads("-flag", &temp_dir).is_err());
        assert!(validate_path_inside_downloads(
            &format!("{}\\..\\Windows\\win.ini", temp_dir.display()),
            &temp_dir
        )
        .is_err());
        assert!(validate_path_inside_downloads(&inside_file.to_string_lossy(), &temp_dir).is_ok());

        let _ = std::fs::remove_file(&inside_file);
        let _ = std::fs::remove_dir(&temp_dir);
    }
}
