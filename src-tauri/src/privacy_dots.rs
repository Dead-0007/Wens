use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
pub struct PrivacyStatus {
    pub mic_active: bool,
    pub mic_apps: Vec<String>,
    pub cam_active: bool,
    pub cam_apps: Vec<String>,
}

#[cfg(target_os = "windows")]
fn check_capability(capability: &str) -> (bool, Vec<String>) {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_READ, REG_QWORD,
    };

    let mut active = false;
    let mut apps: Vec<String> = Vec::new();

    let subpaths = [
        format!(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}",
            capability
        ),
        format!(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}\\NonPackaged",
            capability
        ),
    ];

    let start_name: Vec<u16> = "LastUsedTimeStart"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let stop_name: Vec<u16> = "LastUsedTimeStop"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    for subpath in &subpaths {
        let wide_path: Vec<u16> = subpath.encode_utf16().chain(std::iter::once(0)).collect();
        let mut root_key: HKEY = std::ptr::null_mut();

        unsafe {
            if RegOpenKeyExW(
                HKEY_CURRENT_USER,
                wide_path.as_ptr(),
                0,
                KEY_READ,
                &mut root_key,
            ) == ERROR_SUCCESS
            {
                let mut index = 0u32;
                let mut name_buf = [0u16; 512];

                loop {
                    let mut name_len = name_buf.len() as u32;
                    let ret = RegEnumKeyExW(
                        root_key,
                        index,
                        name_buf.as_mut_ptr(),
                        &mut name_len,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    );

                    if ret == ERROR_NO_MORE_ITEMS {
                        break;
                    }
                    if ret == ERROR_SUCCESS {
                        let sub_name = OsString::from_wide(&name_buf[..name_len as usize])
                            .to_string_lossy()
                            .into_owned();

                        if sub_name != "NonPackaged" {
                            let mut app_key: HKEY = std::ptr::null_mut();
                            let wide_sub: Vec<u16> = name_buf[..name_len as usize]
                                .iter()
                                .copied()
                                .chain(std::iter::once(0))
                                .collect();

                            if RegOpenKeyExW(
                                root_key,
                                wide_sub.as_ptr(),
                                0,
                                KEY_READ,
                                &mut app_key,
                            ) == ERROR_SUCCESS
                            {
                                let mut start_time = 0u64;
                                let mut start_type = 0u32;
                                let mut start_len = std::mem::size_of::<u64>() as u32;

                                let start_res = RegQueryValueExW(
                                    app_key,
                                    start_name.as_ptr(),
                                    std::ptr::null_mut(),
                                    &mut start_type,
                                    &mut start_time as *mut u64 as *mut u8,
                                    &mut start_len,
                                );

                                let mut stop_time = 0u64;
                                let mut stop_type = 0u32;
                                let mut stop_len = std::mem::size_of::<u64>() as u32;

                                let stop_res = RegQueryValueExW(
                                    app_key,
                                    stop_name.as_ptr(),
                                    std::ptr::null_mut(),
                                    &mut stop_type,
                                    &mut stop_time as *mut u64 as *mut u8,
                                    &mut stop_len,
                                );

                                // Require BOTH registry queries to return ERROR_SUCCESS with valid REG_QWORD (8 bytes)
                                // so missing/unreadable LastUsedTimeStop never causes false-positive active camera/mic dots!
                                let start_valid = start_res == ERROR_SUCCESS
                                    && start_type == REG_QWORD
                                    && start_len == 8
                                    && start_time > 0;
                                let stop_valid = stop_res == ERROR_SUCCESS
                                    && stop_type == REG_QWORD
                                    && stop_len == 8;

                                if start_valid && stop_valid && stop_time == 0 {
                                    active = true;
                                    let clean_name = sub_name
                                        .replace('#', "\\")
                                        .split('\\')
                                        .last()
                                        .unwrap_or(&sub_name)
                                        .to_string();
                                    if !clean_name.is_empty() && !apps.contains(&clean_name) {
                                        apps.push(clean_name);
                                    }
                                }

                                RegCloseKey(app_key);
                            }
                        }
                    }

                    index += 1;
                }

                RegCloseKey(root_key);
            }
        }
    }

    (active, apps)
}

#[cfg(not(target_os = "windows"))]
fn check_capability(_capability: &str) -> (bool, Vec<String>) {
    (false, Vec::new())
}

pub fn get_current_privacy_status() -> PrivacyStatus {
    let (mic_active, mic_apps) = check_capability("microphone");
    let (cam_active, cam_apps) = check_capability("webcam");
    PrivacyStatus {
        mic_active,
        mic_apps,
        cam_active,
        cam_apps,
    }
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

pub fn start_privacy_monitor(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::Builder::new()
        .name("wens-privacy-dots".to_string())
        .spawn(move || {
            let mut last_status = PrivacyStatus::default();

            while !stop_flag.load(Ordering::Relaxed) {
                sleep_interruptible(Duration::from_millis(1500), &stop_flag);
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                // O(1) RAM preference read — sleep quietly when privacy dots are disabled
                let prefs = crate::storage::get_cached_preferences(&app);
                if !prefs.privacy_dots_enabled
                    || !crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    || crate::island_blocked()
                {
                    if !prefs.privacy_dots_enabled && last_status != PrivacyStatus::default() {
                        let empty = PrivacyStatus::default();
                        let _ = app.emit("wens-privacy-status", &empty);
                        last_status = empty;
                    }
                    if !prefs.privacy_dots_enabled {
                        sleep_interruptible(Duration::from_millis(1500), &stop_flag);
                    }
                    continue;
                }

                let status = get_current_privacy_status();
                if status != last_status {
                    let _ = app.emit("wens-privacy-status", &status);
                    last_status = status;
                }
            }
        })
        .ok();
}
