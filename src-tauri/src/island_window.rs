use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, Ordering};
use std::sync::Arc;
#[cfg(target_os = "windows")]
use std::thread;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};
use tauri::AppHandle;
#[cfg(target_os = "windows")]
use tauri::{Emitter, Manager, PhysicalPosition};

static MANUAL_CLICK_THROUGH: AtomicBool = AtomicBool::new(false);
static ACTUAL_CLICK_THROUGH: AtomicBool = AtomicBool::new(false);
static EXPANDED_WIDTH_LOGICAL: AtomicI32 = AtomicI32::new(330);
static EXPANDED_HEIGHT_LOGICAL: AtomicI32 = AtomicI32::new(36);
static OVERLAY_HWND_CACHE: AtomicIsize = AtomicIsize::new(0);

#[derive(Debug, Clone, Serialize)]
pub struct CursorNearEvent {
    pub distance: f64,
    pub cursor_x: i32,
    pub cursor_y: i32,
    pub dx: f64,
    pub dy: f64,
    pub pet_center_x: i32,
    pub pet_center_y: i32,
    pub scale_factor: f64,
}

/// Synchronizes JS/Rust click-through state so `island_set_click_through` and the
/// hover/hit-test loop never desync.
pub fn set_click_through_override(click_through: bool) {
    MANUAL_CLICK_THROUGH.store(click_through, Ordering::SeqCst);
    let hwnd = OVERLAY_HWND_CACHE.load(Ordering::SeqCst);
    if hwnd != 0 {
        set_click_through(hwnd, click_through);
    } else {
        ACTUAL_CLICK_THROUGH.store(click_through, Ordering::SeqCst);
    }
}

/// Records the active logical dimensions of the expanded Dynamic Island pill/card so
/// top-strip click-through hit-testing covers 100% of `.island-bar` buttons.
pub fn set_expanded_dimensions(width_logical: i32, height_logical: i32) {
    let clamped_w = width_logical.clamp(140, 1200);
    let clamped_h = height_logical.clamp(24, 900);
    EXPANDED_WIDTH_LOGICAL.store(clamped_w, Ordering::SeqCst);
    EXPANDED_HEIGHT_LOGICAL.store(clamped_h, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
pub fn set_click_through(hwnd_ptr: isize, enable: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongW, IsWindow, SetWindowLongW, GWL_EXSTYLE, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    };

    if hwnd_ptr == 0 {
        return;
    }
    let hwnd = hwnd_ptr as windows_sys::Win32::Foundation::HWND;
    unsafe {
        if IsWindow(hwnd) == 0 {
            return;
        }
        OVERLAY_HWND_CACHE.store(hwnd_ptr, Ordering::SeqCst);
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let new_style = if enable {
            ex_style | WS_EX_TRANSPARENT | WS_EX_LAYERED
        } else {
            (ex_style & !WS_EX_TRANSPARENT) | WS_EX_LAYERED
        };
        if new_style != ex_style {
            SetWindowLongW(hwnd, GWL_EXSTYLE, new_style as i32);
        }
        ACTUAL_CLICK_THROUGH.store(enable, Ordering::SeqCst);
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_click_through(_hwnd_ptr: isize, enable: bool) {
    ACTUAL_CLICK_THROUGH.store(enable, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
fn enumerate_monitor_work_rects() -> Vec<(i32, i32, i32, i32)> {
    use windows_sys::Win32::Foundation::{BOOL, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };

    unsafe extern "system" fn mon_proc(
        hmon: HMONITOR,
        _hdc: HDC,
        _rc: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmon, &mut mi) != 0 {
            let rects = &mut *(lparam as *mut Vec<(i32, i32, i32, i32)>);
            rects.push((
                mi.rcWork.left,
                mi.rcWork.top,
                mi.rcWork.right,
                mi.rcWork.bottom,
            ));
        }
        1
    }

    let mut rects: Vec<(i32, i32, i32, i32)> = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(mon_proc),
            &mut rects as *mut Vec<(i32, i32, i32, i32)> as LPARAM,
        );
    }
    rects.sort_unstable();
    rects
}

#[cfg(target_os = "windows")]
fn clamp_position_to_nearest_monitor(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    margin: i32,
) -> (i32, i32) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };

    unsafe {
        let center = POINT {
            x: x.saturating_add(width / 2),
            y: y.saturating_add(height / 2),
        };
        let hmon = MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if !hmon.is_null() && GetMonitorInfoW(hmon, &mut mi) != 0 {
            let work = mi.rcWork;
            let min_x = work.left + margin;
            let min_y = work.top + margin;
            let max_x = (work.right - width - margin).max(min_x);
            let max_y = (work.bottom - height - margin).max(min_y);
            return (x.clamp(min_x, max_x), y.clamp(min_y, max_y));
        }
    }
    (x, y)
}

