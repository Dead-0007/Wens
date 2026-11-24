//! Native Win32 Taskbar Strip Widget & Interactive Prayer Flyout for Wens Desktop.
//!
//! Renders a crisp, DPI-aware, Dark/Light-themed countdown strip embedded on the
//! Windows Taskbar (`Shell_TrayWnd`) with:
//! - Zero per-tick SQLite churn (reads O(1) cached preferences + cached `PrayerDay`)
//! - Explorer.exe crash/restart auto-recovery via a top-level `TaskbarCreated` observer
//! - Cached GDI fonts/brushes/pens (zero leaks, zero deleting selected objects, zero `static mut` UB)
//! - Interactive Win32 Flyout Popup on left-click showing all 5 prayers, live countdown & quick actions
//! - Vertical taskbar & multi-monitor safe clamping

#![cfg_attr(not(target_os = "windows"), allow(dead_code, unused_variables))]

#[cfg(target_os = "windows")]
use chrono::Timelike;
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicIsize, AtomicU32, AtomicU64, Ordering};
#[cfg(target_os = "windows")]
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use tauri::{AppHandle, Emitter, Manager};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::*;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Gdi::*;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, REG_DWORD,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, ReleaseCapture, SetCapture, SetFocus, TrackMouseEvent, TME_LEAVE,
    TRACKMOUSEEVENT, VK_ESCAPE, VK_LBUTTON,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Shell::SHQueryUserNotificationState;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::*;

#[cfg(target_os = "windows")]
type HWINEVENTHOOK = *mut core::ffi::c_void;
#[cfg(target_os = "windows")]
type WINEVENTPROC = Option<
    unsafe extern "system" fn(
        h_win_event_hook: HWINEVENTHOOK,
        event: u32,
        hwnd: HWND,
        id_object: i32,
        id_child: i32,
        id_event_thread: u32,
        dwms_event_time: u32,
    ),
>;

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn SetWinEventHook(
        event_min: u32,
        event_max: u32,
        hmod_win_event_proc: HINSTANCE,
        pfn_win_event_proc: WINEVENTPROC,
        id_process: u32,
        id_thread: u32,
        dw_flags: u32,
    ) -> HWINEVENTHOOK;
    fn UnhookWinEvent(h_win_event_hook: HWINEVENTHOOK) -> BOOL;
}

#[cfg(target_os = "windows")]
const EVENT_SYSTEM_FOREGROUND: u32 = 0x0003;
#[cfg(target_os = "windows")]
const EVENT_SYSTEM_MINIMIZESTART: u32 = 0x0016;
#[cfg(target_os = "windows")]
const EVENT_SYSTEM_MINIMIZEEND: u32 = 0x0017;
#[cfg(target_os = "windows")]
const WINEVENT_OUTOFCONTEXT: u32 = 0x0000;

#[cfg(target_os = "windows")]
const WM_POWERBROADCAST: u32 = 0x0218;
#[cfg(target_os = "windows")]
const WM_MOUSELEAVE_MSG: u32 = 0x02A3;
#[cfg(target_os = "windows")]
const WM_WENS_SETTINGS_CHANGED: u32 = WM_APP + 1;
#[cfg(target_os = "windows")]
const WM_WENS_SHUTDOWN: u32 = WM_APP + 2;

#[cfg(target_os = "windows")]
const TIMER_COUNTDOWN_ID: usize = 1;
#[cfg(target_os = "windows")]
const TIMER_GUARD_ID: usize = 2;

#[cfg(target_os = "windows")]
static TASKBAR_WIDGET_RUNNING: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static TASKBAR_WIDGET_VISIBLE: AtomicBool = AtomicBool::new(true);
#[cfg(target_os = "windows")]
static TASKBAR_WIDGET_LOCKED: AtomicBool = AtomicBool::new(true);
#[cfg(target_os = "windows")]
static CUSTOM_X_POSITION: AtomicI32 = AtomicI32::new(-999_999);
#[cfg(target_os = "windows")]
static OBSERVER_HWND: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static WIDGET_HWND: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static FLYOUT_HWND: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static FLYOUT_LAST_CLOSED_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(target_os = "windows")]
static CURRENT_PARENT_TRAY: AtomicIsize = AtomicIsize::new(0);
#[cfg(target_os = "windows")]
static WIDGET_CURRENTLY_SHOWN: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static FULLSCREEN_SUPPRESSED: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static TRANSITIONING_STATE: AtomicBool = AtomicBool::new(false);
#[cfg(target_os = "windows")]
static SUPPRESS_HOLD_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(target_os = "windows")]
static TASKBAR_CLICK_COOLDOWN_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(target_os = "windows")]
static TASKBAR_CREATED_MSG: AtomicU32 = AtomicU32::new(0);
#[cfg(target_os = "windows")]
static SCHEDULE_EPOCH: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, PartialEq, Eq)]
struct ScheduleKey {
    today: String,
    tomorrow: String,
    tz_today: i32,
    tz_tomorrow: i32,
    lat_bits: u64,
    lng_bits: u64,
    calc_method: String,
    asr_hanafi: bool,
    fajr_offset: i32,
    maghrib_offset: i32,
    isha_offset: i32,
    epoch: u64,
}

#[cfg(target_os = "windows")]
struct CachedPrayerSchedule {
    key: ScheduleKey,
    today_day: Option<wens_core::PrayerDay>,
    tomorrow_day: Option<wens_core::PrayerDay>,
}

#[cfg(target_os = "windows")]
static CACHED_SCHEDULE: Mutex<Option<CachedPrayerSchedule>> = Mutex::new(None);

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FullscreenState {
    Normal,
    Transitioning,
    Active,
}

#[cfg(target_os = "windows")]
#[inline]
fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(target_os = "windows")]
#[inline]
fn rgb(r: u8, g: u8, b: u8) -> u32 {
    (r as u32) | ((g as u32) << 8) | ((b as u32) << 16)
}

#[cfg(target_os = "windows")]
#[inline]
fn scale_px(logical: i32, dpi: u32) -> i32 {
    let d = dpi.clamp(72, 384) as i64;
    ((logical as i64 * d + 48) / 96) as i32
}

#[cfg(target_os = "windows")]
#[inline]
fn lparam_x(lparam: LPARAM) -> i32 {
    (lparam & 0xFFFF) as i16 as i32
}

#[cfg(target_os = "windows")]
#[inline]
fn lparam_y(lparam: LPARAM) -> i32 {
    ((lparam >> 16) & 0xFFFF) as i16 as i32
}

// -------------------------------------------------------------
// Pure Helpers (Tested cross-platform)
// -------------------------------------------------------------

fn sanitize_latitude(v: f64) -> f64 {
    if v.is_finite() && (-90.0..=90.0).contains(&v) {
        v
    } else {
        30.0444
    }
}

fn sanitize_longitude(v: f64) -> f64 {
    if v.is_finite() && (-180.0..=180.0).contains(&v) {
        v
    } else {
        31.2357
    }
}

fn format_countdown_text(diff_secs: i64) -> String {
    let clamped = diff_secs.max(0);
    let diff_h = clamped / 3600;
    let diff_m = (clamped % 3600) / 60;
    let diff_s = clamped % 60;

    // Strictly `< 3600` so exactly 3600 seconds displays "01:00" (NOT "00:00"!)
    if clamped < 3600 {
        format!("{:02}:{:02}", diff_m, diff_s)
    } else {
        format!("{:02}:{:02}", diff_h, diff_m)
    }
}

fn format_prayer_time_12h(minutes_from_midnight: i32) -> String {
    let mins = minutes_from_midnight.clamp(0, 1439);
    let p_h24 = mins / 60;
    let p_min = mins % 60;
    let period = if p_h24 >= 12 { "م" } else { "ص" };
    let p_h12 = match p_h24 % 12 {
        0 => 12,
        other => other,
    };
    format!("{:02}:{:02} {}", p_h12, p_min, period)
}

fn clamp_horizontal_x(x: i32, tray_left: i32, tray_right: i32, widget_w: i32) -> i32 {
    // Guard vertical/narrow taskbar where `tray_right - widget_w < tray_left` so `.clamp()` NEVER panics!
    let max_x = (tray_right - widget_w).max(tray_left);
    x.clamp(tray_left, max_x)
}

fn to_arabic_digits(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '0' => '٠',
            '1' => '١',
            '2' => '٢',
            '3' => '٣',
            '4' => '٤',
            '5' => '٥',
            '6' => '٦',
            '7' => '٧',
            '8' => '٨',
            '9' => '٩',
            other => other,
        })
        .collect()
}

// -------------------------------------------------------------
// Public API
// -------------------------------------------------------------

