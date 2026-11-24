use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CalculationMethod {
    #[serde(alias = "egyptian")]
    Egypt,
    Mwl,
    #[serde(alias = "muslim-world-league", alias = "muslimworldleague", alias = "muslimWorldLeague")]
    MuslimWorldLeague,
    #[serde(alias = "makkah", alias = "ummalqura", alias = "umm-al-qura", alias = "ummAlQura", alias = "mecca")]
    UmmAlQura,
    Karachi,
    #[serde(alias = "isna", alias = "north-america", alias = "northamerica", alias = "northAmerica")]
    NorthAmerica,
    Dubai,
    Kuwait,
    Qatar,
    Gulf,
    Morocco,
    Algeria,
    Tunisia,
    Turkey,
    Jordan,
    Singapore,
    France,
    Russia,
    Tehran,
}

impl Default for CalculationMethod {
    fn default() -> Self {
        Self::Egypt
    }
}

impl CalculationMethod {
    pub fn from_str_lossy(raw: &str) -> Self {
        let normalized: String = raw
            .trim()
            .to_ascii_lowercase()
            .chars()
            .filter(|c| !matches!(c, '_' | '-' | ' '))
            .collect();
        match normalized.as_str() {
            "makkah" | "mecca" | "ummalqura" => Self::UmmAlQura,
            "mwl" | "muslimworldleague" => Self::MuslimWorldLeague,
            "isna" | "northamerica" => Self::NorthAmerica,
            "karachi" => Self::Karachi,
            "egypt" | "egyptian" => Self::Egypt,
            "dubai" => Self::Dubai,
            "kuwait" => Self::Kuwait,
            "qatar" => Self::Qatar,
            "gulf" => Self::Gulf,
            "morocco" => Self::Morocco,
            "algeria" => Self::Algeria,
            "tunisia" => Self::Tunisia,
            "turkey" | "diyanet" => Self::Turkey,
            "jordan" => Self::Jordan,
            "singapore" => Self::Singapore,
            "france" | "uoif" => Self::France,
            "russia" => Self::Russia,
            "tehran" => Self::Tehran,
            _ => Self::Egypt,
        }
    }

