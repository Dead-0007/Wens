use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub progress: i64,
    pub symbol: String,
    pub current_task: Option<String>,
    #[serde(default)]
    pub goal: Option<String>,
    #[serde(default)]
    pub is_current: bool,
    pub device_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProject {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub progress: Option<i64>,
    pub symbol: Option<String>,
    pub current_task: Option<Option<String>>,
    pub goal: Option<Option<String>>,
    pub is_current: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Idea {
    pub id: String,
    pub title: String,
    pub tag: String,
    pub body: String,
    pub device_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub revision: i64,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateIdea {
    pub id: String,
    pub title: Option<String>,
    pub tag: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkSessionRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub project_title: Option<String>,
    pub duration_secs: i64,
    pub started_at: String,
    pub ended_at: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DailyWorshipRecord {
    pub date: String,
    #[serde(default)]
    pub fajr: bool,
    #[serde(default)]
    pub sunrise: bool,
    #[serde(default)]
    pub dhuhr: bool,
    #[serde(default)]
    pub asr: bool,
    #[serde(default)]
    pub maghrib: bool,
    #[serde(default)]
    pub isha: bool,
    #[serde(default)]
    pub fasting: bool,
    pub note: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeId {
    MidnightMagenta,
    DawnSand,
    NileTeal,
    StudioVoltage,
    CopperGarden,
}

impl Default for ThemeId {
    fn default() -> Self {
        ThemeId::MidnightMagenta
    }
}

impl ThemeId {
    pub fn as_str(&self) -> &'static str {
        match self {
            ThemeId::MidnightMagenta => "midnight-magenta",
            ThemeId::DawnSand => "dawn-sand",
            ThemeId::NileTeal => "nile-teal",
            ThemeId::StudioVoltage => "studio-voltage",
            ThemeId::CopperGarden => "copper-garden",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "midnight-magenta" | "midnight_magenta" | "midnight" | "magenta" | "default" => {
                Some(ThemeId::MidnightMagenta)
            }
            "dawn-sand" | "dawn_sand" | "dawn" | "sand" | "light" => Some(ThemeId::DawnSand),
            "nile-teal" | "nile_teal" | "nile" | "teal" => Some(ThemeId::NileTeal),
            "studio-voltage" | "studio_voltage" | "studio" | "voltage" => {
                Some(ThemeId::StudioVoltage)
            }
            "copper-garden" | "copper_garden" | "copper" | "garden" => {
                Some(ThemeId::CopperGarden)
            }
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AccentId {
    Rose,
    Amber,
    Aqua,
    Violet,
    Lime,
}

impl Default for AccentId {
    fn default() -> Self {
        AccentId::Amber
    }
}

impl AccentId {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccentId::Rose => "rose",
            AccentId::Amber => "amber",
            AccentId::Aqua => "aqua",
            AccentId::Violet => "violet",
            AccentId::Lime => "lime",
        }
    }

    pub fn from_str_loose(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "rose" | "pink" | "red" => Some(AccentId::Rose),
            "amber" | "gold" | "orange" | "yellow" | "default" => Some(AccentId::Amber),
            "aqua" | "cyan" | "teal" | "blue" => Some(AccentId::Aqua),
            "violet" | "purple" => Some(AccentId::Violet),
            "lime" | "green" => Some(AccentId::Lime),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PrayerSoundMode {
    Silent,
    GentleChime,
    Adhan,
}

impl Default for PrayerSoundMode {
    fn default() -> Self {
        PrayerSoundMode::Silent
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WorkSoundMode {
    Silent,
    GentleChime,
    WorkChime,
}

impl Default for WorkSoundMode {
    fn default() -> Self {
        WorkSoundMode::Silent
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum FastingSoundMode {
    Silent,
    GentleChime,
    Adhan,
    StrongAlarm,
}

impl Default for FastingSoundMode {
    fn default() -> Self {
        FastingSoundMode::GentleChime
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BackgroundAudioMode {
    #[serde(rename = "foreground-only")]
    ForegroundOnly,
    #[serde(rename = "always")]
    Always,
}

impl Default for BackgroundAudioMode {
    fn default() -> Self {
        BackgroundAudioMode::Always
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuietHours {
    pub start: String,
    pub end: String,
}

impl QuietHours {
    pub fn validate(&self) -> Result<(), String> {
        validate_hh_mm(&self.start)?;
        validate_hh_mm(&self.end)?;
        Ok(())
    }

    pub fn contains(&self, hour: u32, minute: u32) -> bool {
        let now_mins = hour * 60 + minute;
        let (sh, sm) = parse_hh_mm(&self.start).unwrap_or((22, 0));
        let (eh, em) = parse_hh_mm(&self.end).unwrap_or((6, 0));
        let s_mins = sh * 60 + sm;
        let e_mins = eh * 60 + em;

        if s_mins <= e_mins {
            now_mins >= s_mins && now_mins < e_mins
        } else {
            now_mins >= s_mins || now_mins < e_mins
        }
    }
}

fn validate_hh_mm(s: &str) -> Result<(), String> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return Err(format!("invalid time '{}', expected HH:MM", s));
    }
    let h: u32 = parts[0]
        .trim()
        .parse()
        .map_err(|_| format!("invalid hour in '{}'", s))?;
    let m: u32 = parts[1]
        .trim()
        .parse()
        .map_err(|_| format!("invalid minute in '{}'", s))?;
    if h > 23 || m > 59 {
        return Err(format!("time '{}' is out of bounds", s));
    }
    Ok(())
}

fn parse_hh_mm(s: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h = parts[0].trim().parse().ok()?;
    let m = parts[1].trim().parse().ok()?;
    Some((h, m))
}

fn default_volume() -> u8 {
    85
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPreferences {
    #[serde(default = "default_true")]
    pub pre_prayer_enabled: bool,
    #[serde(default = "default_true")]
    pub prayer_at_time_enabled: bool,
    #[serde(default)]
    pub fasting_enabled: bool,
    #[serde(default = "default_true")]
    pub focus_completion_enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quiet_hours: Option<QuietHours>,
}

impl Default for NotificationPreferences {
    fn default() -> Self {
        Self {
            pre_prayer_enabled: true,
            prayer_at_time_enabled: true,
            fasting_enabled: false,
            focus_completion_enabled: true,
            quiet_hours: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreferences {
    #[serde(default)]
    pub prayer: PrayerSoundMode,
    #[serde(default)]
    pub fasting: FastingSoundMode,
    #[serde(default)]
    pub work: WorkSoundMode,
    #[serde(default = "default_volume")]
    pub volume: u8,
    #[serde(default)]
    pub background_playback: BackgroundAudioMode,
}

impl Default for AudioPreferences {
    fn default() -> Self {
        Self {
            prayer: PrayerSoundMode::Silent,
            fasting: FastingSoundMode::GentleChime,
            work: WorkSoundMode::Silent,
            volume: default_volume(),
            background_playback: BackgroundAudioMode::Always,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppPreferences {
    #[serde(default)]
    pub theme_id: ThemeId,
    #[serde(default)]
    pub accent_id: AccentId,
    #[serde(default)]
    pub notifications: NotificationPreferences,
    #[serde(default)]
    pub audio: AudioPreferences,
    #[serde(default = "default_latitude")]
    pub latitude: f64,
    #[serde(default = "default_longitude")]
    pub longitude: f64,
    #[serde(default = "default_wudu_lead")]
    pub wudu_lead_minutes: i64,
    #[serde(default = "default_pre_prayer_leads")]
    pub pre_prayer_leads: Vec<i64>,
    #[serde(default = "default_calc_method")]
    pub calc_method: String,
    #[serde(default = "default_true")]
    pub pet_visible: bool,
    #[serde(default = "default_true")]
    pub overlay_widget: bool,
    #[serde(default = "default_location_label")]
    pub location_label: String,
    #[serde(default = "default_country_code")]
    pub country_code: String,
    #[serde(default = "default_time_zone")]
    pub time_zone: String,
    #[serde(default)]
    pub fajr_offset: i64,
    #[serde(default)]
    pub maghrib_offset: i64,
    #[serde(default)]
    pub isha_offset: i64,
    #[serde(default)]
    pub hijri_date_offset: i64,
    #[serde(default = "default_true")]
    pub bubbles: bool,
    #[serde(default)]
    pub lively_popups: bool,
    #[serde(default)]
    pub quiet_default: bool,
    #[serde(default)]
    pub strict_offline: bool,
    #[serde(default = "default_avatar")]
    pub pet_avatar: String,
    #[serde(default = "default_pet_size")]
    pub pet_size: String,
    #[serde(default = "default_false")]
    pub pet_roaming: bool,
    #[serde(default = "default_false")]
    pub pet_interaction_sounds: bool,
    #[serde(default = "default_true")]
    pub pet_idle_fade: bool,
    #[serde(default = "default_pet_idle_opacity")]
    pub pet_idle_opacity: f64,
    #[serde(default = "default_pet_idle_delay")]
    pub pet_idle_delay_seconds: i64,
    #[serde(default = "default_pet_popup_size")]
    pub pet_popup_size: String,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default)]
    pub reduced_motion: bool,
    #[serde(default = "default_suhoor_lead")]
    pub suhoor_lead_minutes: i64,
    #[serde(default = "default_imsak_water_lead")]
    pub imsak_water_lead_minutes: i64,
    #[serde(default = "default_true")]
    pub suhoor_wake_challenge: bool,
    #[serde(default = "default_suhoor_wake_check")]
    pub suhoor_wake_check_minutes: i64,
    #[serde(default)]
    pub prevent_sleep_for_suhoor: bool,
    #[serde(default = "default_true")]
    pub taskbar_widget_enabled: bool,
    #[serde(default = "default_taskbar_position")]
    pub taskbar_widget_position: String,
    #[serde(default = "default_taskbar_digits")]
    pub taskbar_widget_digits: String,
    #[serde(default = "default_true")]
    pub taskbar_show_focus_timer: bool,
    #[serde(default = "default_false")]
    pub asr_hanafi: bool,
    #[serde(default = "default_island_orientation")]
    pub island_orientation: String,
    #[serde(default = "default_island_side")]
    pub island_side: String,
    #[serde(default = "default_true")]
    pub island_hide_fullscreen: bool,
    #[serde(default = "default_island_theme")]
    pub island_theme: String,
    #[serde(default = "default_overlay_size")]
    pub overlay_size: String,
    #[serde(default = "default_true")]
    pub dhikr_cards_enabled: bool,
    #[serde(default = "default_dhikr_every")]
    pub dhikr_every_minutes: i64,
    #[serde(default = "default_dhikr_interval")]
    pub dhikr_cards_interval_minutes: i64,
    #[serde(default = "default_dhikr_duration")]
    pub dhikr_duration_seconds: i64,
    #[serde(default = "default_true")]
    pub dhikr_include_ayah: bool,
    #[serde(default = "default_true")]
    pub dhikr_include_dhikr: bool,
    #[serde(default = "default_true")]
    pub dhikr_include_dua: bool,
    #[serde(default = "default_true")]
    pub radio_pause_at_prayer: bool,
    #[serde(default = "default_true")]
    pub quran_radio_enabled: bool,
    #[serde(default = "default_radio_station")]
    pub quran_radio_default_station: String,
    #[serde(default = "default_true")]
    pub media_pill_enabled: bool,
    #[serde(default = "default_true")]
    pub media_pause_at_prayer: bool,
    #[serde(default = "default_true")]
    pub water_reminder_enabled: bool,
    #[serde(default = "default_water_every")]
    pub water_every_minutes: i64,
    #[serde(default = "default_water_goal")]
    pub water_daily_goal: i64,
    #[serde(default = "default_true")]
    pub eye_break_enabled: bool,
    #[serde(default = "default_true")]
    pub welcome_back_enabled: bool,
    #[serde(default = "default_true")]
    pub morning_brief_enabled: bool,
    #[serde(default = "default_true")]
    pub smart_clipboard_enabled: bool,
    #[serde(default = "default_true")]
    pub clipboard_history_enabled: bool,
    #[serde(default = "default_true")]
    pub shelf_enabled: bool,
    #[serde(default = "default_true")]
    pub screenshot_auto_shelf: bool,
    #[serde(default = "default_screenshot_shelf_minutes")]
    pub screenshot_shelf_minutes: i64,
    #[serde(default = "default_true")]
    pub downloads_watcher_enabled: bool,
    #[serde(default = "default_true")]
    pub privacy_dots_enabled: bool,
    #[serde(default = "default_true")]
    pub meetings_ical_enabled: bool,
    #[serde(default)]
    pub meetings_ical_url: String,
    #[serde(default = "default_true")]
    pub pet_cursor_eyes: bool,
    #[serde(default = "default_true")]
    pub pet_context_props: bool,
    #[serde(default)]
    pub onboarding_completed: bool,
}

fn default_island_orientation() -> String {
    "horizontal".to_string()
}
fn default_island_side() -> String {
    "right".to_string()
}
fn default_island_theme() -> String {
    "original".to_string()
}
fn default_overlay_size() -> String {
    "normal".to_string()
}
fn default_dhikr_every() -> i64 {
    5
}
fn default_dhikr_interval() -> i64 {
    25
}
fn default_radio_station() -> String {
    "cairo".to_string()
}
fn default_dhikr_duration() -> i64 {
    30
}
fn default_water_every() -> i64 {
    60
}
fn default_water_goal() -> i64 {
    8
}
fn default_screenshot_shelf_minutes() -> i64 {
    20
}

fn default_taskbar_position() -> String {
    "left".to_string()
}

fn default_taskbar_digits() -> String {
    "latin".to_string()
}

fn default_suhoor_lead() -> i64 {
    45
}

fn default_imsak_water_lead() -> i64 {
    15
}

fn default_suhoor_wake_check() -> i64 {
    5
}

fn default_pet_idle_opacity() -> f64 {
    0.15
}

fn default_pet_idle_delay() -> i64 {
    2
}

fn default_pet_popup_size() -> String {
    "normal".to_string()
}

fn default_pet_size() -> String {
    "normal".to_string()
}

fn default_font_size() -> String {
    "medium".to_string()
}

fn default_latitude() -> f64 {
    30.0444
}
fn default_longitude() -> f64 {
    31.2357
}
fn default_wudu_lead() -> i64 {
    15
}
fn default_pre_prayer_leads() -> Vec<i64> {
    vec![15]
}
fn default_calc_method() -> String {
    "egypt".to_string()
}
fn default_true() -> bool {
    true
}
fn default_false() -> bool {
    false
}
fn default_location_label() -> String {
    "القاهرة، مصر".to_string()
}
fn default_country_code() -> String {
    "EG".to_string()
}
fn default_time_zone() -> String {
    "Africa/Cairo".to_string()
}
fn default_avatar() -> String {
    "orb".to_string()
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            theme_id: ThemeId::MidnightMagenta,
            accent_id: AccentId::Amber,
            notifications: NotificationPreferences::default(),
            audio: AudioPreferences::default(),
            latitude: default_latitude(),
            longitude: default_longitude(),
            wudu_lead_minutes: default_wudu_lead(),
            pre_prayer_leads: default_pre_prayer_leads(),
            calc_method: default_calc_method(),
            pet_visible: true,
            overlay_widget: true,
            location_label: default_location_label(),
            country_code: default_country_code(),
            time_zone: default_time_zone(),
            fajr_offset: 0,
            maghrib_offset: 0,
            isha_offset: 0,
            hijri_date_offset: 0,
            bubbles: true,
            lively_popups: false,
            quiet_default: false,
            strict_offline: false,
            pet_avatar: default_avatar(),
            pet_size: default_pet_size(),
            pet_roaming: false,
            pet_interaction_sounds: false,
            pet_idle_fade: true,
            pet_idle_opacity: 0.15,
            pet_idle_delay_seconds: 2,
            pet_popup_size: default_pet_popup_size(),
            font_size: default_font_size(),
            reduced_motion: false,
            suhoor_lead_minutes: default_suhoor_lead(),
            imsak_water_lead_minutes: default_imsak_water_lead(),
            suhoor_wake_challenge: true,
            suhoor_wake_check_minutes: default_suhoor_wake_check(),
            prevent_sleep_for_suhoor: false,
            taskbar_widget_enabled: true,
            taskbar_widget_position: default_taskbar_position(),
            taskbar_widget_digits: default_taskbar_digits(),
            taskbar_show_focus_timer: true,
            asr_hanafi: false,
            island_orientation: default_island_orientation(),
            island_side: default_island_side(),
            island_hide_fullscreen: true,
            island_theme: default_island_theme(),
            overlay_size: default_overlay_size(),
            dhikr_cards_enabled: true,
            dhikr_every_minutes: default_dhikr_every(),
            dhikr_cards_interval_minutes: default_dhikr_interval(),
            dhikr_duration_seconds: default_dhikr_duration(),
            dhikr_include_ayah: true,
            dhikr_include_dhikr: true,
            dhikr_include_dua: true,
            radio_pause_at_prayer: true,
            quran_radio_enabled: true,
            quran_radio_default_station: default_radio_station(),
            media_pill_enabled: true,
            media_pause_at_prayer: true,
            water_reminder_enabled: true,
            water_every_minutes: default_water_every(),
            water_daily_goal: default_water_goal(),
            eye_break_enabled: true,
            welcome_back_enabled: true,
            morning_brief_enabled: true,
            smart_clipboard_enabled: true,
            clipboard_history_enabled: true,
            shelf_enabled: true,
            screenshot_auto_shelf: true,
            screenshot_shelf_minutes: default_screenshot_shelf_minutes(),
            downloads_watcher_enabled: true,
            privacy_dots_enabled: true,
            meetings_ical_enabled: true,
            meetings_ical_url: String::new(),
            pet_cursor_eyes: true,
            pet_context_props: true,
            onboarding_completed: false,
        }
    }
}

impl AppPreferences {
    pub fn validate(&self) -> Result<(), String> {
        if self.audio.volume > 100 {
            return Err("audio volume must be between 0 and 100".into());
        }
        if let Some(qh) = &self.notifications.quiet_hours {
            qh.validate()?;
        }
        if !self.latitude.is_finite() || !(-90.0..=90.0).contains(&self.latitude) {
            return Err("latitude must be between -90 and 90".into());
        }
        if !self.longitude.is_finite() || !(-180.0..=180.0).contains(&self.longitude) {
            return Err("longitude must be between -180 and 180".into());
        }
        if !self.pet_idle_opacity.is_finite() || !(0.05..=1.0).contains(&self.pet_idle_opacity) {
            return Err("petIdleOpacity must be between 0.05 and 1.0".into());
        }
        Ok(())
    }

    pub fn apply_patch(&mut self, patch: &Value) -> Result<(), String> {
        let Some(patch_obj) = patch.as_object() else {
            return Err("settings patch must be a JSON object".into());
        };
        let mut next = self.clone();

        if let Some(theme_val) = patch_obj.get("themeId").and_then(|v| v.as_str()) {
            if let Some(theme) = ThemeId::from_str_loose(theme_val) {
                next.theme_id = theme;
            } else {
                return Err(format!("invalid themeId: '{theme_val}'"));
            }
        }

        if let Some(accent_val) = patch_obj.get("accentId").and_then(|v| v.as_str()) {
            if let Some(accent) = AccentId::from_str_loose(accent_val) {
                next.accent_id = accent;
            } else {
                return Err(format!("invalid accentId: '{accent_val}'"));
            }
        }

        if let Some(notifs) = patch_obj.get("notifications").and_then(|v| v.as_object()) {
            if let Some(pre) = notifs.get("prePrayerEnabled").and_then(|v| v.as_bool()) {
                next.notifications.pre_prayer_enabled = pre;
            }
            if let Some(at) = notifs.get("prayerAtTimeEnabled").and_then(|v| v.as_bool()) {
                next.notifications.prayer_at_time_enabled = at;
            }
            if let Some(fasting) = notifs.get("fastingEnabled").and_then(|v| v.as_bool()) {
                next.notifications.fasting_enabled = fasting;
            }
            if let Some(focus) = notifs.get("focusCompletionEnabled").and_then(|v| v.as_bool()) {
                next.notifications.focus_completion_enabled = focus;
            }
            if notifs.contains_key("quietHours") {
                let qh_val = notifs.get("quietHours");
                if qh_val.map_or(false, |v| v.is_null()) {
                    next.notifications.quiet_hours = None;
                } else if let Some(qh_obj) = qh_val.and_then(|v| v.as_object()) {
                    let existing = next.notifications.quiet_hours.as_ref();
                    let start = qh_obj
                        .get("start")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| existing.map(|e| e.start.clone()))
                        .unwrap_or_else(|| "22:00".to_string());
                    let end = qh_obj
                        .get("end")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .or_else(|| existing.map(|e| e.end.clone()))
                        .unwrap_or_else(|| "06:00".to_string());
                    let qh = QuietHours { start, end };
                    qh.validate()?;
                    next.notifications.quiet_hours = Some(qh);
                }
            }
        }

        if let Some(audio) = patch_obj.get("audio").and_then(|v| v.as_object()) {
            if let Some(p) = audio.get("prayer").and_then(|v| v.as_str()) {
                next.audio.prayer = match p {
                    "gentle-chime" => PrayerSoundMode::GentleChime,
                    "adhan" => PrayerSoundMode::Adhan,
                    "silent" => PrayerSoundMode::Silent,
                    _ => return Err(format!("invalid prayer sound mode: '{p}'")),
                };
            }
            if let Some(f) = audio.get("fasting").and_then(|v| v.as_str()) {
                next.audio.fasting = match f {
                    "strong-alarm" => FastingSoundMode::StrongAlarm,
                    "adhan" => FastingSoundMode::Adhan,
                    "gentle-chime" => FastingSoundMode::GentleChime,
                    "silent" => FastingSoundMode::Silent,
                    _ => return Err(format!("invalid fasting sound mode: '{f}'")),
                };
            }
            if let Some(w) = audio.get("work").and_then(|v| v.as_str()) {
                next.audio.work = match w {
                    "gentle-chime" => WorkSoundMode::GentleChime,
                    "work-chime" => WorkSoundMode::WorkChime,
                    "silent" => WorkSoundMode::Silent,
                    _ => return Err(format!("invalid work sound mode: '{w}'")),
                };
            }
            if let Some(vol) = audio.get("volume").and_then(|v| v.as_i64()) {
                if !(0..=100).contains(&vol) {
                    return Err("volume must be between 0 and 100".into());
                }
                next.audio.volume = vol as u8;
            }
            if let Some(bg) = audio.get("backgroundPlayback").and_then(|v| v.as_str()) {
                next.audio.background_playback = match bg {
                    "always" => BackgroundAudioMode::Always,
                    "foreground-only" => BackgroundAudioMode::ForegroundOnly,
                    _ => return Err(format!("invalid backgroundPlayback mode: '{bg}'")),
                };
            }
        }

        if let Some(w) = patch_obj.get("wuduLeadMinutes").and_then(|v| v.as_i64()) {
            if !(0..=120).contains(&w) {
                return Err("wuduLeadMinutes must be between 0 and 120".into());
            }
            next.wudu_lead_minutes = w;
        }
        if let Some(leads) = patch_obj.get("prePrayerLeads").and_then(|v| v.as_array()) {
            let mut parsed: Vec<i64> = Vec::new();
            for l in leads {
                if let Some(m) = l.as_i64() {
                    if (1..=120).contains(&m) && !parsed.contains(&m) {
                        parsed.push(m);
                    }
                }
            }
            parsed.sort_by(|a, b| b.cmp(a));
            next.pre_prayer_leads = parsed;
        }
        if let Some(lat_val) = patch_obj.get("latitude") {
            if !lat_val.is_null() {
                let Some(lat) = lat_val.as_f64() else {
                    return Err("latitude must be a finite number between -90 and 90".into());
                };
                next.latitude = lat;
            }
        }
        if let Some(lng_val) = patch_obj.get("longitude") {
            if !lng_val.is_null() {
                let Some(lng) = lng_val.as_f64() else {
                    return Err("longitude must be a finite number between -180 and 180".into());
                };
                next.longitude = lng;
            }
        }
        if let Some(c) = patch_obj.get("calcMethod").and_then(|v| v.as_str()) {
            next.calc_method = c.to_string();
        }
        if let Some(pv) = patch_obj.get("petVisible").and_then(|v| v.as_bool()) {
            next.pet_visible = pv;
        }
        if let Some(ow) = patch_obj.get("overlayWidget").and_then(|v| v.as_bool()) {
            next.overlay_widget = ow;
        }
        if let Some(loc) = patch_obj.get("locationLabel").and_then(|v| v.as_str()) {
            next.location_label = loc.to_string();
        }
        if let Some(cc) = patch_obj.get("countryCode").and_then(|v| v.as_str()) {
            next.country_code = cc.to_string();
        }
        if let Some(tz) = patch_obj.get("timeZone").and_then(|v| v.as_str()) {
            next.time_zone = tz.to_string();
        }
        if let Some(fo) = patch_obj.get("fajrOffset").and_then(|v| v.as_i64()) {
            next.fajr_offset = fo;
        }
        if let Some(mo) = patch_obj.get("maghribOffset").and_then(|v| v.as_i64()) {
            next.maghrib_offset = mo;
        }
        if let Some(io) = patch_obj.get("ishaOffset").and_then(|v| v.as_i64()) {
            next.isha_offset = io;
        }
        if let Some(ho) = patch_obj
            .get("hijriDateOffset")
            .or_else(|| patch_obj.get("hijriOffset"))
            .and_then(|v| v.as_i64())
        {
            next.hijri_date_offset = ho.clamp(-5, 5);
        }
        if let Some(b) = patch_obj.get("bubbles").and_then(|v| v.as_bool()) {
            next.bubbles = b;
        }
        if let Some(lp) = patch_obj.get("livelyPopups").and_then(|v| v.as_bool()) {
            next.lively_popups = lp;
        }
        if let Some(qd) = patch_obj.get("quietDefault").and_then(|v| v.as_bool()) {
            next.quiet_default = qd;
        }
        if let Some(so) = patch_obj.get("strictOffline").and_then(|v| v.as_bool()) {
            next.strict_offline = so;
        }
        if let Some(avatar) = patch_obj.get("petAvatar").and_then(|v| v.as_str()) {
            next.pet_avatar = match avatar {
                "robot" | "cat" | "owl" | "crescent" | "sprout" | "lantern" => avatar.to_string(),
                _ => "orb".to_string(),
            };
        }
        if let Some(size) = patch_obj.get("petSize").and_then(|v| v.as_str()) {
            next.pet_size = match size {
                "small" | "large" => size.to_string(),
                _ => "normal".to_string(),
            };
        }
        if let Some(roam) = patch_obj.get("petRoaming").and_then(|v| v.as_bool()) {
            next.pet_roaming = roam;
        }
        if let Some(sounds) = patch_obj.get("petInteractionSounds").and_then(|v| v.as_bool()) {
            next.pet_interaction_sounds = sounds;
        }
        if let Some(fade) = patch_obj.get("petIdleFade").and_then(|v| v.as_bool()) {
            next.pet_idle_fade = fade;
        }
        if let Some(op) = patch_obj.get("petIdleOpacity").and_then(|v| v.as_f64()) {
            if op.is_finite() && (0.05..=1.0).contains(&op) {
                next.pet_idle_opacity = op;
            }
        }
        if let Some(delay) = patch_obj.get("petIdleDelaySeconds").and_then(|v| v.as_i64()) {
            if (1..=60).contains(&delay) {
                next.pet_idle_delay_seconds = delay;
            }
        }
        if let Some(ps) = patch_obj.get("petPopupSize").and_then(|v| v.as_str()) {
            next.pet_popup_size = match ps {
                "compact" | "large" => ps.to_string(),
                _ => "normal".to_string(),
            };
        }
        if let Some(os) = patch_obj.get("overlaySize").and_then(|v| v.as_str()) {
            next.overlay_size = match os {
                "compact" | "large" => os.to_string(),
                _ => "normal".to_string(),
            };
        }
        if let Some(fs) = patch_obj.get("fontSize").and_then(|v| v.as_str()) {
            next.font_size = match fs {
                "small" => "small".to_string(),
                "large" => "large".to_string(),
                _ => "medium".to_string(),
            };
        }
        if let Some(rm) = patch_obj.get("reducedMotion").and_then(|v| v.as_bool()) {
            next.reduced_motion = rm;
        }
        if let Some(sl) = patch_obj.get("suhoorLeadMinutes").and_then(|v| v.as_i64()) {
            if !(5..=180).contains(&sl) {
                return Err("suhoorLeadMinutes must be between 5 and 180".into());
            }
            next.suhoor_lead_minutes = sl;
        }
        if let Some(iw) = patch_obj.get("imsakWaterLeadMinutes").and_then(|v| v.as_i64()) {
            if !(0..=60).contains(&iw) {
                return Err("imsakWaterLeadMinutes must be between 0 and 60".into());
            }
            next.imsak_water_lead_minutes = iw;
        }
        if let Some(swc) = patch_obj.get("suhoorWakeChallenge").and_then(|v| v.as_bool()) {
            next.suhoor_wake_challenge = swc;
        }
        if let Some(swm) = patch_obj.get("suhoorWakeCheckMinutes").and_then(|v| v.as_i64()) {
            if !(0..=30).contains(&swm) {
                return Err("suhoorWakeCheckMinutes must be between 0 and 30".into());
            }
            next.suhoor_wake_check_minutes = swm;
        }
        if let Some(ps) = patch_obj.get("preventSleepForSuhoor").and_then(|v| v.as_bool()) {
            next.prevent_sleep_for_suhoor = ps;
        }
        if let Some(tb) = patch_obj.get("taskbarWidgetEnabled").and_then(|v| v.as_bool()) {
            next.taskbar_widget_enabled = tb;
        }
        if let Some(tbp) = patch_obj.get("taskbarWidgetPosition").and_then(|v| v.as_str()) {
            next.taskbar_widget_position = match tbp.trim().to_ascii_lowercase().as_str() {
                "near-tray" | "near_tray" | "tray" => "tray".to_string(),
                "far_left" | "far-left" => "far_left".to_string(),
                "left" => "left".to_string(),
                _ => "left".to_string(),
            };
        }
        if let Some(tbd) = patch_obj.get("taskbarWidgetDigits").and_then(|v| v.as_str()) {
            next.taskbar_widget_digits = match tbd {
                "arabic" => "arabic".to_string(),
                _ => "latin".to_string(),
            };
        }
        if let Some(tbf) = patch_obj.get("taskbarShowFocusTimer").and_then(|v| v.as_bool()) {
            next.taskbar_show_focus_timer = tbf;
        }
        if let Some(ah) = patch_obj.get("asrHanafi").and_then(|v| v.as_bool()) {
            next.asr_hanafi = ah;
        }
        if let Some(io) = patch_obj.get("islandOrientation").and_then(|v| v.as_str()) {
            next.island_orientation = match io.trim().to_ascii_lowercase().as_str() {
                "top" => "top".to_string(),
                "bottom" => "bottom".to_string(),
                "left" => "left".to_string(),
                "right" => "right".to_string(),
                "vertical" => "vertical".to_string(),
                "horizontal" => "horizontal".to_string(),
                _ => "horizontal".to_string(),
            };
        }
        if let Some(is) = patch_obj.get("islandSide").and_then(|v| v.as_str()) {
            next.island_side = match is {
                "left" => "left".to_string(),
                _ => "right".to_string(),
            };
        }
        if let Some(hf) = patch_obj.get("islandHideFullscreen").and_then(|v| v.as_bool()) {
            next.island_hide_fullscreen = hf;
        }
        if let Some(it) = patch_obj.get("islandTheme").and_then(|v| v.as_str()) {
            next.island_theme = it.to_string();
        }
        if let Some(dc) = patch_obj.get("dhikrCardsEnabled").and_then(|v| v.as_bool()) {
            next.dhikr_cards_enabled = dc;
        }
        if let Some(de) = patch_obj.get("dhikrEveryMinutes").and_then(|v| v.as_i64()) {
            if (1..=240).contains(&de) {
                next.dhikr_every_minutes = de;
                if !patch_obj.contains_key("dhikrCardsIntervalMinutes") {
                    next.dhikr_cards_interval_minutes = de;
                }
            }
        }
        if let Some(dci) = patch_obj
            .get("dhikrCardsIntervalMinutes")
            .and_then(|v| v.as_i64())
        {
            if (1..=240).contains(&dci) {
                next.dhikr_cards_interval_minutes = dci;
                if !patch_obj.contains_key("dhikrEveryMinutes") {
                    next.dhikr_every_minutes = dci;
                }
            }
        }
        if let Some(dd) = patch_obj.get("dhikrDurationSeconds").and_then(|v| v.as_i64()) {
            if (5..=300).contains(&dd) {
                next.dhikr_duration_seconds = dd;
            }
        }
        if let Some(da) = patch_obj.get("dhikrIncludeAyah").and_then(|v| v.as_bool()) {
            next.dhikr_include_ayah = da;
        }
        if let Some(ddk) = patch_obj.get("dhikrIncludeDhikr").and_then(|v| v.as_bool()) {
            next.dhikr_include_dhikr = ddk;
        }
        if let Some(ddu) = patch_obj.get("dhikrIncludeDua").and_then(|v| v.as_bool()) {
            next.dhikr_include_dua = ddu;
        }
        if let Some(rp) = patch_obj.get("radioPauseAtPrayer").and_then(|v| v.as_bool()) {
            next.radio_pause_at_prayer = rp;
        }
        if let Some(qre) = patch_obj.get("quranRadioEnabled").and_then(|v| v.as_bool()) {
            next.quran_radio_enabled = qre;
        }
        if let Some(qrs) = patch_obj
            .get("quranRadioDefaultStation")
            .and_then(|v| v.as_str())
        {
            let trimmed = qrs.trim();
            if !trimmed.is_empty() && trimmed.len() <= 64 {
                next.quran_radio_default_station = trimmed.to_string();
            }
        }
        if let Some(mp) = patch_obj.get("mediaPillEnabled").and_then(|v| v.as_bool()) {
            next.media_pill_enabled = mp;
        }
        if let Some(mpp) = patch_obj.get("mediaPauseAtPrayer").and_then(|v| v.as_bool()) {
            next.media_pause_at_prayer = mpp;
        }
        if let Some(wr) = patch_obj.get("waterReminderEnabled").and_then(|v| v.as_bool()) {
            next.water_reminder_enabled = wr;
        }
        if let Some(we) = patch_obj.get("waterEveryMinutes").and_then(|v| v.as_i64()) {
            if (15..=240).contains(&we) {
                next.water_every_minutes = we;
            }
        }
        if let Some(wg) = patch_obj.get("waterDailyGoal").and_then(|v| v.as_i64()) {
            if (1..=20).contains(&wg) {
                next.water_daily_goal = wg;
            }
        }
        if let Some(eb) = patch_obj.get("eyeBreakEnabled").and_then(|v| v.as_bool()) {
            next.eye_break_enabled = eb;
        }
        if let Some(wb) = patch_obj.get("welcomeBackEnabled").and_then(|v| v.as_bool()) {
            next.welcome_back_enabled = wb;
        }
        if let Some(mb) = patch_obj.get("morningBriefEnabled").and_then(|v| v.as_bool()) {
            next.morning_brief_enabled = mb;
        }
        if let Some(sc) = patch_obj.get("smartClipboardEnabled").and_then(|v| v.as_bool()) {
            next.smart_clipboard_enabled = sc;
        }
        if let Some(ch) = patch_obj.get("clipboardHistoryEnabled").and_then(|v| v.as_bool()) {
            next.clipboard_history_enabled = ch;
        }
        if let Some(se) = patch_obj.get("shelfEnabled").and_then(|v| v.as_bool()) {
            next.shelf_enabled = se;
        }
        if let Some(sas) = patch_obj.get("screenshotAutoShelf").and_then(|v| v.as_bool()) {
            next.screenshot_auto_shelf = sas;
        }
        if let Some(ssm) = patch_obj.get("screenshotShelfMinutes").and_then(|v| v.as_i64()) {
            if (1..=1440).contains(&ssm) {
                next.screenshot_shelf_minutes = ssm;
            }
        }
        if let Some(dwe) = patch_obj.get("downloadsWatcherEnabled").and_then(|v| v.as_bool()) {
            next.downloads_watcher_enabled = dwe;
        }
        if let Some(pde) = patch_obj.get("privacyDotsEnabled").and_then(|v| v.as_bool()) {
            next.privacy_dots_enabled = pde;
        }
        if let Some(mie) = patch_obj.get("meetingsIcalEnabled").and_then(|v| v.as_bool()) {
            next.meetings_ical_enabled = mie;
        }
        if let Some(miu) = patch_obj.get("meetingsIcalUrl").and_then(|v| v.as_str()) {
            next.meetings_ical_url = miu.to_string();
        }
        if let Some(pce) = patch_obj.get("petCursorEyes").and_then(|v| v.as_bool()) {
            next.pet_cursor_eyes = pce;
        }
        if let Some(pcp) = patch_obj.get("petContextProps").and_then(|v| v.as_bool()) {
            next.pet_context_props = pcp;
        }
        if let Some(oc) = patch_obj.get("onboardingCompleted").and_then(|v| v.as_bool()) {
            next.onboarding_completed = oc;
        }

        next.validate()?;
        *self = next;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReminderEvent {
    pub id: String,
    pub title: String,
    pub body: String,
    pub kind: String,
    pub due_at_ms: u64,
    pub catch_up_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSummary {
    pub next_reminder: Option<ReminderEvent>,
    pub status: String,
    pub unread_count: usize,
    pub last_recoverable_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRecord {
    pub id: String,
    pub title: String,
    pub body: String,
    pub kind: String,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
    pub read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryResult {
    pub success: bool,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub schema_version: i64,
    pub device_id: String,
    pub settings: AppPreferences,
    pub notification_summary: NotificationSummary,
    pub projects: Vec<Project>,
    pub ideas: Vec<Idea>,
    pub migration: Option<super::database::MigrationReport>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProject {
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_project_status")]
    pub status: String,
    #[serde(default)]
    pub current_task: Option<String>,
    #[serde(default)]
    pub goal: Option<String>,
    #[serde(default)]
    pub is_current: bool,
}

fn default_project_status() -> String {
    "فكرة".to_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIdea {
    pub title: String,
    #[serde(default = "default_idea_tag")]
    pub tag: String,
    #[serde(default)]
    pub body: String,
}

fn default_idea_tag() -> String {
    "فكرة".to_owned()
}