pub fn is_fullscreen_app_active() -> bool {
    #[cfg(target_os = "windows")]
    {
        FULLSCREEN_SUPPRESSED.load(Ordering::SeqCst)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

pub fn is_fullscreen_transitioning() -> bool {
    #[cfg(target_os = "windows")]
    {
        TRANSITIONING_STATE.load(Ordering::SeqCst)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
pub fn set_window_fullscreen_suppressed(hwnd_ptr: isize, suppress: bool) {
    let hwnd = hwnd_ptr as HWND;
    if hwnd.is_null() {
        return;
    }
    unsafe {
        if suppress {
            SetWindowPos(
                hwnd,
                HWND_NOTOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_HIDEWINDOW,
            );
        } else {
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }
}

/// Called by `storage::settings_update` (or whenever preferences change) to immediately
/// invalidate cached prayer schedules, toggle visibility, reposition, and repaint.
pub fn notify_settings_changed(app: &tauri::AppHandle) {
    #[cfg(target_os = "windows")]
    {
        let prefs = crate::storage::get_cached_preferences(app);
        TASKBAR_WIDGET_VISIBLE.store(prefs.taskbar_widget_enabled, Ordering::SeqCst);
        SCHEDULE_EPOCH.fetch_add(1, Ordering::SeqCst);
        let obs = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
        if !obs.is_null() {
            unsafe {
                PostMessageW(obs, WM_WENS_SETTINGS_CHANGED, 0, 0);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
    }
}

#[cfg(target_os = "windows")]
pub fn shutdown_taskbar_widget() {
    let obs = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
    if !obs.is_null() {
        unsafe {
            PostMessageW(obs, WM_WENS_SHUTDOWN, 0, 0);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn shutdown_taskbar_widget() {}

#[cfg(target_os = "windows")]
pub fn start_taskbar_widget(app: AppHandle) {
    if TASKBAR_WIDGET_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    // Respect `taskbar_widget_enabled` immediately at startup from cached preferences
    let prefs = crate::storage::get_cached_preferences(&app);
    TASKBAR_WIDGET_VISIBLE.store(prefs.taskbar_widget_enabled, Ordering::SeqCst);

    if let Err(err) = std::thread::Builder::new()
        .name("wens-taskbar-widget".to_string())
        .spawn(move || unsafe {
            run_taskbar_widget_loop(app);
        })
    {
        TASKBAR_WIDGET_RUNNING.store(false, Ordering::SeqCst);
        crate::storage::log_line(
            "ERROR",
            "taskbar_widget",
            &format!("Failed to spawn taskbar widget thread: {err}"),
        );
    }
}

#[cfg(not(target_os = "windows"))]
pub fn start_taskbar_widget(_app: tauri::AppHandle) {}

pub fn set_taskbar_widget_visible(visible: bool) {
    #[cfg(target_os = "windows")]
    {
        TASKBAR_WIDGET_VISIBLE.store(visible, Ordering::SeqCst);
        let obs = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
        if !obs.is_null() {
            unsafe {
                PostMessageW(obs, WM_WENS_SETTINGS_CHANGED, 0, 0);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = visible;
    }
}

pub fn set_taskbar_widget_locked(locked: bool) {
    #[cfg(target_os = "windows")]
    {
        TASKBAR_WIDGET_LOCKED.store(locked, Ordering::SeqCst);
        let hwnd = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
        if !hwnd.is_null() {
            unsafe {
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = locked;
    }
}

pub fn is_taskbar_widget_locked() -> bool {
    #[cfg(target_os = "windows")]
    {
        TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst)
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

pub fn set_taskbar_widget_custom_x(x: i32) {
    #[cfg(target_os = "windows")]
    {
        CUSTOM_X_POSITION.store(x, Ordering::SeqCst);
        let obs = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
        if !obs.is_null() {
            unsafe {
                PostMessageW(obs, WM_WENS_SETTINGS_CHANGED, 0, 0);
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = x;
    }
}

pub fn reset_taskbar_widget_position() {
    #[cfg(target_os = "windows")]
    {
        CUSTOM_X_POSITION.store(-999_999, Ordering::SeqCst);
        let obs = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
        if !obs.is_null() {
            unsafe {
                PostMessageW(obs, WM_WENS_SETTINGS_CHANGED, 0, 0);
            }
        }
    }
}

// -------------------------------------------------------------
// Windows Theme, DPI & Cached GDI Resources
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
fn is_windows_light_taskbar() -> bool {
    let subkey = encode_wide("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize");
    let value_name = encode_wide("SystemUsesLightTheme");
    let mut hkey: HKEY = std::ptr::null_mut();

    unsafe {
        if RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        ) == ERROR_SUCCESS
        {
            let mut val: u32 = 0;
            let mut val_type: u32 = 0;
            let mut val_len: u32 = std::mem::size_of::<u32>() as u32;
            let res = RegQueryValueExW(
                hkey,
                value_name.as_ptr(),
                std::ptr::null_mut(),
                &mut val_type,
                &mut val as *mut u32 as *mut u8,
                &mut val_len,
            );
            RegCloseKey(hkey);
            if res == ERROR_SUCCESS && val_type == REG_DWORD && val_len == 4 {
                return val != 0;
            }
        }
    }
    false
}

#[cfg(target_os = "windows")]
unsafe fn get_dpi_for_hwnd(hwnd: HWND) -> u32 {
    let user32 = GetModuleHandleW(encode_wide("user32.dll").as_ptr());
    if !user32.is_null() {
        if let Some(proc) = GetProcAddress(user32, b"GetDpiForWindow\0".as_ptr()) {
            let get_dpi: unsafe extern "system" fn(HWND) -> u32 = std::mem::transmute(proc);
            let dpi = get_dpi(hwnd);
            if (72..=384).contains(&dpi) {
                return dpi;
            }
        }
    }
    let hdc = GetDC(hwnd);
    if !hdc.is_null() {
        let dpi = GetDeviceCaps(hdc, LOGPIXELSX as i32);
        ReleaseDC(hwnd, hdc);
        if (72..=384).contains(&dpi) {
            return dpi as u32;
        }
    }
    96
}

#[cfg(target_os = "windows")]
unsafe fn create_ui_font(height_px: i32, weight: i32) -> HFONT {
    CreateFontW(
        -height_px.abs().max(9),
        0,
        0,
        0,
        weight,
        0,
        0,
        0,
        DEFAULT_CHARSET as u32,
        OUT_DEFAULT_PRECIS as u32,
        CLIP_DEFAULT_PRECIS as u32,
        CLEARTYPE_QUALITY as u32,
        (DEFAULT_PITCH | FF_DONTCARE) as u32,
        encode_wide("Segoe UI").as_ptr(),
    )
}

#[cfg(target_os = "windows")]
struct StripGdiCache {
    dpi: u32,
    light_theme: bool,
    font_label: HFONT,
    font_value: HFONT,
    brush_bg: HBRUSH,
    pen_border_locked: HPEN,
    pen_border_unlocked: HPEN,
    pen_divider: HPEN,
}

#[cfg(target_os = "windows")]
impl StripGdiCache {
    unsafe fn new(dpi: u32, light_theme: bool) -> Self {
        let (bg, border_locked, divider) = if light_theme {
            (rgb(242, 244, 248), rgb(202, 208, 220), rgb(210, 214, 224))
        } else {
            (rgb(26, 26, 30), rgb(55, 55, 65), rgb(55, 55, 65))
        };
        Self {
            dpi,
            light_theme,
            font_label: create_ui_font(scale_px(11, dpi), FW_NORMAL as i32),
            font_value: create_ui_font(scale_px(12, dpi), FW_BOLD as i32),
            brush_bg: CreateSolidBrush(bg),
            pen_border_locked: CreatePen(PS_SOLID as i32, 1, border_locked),
            pen_border_unlocked: CreatePen(PS_SOLID as i32, 1, rgb(70, 150, 240)),
            pen_divider: CreatePen(PS_SOLID as i32, 1, divider),
        }
    }

    unsafe fn ensure(&mut self, dpi: u32, light_theme: bool) {
        if self.dpi != dpi || self.light_theme != light_theme {
            self.destroy();
            *self = Self::new(dpi, light_theme);
        }
    }

    unsafe fn destroy(&mut self) {
        if !self.font_label.is_null() {
            DeleteObject(self.font_label as HGDIOBJ);
            self.font_label = std::ptr::null_mut();
        }
        if !self.font_value.is_null() {
            DeleteObject(self.font_value as HGDIOBJ);
            self.font_value = std::ptr::null_mut();
        }
        if !self.brush_bg.is_null() {
            DeleteObject(self.brush_bg as HGDIOBJ);
            self.brush_bg = std::ptr::null_mut();
        }
        if !self.pen_border_locked.is_null() {
            DeleteObject(self.pen_border_locked as HGDIOBJ);
            self.pen_border_locked = std::ptr::null_mut();
        }
        if !self.pen_border_unlocked.is_null() {
            DeleteObject(self.pen_border_unlocked as HGDIOBJ);
            self.pen_border_unlocked = std::ptr::null_mut();
        }
        if !self.pen_divider.is_null() {
            DeleteObject(self.pen_divider as HGDIOBJ);
            self.pen_divider = std::ptr::null_mut();
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for StripGdiCache {
    fn drop(&mut self) {
        unsafe {
            self.destroy();
        }
    }
}

#[cfg(target_os = "windows")]
struct FlyoutGdiCache {
    dpi: u32,
    light_theme: bool,
    font_title: HFONT,
    font_sub: HFONT,
    font_countdown: HFONT,
    font_row: HFONT,
    font_row_bold: HFONT,
    font_btn: HFONT,
    brush_bg: HBRUSH,
    brush_card: HBRUSH,
    brush_highlight: HBRUSH,
    brush_btn: HBRUSH,
    brush_btn_hover: HBRUSH,
    brush_stop_btn: HBRUSH,
    brush_stop_hover: HBRUSH,
    brush_emerald: HBRUSH,
    pen_border: HPEN,
    pen_card_border: HPEN,
    pen_highlight_border: HPEN,
}

#[cfg(target_os = "windows")]
impl FlyoutGdiCache {
    unsafe fn new(dpi: u32, light_theme: bool) -> Self {
        let (bg, card, highlight, border, card_border, hi_border, btn, btn_hover) = if light_theme {
            (
                rgb(248, 249, 252),
                rgb(238, 241, 247),
                rgb(228, 242, 236),
                rgb(200, 206, 218),
                rgb(214, 220, 232),
                rgb(34, 160, 107),
                rgb(22, 138, 92),
                rgb(16, 118, 78),
            )
        } else {
            (
                rgb(22, 23, 29),
                rgb(31, 33, 42),
                rgb(28, 48, 42),
                rgb(58, 62, 76),
                rgb(48, 52, 66),
                rgb(46, 184, 126),
                rgb(32, 152, 102),
                rgb(40, 174, 118),
            )
        };

        Self {
            dpi,
            light_theme,
            font_title: create_ui_font(scale_px(14, dpi), FW_BOLD as i32),
            font_sub: create_ui_font(scale_px(11, dpi), FW_NORMAL as i32),
            font_countdown: create_ui_font(scale_px(22, dpi), FW_BOLD as i32),
            font_row: create_ui_font(scale_px(13, dpi), FW_NORMAL as i32),
            font_row_bold: create_ui_font(scale_px(13, dpi), FW_BOLD as i32),
            font_btn: create_ui_font(scale_px(13, dpi), 600),
            brush_bg: CreateSolidBrush(bg),
            brush_card: CreateSolidBrush(card),
            brush_highlight: CreateSolidBrush(highlight),
            brush_btn: CreateSolidBrush(btn),
            brush_btn_hover: CreateSolidBrush(btn_hover),
            brush_stop_btn: CreateSolidBrush(rgb(185, 48, 58)),
            brush_stop_hover: CreateSolidBrush(rgb(210, 60, 70)),
            brush_emerald: CreateSolidBrush(rgb(34, 197, 94)),
            pen_border: CreatePen(PS_SOLID as i32, 1, border),
            pen_card_border: CreatePen(PS_SOLID as i32, 1, card_border),
            pen_highlight_border: CreatePen(PS_SOLID as i32, 1, hi_border),
        }
    }

    unsafe fn ensure(&mut self, dpi: u32, light_theme: bool) {
        if self.dpi != dpi || self.light_theme != light_theme {
            self.destroy();
            *self = Self::new(dpi, light_theme);
        }
    }

    unsafe fn destroy(&mut self) {
        let handles: &mut [*mut core::ffi::c_void] = &mut [
            self.font_title as _,
            self.font_sub as _,
            self.font_countdown as _,
            self.font_row as _,
            self.font_row_bold as _,
            self.font_btn as _,
            self.brush_bg as _,
            self.brush_card as _,
            self.brush_highlight as _,
            self.brush_btn as _,
            self.brush_btn_hover as _,
            self.brush_stop_btn as _,
            self.brush_stop_hover as _,
            self.brush_emerald as _,
            self.pen_border as _,
            self.pen_card_border as _,
            self.pen_highlight_border as _,
        ];
        for h in handles.iter_mut() {
            if !(*h).is_null() {
                DeleteObject(*h as HGDIOBJ);
                *h = std::ptr::null_mut();
            }
        }
        self.font_title = std::ptr::null_mut();
        self.font_sub = std::ptr::null_mut();
        self.font_countdown = std::ptr::null_mut();
        self.font_row = std::ptr::null_mut();
        self.font_row_bold = std::ptr::null_mut();
        self.font_btn = std::ptr::null_mut();
        self.brush_bg = std::ptr::null_mut();
        self.brush_card = std::ptr::null_mut();
        self.brush_highlight = std::ptr::null_mut();
        self.brush_btn = std::ptr::null_mut();
        self.brush_btn_hover = std::ptr::null_mut();
        self.brush_stop_btn = std::ptr::null_mut();
        self.brush_stop_hover = std::ptr::null_mut();
        self.brush_emerald = std::ptr::null_mut();
        self.pen_border = std::ptr::null_mut();
        self.pen_card_border = std::ptr::null_mut();
        self.pen_highlight_border = std::ptr::null_mut();
    }
}

#[cfg(target_os = "windows")]
impl Drop for FlyoutGdiCache {
    fn drop(&mut self) {
        unsafe {
            self.destroy();
        }
    }
}

// -------------------------------------------------------------
// Per-Window Heap State (Zero `static mut` UB!)
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
struct ObserverState {
    app: AppHandle,
    h_instance: HINSTANCE,
    strip_class: Vec<u16>,
    flyout_class: Vec<u16>,
    last_light_theme: bool,
}

#[cfg(target_os = "windows")]
struct StripState {
    app: AppHandle,
    dpi: u32,
    light_theme: bool,
    is_dragging: bool,
    drag_start_x: i32,
    drag_start_window_x: i32,
    last_rect: (i32, i32, i32, i32),
    gdi: StripGdiCache,
}

#[cfg(target_os = "windows")]
struct FlyoutState {
    app: AppHandle,
    dpi: u32,
    light_theme: bool,
    hover_open_btn: bool,
    hover_stop_btn: bool,
    tracking_mouse: bool,
    open_btn_rect: RECT,
    stop_btn_rect: RECT,
    has_stop_btn: bool,
    gdi: FlyoutGdiCache,
}

// -------------------------------------------------------------
// Main Taskbar Widget Thread & Observer Setup
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe fn run_taskbar_widget_loop(app: AppHandle) {
    // Load persisted lock/custom-x once using shared single SQLite connection
    let _ = crate::storage::with_database(&app, |db| {
        if let Ok(Some(val)) = db.kv_get("taskbar_locked") {
            let locked = !(val == "0" || val == "false");
            TASKBAR_WIDGET_LOCKED.store(locked, Ordering::SeqCst);
        }
        if let Ok(Some(val)) = db.kv_get("taskbar_custom_x") {
            if let Ok(x) = val.parse::<i32>() {
                CUSTOM_X_POSITION.store(x, Ordering::SeqCst);
            }
        }
        Ok(())
    });

    let tc_msg = RegisterWindowMessageW(encode_wide("TaskbarCreated").as_ptr());
    TASKBAR_CREATED_MSG.store(tc_msg, Ordering::SeqCst);

    let h_instance = GetModuleHandleW(std::ptr::null());
    let observer_class = encode_wide("WensTaskbarObserverClass");
    let strip_class = encode_wide("WensTaskbarStripClass");
    let flyout_class = encode_wide("WensTaskbarFlyoutClass");

    let obs_wc = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: 0,
        lpfnWndProc: Some(observer_window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: h_instance,
        hIcon: std::ptr::null_mut(),
        hCursor: std::ptr::null_mut(),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: observer_class.as_ptr(),
        hIconSm: std::ptr::null_mut(),
    };
    RegisterClassExW(&obs_wc);

    let strip_wc = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(widget_window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: h_instance,
        hIcon: std::ptr::null_mut(),
        hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: strip_class.as_ptr(),
        hIconSm: std::ptr::null_mut(),
    };
    RegisterClassExW(&strip_wc);

    let flyout_wc = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(flyout_window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: h_instance,
        hIcon: std::ptr::null_mut(),
        hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: flyout_class.as_ptr(),
        hIconSm: std::ptr::null_mut(),
    };
    RegisterClassExW(&flyout_wc);

    // Top-level hidden observer window: NEVER a child of Shell_TrayWnd, so it survives
    // Explorer.exe crashes/restarts and reliably receives `TaskbarCreated`, `WM_SETTINGCHANGE`, etc.!
    let obs_hwnd = CreateWindowExW(
        WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        observer_class.as_ptr(),
        encode_wide("WensTaskbarObserver").as_ptr(),
        WS_OVERLAPPED,
        0,
        0,
        0,
        0,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        h_instance,
        std::ptr::null_mut(),
    );

    if obs_hwnd.is_null() {
        TASKBAR_WIDGET_RUNNING.store(false, Ordering::SeqCst);
        return;
    }

    OBSERVER_HWND.store(obs_hwnd as isize, Ordering::SeqCst);
    let obs_state = Box::new(ObserverState {
        app: app.clone(),
        h_instance,
        strip_class,
        flyout_class,
        last_light_theme: is_windows_light_taskbar(),
    });
    SetWindowLongPtrW(obs_hwnd, GWLP_USERDATA, Box::into_raw(obs_state) as isize);

    // Create initial strip window & sync with taskbar
    let obs_ptr = GetWindowLongPtrW(obs_hwnd, GWLP_USERDATA) as *mut ObserverState;
    if !obs_ptr.is_null() {
        ensure_strip_window_and_sync(&mut *obs_ptr);
    }

    let hook_fg = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_FOREGROUND,
        std::ptr::null_mut(),
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT,
    );
    let hook_min = SetWinEventHook(
        EVENT_SYSTEM_MINIMIZESTART,
        EVENT_SYSTEM_MINIMIZEEND,
        std::ptr::null_mut(),
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT,
    );

    // Timer 1: 1000ms for live countdown repaint
    SetTimer(obs_hwnd, TIMER_COUNTDOWN_ID, 1000, None);
    // Timer 2: 250ms lightweight taskbar attachment, explorer-restart & fullscreen guard
    SetTimer(obs_hwnd, TIMER_GUARD_ID, 250, None);

    let mut msg: MSG = std::mem::zeroed();
    while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    if !hook_fg.is_null() {
        UnhookWinEvent(hook_fg);
    }
    if !hook_min.is_null() {
        UnhookWinEvent(hook_min);
    }

    let fly = FLYOUT_HWND.swap(0, Ordering::SeqCst) as HWND;
    if !fly.is_null() && IsWindow(fly) != 0 {
        DestroyWindow(fly);
    }
    let strip = WIDGET_HWND.swap(0, Ordering::SeqCst) as HWND;
    if !strip.is_null() && IsWindow(strip) != 0 {
        DestroyWindow(strip);
    }
    CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
    OBSERVER_HWND.store(0, Ordering::SeqCst);
    WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
    TASKBAR_WIDGET_RUNNING.store(false, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
unsafe fn create_strip_window(obs: &ObserverState) -> HWND {
    let hwnd = CreateWindowExW(
        WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
        obs.strip_class.as_ptr(),
        encode_wide("وِنس - شريط المهام").as_ptr(),
        WS_POPUP | WS_CLIPSIBLINGS,
        0,
        0,
        184,
        38,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
        obs.h_instance,
        std::ptr::null_mut(),
    );
    if hwnd.is_null() {
        return std::ptr::null_mut();
    }

    let dpi = get_dpi_for_hwnd(hwnd);
    let light = is_windows_light_taskbar();
    let state = Box::new(StripState {
        app: obs.app.clone(),
        dpi,
        light_theme: light,
        is_dragging: false,
        drag_start_x: 0,
        drag_start_window_x: 0,
        last_rect: (0, 0, 0, 0),
        gdi: StripGdiCache::new(dpi, light),
    });
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, Box::into_raw(state) as isize);
    WIDGET_HWND.store(hwnd as isize, Ordering::SeqCst);
    CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
    WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
    hwnd
}

#[cfg(target_os = "windows")]
unsafe fn ensure_strip_window_and_sync(obs: &mut ObserverState) -> bool {
    let mut strip_hwnd = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
    if strip_hwnd.is_null() || IsWindow(strip_hwnd) == 0 {
        WIDGET_HWND.store(0, Ordering::SeqCst);
        CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
        WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
        strip_hwnd = create_strip_window(obs);
    }
    if strip_hwnd.is_null() {
        return false;
    }
    sync_widget_visibility_and_zorder(strip_hwnd)
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn observer_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    let tc_msg = TASKBAR_CREATED_MSG.load(Ordering::SeqCst);
    if tc_msg != 0 && msg == tc_msg {
        // Explorer.exe restarted! Recreate/reattach strip cleanly on the new Shell_TrayWnd!
        CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
        WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
        let old_strip = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
        if !old_strip.is_null() && IsWindow(old_strip) != 0 {
            let st_ptr = GetWindowLongPtrW(old_strip, GWLP_USERDATA) as *mut StripState;
            if !st_ptr.is_null() {
                (*st_ptr).last_rect = (0, 0, 0, 0);
            }
        }
        let obs_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ObserverState;
        if !obs_ptr.is_null() {
            let obs = &mut *obs_ptr;
            if ensure_strip_window_and_sync(obs) {
                let strip = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
                if !strip.is_null() {
                    InvalidateRect(strip, std::ptr::null(), 0);
                }
            }
        }
        return 0;
    }

    match msg {
        WM_TIMER => {
            let obs_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ObserverState;
            if obs_ptr.is_null() {
                return 0;
            }
            let obs = &mut *obs_ptr;
            if wparam == TIMER_GUARD_ID {
                let _ = ensure_strip_window_and_sync(obs);
            } else if wparam == TIMER_COUNTDOWN_ID {
                let visible = ensure_strip_window_and_sync(obs);
                if visible {
                    let strip = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
                    if !strip.is_null() && IsWindow(strip) != 0 {
                        InvalidateRect(strip, std::ptr::null(), 0);
                    }
                }
                let fly = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
                if !fly.is_null() && IsWindow(fly) != 0 && IsWindowVisible(fly) != 0 {
                    InvalidateRect(fly, std::ptr::null(), 0);
                }
            }
            0
        }
        WM_SETTINGCHANGE => {
            let obs_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ObserverState;
            if !obs_ptr.is_null() {
                let obs = &mut *obs_ptr;
                let light = is_windows_light_taskbar();
                if light != obs.last_light_theme {
                    obs.last_light_theme = light;
                    let strip = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
                    if !strip.is_null() && IsWindow(strip) != 0 {
                        let st_ptr = GetWindowLongPtrW(strip, GWLP_USERDATA) as *mut StripState;
                        if !st_ptr.is_null() {
                            (*st_ptr).light_theme = light;
                            (*st_ptr).gdi.ensure((*st_ptr).dpi, light);
                        }
                        InvalidateRect(strip, std::ptr::null(), 0);
                    }
                    let fly = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
                    if !fly.is_null() && IsWindow(fly) != 0 {
                        let f_ptr = GetWindowLongPtrW(fly, GWLP_USERDATA) as *mut FlyoutState;
                        if !f_ptr.is_null() {
                            (*f_ptr).light_theme = light;
                            (*f_ptr).gdi.ensure((*f_ptr).dpi, light);
                        }
                        InvalidateRect(fly, std::ptr::null(), 0);
                    }
                }
            }
            0
        }
        WM_DISPLAYCHANGE | WM_TIMECHANGE | WM_POWERBROADCAST | WM_WENS_SETTINGS_CHANGED => {
            SCHEDULE_EPOCH.fetch_add(1, Ordering::SeqCst);
            let strip = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
            if !strip.is_null() && IsWindow(strip) != 0 {
                let st_ptr = GetWindowLongPtrW(strip, GWLP_USERDATA) as *mut StripState;
                if !st_ptr.is_null() {
                    (*st_ptr).last_rect = (0, 0, 0, 0);
                }
            }
            let obs_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut ObserverState;
            if !obs_ptr.is_null() {
                let visible = ensure_strip_window_and_sync(&mut *obs_ptr);
                if visible {
                    let s = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
                    if !s.is_null() && IsWindow(s) != 0 {
                        InvalidateRect(s, std::ptr::null(), 0);
                    }
                } else {
                    close_flyout();
                }
            }
            let fly = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
            if !fly.is_null() && IsWindow(fly) != 0 && IsWindowVisible(fly) != 0 {
                InvalidateRect(fly, std::ptr::null(), 0);
            }
            0
        }
        WM_WENS_SHUTDOWN => {
            close_flyout();
            let strip = WIDGET_HWND.swap(0, Ordering::SeqCst) as HWND;
            if !strip.is_null() && IsWindow(strip) != 0 {
                DestroyWindow(strip);
            }
            DestroyWindow(hwnd);
            0
        }
        WM_DESTROY => {
            KillTimer(hwnd, TIMER_COUNTDOWN_ID);
            KillTimer(hwnd, TIMER_GUARD_ID);
            // Zero GWLP_USERDATA BEFORE Box::from_raw to eliminate UAF!
            let obs_ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut ObserverState;
            if !obs_ptr.is_null() {
                drop(Box::from_raw(obs_ptr));
            }
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

// -------------------------------------------------------------
// Fullscreen / Game Detection & Taskbar Attachment
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe fn is_window_fullscreen_or_game(target_hwnd: HWND, shell_tray: HWND) -> bool {
    if target_hwnd.is_null() || IsWindowVisible(target_hwnd) == 0 || IsIconic(target_hwnd) != 0 {
        return false;
    }
    let widget_hwnd = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
    let flyout_hwnd = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
    if target_hwnd == widget_hwnd
        || target_hwnd == flyout_hwnd
        || (!shell_tray.is_null() && target_hwnd == shell_tray)
    {
        return false;
    }

    let mut pid: u32 = 0;
    GetWindowThreadProcessId(target_hwnd, &mut pid);
    if pid == std::process::id() {
        return false;
    }

    let mut class_buf = [0u16; 256];
    let len = GetClassNameW(target_hwnd, class_buf.as_mut_ptr(), class_buf.len() as i32);
    let class_name = if len > 0 {
        String::from_utf16_lossy(&class_buf[..len as usize])
    } else {
        String::new()
    };

    if matches!(
        class_name.as_str(),
        "Progman"
            | "WorkerW"
            | "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "NotifyIconOverflowWindow"
            | "Windows.UI.Core.CoreWindow"
            | "XamlExplorerHostIslandWindow"
            | "TopLevelWindowForOverflowXamlIsland"
            | "TaskListThumbnailWnd"
            | "MultitaskingViewFrame"
            | "ForegroundStaging"
    ) {
        return false;
    }

    let class_upper = class_name.to_uppercase();
    if class_upper.contains("VALORANT")
        || class_upper.contains("UNREALWINDOW")
        || class_name == "RiotWindowClass"
        || class_name == "UnityWndClass"
        || class_name == "SDL_app"
        || class_name == "CryENGINE"
    {
        return true;
    }

    let mut rect: RECT = std::mem::zeroed();
    if GetWindowRect(target_hwnd, &mut rect) != 0 {
        let target_mon = MonitorFromWindow(target_hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(target_mon, &mut mi) != 0
            && rect.left <= mi.rcMonitor.left
            && rect.top <= mi.rcMonitor.top
            && rect.right >= mi.rcMonitor.right
            && rect.bottom >= mi.rcMonitor.bottom
        {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
unsafe fn evaluate_fullscreen_state(shell_tray: HWND) -> FullscreenState {
    let now = now_millis();

    let mut quns: i32 = 0;
    if SHQueryUserNotificationState(&mut quns) == 0 && (quns == 3 || quns == 4) {
        let fg_now = GetForegroundWindow();
        if !fg_now.is_null() && is_window_fullscreen_or_game(fg_now, shell_tray) {
            SUPPRESS_HOLD_UNTIL_MS.store(now + 2000, Ordering::SeqCst);
            return FullscreenState::Active;
        }
    }

    let lbutton_down = (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0;
    if lbutton_down && !shell_tray.is_null() {
        let mut pt: POINT = std::mem::zeroed();
        let mut tray_rect: RECT = std::mem::zeroed();
        if GetCursorPos(&mut pt) != 0
            && GetWindowRect(shell_tray, &mut tray_rect) != 0
            && pt.x >= tray_rect.left
            && pt.x <= tray_rect.right
            && pt.y >= tray_rect.top
            && pt.y <= tray_rect.bottom
        {
            TASKBAR_CLICK_COOLDOWN_UNTIL_MS.store(now + 800, Ordering::SeqCst);
        }
    }

    let fg = GetForegroundWindow();
    if fg.is_null() {
        if now < SUPPRESS_HOLD_UNTIL_MS.load(Ordering::SeqCst) {
            return FullscreenState::Active;
        }
        return FullscreenState::Transitioning;
    }

    if is_window_fullscreen_or_game(fg, shell_tray) {
        SUPPRESS_HOLD_UNTIL_MS.store(now + 2500, Ordering::SeqCst);
        return FullscreenState::Active;
    }

    if now < SUPPRESS_HOLD_UNTIL_MS.load(Ordering::SeqCst) {
        if !shell_tray.is_null() && fg == shell_tray {
            return FullscreenState::Active;
        }
        SUPPRESS_HOLD_UNTIL_MS.store(0, Ordering::SeqCst);
    }

    if now < TASKBAR_CLICK_COOLDOWN_UNTIL_MS.load(Ordering::SeqCst) {
        return FullscreenState::Transitioning;
    }

    FullscreenState::Normal
}

#[cfg(target_os = "windows")]
unsafe fn ensure_attached_to_taskbar(hwnd: HWND, shell_tray: HWND) -> bool {
    if shell_tray.is_null() || IsWindow(shell_tray) == 0 {
        CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
        return false;
    }
    let current_parent = CURRENT_PARENT_TRAY.load(Ordering::SeqCst) as HWND;
    if current_parent != shell_tray || GetParent(hwnd) != shell_tray {
        SetWindowLongW(
            hwnd,
            GWL_STYLE,
            (WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS) as i32,
        );
        SetWindowLongW(
            hwnd,
            GWL_EXSTYLE,
            (WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as i32,
        );
        SetParent(hwnd, shell_tray);
        if GetParent(hwnd) != shell_tray {
            CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
            return false;
        }
        SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        CURRENT_PARENT_TRAY.store(shell_tray as isize, Ordering::SeqCst);
        let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
        if !st_ptr.is_null() {
            let st = &mut *st_ptr;
            st.last_rect = (0, 0, 0, 0);
            let new_dpi = get_dpi_for_hwnd(shell_tray);
            st.dpi = new_dpi;
            st.gdi.ensure(new_dpi, st.light_theme);
        }
        WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
    }
    true
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn win_event_proc(
    _h_win_event_hook: HWINEVENTHOOK,
    event: u32,
    event_hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _id_event_thread: u32,
    _dwms_event_time: u32,
) {
    if id_object != 0 {
        return;
    }
    let widget_hwnd = WIDGET_HWND.load(Ordering::SeqCst) as HWND;
    if widget_hwnd.is_null() || IsWindow(widget_hwnd) == 0 {
        return;
    }
    let shell_tray = FindWindowW(encode_wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
    if (event == EVENT_SYSTEM_MINIMIZEEND || event == EVENT_SYSTEM_FOREGROUND)
        && !event_hwnd.is_null()
        && is_window_fullscreen_or_game(event_hwnd, shell_tray)
    {
        SUPPRESS_HOLD_UNTIL_MS.store(now_millis() + 3000, Ordering::SeqCst);
        FULLSCREEN_SUPPRESSED.store(true, Ordering::SeqCst);
        TRANSITIONING_STATE.store(false, Ordering::SeqCst);
        close_flyout();
        return;
    }
    let _ = sync_widget_visibility_and_zorder(widget_hwnd);
}

#[cfg(target_os = "windows")]
unsafe fn sync_widget_visibility_and_zorder(hwnd: HWND) -> bool {
    let shell_tray = FindWindowW(encode_wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
    let state = evaluate_fullscreen_state(shell_tray);
    match state {
        FullscreenState::Active => {
            FULLSCREEN_SUPPRESSED.store(true, Ordering::SeqCst);
            TRANSITIONING_STATE.store(false, Ordering::SeqCst);
            close_flyout();
        }
        FullscreenState::Transitioning => {
            TRANSITIONING_STATE.store(true, Ordering::SeqCst);
        }
        FullscreenState::Normal => {
            FULLSCREEN_SUPPRESSED.store(false, Ordering::SeqCst);
            TRANSITIONING_STATE.store(false, Ordering::SeqCst);
        }
    }

    if !TASKBAR_WIDGET_VISIBLE.load(Ordering::SeqCst) {
        if WIDGET_CURRENTLY_SHOWN.swap(false, Ordering::SeqCst) || IsWindowVisible(hwnd) != 0 {
            ShowWindow(hwnd, SW_HIDE);
        }
        return false;
    }

    if !ensure_attached_to_taskbar(hwnd, shell_tray) {
        if WIDGET_CURRENTLY_SHOWN.swap(false, Ordering::SeqCst) || IsWindowVisible(hwnd) != 0 {
            ShowWindow(hwnd, SW_HIDE);
        }
        return false;
    }

    let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
    if st_ptr.is_null() {
        return false;
    }
    let st = &mut *st_ptr;
    if !st.is_dragging {
        let (x, y, w, h) = calculate_widget_rect(Some(&st.app), st.dpi);
        let was_shown =
            WIDGET_CURRENTLY_SHOWN.load(Ordering::SeqCst) && IsWindowVisible(hwnd) != 0;

        if !was_shown {
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                x,
                y,
                w,
                h,
                SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
            );
            st.last_rect = (x, y, w, h);
            WIDGET_CURRENTLY_SHOWN.store(true, Ordering::SeqCst);
        } else if (x, y, w, h) != st.last_rect {
            SetWindowPos(hwnd, std::ptr::null_mut(), x, y, w, h, SWP_NOACTIVATE);
            st.last_rect = (x, y, w, h);
        } else if !GetWindow(hwnd, GW_HWNDPREV).is_null() {
            SetWindowPos(
                hwnd,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
    true
}

#[cfg(target_os = "windows")]
unsafe fn calculate_widget_rect(app_opt: Option<&AppHandle>, dpi: u32) -> (i32, i32, i32, i32) {
    // O(1) RAM preference read — ZERO SQLite opens!
    let position_pref = app_opt
        .map(|app| crate::storage::get_cached_preferences(app).taskbar_widget_position)
        .unwrap_or_else(|| "tray".to_string());

    let shell_tray = FindWindowW(encode_wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
    let mut tray_rect: RECT = std::mem::zeroed();
    let has_tray = if !shell_tray.is_null() {
        GetWindowRect(shell_tray, &mut tray_rect) != 0
    } else {
        false
    };

    if !has_tray || (tray_rect.bottom - tray_rect.top) <= 0 || (tray_rect.right - tray_rect.left) <= 0
    {
        let mut work_area: RECT = std::mem::zeroed();
        let sw = GetSystemMetrics(SM_CXSCREEN).max(800);
        let sh = GetSystemMetrics(SM_CYSCREEN).max(600);
        if SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut work_area as *mut _ as *mut _, 0) != 0
            && sh > work_area.bottom
        {
            tray_rect = RECT {
                left: 0,
                top: work_area.bottom,
                right: sw,
                bottom: sh,
            };
        } else {
            tray_rect = RECT {
                left: 0,
                top: (sh - scale_px(48, dpi)).max(0),
                right: sw,
                bottom: sh,
            };
        }
    }

    let tray_w = (tray_rect.right - tray_rect.left).max(1);
    let tray_h = (tray_rect.bottom - tray_rect.top).max(1);
    let base_w = scale_px(184, dpi);

    // Guard vertical/narrow taskbar safely (NEVER panics when tray_w < widget_w!)
    if tray_w < base_w + 8 {
        let widget_w = (tray_w - 4).clamp(56, base_w);
        let widget_h = scale_px(38, dpi).min(tray_h.max(32));
        let rel_x = ((tray_w - widget_w) / 2).max(0);
        let rel_y = (tray_h - widget_h - scale_px(72, dpi)).max(8);
        if CURRENT_PARENT_TRAY.load(Ordering::SeqCst) != 0 && has_tray {
            return (rel_x, rel_y, widget_w, widget_h);
        } else {
            return (tray_rect.left + rel_x, tray_rect.top + rel_y, widget_w, widget_h);
        }
    }

    let taskbar_h = tray_h.max(scale_px(36, dpi));
    let widget_w = base_w;
    let widget_h = (taskbar_h - scale_px(10, dpi))
        .clamp(scale_px(30, dpi), scale_px(42, dpi))
        .min(taskbar_h);

    let custom_x = CUSTOM_X_POSITION.load(Ordering::SeqCst);
    let screen_x = if custom_x != -999_999 {
        clamp_horizontal_x(custom_x, tray_rect.left, tray_rect.right, widget_w)
    } else if position_pref == "far_left" {
        clamp_horizontal_x(
            tray_rect.left + scale_px(16, dpi),
            tray_rect.left,
            tray_rect.right,
            widget_w,
        )
    } else {
        // Default ("tray" / "near-tray" / "left"): beside TrayNotifyWnd (system tray area)
        let mut found_x = None;
        if !shell_tray.is_null() {
            let tray_notify = FindWindowExW(
                shell_tray,
                std::ptr::null_mut(),
                encode_wide("TrayNotifyWnd").as_ptr(),
                std::ptr::null(),
            );
            if !tray_notify.is_null() {
                let mut notify_rect: RECT = std::mem::zeroed();
                if GetWindowRect(tray_notify, &mut notify_rect) != 0
                    && notify_rect.left > tray_rect.left + widget_w
                {
                    found_x = Some(notify_rect.left - widget_w - scale_px(8, dpi));
                }
            }
        }
        let target = found_x
            .unwrap_or_else(|| (tray_rect.right - scale_px(290, dpi) - widget_w).max(tray_rect.left + 16));
        clamp_horizontal_x(target, tray_rect.left, tray_rect.right, widget_w)
    };

    if CURRENT_PARENT_TRAY.load(Ordering::SeqCst) != 0 && has_tray {
        let rel_x = (screen_x - tray_rect.left).max(0);
        let rel_y = ((taskbar_h - widget_h) / 2).max(0);
        (rel_x, rel_y, widget_w, widget_h)
    } else {
        let widget_y = tray_rect.top + ((taskbar_h - widget_h) / 2).max(0);
        (screen_x, widget_y, widget_w, widget_h)
    }
}

// -------------------------------------------------------------
// Taskbar Strip Window Procedure
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe extern "system" fn widget_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_MOUSEACTIVATE => MA_NOACTIVATE as LRESULT,
        WM_ERASEBKGND => 1,
        WM_DPICHANGED => {
            let new_dpi = (wparam & 0xFFFF) as u32;
            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if !st_ptr.is_null() && (72..=384).contains(&new_dpi) {
                let st = &mut *st_ptr;
                st.dpi = new_dpi;
                st.last_rect = (0, 0, 0, 0);
                st.gdi.ensure(new_dpi, st.light_theme);
                let _ = sync_widget_visibility_and_zorder(hwnd);
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }
            0
        }
        WM_SETCURSOR => {
            let is_locked = TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst);
            let cursor_id = if is_locked { IDC_HAND } else { IDC_SIZEALL };
            SetCursor(LoadCursorW(std::ptr::null_mut(), cursor_id));
            1
        }
        WM_LBUTTONDOWN => {
            let is_locked = TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst);
            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if !is_locked && !st_ptr.is_null() {
                let st = &mut *st_ptr;
                st.is_dragging = true;
                SetCapture(hwnd);
                let mut pt: POINT = std::mem::zeroed();
                GetCursorPos(&mut pt);
                st.drag_start_x = pt.x;
                let mut win_rect: RECT = std::mem::zeroed();
                GetWindowRect(hwnd, &mut win_rect);
                st.drag_start_window_x = win_rect.left;
            }
            0
        }
        WM_MOUSEMOVE => {
            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if !st_ptr.is_null() {
                let st = &mut *st_ptr;
                if st.is_dragging && (wparam & 1) != 0 {
                    let mut pt: POINT = std::mem::zeroed();
                    GetCursorPos(&mut pt);
                    let dx = pt.x - st.drag_start_x;
                    let new_screen_x = st.drag_start_window_x + dx;
                    let mut win_rect: RECT = std::mem::zeroed();
                    GetWindowRect(hwnd, &mut win_rect);
                    let w = (win_rect.right - win_rect.left).max(1);
                    let h = (win_rect.bottom - win_rect.top).max(1);
                    let parent_tray = CURRENT_PARENT_TRAY.load(Ordering::SeqCst) as HWND;
                    let (pos_x, pos_y, clamped_screen_x) =
                        if !parent_tray.is_null() && IsWindow(parent_tray) != 0 {
                            let mut tray_rect: RECT = std::mem::zeroed();
                            GetWindowRect(parent_tray, &mut tray_rect);
                            let taskbar_h = (tray_rect.bottom - tray_rect.top).max(h);
                            let clamped_x =
                                clamp_horizontal_x(new_screen_x, tray_rect.left, tray_rect.right, w);
                            (
                                (clamped_x - tray_rect.left).max(0),
                                ((taskbar_h - h) / 2).max(0),
                                clamped_x,
                            )
                        } else {
                            (new_screen_x, win_rect.top, new_screen_x)
                        };
                    SetWindowPos(
                        hwnd,
                        std::ptr::null_mut(),
                        pos_x,
                        pos_y,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                    st.last_rect = (pos_x, pos_y, w, h);
                    CUSTOM_X_POSITION.store(clamped_screen_x, Ordering::SeqCst);
                }
            }
            0
        }
        WM_LBUTTONUP => {
            let is_locked = TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst);
            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if st_ptr.is_null() {
                return 0;
            }
            let st = &mut *st_ptr;
            if is_locked {
                toggle_flyout_for_strip(hwnd, &st.app, st.dpi);
            } else if st.is_dragging {
                st.is_dragging = false;
                ReleaseCapture();
                let mut pt: POINT = std::mem::zeroed();
                GetCursorPos(&mut pt);
                let dx = (pt.x - st.drag_start_x).abs();
                if dx <= 5 {
                    toggle_flyout_for_strip(hwnd, &st.app, st.dpi);
                } else {
                    let mut win_rect: RECT = std::mem::zeroed();
                    GetWindowRect(hwnd, &mut win_rect);
                    let final_x = win_rect.left;
                    CUSTOM_X_POSITION.store(final_x, Ordering::SeqCst);
                    let _ = crate::storage::with_database(&st.app, |db| {
                        db.kv_set("taskbar_custom_x", &final_x.to_string())
                            .map_err(|e| e.to_string())
                    });
                }
            }
            0
        }
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rect: RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rect);

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            if width <= 0 || height <= 0 {
                EndPaint(hwnd, &ps);
                return 0;
            }

            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if st_ptr.is_null() {
                EndPaint(hwnd, &ps);
                return 0;
            }
            let st = &mut *st_ptr;
            st.gdi.ensure(st.dpi, st.light_theme);

            let summary = compute_prayer_summary(&st.app);

            // Double buffering with strict GDI select/restore discipline (zero leaks!)
            let mem_dc = CreateCompatibleDC(hdc);
            let mem_bmp = CreateCompatibleBitmap(hdc, width, height);
            let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);

            FillRect(mem_dc, &rect, st.gdi.brush_bg);

            let is_locked = TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst);
            let border_pen = if is_locked {
                st.gdi.pen_border_locked
            } else {
                st.gdi.pen_border_unlocked
            };
            let old_pen = SelectObject(mem_dc, border_pen as HGDIOBJ);
            let old_brush = SelectObject(mem_dc, GetStockObject(NULL_BRUSH as i32));
            let radius = scale_px(8, st.dpi);
            RoundRect(mem_dc, rect.left, rect.top, rect.right, rect.bottom, radius, radius);

            let mid_x = rect.right / 2;
            SelectObject(mem_dc, st.gdi.pen_divider as HGDIOBJ);
            let div_pad = scale_px(6, st.dpi);
            MoveToEx(mem_dc, mid_x, rect.top + div_pad, std::ptr::null_mut());
            LineTo(mem_dc, mid_x, rect.bottom - div_pad);

            // Restore pen & brush before text drawing
            SelectObject(mem_dc, old_pen);
            SelectObject(mem_dc, old_brush);

            SetBkMode(mem_dc, TRANSPARENT as i32);

            let (label_color, value_color, now_label_col, now_val_col, wudu_label_col, wudu_val_col) =
                if st.light_theme {
                    (
                        rgb(84, 90, 106),
                        rgb(18, 22, 32),
                        rgb(16, 138, 66),
                        rgb(12, 118, 56),
                        rgb(180, 98, 8),
                        rgb(154, 78, 6),
                    )
                } else {
                    (
                        rgb(180, 180, 190),
                        rgb(245, 245, 250),
                        rgb(34, 197, 94),
                        rgb(74, 222, 128),
                        rgb(245, 158, 11),
                        rgb(251, 191, 36),
                    )
                };

            let old_font = SelectObject(mem_dc, st.gdi.font_label as HGDIOBJ);
            let top_row_h = height / 2;
            let side_pad = scale_px(6, st.dpi);
            let inner_pad = scale_px(3, st.dpi);

            // --- Right Block: Prayer Name & Prayer Time ---
            SetTextColor(mem_dc, label_color);
            let mut r_prayer_name = RECT {
                left: mid_x + inner_pad,
                top: rect.top + scale_px(2, st.dpi),
                right: rect.right - side_pad,
                bottom: rect.top + top_row_h,
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.next_name).as_ptr(),
                -1,
                &mut r_prayer_name,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS,
            );

            SelectObject(mem_dc, st.gdi.font_value as HGDIOBJ);
            SetTextColor(mem_dc, value_color);
            let mut r_prayer_time = RECT {
                left: mid_x + inner_pad,
                top: rect.top + top_row_h - scale_px(1, st.dpi),
                right: rect.right - side_pad,
                bottom: rect.bottom - scale_px(2, st.dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.next_time).as_ptr(),
                -1,
                &mut r_prayer_time,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS,
            );

            // --- Left Block: Status & Countdown ---
            SelectObject(mem_dc, st.gdi.font_label as HGDIOBJ);
            let status_color = if summary.is_now {
                now_label_col
            } else if summary.is_wudu {
                wudu_label_col
            } else {
                label_color
            };
            SetTextColor(mem_dc, status_color);
            let mut r_status = RECT {
                left: rect.left + side_pad,
                top: rect.top + scale_px(2, st.dpi),
                right: mid_x - inner_pad,
                bottom: rect.top + top_row_h,
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.status_label).as_ptr(),
                -1,
                &mut r_status,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS,
            );

            SelectObject(mem_dc, st.gdi.font_value as HGDIOBJ);
            let count_color = if summary.is_now {
                now_val_col
            } else if summary.is_wudu {
                wudu_val_col
            } else {
                value_color
            };
            SetTextColor(mem_dc, count_color);
            let mut r_count = RECT {
                left: rect.left + side_pad,
                top: rect.top + top_row_h - scale_px(1, st.dpi),
                right: mid_x - inner_pad,
                bottom: rect.bottom - scale_px(2, st.dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.countdown).as_ptr(),
                -1,
                &mut r_count,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS,
            );

            // ALWAYS restore font before deleting mem_dc! (Cached fonts stay alive in StripGdiCache.)
            SelectObject(mem_dc, old_font);

            BitBlt(hdc, 0, 0, width, height, mem_dc, 0, 0, SRCCOPY);

            SelectObject(mem_dc, old_bmp);
            DeleteObject(mem_bmp as HGDIOBJ);
            DeleteDC(mem_dc);

            EndPaint(hwnd, &ps);
            0
        }
        WM_RBUTTONUP => {
            close_flyout();
            let st_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
            if st_ptr.is_null() {
                return 0;
            }
            let app = (*st_ptr).app.clone();
            let dpi = (*st_ptr).dpi;

            let mut pt: POINT = std::mem::zeroed();
            GetCursorPos(&mut pt);

            let is_locked = TASKBAR_WIDGET_LOCKED.load(Ordering::SeqCst);
            let lock_label = if is_locked {
                "🔓 تفعيل تحريك موضع الشريط (سحب بالماوس)"
            } else {
                "🔒 تثبيت موضع الشريط (قفل التحريك)"
            };

            let h_menu = CreatePopupMenu();
            AppendMenuW(h_menu, MF_STRING, 108, encode_wide("مواقيت اليوم (القائمة السريعة)").as_ptr());
            AppendMenuW(h_menu, MF_STRING, 101, encode_wide("فتح وِنس").as_ptr());
            AppendMenuW(h_menu, MF_SEPARATOR, 0, std::ptr::null());
            AppendMenuW(h_menu, MF_STRING, 106, encode_wide(lock_label).as_ptr());
            AppendMenuW(h_menu, MF_SEPARATOR, 0, std::ptr::null());
            AppendMenuW(h_menu, MF_STRING, 104, encode_wide("محاذاة بجوار صينية النظام والساعة").as_ptr());
            AppendMenuW(h_menu, MF_STRING, 107, encode_wide("محاذاة لمنتصف شريط المهام").as_ptr());
            AppendMenuW(h_menu, MF_STRING, 105, encode_wide("محاذاة لأقصى يسار شريط المهام").as_ptr());
            AppendMenuW(h_menu, MF_SEPARATOR, 0, std::ptr::null());
            AppendMenuW(h_menu, MF_STRING, 102, encode_wide("إيقاف الصوت الآن").as_ptr());
            AppendMenuW(h_menu, MF_STRING, 103, encode_wide("إخفاء الشريط").as_ptr());

            SetForegroundWindow(hwnd);
            let cmd = TrackPopupMenu(
                h_menu,
                TPM_RETURNCMD | TPM_RIGHTBUTTON,
                pt.x,
                pt.y,
                0,
                hwnd,
                std::ptr::null(),
            );
            DestroyMenu(h_menu);

            match cmd {
                108 => {
                    toggle_flyout_for_strip(hwnd, &app, dpi);
                }
                101 => {
                    focus_main_window(&app);
                }
                106 => {
                    let new_locked = !is_locked;
                    TASKBAR_WIDGET_LOCKED.store(new_locked, Ordering::SeqCst);
                    let _ = crate::storage::with_database(&app, |db| {
                        db.kv_set("taskbar_locked", if new_locked { "1" } else { "0" })
                            .map_err(|e| e.to_string())
                    });
                    let cursor_id = if new_locked { IDC_HAND } else { IDC_SIZEALL };
                    SetCursor(LoadCursorW(std::ptr::null_mut(), cursor_id));
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                107 => {
                    let shell_tray =
                        FindWindowW(encode_wide("Shell_TrayWnd").as_ptr(), std::ptr::null());
                    let mut tray_rect: RECT = std::mem::zeroed();
                    let has_tray = !shell_tray.is_null()
                        && GetWindowRect(shell_tray, &mut tray_rect) != 0;
                    let widget_w = scale_px(184, dpi);
                    let center_x = if has_tray {
                        clamp_horizontal_x(
                            tray_rect.left + ((tray_rect.right - tray_rect.left) - widget_w) / 2,
                            tray_rect.left,
                            tray_rect.right,
                            widget_w,
                        )
                    } else {
                        870
                    };
                    CUSTOM_X_POSITION.store(center_x, Ordering::SeqCst);
                    let _ = crate::storage::with_database(&app, |db| {
                        db.kv_set("taskbar_custom_x", &center_x.to_string())
                            .map_err(|e| e.to_string())
                    });
                    let (x, y, w, h) = calculate_widget_rect(Some(&app), dpi);
                    let st_now = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
                    if !st_now.is_null() {
                        (*st_now).last_rect = (x, y, w, h);
                    }
                    SetWindowPos(
                        hwnd,
                        std::ptr::null_mut(),
                        x,
                        y,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                104 => {
                    CUSTOM_X_POSITION.store(-999_999, Ordering::SeqCst);
                    if let Ok(updated) = crate::storage::with_database(&app, |db| {
                        let _ = db.kv_set("taskbar_custom_x", "");
                        let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
                        prefs.taskbar_widget_position = "tray".to_string();
                        db.save_preferences(&prefs).map_err(|e| e.to_string())?;
                        let _ = db.update_legacy_root_settings(&prefs);
                        Ok(prefs)
                    }) {
                        crate::storage::refresh_cached_preferences(updated.clone());
                        let _ = app.emit("wens-settings-changed", &updated);
                    }
                    let (x, y, w, h) = calculate_widget_rect(Some(&app), dpi);
                    let st_now = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
                    if !st_now.is_null() {
                        (*st_now).last_rect = (x, y, w, h);
                    }
                    SetWindowPos(
                        hwnd,
                        std::ptr::null_mut(),
                        x,
                        y,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                105 => {
                    CUSTOM_X_POSITION.store(-999_999, Ordering::SeqCst);
                    if let Ok(updated) = crate::storage::with_database(&app, |db| {
                        let _ = db.kv_set("taskbar_custom_x", "");
                        let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
                        prefs.taskbar_widget_position = "far_left".to_string();
                        db.save_preferences(&prefs).map_err(|e| e.to_string())?;
                        let _ = db.update_legacy_root_settings(&prefs);
                        Ok(prefs)
                    }) {
                        crate::storage::refresh_cached_preferences(updated.clone());
                        let _ = app.emit("wens-settings-changed", &updated);
                    }
                    let (x, y, w, h) = calculate_widget_rect(Some(&app), dpi);
                    let st_now = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut StripState;
                    if !st_now.is_null() {
                        (*st_now).last_rect = (x, y, w, h);
                    }
                    SetWindowPos(
                        hwnd,
                        std::ptr::null_mut(),
                        x,
                        y,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                102 => {
                    if let Some(audio) = app.try_state::<crate::AudioService>() {
                        audio.stop();
                    }
                }
                103 => {
                    // Persist Hide cleanly via shared DB + refresh cache + broadcast settings change!
                    TASKBAR_WIDGET_VISIBLE.store(false, Ordering::SeqCst);
                    WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
                    ShowWindow(hwnd, SW_HIDE);
                    if let Ok(updated) = crate::storage::with_database(&app, |db| {
                        let mut prefs = db.get_preferences().map_err(|e| e.to_string())?;
                        prefs.taskbar_widget_enabled = false;
                        db.save_preferences(&prefs).map_err(|e| e.to_string())?;
                        let _ = db.update_legacy_root_settings(&prefs);
                        Ok(prefs)
                    }) {
                        crate::storage::refresh_cached_preferences(updated.clone());
                        let _ = app.emit("wens-settings-changed", &updated);
                    }
                }
                _ => {}
            }
            0
        }
        WM_DESTROY => {
            // Explorer.exe restart destroys Shell_TrayWnd and its child windows:
            // Zero GWLP_USERDATA BEFORE Box::from_raw (fixes UAF!), clear handles, and DO NOT PostQuitMessage!
            let st_ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut StripState;
            if !st_ptr.is_null() {
                drop(Box::from_raw(st_ptr));
            }
            if WIDGET_HWND.load(Ordering::SeqCst) == hwnd as isize {
                WIDGET_HWND.store(0, Ordering::SeqCst);
            }
            CURRENT_PARENT_TRAY.store(0, Ordering::SeqCst);
            WIDGET_CURRENTLY_SHOWN.store(false, Ordering::SeqCst);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

#[cfg(target_os = "windows")]
fn focus_main_window(app: &AppHandle) {
    crate::spawn_open_or_focus_main(app);
}

// -------------------------------------------------------------
// Native Win32 Interactive Prayer Flyout Popup
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe fn close_flyout() {
    let fly = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
    if !fly.is_null() && IsWindow(fly) != 0 && IsWindowVisible(fly) != 0 {
        ShowWindow(fly, SW_HIDE);
        FLYOUT_LAST_CLOSED_MS.store(now_millis(), Ordering::SeqCst);
    }
}

#[cfg(target_os = "windows")]
unsafe fn toggle_flyout_for_strip(strip_hwnd: HWND, app: &AppHandle, dpi: u32) {
    let existing = FLYOUT_HWND.load(Ordering::SeqCst) as HWND;
    if !existing.is_null() && IsWindow(existing) != 0 && IsWindowVisible(existing) != 0 {
        close_flyout();
        return;
    }

    // Prevent immediate reopen when user clicks the strip specifically to dismiss an open flyout
    if now_millis().saturating_sub(FLYOUT_LAST_CLOSED_MS.load(Ordering::SeqCst)) < 220 {
        return;
    }

    let obs_hwnd = OBSERVER_HWND.load(Ordering::SeqCst) as HWND;
    if obs_hwnd.is_null() {
        focus_main_window(app);
        return;
    }
    let obs_ptr = GetWindowLongPtrW(obs_hwnd, GWLP_USERDATA) as *mut ObserverState;
    if obs_ptr.is_null() {
        focus_main_window(app);
        return;
    }
    let obs = &*obs_ptr;

    let fly_hwnd = if !existing.is_null() && IsWindow(existing) != 0 {
        existing
    } else {
        let h = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW,
            obs.flyout_class.as_ptr(),
            encode_wide("وِنس — مواقيت الصلاة").as_ptr(),
            WS_POPUP | WS_CLIPSIBLINGS,
            0,
            0,
            scale_px(292, dpi),
            scale_px(336, dpi),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            obs.h_instance,
            std::ptr::null_mut(),
        );
        if h.is_null() {
            focus_main_window(app);
            return;
        }
        let light = is_windows_light_taskbar();
        let state = Box::new(FlyoutState {
            app: app.clone(),
            dpi,
            light_theme: light,
            hover_open_btn: false,
            hover_stop_btn: false,
            tracking_mouse: false,
            open_btn_rect: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            stop_btn_rect: RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            has_stop_btn: false,
            gdi: FlyoutGdiCache::new(dpi, light),
        });
        SetWindowLongPtrW(h, GWLP_USERDATA, Box::into_raw(state) as isize);
        FLYOUT_HWND.store(h as isize, Ordering::SeqCst);
        h
    };

    // Anchor flyout directly above (or below/beside) the taskbar strip, clamped inside monitor work area
    let mut strip_rect: RECT = std::mem::zeroed();
    GetWindowRect(strip_hwnd, &mut strip_rect);
    let hmon = MonitorFromWindow(strip_hwnd, MONITOR_DEFAULTTONEAREST);
    let mut mi: MONITORINFO = std::mem::zeroed();
    mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
    let work = if !hmon.is_null() && GetMonitorInfoW(hmon, &mut mi) != 0 {
        mi.rcWork
    } else {
        RECT {
            left: 0,
            top: 0,
            right: GetSystemMetrics(SM_CXSCREEN).max(1024),
            bottom: GetSystemMetrics(SM_CYSCREEN).max(768) - 48,
        }
    };

    let f_dpi = get_dpi_for_hwnd(strip_hwnd);
    let fly_w = scale_px(292, f_dpi);
    let fly_h = scale_px(336, f_dpi);
    let gap = scale_px(10, f_dpi);

    let f_ptr = GetWindowLongPtrW(fly_hwnd, GWLP_USERDATA) as *mut FlyoutState;
    if !f_ptr.is_null() {
        let fst = &mut *f_ptr;
        fst.dpi = f_dpi;
        fst.light_theme = is_windows_light_taskbar();
        fst.hover_open_btn = false;
        fst.hover_stop_btn = false;
        fst.gdi.ensure(fst.dpi, fst.light_theme);
    }

    let strip_cx = (strip_rect.left + strip_rect.right) / 2;
    let mut x = strip_cx - fly_w / 2;
    let mut y = strip_rect.top - fly_h - gap;
    if y < work.top + gap {
        // Taskbar at top of screen: anchor below the strip
        y = strip_rect.bottom + gap;
    }

    let min_x = work.left + gap;
    let max_x = (work.right - fly_w - gap).max(min_x);
    let min_y = work.top + gap;
    let max_y = (work.bottom - fly_h - gap).max(min_y);
    x = x.clamp(min_x, max_x);
    y = y.clamp(min_y, max_y);

    SetWindowPos(
        fly_hwnd,
        HWND_TOPMOST,
        x,
        y,
        fly_w,
        fly_h,
        SWP_SHOWWINDOW,
    );
    InvalidateRect(fly_hwnd, std::ptr::null(), 0);
    SetForegroundWindow(fly_hwnd);
    SetFocus(fly_hwnd);
}

#[cfg(target_os = "windows")]
fn point_in_rect(x: i32, y: i32, r: &RECT) -> bool {
    x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn flyout_window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_ERASEBKGND => 1,
        WM_ACTIVATE => {
            if (wparam & 0xFFFF) as u32 == WA_INACTIVE {
                close_flyout();
            }
            0
        }
        WM_KILLFOCUS => {
            close_flyout();
            0
        }
        WM_KEYDOWN => {
            if wparam == VK_ESCAPE as usize {
                close_flyout();
            }
            0
        }
        WM_DPICHANGED => {
            let new_dpi = (wparam & 0xFFFF) as u32;
            let f_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut FlyoutState;
            if !f_ptr.is_null() && (72..=384).contains(&new_dpi) {
                let fst = &mut *f_ptr;
                fst.dpi = new_dpi;
                fst.gdi.ensure(new_dpi, fst.light_theme);
                InvalidateRect(hwnd, std::ptr::null(), 0);
            }
            0
        }
        WM_MOUSEMOVE => {
            let f_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut FlyoutState;
            if !f_ptr.is_null() {
                let fst = &mut *f_ptr;
                if !fst.tracking_mouse {
                    let mut tme = TRACKMOUSEEVENT {
                        cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
                        dwFlags: TME_LEAVE,
                        hwndTrack: hwnd,
                        dwHoverTime: 0,
                    };
                    TrackMouseEvent(&mut tme);
                    fst.tracking_mouse = true;
                }
                let mx = lparam_x(lparam);
                let my = lparam_y(lparam);
                let h_open = point_in_rect(mx, my, &fst.open_btn_rect);
                let h_stop = fst.has_stop_btn && point_in_rect(mx, my, &fst.stop_btn_rect);
                if h_open != fst.hover_open_btn || h_stop != fst.hover_stop_btn {
                    fst.hover_open_btn = h_open;
                    fst.hover_stop_btn = h_stop;
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
                let cursor_id = if h_open || h_stop { IDC_HAND } else { IDC_ARROW };
                SetCursor(LoadCursorW(std::ptr::null_mut(), cursor_id));
            }
            0
        }
        WM_MOUSELEAVE_MSG => {
            let f_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut FlyoutState;
            if !f_ptr.is_null() {
                let fst = &mut *f_ptr;
                fst.tracking_mouse = false;
                if fst.hover_open_btn || fst.hover_stop_btn {
                    fst.hover_open_btn = false;
                    fst.hover_stop_btn = false;
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
            }
            0
        }
        WM_LBUTTONUP => {
            let f_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut FlyoutState;
            if !f_ptr.is_null() {
                let fst = &mut *f_ptr;
                let mx = lparam_x(lparam);
                let my = lparam_y(lparam);
                if point_in_rect(mx, my, &fst.open_btn_rect) {
                    let app = fst.app.clone();
                    close_flyout();
                    focus_main_window(&app);
                } else if fst.has_stop_btn && point_in_rect(mx, my, &fst.stop_btn_rect) {
                    if let Some(audio) = fst.app.try_state::<crate::AudioService>() {
                        audio.stop();
                    }
                    InvalidateRect(hwnd, std::ptr::null(), 0);
                }
            }
            0
        }
        WM_PAINT => {
            let mut ps: PAINTSTRUCT = std::mem::zeroed();
            let hdc = BeginPaint(hwnd, &mut ps);
            let mut rect: RECT = std::mem::zeroed();
            GetClientRect(hwnd, &mut rect);

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            let f_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut FlyoutState;
            if width <= 0 || height <= 0 || f_ptr.is_null() {
                EndPaint(hwnd, &ps);
                return 0;
            }

            let fst = &mut *f_ptr;
            fst.gdi.ensure(fst.dpi, fst.light_theme);
            let dpi = fst.dpi;

            let summary = compute_prayer_summary(&fst.app);
            let audio_playing = fst
                .app
                .try_state::<crate::AudioService>()
                .map(|a| a.is_playing())
                .unwrap_or(false);
            fst.has_stop_btn = audio_playing;

            let mem_dc = CreateCompatibleDC(hdc);
            let mem_bmp = CreateCompatibleBitmap(hdc, width, height);
            let old_bmp = SelectObject(mem_dc, mem_bmp as HGDIOBJ);
            let old_font = SelectObject(mem_dc, fst.gdi.font_title as HGDIOBJ);
            let old_pen = SelectObject(mem_dc, fst.gdi.pen_border as HGDIOBJ);
            let old_brush = SelectObject(mem_dc, fst.gdi.brush_bg as HGDIOBJ);

            FillRect(mem_dc, &rect, fst.gdi.brush_bg);
            SetBkMode(mem_dc, TRANSPARENT as i32);

            // Outer frame border
            SelectObject(mem_dc, GetStockObject(NULL_BRUSH as i32));
            RoundRect(
                mem_dc,
                rect.left,
                rect.top,
                rect.right,
                rect.bottom,
                scale_px(12, dpi),
                scale_px(12, dpi),
            );

            let (fg_primary, fg_muted, accent_fg, amber_fg) = if fst.light_theme {
                (
                    rgb(20, 24, 34),
                    rgb(94, 102, 118),
                    rgb(16, 138, 84),
                    rgb(180, 98, 8),
                )
            } else {
                (
                    rgb(245, 246, 250),
                    rgb(160, 166, 182),
                    rgb(74, 222, 128),
                    rgb(251, 191, 36),
                )
            };

            let pad = scale_px(14, dpi);
            let mut y = pad;

            // --- Header: Brand + Location ---
            SelectObject(mem_dc, fst.gdi.font_title as HGDIOBJ);
            SetTextColor(mem_dc, fg_primary);
            let mut r_brand = RECT {
                left: width / 2,
                top: y,
                right: width - pad,
                bottom: y + scale_px(22, dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide("وِنس · مواقيت الصلاة").as_ptr(),
                -1,
                &mut r_brand,
                DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_RTLREADING,
            );

            SelectObject(mem_dc, fst.gdi.font_sub as HGDIOBJ);
            SetTextColor(mem_dc, fg_muted);
            let mut r_city = RECT {
                left: pad,
                top: y,
                right: width / 2 - scale_px(4, dpi),
                bottom: y + scale_px(22, dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.location_label).as_ptr(),
                -1,
                &mut r_city,
                DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS,
            );
            y += scale_px(28, dpi);

            // --- Hero Countdown Card ---
            let hero_h = scale_px(66, dpi);
            let hero_rect = RECT {
                left: pad,
                top: y,
                right: width - pad,
                bottom: y + hero_h,
            };
            SelectObject(mem_dc, fst.gdi.pen_card_border as HGDIOBJ);
            SelectObject(mem_dc, fst.gdi.brush_card as HGDIOBJ);
            RoundRect(
                mem_dc,
                hero_rect.left,
                hero_rect.top,
                hero_rect.right,
                hero_rect.bottom,
                scale_px(10, dpi),
                scale_px(10, dpi),
            );

            let hero_status = if summary.is_now {
                format!("حان الآن وقت {}", summary.next_name)
            } else if summary.is_wudu {
                format!("استعد للوضوء · {}", summary.next_name)
            } else {
                format!("الصلاة القادمة: {}", summary.next_name)
            };
            SelectObject(mem_dc, fst.gdi.font_sub as HGDIOBJ);
            SetTextColor(
                mem_dc,
                if summary.is_now {
                    accent_fg
                } else if summary.is_wudu {
                    amber_fg
                } else {
                    fg_muted
                },
            );
            let mut r_hero_top = RECT {
                left: hero_rect.left + scale_px(10, dpi),
                top: hero_rect.top + scale_px(8, dpi),
                right: hero_rect.right - scale_px(10, dpi),
                bottom: hero_rect.top + scale_px(26, dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&hero_status).as_ptr(),
                -1,
                &mut r_hero_top,
                DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_RTLREADING,
            );

            SelectObject(mem_dc, fst.gdi.font_countdown as HGDIOBJ);
            SetTextColor(
                mem_dc,
                if summary.is_now {
                    accent_fg
                } else if summary.is_wudu {
                    amber_fg
                } else {
                    fg_primary
                },
            );
            let mut r_hero_cd = RECT {
                left: hero_rect.left + scale_px(10, dpi),
                top: hero_rect.top + scale_px(28, dpi),
                right: hero_rect.right - scale_px(10, dpi),
                bottom: hero_rect.bottom - scale_px(8, dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.countdown).as_ptr(),
                -1,
                &mut r_hero_cd,
                DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
            );

            SelectObject(mem_dc, fst.gdi.font_row_bold as HGDIOBJ);
            SetTextColor(mem_dc, fg_primary);
            let mut r_hero_time = RECT {
                left: hero_rect.left + scale_px(10, dpi),
                top: hero_rect.top + scale_px(30, dpi),
                right: hero_rect.right - scale_px(10, dpi),
                bottom: hero_rect.bottom - scale_px(8, dpi),
            };
            DrawTextW(
                mem_dc,
                encode_wide(&summary.next_time).as_ptr(),
                -1,
                &mut r_hero_time,
                DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
            );

            y += hero_h + scale_px(10, dpi);

            // --- All 5 Obligatory Prayers List ---
            let row_h = scale_px(30, dpi);
            let row_gap = scale_px(4, dpi);
            for row in &summary.five_prayers {
                let rr = RECT {
                    left: pad,
                    top: y,
                    right: width - pad,
                    bottom: y + row_h,
                };
                if row.is_next {
                    SelectObject(mem_dc, fst.gdi.pen_highlight_border as HGDIOBJ);
                    SelectObject(mem_dc, fst.gdi.brush_highlight as HGDIOBJ);
                    RoundRect(
                        mem_dc,
                        rr.left,
                        rr.top,
                        rr.right,
                        rr.bottom,
                        scale_px(8, dpi),
                        scale_px(8, dpi),
                    );
                }

                // Emerald indicator dot for current prayer
                if row.is_current {
                    let dot = scale_px(7, dpi);
                    let dx = rr.right - scale_px(14, dpi);
                    let dy = rr.top + (row_h - dot) / 2;
                    SelectObject(mem_dc, GetStockObject(NULL_PEN as i32));
                    SelectObject(mem_dc, fst.gdi.brush_emerald as HGDIOBJ);
                    RoundRect(mem_dc, dx, dy, dx + dot, dy + dot, dot, dot);
                }

                let name_right = if row.is_current {
                    rr.right - scale_px(22, dpi)
                } else {
                    rr.right - scale_px(10, dpi)
                };

                SelectObject(
                    mem_dc,
                    if row.is_next {
                        fst.gdi.font_row_bold
                    } else {
                        fst.gdi.font_row
                    } as HGDIOBJ,
                );
                SetTextColor(
                    mem_dc,
                    if row.is_next {
                        accent_fg
                    } else if row.is_current {
                        fg_primary
                    } else {
                        fg_muted
                    },
                );

                let mut r_name = RECT {
                    left: rr.left + scale_px(96, dpi),
                    top: rr.top,
                    right: name_right,
                    bottom: rr.bottom,
                };
                DrawTextW(
                    mem_dc,
                    encode_wide(&row.name_ar).as_ptr(),
                    -1,
                    &mut r_name,
                    DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_RTLREADING,
                );

                let mut r_time = RECT {
                    left: rr.left + scale_px(10, dpi),
                    top: rr.top,
                    right: rr.left + scale_px(110, dpi),
                    bottom: rr.bottom,
                };
                DrawTextW(
                    mem_dc,
                    encode_wide(&row.time_text).as_ptr(),
                    -1,
                    &mut r_time,
                    DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
                );

                y += row_h + row_gap;
            }

            // --- Footer Action Button(s) ---
            let btn_h = scale_px(34, dpi);
            let btn_top = (height - pad - btn_h).max(y + scale_px(4, dpi));
            let btn_bottom = btn_top + btn_h;

            if audio_playing {
                let split_gap = scale_px(8, dpi);
                let stop_w = scale_px(100, dpi);
                fst.stop_btn_rect = RECT {
                    left: pad,
                    top: btn_top,
                    right: pad + stop_w,
                    bottom: btn_bottom,
                };
                fst.open_btn_rect = RECT {
                    left: pad + stop_w + split_gap,
                    top: btn_top,
                    right: width - pad,
                    bottom: btn_bottom,
                };

                SelectObject(mem_dc, GetStockObject(NULL_PEN as i32));
                SelectObject(
                    mem_dc,
                    if fst.hover_stop_btn {
                        fst.gdi.brush_stop_hover
                    } else {
                        fst.gdi.brush_stop_btn
                    } as HGDIOBJ,
                );
                RoundRect(
                    mem_dc,
                    fst.stop_btn_rect.left,
                    fst.stop_btn_rect.top,
                    fst.stop_btn_rect.right,
                    fst.stop_btn_rect.bottom,
                    scale_px(8, dpi),
                    scale_px(8, dpi),
                );
                SelectObject(mem_dc, fst.gdi.font_btn as HGDIOBJ);
                SetTextColor(mem_dc, rgb(255, 255, 255));
                let mut r_stop_txt = fst.stop_btn_rect;
                DrawTextW(
                    mem_dc,
                    encode_wide("إيقاف الصوت").as_ptr(),
                    -1,
                    &mut r_stop_txt,
                    DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
                );
            } else {
                fst.stop_btn_rect = RECT {
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                };
                fst.open_btn_rect = RECT {
                    left: pad,
                    top: btn_top,
                    right: width - pad,
                    bottom: btn_bottom,
                };
            }

            SelectObject(mem_dc, GetStockObject(NULL_PEN as i32));
            SelectObject(
                mem_dc,
                if fst.hover_open_btn {
                    fst.gdi.brush_btn_hover
                } else {
                    fst.gdi.brush_btn
                } as HGDIOBJ,
            );
            RoundRect(
                mem_dc,
                fst.open_btn_rect.left,
                fst.open_btn_rect.top,
                fst.open_btn_rect.right,
                fst.open_btn_rect.bottom,
                scale_px(8, dpi),
                scale_px(8, dpi),
            );
            SelectObject(mem_dc, fst.gdi.font_btn as HGDIOBJ);
            SetTextColor(mem_dc, rgb(255, 255, 255));
            let mut r_open_txt = fst.open_btn_rect;
            DrawTextW(
                mem_dc,
                encode_wide("فتح وِنس").as_ptr(),
                -1,
                &mut r_open_txt,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX,
            );

            // Restore EVERY GDI object before deleting mem_dc
            SelectObject(mem_dc, old_font);
            SelectObject(mem_dc, old_pen);
            SelectObject(mem_dc, old_brush);

            BitBlt(hdc, 0, 0, width, height, mem_dc, 0, 0, SRCCOPY);

            SelectObject(mem_dc, old_bmp);
            DeleteObject(mem_bmp as HGDIOBJ);
            DeleteDC(mem_dc);

            EndPaint(hwnd, &ps);
            0
        }
        WM_DESTROY => {
            let f_ptr = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut FlyoutState;
            if !f_ptr.is_null() {
                drop(Box::from_raw(f_ptr));
            }
            if FLYOUT_HWND.load(Ordering::SeqCst) == hwnd as isize {
                FLYOUT_HWND.store(0, Ordering::SeqCst);
            }
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

// -------------------------------------------------------------
// Cached Prayer Computation (ZERO DB Opens, DST-Safe, 0°-Safe)
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
struct FlyoutPrayerRow {
    name_ar: String,
    time_text: String,
    is_current: bool,
    is_next: bool,
}

#[cfg(target_os = "windows")]
struct PrayerDisplaySummary {
    next_name: String,
    next_time: String,
    countdown: String,
    status_label: String,
    is_wudu: bool,
    is_now: bool,
    location_label: String,
    five_prayers: Vec<FlyoutPrayerRow>,
}

#[cfg(target_os = "windows")]
fn get_or_compute_prayer_days(
    prefs: &wens_core::AppPreferences,
    now: chrono::DateTime<chrono::FixedOffset>,
) -> (Option<wens_core::PrayerDay>, Option<wens_core::PrayerDay>) {
    let today_naive = now.date_naive();
    let tomorrow_naive = today_naive
        .succ_opt()
        .unwrap_or_else(|| today_naive + chrono::Duration::days(1));

    let today_str = today_naive.format("%Y-%m-%d").to_string();
    let tomorrow_str = tomorrow_naive.format("%Y-%m-%d").to_string();

    let now_offset_mins = now.offset().local_minus_utc() / 60;
    let tz_today = crate::prayer_day_clock(today_naive, &prefs.time_zone)
        .map(|(offset, _)| offset).unwrap_or(now_offset_mins);
    let tz_tomorrow = crate::prayer_day_clock(tomorrow_naive, &prefs.time_zone)
        .map(|(offset, _)| offset).unwrap_or(now_offset_mins);

    let lat = sanitize_latitude(prefs.latitude);
    let lng = sanitize_longitude(prefs.longitude);
    let epoch = SCHEDULE_EPOCH.load(Ordering::SeqCst);

    let key = ScheduleKey {
        today: today_str.clone(),
        tomorrow: tomorrow_str.clone(),
        tz_today,
        tz_tomorrow,
        lat_bits: lat.to_bits(),
        lng_bits: lng.to_bits(),
        calc_method: prefs.calc_method.clone(),
        asr_hanafi: prefs.asr_hanafi,
        fajr_offset: prefs.fajr_offset as i32,
        maghrib_offset: prefs.maghrib_offset as i32,
        isha_offset: prefs.isha_offset as i32,
        epoch,
    };

    let mut guard = CACHED_SCHEDULE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ref cached) = *guard {
        if cached.key == key {
            return (cached.today_day.clone(), cached.tomorrow_day.clone());
        }
    }

    let method = wens_core::prayer::CalculationMethod::from_str_lossy(&prefs.calc_method);
    let jurist = if prefs.asr_hanafi {
        wens_core::prayer::AsrJurist::Hanafi
    } else {
        wens_core::prayer::AsrJurist::Standard
    };

    let today_day = wens_core::calculate_prayer_day(wens_core::PrayerRequest {
        date: today_str,
        latitude: lat,
        longitude: lng,
        timezone_offset_minutes: tz_today,
        method,
        asr_jurist: jurist,
        fajr_offset_minutes: prefs.fajr_offset as i32,
        maghrib_offset_minutes: prefs.maghrib_offset as i32,
        isha_offset_minutes: prefs.isha_offset as i32,
    })
    .ok();

    let tomorrow_day = wens_core::calculate_prayer_day(wens_core::PrayerRequest {
        date: tomorrow_str,
        latitude: lat,
        longitude: lng,
        timezone_offset_minutes: tz_tomorrow,
        method,
        asr_jurist: jurist,
        fajr_offset_minutes: prefs.fajr_offset as i32,
        maghrib_offset_minutes: prefs.maghrib_offset as i32,
        isha_offset_minutes: prefs.isha_offset as i32,
    })
    .ok();

    *guard = Some(CachedPrayerSchedule {
        key,
        today_day: today_day.clone(),
        tomorrow_day: tomorrow_day.clone(),
    });

    (today_day, tomorrow_day)
}

#[cfg(target_os = "windows")]
fn compute_prayer_summary(app: &AppHandle) -> PrayerDisplaySummary {
    let prefs = crate::storage::get_cached_preferences(app);
    let utc = chrono::Utc::now();
    let now = match prefs.time_zone.parse::<chrono_tz::Tz>() {
        Ok(zone) => utc.with_timezone(&zone).fixed_offset(),
        Err(_) => utc.with_timezone(&chrono::Local).fixed_offset(),
    };
    let current_minutes = (now.hour() * 60 + now.minute()) as i64;
    let current_seconds = now.second() as i64;

    let (today_day_opt, tomorrow_day_opt) = get_or_compute_prayer_days(&prefs, now);

    let use_arabic = prefs.taskbar_widget_digits == "arabic";
    let fmt_digits = |s: String| -> String {
        if use_arabic {
            to_arabic_digits(&s)
        } else {
            s
        }
    };

    let mut target_name = "الفجر".to_string();
    let mut target_min: i64 = 277;
    let mut is_tomorrow = false;
    let mut next_key: Option<String> = None;
    let mut current_key: Option<String> = None;
    let mut five_prayers: Vec<FlyoutPrayerRow> = Vec::with_capacity(5);

    if let Some(ref today_day) = today_day_opt {
        let obligatory: Vec<&wens_core::prayer::PrayerTime> = today_day
            .times
            .iter()
            .filter(|t| t.key != "sunrise")
            .collect();

        for p in &obligatory {
            let m = p.minutes_from_midnight.clamp(0, 1439) as i64;
            if m <= current_minutes {
                current_key = Some(p.key.clone());
            } else if next_key.is_none() {
                next_key = Some(p.key.clone());
                target_name = p.name_ar.clone();
                target_min = m;
            }
        }

        if next_key.is_none() {
            is_tomorrow = true;
            next_key = Some("fajr".to_string());
            if let Some(ref tmrw) = tomorrow_day_opt {
                if let Some(fajr) = tmrw.times.iter().find(|t| t.key == "fajr") {
                    target_name = fajr.name_ar.clone();
                    target_min = fajr.minutes_from_midnight.clamp(0, 1439) as i64;
                }
            }
        }

        for p in &obligatory {
            five_prayers.push(FlyoutPrayerRow {
                name_ar: p.name_ar.clone(),
                time_text: fmt_digits(format_prayer_time_12h(p.minutes_from_midnight)),
                is_current: current_key.as_deref() == Some(p.key.as_str()),
                is_next: !is_tomorrow && next_key.as_deref() == Some(p.key.as_str()),
            });
        }
    }

    let day_offset = if is_tomorrow { 1 } else { 0 };
    let target_date = now.date_naive() + chrono::Duration::days(day_offset);
    let diff_secs = crate::prayer_day_clock(target_date, &prefs.time_zone)
        .map(|(_, midnight)| (midnight as i64 / 1000 + target_min * 60 - now.timestamp()).max(0))
        .unwrap_or_else(|| ((day_offset * 1440 + target_min - current_minutes) * 60 - current_seconds).max(0));

    let countdown = fmt_digits(format_countdown_text(diff_secs));
    let next_time = fmt_digits(format_prayer_time_12h(target_min as i32));

    let wudu_secs = prefs.wudu_lead_minutes.clamp(5, 60) * 60;
    let is_wudu = diff_secs <= wudu_secs;
    let is_now = diff_secs <= 60;

    let status_label = if is_now {
        "الآن".to_string()
    } else if is_wudu {
        "الوضوء".to_string()
    } else {
        "بعد".to_string()
    };

    PrayerDisplaySummary {
        next_name: target_name,
        next_time,
        countdown,
        status_label,
        is_wudu,
        is_now,
        location_label: if prefs.location_label.trim().is_empty() {
            "القاهرة، مصر".to_string()
        } else {
            prefs.location_label
        },
        five_prayers,
    }
}

#[cfg(target_os = "windows")]
fn encode_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn countdown_formats_3600_seconds_as_one_hour_not_zero() {
        assert_eq!(format_countdown_text(3600), "01:00");
        assert_eq!(format_countdown_text(3660), "01:01");
        assert_eq!(format_countdown_text(3599), "59:59");
        assert_eq!(format_countdown_text(60), "01:00");
        assert_eq!(format_countdown_text(0), "00:00");
        assert_eq!(format_countdown_text(-5), "00:00");
    }

    #[test]
    fn vertical_taskbar_clamp_never_panics() {
        // Vertical 62px-wide taskbar where tray_right - widget_w < tray_left
        assert_eq!(clamp_horizontal_x(500, 0, 62, 184), 0);
        assert_eq!(clamp_horizontal_x(-50, 1920, 1982, 184), 1920);
        // Normal horizontal taskbar
        assert_eq!(clamp_horizontal_x(500, 0, 1920, 184), 500);
        assert_eq!(clamp_horizontal_x(9999, 0, 1920, 184), 1736);
    }

    #[test]
    fn zero_degree_coordinates_are_preserved_and_non_finite_rejected() {
        assert_eq!(sanitize_latitude(0.0), 0.0);
        assert_eq!(sanitize_longitude(0.0), 0.0);
        assert_eq!(sanitize_latitude(f64::NAN), 30.0444);
        assert_eq!(sanitize_longitude(f64::INFINITY), 31.2357);
        assert_eq!(sanitize_latitude(95.0), 30.0444);
        assert_eq!(sanitize_longitude(-185.0), 31.2357);
    }

    #[test]
    fn test_taskbar_widget_window_creation() {
        #[cfg(target_os = "windows")]
        unsafe {
            let class_name = encode_wide("WensTaskbarStripClassTest");
            let h_instance = GetModuleHandleW(std::ptr::null());

            let wnd_class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(widget_window_proc),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: h_instance,
                hIcon: std::ptr::null_mut(),
                hCursor: LoadCursorW(std::ptr::null_mut(), IDC_HAND),
                hbrBackground: std::ptr::null_mut(),
                lpszMenuName: std::ptr::null(),
                lpszClassName: class_name.as_ptr(),
                hIconSm: std::ptr::null_mut(),
            };

            RegisterClassExW(&wnd_class);

            let (x, y, w, h) = calculate_widget_rect(None, 96);

            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
                class_name.as_ptr(),
                encode_wide("وِنس - شريط المهام").as_ptr(),
                WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS,
                x,
                y,
                w,
                h,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                h_instance,
                std::ptr::null_mut(),
            );

            assert!(!hwnd.is_null(), "CreateWindow failed");
            DestroyWindow(hwnd);
        }
    }
}
