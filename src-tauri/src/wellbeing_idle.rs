use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static ACTIVE_SECONDS_TODAY: AtomicU64 = AtomicU64::new(0);
static CONTINUOUS_ACTIVE_SECONDS: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize)]
pub struct WelcomeBackEvent {
    pub idle_minutes: u64,
    pub active_minutes_today: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EyeCareEvent {
    pub continuous_minutes: u64,
    pub title_ar: String,
    pub message_ar: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WaterReminderEvent {
    pub cups_drunk: u32,
    pub cups_target: u32,
    pub title_ar: String,
    pub message_ar: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WaterUpdatedEvent {
    pub count: u32,
    pub target: u32,
    pub date: String,
}

#[cfg(target_os = "windows")]
pub fn get_system_idle_seconds() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii) != 0 {
            // Safe 32-bit wrapping subtraction — immune to the 49.7-day GetTickCount rollover!
            let now_tick: u32 = GetTickCount();
            let elapsed_ms: u32 = now_tick.wrapping_sub(lii.dwTime);
            (elapsed_ms / 1000) as u64
        } else {
            0
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_system_idle_seconds() -> u64 {
    0
}

pub fn get_water_key_for_today() -> String {
    let now = chrono::Local::now();
    format!("water_today_{}", now.format("%Y-%m-%d"))
}

fn parse_water_count(raw: &str) -> u32 {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(count) = val.get("count").and_then(|c| c.as_u64()) {
            return count.min(u32::MAX as u64) as u32;
        }
    }
    0
}

pub fn get_water_cups_today(app: &AppHandle) -> u32 {
    let key = get_water_key_for_today();
    crate::storage::with_database(app, |db| {
        let raw = db.kv_get(&key).map_err(|e| e.to_string())?;
        Ok(raw.as_deref().map(parse_water_count).unwrap_or(0))
    })
    .unwrap_or(0)
}

pub fn increment_water_cups_today(app: &AppHandle) -> u32 {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let key = format!("water_today_{today}");
    let target = crate::storage::get_cached_preferences(app)
        .water_daily_goal
        .clamp(1, 20) as u32;

    let current = crate::storage::with_database(app, |db| {
        let existing = db
            .kv_get(&key)
            .map_err(|e| e.to_string())?
            .as_deref()
            .map(parse_water_count)
            .unwrap_or(0);
        let next = existing.saturating_add(1);
        let payload = serde_json::json!({
            "count": next,
            "updated_at": chrono::Utc::now().to_rfc3339()
        });
        db.kv_set(&key, &payload.to_string())
            .map_err(|e| e.to_string())?;
        Ok(next)
    })
    .unwrap_or(1);

    // Broadcast water update so Main App, Dynamic Island, and Pet stay synced
    let _ = app.emit(
        "wens-water-updated",
        &WaterUpdatedEvent {
            count: current,
            target,
            date: today,
        },
    );

    current
}

fn sleep_interruptible(seconds: u64, stop_flag: &AtomicBool) {
    for _ in 0..seconds {
        if stop_flag.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_secs(1));
    }
}

pub fn start_wellbeing_monitor(app: AppHandle, stop_flag: Arc<AtomicBool>) {
    thread::Builder::new()
        .name("wens-wellbeing-idle".to_string())
        .spawn(move || {
            let mut was_idle = false;
            let mut max_idle_secs = 0u64;
            let mut last_water_notify_active_sec = 0u64;
            let mut last_eyecare_notify_active_sec = 0u64;
            let mut current_day = chrono::Local::now().format("%Y-%m-%d").to_string();

            while !stop_flag.load(Ordering::Relaxed) {
                sleep_interruptible(5, &stop_flag);
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }

                // Reset counters at midnight
                let today = chrono::Local::now().format("%Y-%m-%d").to_string();
                if today != current_day {
                    ACTIVE_SECONDS_TODAY.store(0, Ordering::Relaxed);
                    CONTINUOUS_ACTIVE_SECONDS.store(0, Ordering::Relaxed);
                    last_water_notify_active_sec = 0;
                    last_eyecare_notify_active_sec = 0;
                    current_day = today;
                }

                // O(1) RAM preference read — ZERO SQLite opens on tick!
                let prefs = crate::storage::get_cached_preferences(&app);
                let any_wellbeing_enabled = prefs.water_reminder_enabled
                    || prefs.eye_break_enabled
                    || prefs.welcome_back_enabled;

                if !any_wellbeing_enabled
                    || !crate::OVERLAY_ENABLED.load(Ordering::Relaxed)
                    || crate::island_blocked()
                {
                    continue;
                }

                let idle_secs = get_system_idle_seconds();

                if idle_secs >= 60 {
                    // User is taking a real break (>= 60s): reset continuous eye strain AND last notify baseline!
                    CONTINUOUS_ACTIVE_SECONDS.store(0, Ordering::Relaxed);
                    last_eyecare_notify_active_sec = 0;

                    if idle_secs >= 120 {
                        was_idle = true;
                        // Continuously update peak idle duration so >= 900s (15 min AFK) actually triggers Welcome-Back!
                        max_idle_secs = max_idle_secs.max(idle_secs);
                    }
                    continue;
                }

                // User is active (< 60s idle)
                if was_idle {
                    if prefs.welcome_back_enabled && max_idle_secs >= 900 {
                        let idle_minutes = max_idle_secs / 60;
                        let active_minutes = ACTIVE_SECONDS_TODAY.load(Ordering::Relaxed) / 60;
                        let _ = app.emit(
                            "wens-wellbeing-welcomeback",
                            &WelcomeBackEvent {
                                idle_minutes,
                                active_minutes_today: active_minutes,
                            },
                        );
                    }
                    was_idle = false;
                    max_idle_secs = 0;
                }

                let active = ACTIVE_SECONDS_TODAY.fetch_add(5, Ordering::Relaxed) + 5;
                let continuous = CONTINUOUS_ACTIVE_SECONDS.fetch_add(5, Ordering::Relaxed) + 5;

                // Eye care 20-20-20 check
                if prefs.eye_break_enabled {
                    let eye_interval_sec = 20u64 * 60;
                    if continuous >= eye_interval_sec
                        && continuous.saturating_sub(last_eyecare_notify_active_sec)
                            >= eye_interval_sec
                    {
                        last_eyecare_notify_active_sec = continuous;
                        let _ = app.emit(
                            "wens-wellbeing-eyecare",
                            &EyeCareEvent {
                                continuous_minutes: continuous / 60,
                                title_ar: "راحة لعينيك — قاعدة 20-20-20".into(),
                                message_ar:
                                    "انظر إلى نقطة تبعد ٦ أمتار لمدة ٢٠ ثانية لإراحة عضلات عينيك."
                                        .into(),
                            },
                        );
                    }
                }

                // Water reminder check
                if prefs.water_reminder_enabled {
                    let water_interval_m = prefs.water_every_minutes.clamp(10, 180) as u64;
                    let water_target = prefs.water_daily_goal.clamp(1, 20) as u32;
                    let water_interval_sec = water_interval_m * 60;
                    if active >= water_interval_sec
                        && active.saturating_sub(last_water_notify_active_sec) >= water_interval_sec
                    {
                        last_water_notify_active_sec = active;
                        let drunk = get_water_cups_today(&app);
                        let _ = app.emit(
                            "wens-wellbeing-water",
                            &WaterReminderEvent {
                                cups_drunk: drunk,
                                cups_target: water_target,
                                title_ar: "تذكير شرب الماء 💧".into(),
                                message_ar: format!(
                                    "حان وقت شرب كوب ماء! شربت اليوم {} من أصل {} أكواب.",
                                    drunk, water_target
                                ),
                            },
                        );
                    }
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    #[test]
    fn tick_wraparound_arithmetic_survives_49_day_rollover() {
        let last_input: u32 = u32::MAX - 4_000;
        let now_tick: u32 = 6_000;
        let elapsed_ms = now_tick.wrapping_sub(last_input);
        assert_eq!(elapsed_ms / 1000, 10);
    }
}
