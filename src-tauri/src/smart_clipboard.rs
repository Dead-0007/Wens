use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_CLIPBOARD_U16_UNITS: usize = 32_768; // 64 KB cap — prevents OOB read UB and 500MB OOM
const MAX_MATH_DEPTH: usize = 64;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub content: String,
    pub preview: String,
    pub kind: String, // "text", "math", "color", "url", "image"
    pub extra: Option<String>,
    pub timestamp: i64,
}

static CLIPBOARD_HISTORY: Mutex<Option<VecDeque<ClipboardItem>>> = Mutex::new(None);

pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    let mut lock = CLIPBOARD_HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    let history = lock.get_or_insert_with(|| VecDeque::with_capacity(10));
    history.iter().cloned().collect()
}

pub fn clear_clipboard_history() {
    let mut lock = CLIPBOARD_HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(history) = lock.as_mut() {
        history.clear();
    }
}

pub fn add_clipboard_item(item: ClipboardItem) {
    let mut lock = CLIPBOARD_HISTORY.lock().unwrap_or_else(|e| e.into_inner());
    let history = lock.get_or_insert_with(|| VecDeque::with_capacity(10));
    // Deduplicate if identical to top item
    if let Some(top) = history.front() {
        if top.content == item.content && top.kind == item.kind {
            return;
        }
    }
    if history.len() >= 10 {
        history.pop_back();
    }
    history.push_front(item);
}

// -------------------------------------------------------------
// Safe Math Expression Parser (Recursive Descent: + - * / % ^)
// -------------------------------------------------------------

struct MathParser<'a> {
    chars: std::iter::Peekable<std::str::Chars<'a>>,
    depth: usize,
}

impl<'a> MathParser<'a> {
    fn new(expr: &'a str) -> Self {
        Self {
            chars: expr.chars().peekable(),
            depth: 0,
        }
    }

    fn skip_whitespace(&mut self) {
        while let Some(&ch) = self.chars.peek() {
            if ch.is_whitespace() {
                self.chars.next();
            } else {
                break;
            }
        }
    }