#[cfg(target_os = "windows")]
fn is_rect_visible_on_any_monitor(
    x: i32,
    y: i32,
    w: i32,
    h: i32,
    monitors: &[(i32, i32, i32, i32)],
) -> bool {
    if monitors.is_empty() {
        return true;
    }
    let right = x.saturating_add(w);
    let bottom = y.saturating_add(h);
    monitors.iter().any(|&(ml, mt, mr, mb)| {
        let inter_w = right.min(mr) - x.max(ml);
        let inter_h = bottom.min(mb) - y.max(mt);
        inter_w >= (w / 2).max(24) && inter_h >= (h / 2).max(20)
    })
}

#[cfg(target_os = "windows")]
fn reclamp_window_if_offscreen(
    win: &tauri::WebviewWindow,
    monitors: &[(i32, i32, i32, i32)],
) {
    if let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) {
        let w = size.width as i32;
        let h = size.height as i32;
        if !is_rect_visible_on_any_monitor(pos.x, pos.y, w, h, monitors) {
            let (cx, cy) = clamp_position_to_nearest_monitor(pos.x, pos.y, w, h, 8);
            if cx != pos.x || cy != pos.y {
                let _ = win.set_position(PhysicalPosition::new(cx, cy));
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn run_global_hotkey_listener(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MsgWaitForMultipleObjects, PeekMessageW, MSG, PM_REMOVE, QS_ALLINPUT, WM_HOTKEY, WM_QUIT,
    };

    const HOTKEY_ID: i32 = 4192;
    const VK_I: u32 = 0x49;

    unsafe {
        if RegisterHotKey(
            std::ptr::null_mut(),
            HOTKEY_ID,
            MOD_CONTROL | MOD_ALT,
            VK_I,
        ) == 0
        {
            crate::storage::log_line(
                "WARN",
                "island_window",
                "Ctrl+Alt+I hotkey already registered by another app; skipping hotkey registration.",
            );
            return;
        }

        let mut msg: MSG = std::mem::zeroed();
        while !stop_flag.load(Ordering::Relaxed) {
            // Wait up to 250ms for messages so stop_flag is observed promptly and UnregisterHotKey always runs.
            MsgWaitForMultipleObjects(0, std::ptr::null(), 0, 250, QS_ALLINPUT);

            while PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                if msg.message == WM_QUIT {
                    UnregisterHotKey(std::ptr::null_mut(), HOTKEY_ID);
                    return;
                }
                if msg.message == WM_HOTKEY && msg.wParam == HOTKEY_ID as usize {
                    if !stop_flag.load(Ordering::Relaxed) {
                        crate::spawn_companion_toggle(&app, false);
                    }
                }
            }
        }

        UnregisterHotKey(std::ptr::null_mut(), HOTKEY_ID);
    }
}

pub fn start_island_loop(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    // Spawn global hotkey thread
    #[cfg(target_os = "windows")]
    {
        let hotkey_app = app.clone();
        let hotkey_stop = Arc::clone(&stop_flag);
        thread::Builder::new()
            .name("wens-island-hotkey".to_string())
            .spawn(move || {
                run_global_hotkey_listener(hotkey_app, hotkey_stop);
            })
            .ok();
    }

    // Spawn proximity, fullscreen, click-through, pet eyes & monitor-clamp loop
    #[cfg(target_os = "windows")]
    thread::Builder::new()
        .name("wens-island-loop".to_string())
        .spawn(move || {
            use windows_sys::Win32::Foundation::POINT;
            use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

            let mut overlay_hidden_for_fullscreen = false;
            let mut pet_hidden_for_fullscreen = false;
            let mut saved_overlay_pos: Option<(i32, i32)> = None;
            let mut saved_pet_pos: Option<(i32, i32)> = None;

            let mut last_monitors = enumerate_monitor_work_rects();
            let mut last_monitor_check = Instant::now();
            let mut last_cursor_pos = (i32::MIN, i32::MIN);
            let mut pet_eyes_were_active = false;

            while !stop_flag.load(Ordering::Relaxed) {
                let prefs = crate::storage::get_cached_preferences(&app);
                let hide_for_fullscreen = prefs.island_hide_fullscreen;
                let fullscreen_active =
                    hide_for_fullscreen && crate::taskbar_widget::is_fullscreen_app_active();
                let fullscreen_transitioning =
                    hide_for_fullscreen && crate::taskbar_widget::is_fullscreen_transitioning();

                if fullscreen_active {
                    if !overlay_hidden_for_fullscreen
                        && crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    {
                        if let Some(overlay) = app.get_webview_window("overlay") {
                            if let Ok(pos) = overlay.outer_position() {
                                saved_overlay_pos = Some((pos.x, pos.y));
                            }
                            if let Ok(hwnd) = overlay.hwnd() {
                                // Clear click-through before suppressing so state never desyncs on restore
                                if ACTUAL_CLICK_THROUGH.load(Ordering::SeqCst) {
                                    set_click_through(hwnd.0 as isize, false);
                                }
                                crate::taskbar_widget::set_window_fullscreen_suppressed(
                                    hwnd.0 as isize,
                                    true,
                                );
                                overlay_hidden_for_fullscreen = true;
                            }
                        }
                    }
                    if !pet_hidden_for_fullscreen && crate::PET_ENABLED.load(Ordering::Relaxed) {
                        if let Some(pet) = app.get_webview_window("pet") {
                            if let Ok(pos) = pet.outer_position() {
                                saved_pet_pos = Some((pos.x, pos.y));
                            }
                            if let Ok(hwnd) = pet.hwnd() {
                                crate::taskbar_widget::set_window_fullscreen_suppressed(
                                    hwnd.0 as isize,
                                    true,
                                );
                                pet_hidden_for_fullscreen = true;
                            }
                        }
                    }
                    thread::sleep(Duration::from_millis(300));
                    continue;
                } else if fullscreen_transitioning {
                    thread::sleep(Duration::from_millis(150));
                    continue;
                } else {
                    // Restore overlay cleanly WITHOUT resetting user's bottom/custom position
                    if overlay_hidden_for_fullscreen {
                        overlay_hidden_for_fullscreen = false;
                        if crate::OVERLAY_ENABLED.load(Ordering::Relaxed) {
                            if let Some(overlay) = app.get_webview_window("overlay") {
                                if let Some((sx, sy)) = saved_overlay_pos.take() {
                                    let (w, h) = overlay
                                        .outer_size()
                                        .map(|s| (s.width as i32, s.height as i32))
                                        .unwrap_or((184, 28));
                                    let (cx, cy) = clamp_position_to_nearest_monitor(sx, sy, w, h, 8);
                                    let _ = overlay.set_position(PhysicalPosition::new(cx, cy));
                                } else {
                                    let scale = overlay.scale_factor().unwrap_or(1.0);
                                    let (cur_w, cur_h) = match overlay.inner_size() {
                                        Ok(phys) => {
                                            (phys.width as f64 / scale, phys.height as f64 / scale)
                                        }
                                        Err(_) => (184.0, 28.0),
                                    };
                                    let is_bottom = prefs.island_orientation == "bottom";
                                    let _ = crate::position_island(&overlay, cur_w, cur_h, is_bottom);
                                }
                                let _ = overlay.show();
                                if let Ok(hwnd) = overlay.hwnd() {
                                    crate::taskbar_widget::set_window_fullscreen_suppressed(
                                        hwnd.0 as isize,
                                        false,
                                    );
                                    // Re-apply desired click-through state cleanly
                                    let manual = MANUAL_CLICK_THROUGH.load(Ordering::SeqCst);
                                    set_click_through(hwnd.0 as isize, manual);
                                }
                            }
                        }
                    }

                    // Restore pet cleanly WITHOUT resetting user's dragged position
                    if pet_hidden_for_fullscreen {
                        pet_hidden_for_fullscreen = false;
                        if crate::PET_ENABLED.load(Ordering::Relaxed) {
                            if let Some(pet) = app.get_webview_window("pet") {
                                if let Some((sx, sy)) = saved_pet_pos.take() {
                                    let (w, h) = pet
                                        .outer_size()
                                        .map(|s| (s.width as i32, s.height as i32))
                                        .unwrap_or((164, 164));
                                    let (cx, cy) = clamp_position_to_nearest_monitor(sx, sy, w, h, 8);
                                    let _ = pet.set_position(PhysicalPosition::new(cx, cy));
                                } else {
                                    let scale = pet.scale_factor().unwrap_or(1.0);
                                    let (cur_w, cur_h) = match pet.inner_size() {
                                        Ok(phys) => {
                                            (phys.width as f64 / scale, phys.height as f64 / scale)
                                        }
                                        Err(_) => (164.0, 164.0),
                                    };
                                    let _ = crate::position_pet(&pet, cur_w, cur_h);
                                }
                                let _ = pet.show();
                                if let Ok(hwnd) = pet.hwnd() {
                                    crate::taskbar_widget::set_window_fullscreen_suppressed(
                                        hwnd.0 as isize,
                                        false,
                                    );
                                }
                            }
                        }
                    }
                }

                // Periodically detect monitor geometry changes (unplugged monitor / resolution shrink)
                if last_monitor_check.elapsed() >= Duration::from_secs(2) {
                    last_monitor_check = Instant::now();
                    let current_monitors = enumerate_monitor_work_rects();
                    if current_monitors != last_monitors && !current_monitors.is_empty() {
                        last_monitors = current_monitors;
                        if crate::OVERLAY_ENABLED.load(Ordering::Relaxed) {
                            if let Some(overlay) = app.get_webview_window("overlay") {
                                if overlay.is_visible().unwrap_or(false) {
                                    reclamp_window_if_offscreen(&overlay, &last_monitors);
                                }
                            }
                        }
                        if crate::PET_ENABLED.load(Ordering::Relaxed) {
                            if let Some(pet) = app.get_webview_window("pet") {
                                if pet.is_visible().unwrap_or(false) {
                                    reclamp_window_if_offscreen(&pet, &last_monitors);
                                }
                            }
                        }
                    }
                }

                let overlay_enabled = crate::OVERLAY_ENABLED.load(Ordering::Relaxed);
                let pet_enabled = crate::PET_ENABLED.load(Ordering::Relaxed);

                if !overlay_enabled && !pet_enabled {
                    thread::sleep(Duration::from_millis(300));
                    continue;
                }

                let mut pt = POINT { x: 0, y: 0 };
                let got_cursor = unsafe { GetCursorPos(&mut pt) != 0 };
                let mut cursor_near_active_target = false;

                if got_cursor {
                    // 1) Dynamic Island overlay click-through hit-testing
                    if overlay_enabled {
                        if let Some(overlay) = app.get_webview_window("overlay") {
                            if overlay.is_visible().unwrap_or(false) {
                                if let (Ok(pos), Ok(size)) =
                                    (overlay.outer_position(), overlay.outer_size())
                                {
                                    let scale = overlay.scale_factor().unwrap_or(1.0);
                                    let center_x = pos.x + (size.width as i32 / 2);
                                    let center_y = pos.y + (size.height as i32 / 2);

                                    let ov_dist = (((pt.x - center_x) as f64).hypot(
                                        (pt.y - center_y) as f64,
                                    )) / scale.max(0.5);
                                    if ov_dist < 320.0 || (pt.y - pos.y).abs() < (120.0 * scale) as i32 {
                                        cursor_near_active_target = true;
                                    }

                                    let is_bottom = prefs.island_orientation == "bottom";
                                    let is_tall = size.height > (38.0 * scale).round() as u32;
                                    let manual_ct = MANUAL_CLICK_THROUGH.load(Ordering::SeqCst);

                                    let should_pass_through = if manual_ct {
                                        true
                                    } else if is_tall && !is_bottom {
                                        // Cover FULL actual `.island-bar` width (>= max(expanded_w / 2, 165) * scale)
                                        // so `#hideOverlayButton`, `#brandPulse`, and all top pill buttons are 100% clickable.
                                        let expanded_w =
                                            EXPANDED_WIDTH_LOGICAL.load(Ordering::SeqCst);
                                        let half_pill_logical = (expanded_w / 2).max(165) as f64;
                                        let half_pill_phys =
                                            (half_pill_logical * scale).round() as i32;
                                        let top_strip_h_phys = (32.0 * scale).round() as i32;
                                        let in_top_strip =
                                            pt.y >= pos.y && pt.y <= pos.y + top_strip_h_phys;
                                        let outside_pill_x =
                                            (pt.x - center_x).abs() > half_pill_phys;
                                        in_top_strip && outside_pill_x
                                    } else {
                                        false
                                    };

                                    if let Ok(hwnd) = overlay.hwnd() {
                                        let hwnd_isize = hwnd.0 as isize;
                                        OVERLAY_HWND_CACHE.store(hwnd_isize, Ordering::SeqCst);
                                        if should_pass_through
                                            != ACTUAL_CLICK_THROUGH.load(Ordering::SeqCst)
                                        {
                                            set_click_through(hwnd_isize, should_pass_through);
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // 2) Pet cursor eye tracking — relative to `pet`'s actual physical rect, even when `overlay` is hidden!
                    if pet_enabled && prefs.pet_cursor_eyes {
                        if let Some(pet) = app.get_webview_window("pet") {
                            if pet.is_visible().unwrap_or(false) {
                                if let (Ok(pos), Ok(size)) =
                                    (pet.outer_position(), pet.outer_size())
                                {
                                    let scale = pet.scale_factor().unwrap_or(1.0);
                                    let pet_center_x = pos.x + (size.width as i32 / 2);
                                    let pet_center_y = pos.y + (size.height as i32 / 2);
                                    let raw_dx = (pt.x - pet_center_x) as f64;
                                    let raw_dy = (pt.y - pet_center_y) as f64;
                                    let dist_phys = raw_dx.hypot(raw_dy);
                                    let radius_phys = 320.0 * scale.max(0.5);

                                    if dist_phys < radius_phys {
                                        cursor_near_active_target = true;
                                        let cursor_moved = (pt.x, pt.y) != last_cursor_pos;
                                        if cursor_moved || !pet_eyes_were_active {
                                            let norm_x = (raw_dx / radius_phys).clamp(-1.0, 1.0);
                                            let norm_y = (raw_dy / radius_phys).clamp(-1.0, 1.0);
                                            let _ = app.emit(
                                                "wens-cursor-near",
                                                &CursorNearEvent {
                                                    distance: dist_phys / scale.max(0.5),
                                                    cursor_x: pt.x,
                                                    cursor_y: pt.y,
                                                    dx: norm_x,
                                                    dy: norm_y,
                                                    pet_center_x,
                                                    pet_center_y,
                                                    scale_factor: scale,
                                                },
                                            );
                                            pet_eyes_were_active = true;
                                        }
                                    } else if pet_eyes_were_active {
                                        // Send one neutral reset so pet eyes smoothly return to center
                                        let _ = app.emit(
                                            "wens-cursor-near",
                                            &CursorNearEvent {
                                                distance: dist_phys / scale.max(0.5),
                                                cursor_x: pt.x,
                                                cursor_y: pt.y,
                                                dx: 0.0,
                                                dy: 0.0,
                                                pet_center_x,
                                                pet_center_y,
                                                scale_factor: scale,
                                            },
                                        );
                                        pet_eyes_were_active = false;
                                    }
                                }
                            }
                        }
                    }

                    last_cursor_pos = (pt.x, pt.y);
                }

                // Adaptive polling: 100ms near island/pet, 300ms when far away (5x lower idle wakeups)
                let sleep_ms = if cursor_near_active_target { 100 } else { 300 };
                thread::sleep(Duration::from_millis(sleep_ms));
            }
        })
        .ok();

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, stop_flag);
    }
}