    pub fn for_country_code(country: &str) -> Self {
        match country.trim().to_uppercase().as_str() {
            "EG" | "SD" | "LY" | "SY" | "LB" => Self::Egypt,
            "SA" | "YE" => Self::UmmAlQura,
            "AE" => Self::Dubai,
            "KW" => Self::Kuwait,
            "QA" => Self::Qatar,
            "BH" | "OM" => Self::Gulf,
            "JO" | "PS" => Self::Jordan,
            "MA" => Self::Morocco,
            "DZ" => Self::Algeria,
            "TN" => Self::Tunisia,
            "TR" => Self::Turkey,
            "IR" => Self::Tehran,
            "PK" | "IN" | "BD" | "AF" => Self::Karachi,
            "SG" | "BN" | "MY" | "ID" => Self::Singapore,
            "US" | "CA" => Self::NorthAmerica,
            "FR" => Self::France,
            "RU" => Self::Russia,
            _ => Self::Mwl,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum AsrJurist {
    #[default]
    Standard,
    Hanafi,
}

#[derive(Debug, Clone, Copy)]
enum IshaRule {
    Angle(f64),
    MinutesAfterSunset(f64),
}

fn fix(value: f64, range: f64) -> f64 {
    ((value % range) + range) % range
}

fn julian_date(date: NaiveDate, longitude: f64) -> f64 {
    let mut year = date.year();
    let mut month = date.month() as i32;
    if month <= 2 {
        year -= 1;
        month += 12;
    }
    let century = (year as f64 / 100.0).floor();
    let correction = 2.0 - century + (century / 4.0).floor();
    (365.25 * (year + 4716) as f64).floor()
        + (30.6001 * (month + 1) as f64).floor()
        + date.day() as f64
        + correction
        - 1524.5
        - longitude / (15.0 * 24.0)
}

fn sun_position(julian: f64) -> (f64, f64) {
    let elapsed = julian - 2_451_545.0;
    let anomaly = fix(357.529 + 0.98560028 * elapsed, 360.0);
    let mean_longitude = fix(280.459 + 0.98564736 * elapsed, 360.0);
    let sun_longitude = fix(
        mean_longitude
            + 1.915 * anomaly.to_radians().sin()
            + 0.020 * (2.0 * anomaly).to_radians().sin(),
        360.0,
    );
    let obliquity = 23.439 - 0.00000036 * elapsed;
    let right_ascension = fix(
        (obliquity.to_radians().cos() * sun_longitude.to_radians().sin())
            .atan2(sun_longitude.to_radians().cos())
            .to_degrees()
            / 15.0,
        24.0,
    );
    let declination = (obliquity.to_radians().sin() * sun_longitude.to_radians().sin())
        .asin()
        .to_degrees();
    let equation = fix(mean_longitude / 15.0 - right_ascension, 24.0);
    (declination, equation)
}

fn midday(julian: f64, portion: f64) -> f64 {
    fix(12.0 - sun_position(julian + portion).1, 24.0)
}

fn try_time_at_angle(julian: f64, latitude: f64, angle: f64, portion: f64) -> Option<f64> {
    let (declination, _) = sun_position(julian + portion);
    let numerator = -angle.to_radians().sin()
        - declination.to_radians().sin() * latitude.to_radians().sin();
    let denominator = declination.to_radians().cos() * latitude.to_radians().cos();
    if !denominator.is_finite() || denominator.abs() < 1e-12 {
        return None;
    }
    let cos_h = numerator / denominator;
    if !cos_h.is_finite() || !(-1.0..=1.0).contains(&cos_h) {
        return None;
    }
    let delta = cos_h.acos().to_degrees() / 15.0;
    let t = midday(julian, portion) + if angle > 90.0 { -delta } else { delta };
    if t.is_finite() {
        Some(t)
    } else {
        None
    }
}

fn try_asr_time(julian: f64, latitude: f64, portion: f64, jurist: AsrJurist) -> Option<f64> {
    let declination = sun_position(julian + portion).0;
    let diff = (latitude - declination).abs();
    if !diff.is_finite() || diff >= 89.5 {
        return None;
    }
    let factor = match jurist {
        AsrJurist::Hanafi => 2.0,
        AsrJurist::Standard => 1.0,
    };
    let shadow_base = factor + diff.to_radians().tan();
    if !shadow_base.is_finite() || shadow_base <= 0.0 {
        return None;
    }
    let angle = -(1.0 / shadow_base).atan().to_degrees();
    try_time_at_angle(julian, latitude, angle, portion)
}

fn normalize_ordered_day_minutes(raw: [f64; 6]) -> [i32; 6] {
    let mut mins = [0i32; 6];
    for (idx, value) in raw.into_iter().enumerate() {
        let clamped = if value.is_finite() {
            value.round().clamp(0.0, 1439.0) as i32
        } else {
            (idx as i32) * 180 + 180
        };
        mins[idx] = clamped;
    }
    // Enforce strict ascending ordering: fajr < sunrise < dhuhr < asr < maghrib < isha
    for i in 1..6 {
        if mins[i] <= mins[i - 1] {
            mins[i] = mins[i - 1] + 1;
        }
    }
    if mins[5] > 1439 {
        mins[5] = 1439;
        for i in (0..5).rev() {
            if mins[i] >= mins[i + 1] {
                mins[i] = mins[i + 1] - 1;
            }
        }
    }
    mins
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrayerRequest {
    pub date: String,
    pub latitude: f64,
    pub longitude: f64,
    pub timezone_offset_minutes: i32,
    #[serde(default)]
    pub method: CalculationMethod,
    #[serde(default)]
    pub asr_jurist: AsrJurist,
    #[serde(default)]
    pub fajr_offset_minutes: i32,
    #[serde(default)]
    pub maghrib_offset_minutes: i32,
    #[serde(default)]
    pub isha_offset_minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrayerTime {
    pub key: String,
    pub name_ar: String,
    pub minutes_from_midnight: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PrayerDay {
    pub date: String,
    pub times: Vec<PrayerTime>,
    pub calculation_note_ar: String,
}

#[derive(Debug, Error)]
pub enum PrayerError {
    #[error("invalid Gregorian date")]
    InvalidDate,
    #[error("latitude must be between -90 and 90")]
    InvalidLatitude,
    #[error("longitude must be between -180 and 180")]
    InvalidLongitude,
}

pub fn calculate_prayer_day(request: PrayerRequest) -> Result<PrayerDay, PrayerError> {
    if !request.latitude.is_finite() || !(-90.0..=90.0).contains(&request.latitude) {
        return Err(PrayerError::InvalidLatitude);
    }
    if !request.longitude.is_finite() || !(-180.0..=180.0).contains(&request.longitude) {
        return Err(PrayerError::InvalidLongitude);
    }
    let date = NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map_err(|_| PrayerError::InvalidDate)?;
    let julian = julian_date(date, request.longitude);
    let (fajr_angle, isha_rule): (f64, IshaRule) = match request.method {
        CalculationMethod::Mwl | CalculationMethod::MuslimWorldLeague => (18.0, IshaRule::Angle(17.0)),
        CalculationMethod::UmmAlQura => (18.5, IshaRule::MinutesAfterSunset(90.0)),
        CalculationMethod::Karachi => (18.0, IshaRule::Angle(18.0)),
        CalculationMethod::NorthAmerica => (15.0, IshaRule::Angle(15.0)),
        CalculationMethod::Egypt => (19.5, IshaRule::Angle(17.5)),
        CalculationMethod::Dubai => (18.2, IshaRule::Angle(18.2)),
        CalculationMethod::Kuwait => (18.0, IshaRule::Angle(17.5)),
        CalculationMethod::Qatar => (18.0, IshaRule::MinutesAfterSunset(90.0)),
        CalculationMethod::Gulf => (19.5, IshaRule::MinutesAfterSunset(90.0)),
        CalculationMethod::Morocco => (19.0, IshaRule::Angle(17.0)),
        CalculationMethod::Algeria => (18.0, IshaRule::Angle(17.0)),
        CalculationMethod::Tunisia => (18.0, IshaRule::Angle(18.0)),
        CalculationMethod::Turkey => (18.0, IshaRule::Angle(17.0)),
        CalculationMethod::Jordan => (18.0, IshaRule::Angle(18.0)),
        CalculationMethod::Singapore => (20.0, IshaRule::Angle(18.0)),
        CalculationMethod::France => (12.0, IshaRule::Angle(12.0)),
        CalculationMethod::Russia => (16.0, IshaRule::Angle(15.0)),
        CalculationMethod::Tehran => (17.7, IshaRule::Angle(14.0)),
    };
    let portions = [5.0 / 24.0, 6.0 / 24.0, 12.0 / 24.0, 13.0 / 24.0, 18.0 / 24.0, 18.0 / 24.0];
    let dhuhr = midday(julian, portions[2]);

    // Nearest temperate reference latitude for polar midnight sun / polar night.
    let polar_ref_lat = if request.latitude >= 0.0 { 48.5 } else { -48.5 };
    let mut high_lat_fallback_used = false;

    let (sunrise, sunset, eff_lat) = match (
        try_time_at_angle(julian, request.latitude, 180.0 - 0.833, portions[1]),
        try_time_at_angle(julian, request.latitude, 0.833, portions[4]),
    ) {
        (Some(sr), Some(ss)) if sr < dhuhr && dhuhr < ss && (ss - sr) >= 0.5 && (ss - sr) <= 23.0 => {
            (sr, ss, request.latitude)
        }
        _ => {
            high_lat_fallback_used = true;
            let sr = try_time_at_angle(julian, polar_ref_lat, 180.0 - 0.833, portions[1])
                .unwrap_or(dhuhr - 6.0);
            let ss = try_time_at_angle(julian, polar_ref_lat, 0.833, portions[4])
                .unwrap_or(dhuhr + 6.0);
            (sr, ss, polar_ref_lat)
        }
    };

    let asr = match try_asr_time(julian, eff_lat, portions[3], request.asr_jurist) {
        Some(a) if a > dhuhr && a < sunset => a,
        _ => {
            high_lat_fallback_used = true;
            match try_asr_time(julian, polar_ref_lat, portions[3], request.asr_jurist) {
                Some(a) if a > dhuhr && a < sunset => a,
                _ => {
                    let frac = match request.asr_jurist {
                        AsrJurist::Hanafi => 0.65,
                        AsrJurist::Standard => 0.50,
                    };
                    dhuhr + (sunset - dhuhr) * frac
                }
            }
        }
    };

    // High-latitude angle-based / 1/7th-of-night safe fallback for Fajr & Isha.
    let night = (24.0 - (sunset - sunrise)).max(0.5);
    let fajr_max_diff = (fajr_angle / 60.0).clamp(1.0 / 7.0, 0.40) * night;
    let fajr = match try_time_at_angle(julian, eff_lat, 180.0 - fajr_angle, portions[0]) {
        Some(f)
            if f < sunrise
                && (sunrise - f) <= 0.49 * night
                && (eff_lat.abs() <= 48.0 || (sunrise - f) <= fajr_max_diff) =>
        {
            f
        }
        _ => {
            high_lat_fallback_used = true;
            sunrise - fajr_max_diff
        }
    };

    let isha = match isha_rule {
        IshaRule::Angle(angle) => {
            let isha_max_diff = (angle / 60.0).clamp(1.0 / 7.0, 0.40) * night;
            match try_time_at_angle(julian, eff_lat, angle, portions[5]) {
                Some(i)
                    if i > sunset
                        && (i - sunset) <= 0.49 * night
                        && (eff_lat.abs() <= 48.0 || (i - sunset) <= isha_max_diff) =>
                {
                    i
                }
                _ => {
                    high_lat_fallback_used = true;
                    sunset + isha_max_diff
                }
            }
        }
        IshaRule::MinutesAfterSunset(minutes) => {
            let delta_h = minutes / 60.0;
            if high_lat_fallback_used {
                sunset + delta_h.min(0.45 * night)
            } else {
                sunset + delta_h
            }
        }
    };

    // Wrap timezone-longitude difference across the International Date Line into [-12h, +12h).
    let raw_shift_hours =
        request.timezone_offset_minutes as f64 / 60.0 - request.longitude / 15.0;
    let tz_shift_hours = fix(raw_shift_hours + 12.0, 24.0) - 12.0;
    let localize = |hours: f64| (hours + tz_shift_hours) * 60.0;

    let raw_minutes = [
        localize(fajr) + request.fajr_offset_minutes as f64,
        localize(sunrise),
        localize(dhuhr),
        localize(asr),
        localize(sunset) + request.maghrib_offset_minutes as f64,
        localize(isha) + request.isha_offset_minutes as f64,
    ];
    let normalized = normalize_ordered_day_minutes(raw_minutes);

    let labels = [
        ("fajr", "الفجر"),
        ("sunrise", "الشروق"),
        ("dhuhr", "الظهر"),
        ("asr", "العصر"),
        ("maghrib", "المغرب"),
        ("isha", "العشاء"),
    ];
    let calculation_note_ar = if high_lat_fallback_used {
        "حساب شمسي محلي تقريبي (تم تطبيق تقريب خطوط العرض العليا لضمان توازن المواقيت)."
    } else {
        "حساب شمسي محلي تقريبي؛ راجع جهة موثوقة واضبط الفروق من الإعدادات."
    };

    Ok(PrayerDay {
        date: request.date,
        times: labels
            .into_iter()
            .zip(normalized)
            .map(|((key, name), minutes)| PrayerTime {
                key: key.into(),
                name_ar: name.into(),
                minutes_from_midnight: minutes,
            })
            .collect(),
        calculation_note_ar: calculation_note_ar.into(),
    })
}

pub fn calculate_prayer_month(
    year: i32,
    month: u32,
    request_template: PrayerRequest,
) -> Result<Vec<PrayerDay>, PrayerError> {
    if !(1..=12).contains(&month) {
        return Err(PrayerError::InvalidDate);
    }
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    };

    let mut month_days = Vec::with_capacity(days_in_month as usize);
    for d in 1..=days_in_month {
        let date_str = format!("{:04}-{:02}-{:02}", year, month, d);
        let mut req = request_template.clone();
        req.date = date_str;
        month_days.push(calculate_prayer_day(req)?);
    }
    Ok(month_days)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculates_full_month_properly() {
        let template = PrayerRequest {
            date: String::new(),
            latitude: 30.0444,
            longitude: 31.2357,
            timezone_offset_minutes: 180,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::default(),
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        };
        let month_days = calculate_prayer_month(2026, 10, template).unwrap();
        assert_eq!(month_days.len(), 31);
        assert_eq!(month_days[0].date, "2026-10-01");
        assert_eq!(month_days[30].date, "2026-10-31");
        for day in &month_days {
            assert_eq!(day.times.len(), 6);
            let mins: Vec<_> = day.times.iter().map(|t| t.minutes_from_midnight).collect();
            assert!(mins.windows(2).all(|w| w[0] < w[1]));
        }
    }

    #[test]
    fn cairo_times_are_ordered_and_stable() {
        let result = calculate_prayer_day(PrayerRequest {
            date: "2026-08-26".into(),
            latitude: 30.0444,
            longitude: 31.2357,
            timezone_offset_minutes: 180,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::default(),
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        })
        .unwrap();
        let minutes: Vec<_> = result
            .times
            .iter()
            .map(|time| time.minutes_from_midnight)
            .collect();
        assert!(minutes.windows(2).all(|pair| pair[0] < pair[1]));
        assert!((240..=360).contains(&minutes[0]));
        assert!((1050..=1200).contains(&minutes[4]));
    }
    #[test]
    fn egypt_method_matches_cairo_authority_isha_regression() {
        let result = calculate_prayer_day(PrayerRequest {
            date: "2026-08-28".into(),
            latitude: 30.0444,
            longitude: 31.2357,
            timezone_offset_minutes: 180,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::default(),
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        })
        .unwrap();
        // Egyptian General Authority of Survey: 04:59, 06:29, 12:56,
        // 16:31, 19:22, 20:43 for Cairo on 2026-08-28.
        let authority_minutes = [299, 389, 776, 991, 1162, 1243];
        for (actual, expected) in result.times.iter().zip(authority_minutes) {
            assert!(
                (actual.minutes_from_midnight - expected).abs() <= 1,
                "{} drifted: expected about {}, got {}",
                actual.key,
                expected,
                actual.minutes_from_midnight
            );
        }
    }
    #[test]
    fn egypt_method_matches_cairo_authority_for_every_august_prayer() {
        // Dar al-Ifta / Egyptian Survey monthly Cairo table, August 2026.
        // Columns are Fajr, sunrise, Dhuhr, Asr, Maghrib and Isha.
        let authority = [
            [275, 374, 781, 998, 1189, 1275],
            [276, 374, 781, 998, 1188, 1274],
            [277, 375, 781, 998, 1187, 1273],
            [278, 375, 781, 998, 1186, 1272],
            [279, 376, 781, 998, 1185, 1271],
            [280, 377, 781, 998, 1185, 1270],
            [281, 377, 781, 998, 1184, 1269],
            [282, 378, 781, 997, 1183, 1268],
            [283, 378, 780, 997, 1182, 1267],
            [284, 379, 780, 997, 1181, 1266],
            [284, 380, 780, 997, 1180, 1264],
            [285, 380, 780, 997, 1179, 1263],
            [286, 381, 780, 996, 1178, 1262],
            [287, 381, 780, 996, 1177, 1261],
            [288, 382, 779, 996, 1176, 1260],
            [289, 383, 779, 996, 1175, 1258],
            [290, 383, 779, 995, 1174, 1257],
            [291, 384, 779, 995, 1173, 1256],
            [291, 384, 779, 995, 1172, 1255],
            [292, 385, 778, 994, 1171, 1253],
            [293, 386, 778, 994, 1170, 1252],
            [294, 386, 778, 993, 1169, 1251],
            [295, 387, 778, 993, 1168, 1250],
            [295, 387, 777, 993, 1167, 1248],
            [296, 388, 777, 992, 1166, 1247],
            [297, 388, 777, 992, 1165, 1246],
            [298, 389, 776, 991, 1164, 1244],
            [299, 389, 776, 991, 1162, 1243],
            [299, 390, 776, 990, 1161, 1242],
            [300, 391, 776, 990, 1160, 1240],
            [301, 391, 775, 989, 1159, 1239],
        ];
        for (day_index, expected) in authority.into_iter().enumerate() {
            let day = day_index + 1;
            let result = calculate_prayer_day(PrayerRequest {
                date: format!("2026-08-{day:02}"),
                latitude: 30.0444,
                longitude: 31.2357,
                timezone_offset_minutes: 180,
                method: CalculationMethod::Egypt,
                asr_jurist: AsrJurist::default(),
                fajr_offset_minutes: 0,
                maghrib_offset_minutes: 0,
                isha_offset_minutes: 0,
            })
            .unwrap();
            for (actual, expected_minutes) in result.times.iter().zip(expected) {
                assert!(
                    (actual.minutes_from_midnight - expected_minutes).abs() <= 1,
                    "2026-08-{day:02} {} drifted: expected about {}, got {}",
                    actual.key,
                    expected_minutes,
                    actual.minutes_from_midnight
                );
            }
        }
    }
    #[test]
    fn every_cairo_prayer_stays_ordered_through_the_year() {
        let mut date = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
        let end = NaiveDate::from_ymd_opt(2027, 1, 1).unwrap();
        while date < end {
            // Cairo observes UTC+3 during summer and UTC+2 otherwise. Exact
            // transition handling belongs to the OS timezone passed by the UI;
            // either offset must preserve valid astronomical ordering.
            for timezone_offset_minutes in [120, 180] {
                let result = calculate_prayer_day(PrayerRequest {
                    date: date.format("%Y-%m-%d").to_string(),
                    latitude: 30.0444,
                    longitude: 31.2357,
                    timezone_offset_minutes,
                    method: CalculationMethod::Egypt,
                    asr_jurist: AsrJurist::default(),
                    fajr_offset_minutes: 0,
                    maghrib_offset_minutes: 0,
                    isha_offset_minutes: 0,
                })
                .unwrap();
                let values: Vec<_> = result
                    .times
                    .iter()
                    .map(|time| time.minutes_from_midnight)
                    .collect();
                assert!(
                    values.windows(2).all(|pair| pair[0] < pair[1]),
                    "invalid prayer ordering on {date}: {values:?}"
                );
            }
            date = date.succ_opt().unwrap();
        }
    }
    #[test]
    fn rejects_invalid_coordinates() {
        let request = PrayerRequest {
            date: "2026-01-01".into(),
            latitude: 100.0,
            longitude: 0.0,
            timezone_offset_minutes: 0,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::default(),
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        };
        assert!(matches!(
            calculate_prayer_day(request),
            Err(PrayerError::InvalidLatitude)
        ));
    }

    #[test]
    fn hanafi_asr_is_later_than_standard() {
        let std_req = PrayerRequest {
            date: "2026-06-21".into(),
            latitude: 30.0444,
            longitude: 31.2357,
            timezone_offset_minutes: 180,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::Standard,
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        };
        let hanafi_req = PrayerRequest {
            date: "2026-06-21".into(),
            latitude: 30.0444,
            longitude: 31.2357,
            timezone_offset_minutes: 180,
            method: CalculationMethod::Egypt,
            asr_jurist: AsrJurist::Hanafi,
            fajr_offset_minutes: 0,
            maghrib_offset_minutes: 0,
            isha_offset_minutes: 0,
        };
        let std_res = calculate_prayer_day(std_req).unwrap();
        let hanafi_res = calculate_prayer_day(hanafi_req).unwrap();
        let std_asr = std_res.times.iter().find(|t| t.key == "asr").unwrap().minutes_from_midnight;
        let hanafi_asr = hanafi_res.times.iter().find(|t| t.key == "asr").unwrap().minutes_from_midnight;
        assert!(hanafi_asr > std_asr, "Hanafi asr ({hanafi_asr}) must be strictly after standard asr ({std_asr})");
    }

    #[test]
    fn country_code_detection_works() {
        assert_eq!(CalculationMethod::for_country_code("EG"), CalculationMethod::Egypt);
        assert_eq!(CalculationMethod::for_country_code("SA"), CalculationMethod::UmmAlQura);
        assert_eq!(CalculationMethod::for_country_code("AE"), CalculationMethod::Dubai);
        assert_eq!(CalculationMethod::for_country_code("TR"), CalculationMethod::Turkey);
        assert_eq!(CalculationMethod::for_country_code("FR"), CalculationMethod::France);
        assert_eq!(CalculationMethod::for_country_code("US"), CalculationMethod::NorthAmerica);
        assert_eq!(CalculationMethod::for_country_code("UNKNOWN"), CalculationMethod::Mwl);
    }

    #[test]
    fn calculation_method_serde_aliases_and_from_str_lossy() {
        let cases = [
            ("\"makkah\"", CalculationMethod::UmmAlQura),
            ("\"umm_al_qura\"", CalculationMethod::UmmAlQura),
            ("\"ummalqura\"", CalculationMethod::UmmAlQura),
            ("\"muslim_world_league\"", CalculationMethod::MuslimWorldLeague),
            ("\"mwl\"", CalculationMethod::Mwl),
            ("\"isna\"", CalculationMethod::NorthAmerica),
            ("\"north_america\"", CalculationMethod::NorthAmerica),
            ("\"egypt\"", CalculationMethod::Egypt),
            ("\"karachi\"", CalculationMethod::Karachi),
        ];
        for (raw_json, expected) in cases {
            let parsed: CalculationMethod = serde_json::from_str(raw_json)
                .unwrap_or_else(|e| panic!("failed to deserialize {raw_json}: {e}"));
            assert_eq!(parsed, expected, "mismatch for {raw_json}");
        }

        assert_eq!(CalculationMethod::from_str_lossy("makkah"), CalculationMethod::UmmAlQura);
        assert_eq!(CalculationMethod::from_str_lossy("UMM_AL_QURA"), CalculationMethod::UmmAlQura);
        assert_eq!(CalculationMethod::from_str_lossy("Umm-Al-Qura"), CalculationMethod::UmmAlQura);
        assert_eq!(CalculationMethod::from_str_lossy("ummalqura"), CalculationMethod::UmmAlQura);
        assert_eq!(CalculationMethod::from_str_lossy("mwl"), CalculationMethod::MuslimWorldLeague);
        assert_eq!(CalculationMethod::from_str_lossy("Muslim World League"), CalculationMethod::MuslimWorldLeague);
        assert_eq!(CalculationMethod::from_str_lossy("ISNA"), CalculationMethod::NorthAmerica);
        assert_eq!(CalculationMethod::from_str_lossy("north-america"), CalculationMethod::NorthAmerica);
        assert_eq!(CalculationMethod::from_str_lossy("karachi"), CalculationMethod::Karachi);
        assert_eq!(CalculationMethod::from_str_lossy("egypt"), CalculationMethod::Egypt);
        assert_eq!(CalculationMethod::from_str_lossy("unknown-method"), CalculationMethod::Egypt);
    }

    #[test]
    fn rejects_nan_and_infinite_coordinates() {
        for bad_lat in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -90.1, 90.1] {
            let req = PrayerRequest {
                date: "2026-06-21".into(),
                latitude: bad_lat,
                longitude: 0.0,
                timezone_offset_minutes: 0,
                method: CalculationMethod::Egypt,
                asr_jurist: AsrJurist::Standard,
                fajr_offset_minutes: 0,
                maghrib_offset_minutes: 0,
                isha_offset_minutes: 0,
            };
            assert!(matches!(calculate_prayer_day(req), Err(PrayerError::InvalidLatitude)));
        }
        for bad_lng in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -180.1, 180.1] {
            let req = PrayerRequest {
                date: "2026-06-21".into(),
                latitude: 30.0,
                longitude: bad_lng,
                timezone_offset_minutes: 0,
                method: CalculationMethod::Egypt,
                asr_jurist: AsrJurist::Standard,
                fajr_offset_minutes: 0,
                maghrib_offset_minutes: 0,
                isha_offset_minutes: 0,
            };
            assert!(matches!(calculate_prayer_day(req), Err(PrayerError::InvalidLongitude)));
        }
    }

    #[test]
    fn high_latitude_polar_and_dateline_locations_stay_strictly_ordered_in_day_bounds() {
        let locations = [
            ("London", 51.5074, -0.1278, 60),
            ("Stockholm", 59.3293, 18.0686, 120),
            ("Reykjavik", 64.1466, -21.9426, 0),
            ("Tromso", 69.6492, 18.9553, 120),
            ("NorthPole", 90.0, 0.0, 0),
            ("McMurdoAntarctica", -77.8419, 166.6863, 720),
            ("SouthPole", -90.0, 0.0, 0),
            ("NullIsland", 0.0, 0.0, 0),
            ("KiribatiDateLineEast", 1.8721, -157.4278, 840),
            ("SamoaDateLine", -13.8333, -171.75, 780),
            ("BakerDateLineWest", 0.1936, 179.9, -720),
            ("SydneyWithCairoTz", -33.8688, 151.2093, 120),
        ];
        let dates = ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"];
        let methods = [
            CalculationMethod::Egypt,
            CalculationMethod::MuslimWorldLeague,
            CalculationMethod::UmmAlQura,
            CalculationMethod::NorthAmerica,
            CalculationMethod::Karachi,
        ];
        for (name, lat, lng, tz) in locations {
            for date in dates {
                for method in methods {
                    for jurist in [AsrJurist::Standard, AsrJurist::Hanafi] {
                        let day = calculate_prayer_day(PrayerRequest {
                            date: date.into(),
                            latitude: lat,
                            longitude: lng,
                            timezone_offset_minutes: tz,
                            method,
                            asr_jurist: jurist,
                            fajr_offset_minutes: 0,
                            maghrib_offset_minutes: 0,
                            isha_offset_minutes: 0,
                        })
                        .unwrap_or_else(|e| panic!("{name} {date} {method:?} failed: {e}"));
                        assert_eq!(day.times.len(), 6);
                        let mins: Vec<i32> =
                            day.times.iter().map(|t| t.minutes_from_midnight).collect();
                        for &m in &mins {
                            assert!(
                                (0..=1439).contains(&m),
                                "{name} {date} {method:?} out of 0..=1439: {mins:?}"
                            );
                        }
                        assert!(
                            mins.windows(2).all(|w| w[0] < w[1]),
                            "{name} {date} {method:?} ({jurist:?}) not strictly increasing: {mins:?}"
                        );
                    }
                }
            }
        }
    }
}