    fn parse_expression(&mut self) -> Result<f64, ()> {
        let mut result = self.parse_term()?;
        loop {
            self.skip_whitespace();
            match self.chars.peek() {
                Some('+') => {
                    self.chars.next();
                    result += self.parse_term()?;
                }
                Some('-') => {
                    self.chars.next();
                    result -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Ok(result)
    }

    fn parse_term(&mut self) -> Result<f64, ()> {
        let mut result = self.parse_power()?;
        loop {
            self.skip_whitespace();
            match self.chars.peek() {
                Some('*') | Some('×') => {
                    self.chars.next();
                    result *= self.parse_power()?;
                }
                Some('/') | Some('÷') => {
                    self.chars.next();
                    let denom = self.parse_power()?;
                    if denom.abs() < 1e-12 {
                        return Err(());
                    }
                    result /= denom;
                }
                Some('%') => {
                    self.chars.next();
                    let denom = self.parse_power()?;
                    if denom.abs() < 1e-12 {
                        return Err(());
                    }
                    result %= denom;
                }
                _ => break,
            }
        }
        Ok(result)
    }

    fn parse_power(&mut self) -> Result<f64, ()> {
        let base = self.parse_factor()?;
        self.skip_whitespace();
        if let Some('^') = self.chars.peek() {
            self.chars.next();
            let exponent = self.parse_factor()?;
            let res = base.powf(exponent);
            if res.is_finite() {
                Ok(res)
            } else {
                Err(())
            }
        } else {
            Ok(base)
        }
    }

    fn parse_factor(&mut self) -> Result<f64, ()> {
        if self.depth >= MAX_MATH_DEPTH {
            return Err(());
        }
        self.depth += 1;
        self.skip_whitespace();
        let res = match self.chars.peek() {
            Some('+') => {
                self.chars.next();
                self.parse_factor()
            }
            Some('-') => {
                self.chars.next();
                Ok(-self.parse_factor()?)
            }
            Some('(') => {
                self.chars.next();
                let inner = self.parse_expression()?;
                self.skip_whitespace();
                if self.chars.next() == Some(')') {
                    Ok(inner)
                } else {
                    Err(())
                }
            }
            Some(ch) if ch.is_ascii_digit() || *ch == '.' => {
                let mut num_str = String::new();
                while let Some(&d) = self.chars.peek() {
                    if d.is_ascii_digit() || d == '.' {
                        num_str.push(d);
                        self.chars.next();
                    } else {
                        break;
                    }
                }
                num_str.parse::<f64>().map_err(|_| ())
            }
            _ => Err(()),
        };
        self.depth -= 1;
        res
    }
}

pub fn try_evaluate_math(expr: &str) -> Option<f64> {
    let trimmed = expr.trim();
    if !trimmed.chars().any(|c| "+-*/×÷%^".contains(c)) {
        return None;
    }
    if trimmed.len() > 100 {
        return None;
    }
    let mut parser = MathParser::new(trimmed);
    if let Ok(res) = parser.parse_expression() {
        parser.skip_whitespace();
        if parser.chars.next().is_none() && res.is_finite() {
            return Some(res);
        }
    }
    None
}

fn format_math_result(math_res: f64) -> String {
    // 2^53 = 9_007_199_254_740_992.0: exact integer range in f64 without i64 saturation
    const MAX_EXACT_F64_INT: f64 = 9_007_199_254_740_992.0;
    if math_res.fract().abs() < 1e-9 && math_res.abs() <= MAX_EXACT_F64_INT {
        format!("{}", math_res.round() as i64)
    } else if math_res.abs() >= 1e15 || (math_res != 0.0 && math_res.abs() < 1e-4) {
        format!("{:.4e}", math_res)
    } else {
        let s = format!("{:.4}", math_res);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

// -------------------------------------------------------------
// Color Code Classifier (#hex, rgb, rgba, hsl)
// -------------------------------------------------------------

pub fn try_detect_color(text: &str) -> Option<String> {
    let s = text.trim();
    if s.starts_with('#') && (s.len() == 4 || s.len() == 7 || s.len() == 9) {
        if s[1..].chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(s.to_uppercase());
        }
    }
    if (s.starts_with("rgb(") || s.starts_with("rgba(") || s.starts_with("hsl("))
        && s.ends_with(')')
        && s.len() <= 64
    {
        return Some(s.to_string());
    }
    None
}

// -------------------------------------------------------------
// URL Classifier
// -------------------------------------------------------------

pub fn try_detect_url(text: &str) -> Option<String> {
    let s = text.trim();
    if (s.starts_with("https://") || s.starts_with("http://")) && !s.contains(char::is_whitespace) {
        return Some(s.to_string());
    }
    None
}

// -------------------------------------------------------------
// Win32 Clipboard Monitoring, Privacy Flags & Bounded Reads
// -------------------------------------------------------------

#[cfg(target_os = "windows")]
unsafe fn is_excluded_while_clipboard_open() -> bool {
    use windows_sys::Win32::System::DataExchange::{
        GetClipboardData, IsClipboardFormatAvailable, RegisterClipboardFormatW,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    // 1. Presence-only exclusion formats (password managers / sensitive sources)
    let presence_exclude_formats = [
        "ExcludeClipboardContentFromMonitorProcessing",
        "Clipboard Viewer Ignore",
    ];
    for name in &presence_exclude_formats {
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let format_id = RegisterClipboardFormatW(wide.as_ptr());
        if format_id != 0 && IsClipboardFormatAvailable(format_id) != 0 {
            return true;
        }
    }

    // 2. DWORD-valued flag: "CanIncludeInClipboardHistory"
    //    Per Microsoft spec: DWORD == 0 means EXCLUDE, DWORD != 0 means ALLOW!
    let history_flag_name: Vec<u16> = "CanIncludeInClipboardHistory"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let history_fmt = RegisterClipboardFormatW(history_flag_name.as_ptr());
    if history_fmt != 0 && IsClipboardFormatAvailable(history_fmt) != 0 {
        let handle = GetClipboardData(history_fmt);
        if handle.is_null() {
            // Fail closed if the format exists but cannot be read
            return true;
        }
        let byte_size = GlobalSize(handle);
        if byte_size < std::mem::size_of::<u32>() {
            return true;
        }
        let ptr = GlobalLock(handle) as *const u32;
        if ptr.is_null() {
            return true;
        }
        let allow_flag = *ptr;
        GlobalUnlock(handle);
        if allow_flag == 0 {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn read_clipboard_text_if_allowed() -> Option<String> {
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, OpenClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    const CF_UNICODETEXT: u32 = 13;

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }

        // Atomically evaluate privacy flags while clipboard is open so content cannot race between check & read.
        if is_excluded_while_clipboard_open() {
            CloseClipboard();
            return None;
        }

        let handle: HANDLE = GetClipboardData(CF_UNICODETEXT);
        if handle.is_null() {
            CloseClipboard();
            return None;
        }

        // Check GlobalSize BEFORE locking/reading so there is ZERO out-of-bounds read UB and ZERO 500MB OOM!
        let byte_size = GlobalSize(handle);
        if byte_size < std::mem::size_of::<u16>() {
            CloseClipboard();
            return None;
        }
        let max_u16 = (byte_size / std::mem::size_of::<u16>()).min(MAX_CLIPBOARD_U16_UNITS);
        if max_u16 == 0 {
            CloseClipboard();
            return None;
        }

        let ptr = GlobalLock(handle) as *const u16;
        if ptr.is_null() {
            CloseClipboard();
            return None;
        }

        let bounded_slice = std::slice::from_raw_parts(ptr, max_u16);
        let nul_pos = bounded_slice
            .iter()
            .position(|&c| c == 0)
            .unwrap_or(bounded_slice.len());
        let text = String::from_utf16_lossy(&bounded_slice[..nul_pos]);

        GlobalUnlock(handle);
        CloseClipboard();

        Some(text)
    }
}

#[cfg(not(target_os = "windows"))]
fn read_clipboard_text_if_allowed() -> Option<String> {
    None
}

#[cfg(target_os = "windows")]
pub fn set_clipboard_text(text: &str) -> Result<(), String> {
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE, HWND};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, HWND_MESSAGE,
    };

    const CF_UNICODETEXT: u32 = 13;

    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes_len = wide.len() * std::mem::size_of::<u16>();
    let static_class: Vec<u16> = "STATIC".encode_utf16().chain(std::iter::once(0)).collect();

    unsafe {
        // Use a dedicated message-only HWND as clipboard owner so EmptyClipboard + SetClipboardData succeed reliably.
        let owner_hwnd: HWND = CreateWindowExW(
            0,
            static_class.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
        );

        let mut opened = false;
        for _ in 0..3 {
            if OpenClipboard(owner_hwnd) != 0 {
                opened = true;
                break;
            }
            thread::sleep(Duration::from_millis(15));
        }

        if !opened {
            if !owner_hwnd.is_null() {
                DestroyWindow(owner_hwnd);
            }
            return Err("Cannot open clipboard".into());
        }

        if EmptyClipboard() == 0 {
            CloseClipboard();
            if !owner_hwnd.is_null() {
                DestroyWindow(owner_hwnd);
            }
            return Err("EmptyClipboard failed".into());
        }

        let h_global: HANDLE = GlobalAlloc(GMEM_MOVEABLE, bytes_len);
        if h_global.is_null() {
            CloseClipboard();
            if !owner_hwnd.is_null() {
                DestroyWindow(owner_hwnd);
            }
            return Err("GlobalAlloc failed".into());
        }

        let ptr = GlobalLock(h_global) as *mut u16;
        if ptr.is_null() {
            // We still own h_global on lock failure -> free it!
            GlobalFree(h_global);
            CloseClipboard();
            if !owner_hwnd.is_null() {
                DestroyWindow(owner_hwnd);
            }
            return Err("GlobalLock failed".into());
        }

        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        GlobalUnlock(h_global);

        let set_res = SetClipboardData(CF_UNICODETEXT, h_global);
        if set_res.is_null() {
            // SetClipboardData failed: caller still owns h_global -> MUST free it!
            GlobalFree(h_global);
            CloseClipboard();
            if !owner_hwnd.is_null() {
                DestroyWindow(owner_hwnd);
            }
            return Err("SetClipboardData failed".into());
        }

        // On success, Windows owns h_global — DO NOT call GlobalFree!
        CloseClipboard();
        if !owner_hwnd.is_null() {
            DestroyWindow(owner_hwnd);
        }

        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub fn set_clipboard_text(_text: &str) -> Result<(), String> {
    Err("Not supported on this OS".into())
}

pub fn start_clipboard_monitor(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::Builder::new()
        .name("wens-smart-clipboard".to_string())
        .spawn(move || {
            #[cfg(target_os = "windows")]
            use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;

            #[cfg(target_os = "windows")]
            let mut last_seq = unsafe { GetClipboardSequenceNumber() };
            #[cfg(not(target_os = "windows"))]
            let mut last_seq = 0u32;

            while !stop_flag.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(500));
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                let prefs = crate::storage::get_cached_preferences(&app);
                if !prefs.clipboard_history_enabled
                    || !crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    || crate::island_blocked()
                {
                    // Advance sequence number without opening clipboard so secrets copied while disabled aren't captured later.
                    #[cfg(target_os = "windows")]
                    {
                        let seq = unsafe { GetClipboardSequenceNumber() };
                        if seq != 0 {
                            last_seq = seq;
                        }
                    }
                    if !prefs.clipboard_history_enabled {
                        thread::sleep(Duration::from_millis(1000));
                    }
                    continue;
                }

                #[cfg(target_os = "windows")]
                let current_seq = unsafe { GetClipboardSequenceNumber() };
                #[cfg(not(target_os = "windows"))]
                let current_seq = 0u32;

                if current_seq != 0 && current_seq != last_seq {
                    last_seq = current_seq;

                    if let Some(text) = read_clipboard_text_if_allowed() {
                        let trimmed = text.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        let (kind, extra) = if prefs.smart_clipboard_enabled {
                            if let Some(math_res) = try_evaluate_math(trimmed) {
                                ("math".to_string(), Some(format_math_result(math_res)))
                            } else if let Some(col) = try_detect_color(trimmed) {
                                ("color".to_string(), Some(col))
                            } else if let Some(url) = try_detect_url(trimmed) {
                                ("url".to_string(), Some(url))
                            } else {
                                ("text".to_string(), None)
                            }
                        } else {
                            ("text".to_string(), None)
                        };

                        let preview = if trimmed.chars().count() > 60 {
                            let truncated: String = trimmed.chars().take(57).collect();
                            format!("{}...", truncated)
                        } else {
                            trimmed.to_string()
                        };

                        let now_ms = chrono::Utc::now().timestamp_millis();
                        let item = ClipboardItem {
                            id: format!("clip_{}", now_ms),
                            content: text,
                            preview,
                            kind,
                            extra,
                            timestamp: now_ms,
                        };

                        let update = serde_json::json!({ "kind": item.kind, "extra": item.extra });
                        add_clipboard_item(item);
                        let _ = app.emit_to("overlay", "wens-clipboard-update", update);
                    }
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn math_formatting_avoids_i64_saturation() {
        assert_eq!(format_math_result(42.0), "42");
        assert_eq!(format_math_result(3.5), "3.5");
        let huge = format_math_result(1e30);
        assert!(huge.contains('e'), "expected scientific notation, got {huge}");
    }

    #[test]
    fn math_parser_bounds_deep_recursion() {
        let deep = format!("{}{}{}", "(".repeat(100), "1+1", ")".repeat(100));
        assert!(try_evaluate_math(&deep).is_none());
        assert_eq!(try_evaluate_math("(2 + 3) * 4"), Some(20.0));
    }
}
