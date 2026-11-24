use chrono::{DateTime, Datelike, Duration, FixedOffset, Local, NaiveDate, NaiveDateTime, NaiveTime, Utc, Weekday};
use serde::{Deserialize, Serialize};
use std::future::Future;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::sync::OnceLock;
use std::time::Duration as StdDuration;
use tokio::sync::watch;
use url::Url;

const MAX_ICS_BYTES: usize = 2 * 1024 * 1024; // 2 MB cap
const HTTP_TIMEOUT_SECS: u64 = 10;
const MAX_REDIRECTS: usize = 3;

fn calendar_policy() -> &'static watch::Sender<Option<String>> {
    static POLICY: OnceLock<watch::Sender<Option<String>>> = OnceLock::new();
    POLICY.get_or_init(|| watch::channel(None).0)
}

pub(crate) fn update_calendar_policy(prefs: &wens_core::AppPreferences) {
    let url = prefs.meetings_ical_url.trim();
    let allowed_url = (!prefs.strict_offline && prefs.meetings_ical_enabled && !url.is_empty())
        .then_some(url);
    calendar_policy().send_if_modified(|current| {
        if current.as_deref() == allowed_url {
            return false;
        }
        *current = allowed_url.map(str::to_owned);
        true
    });
}

async fn run_until_calendar_changes<T>(
    policy: &mut watch::Receiver<Option<String>>,
    request: impl Future<Output = T>,
) -> Option<T> {
    tokio::select! {
        biased;
        _ = policy.changed() => None,
        response = request => Some(response),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarMeeting {
    pub id: String,
    pub title: String,
    pub start_time: String,
    pub end_time: String,
    pub location: Option<String>,
    pub meeting_link: Option<String>,
    pub is_upcoming: bool,
    pub minutes_until_start: i64,
}

// -------------------------------------------------------------
// Strict SSRF & URL Security Validation
// -------------------------------------------------------------

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()                                           // 127.0.0.0/8
        || ip.is_private()                                     // 10/8, 172.16/12, 192.168/16
        || ip.is_link_local()                                  // 169.254.0.0/16 (incl. cloud metadata)
        || ip.is_unspecified()                                 // 0.0.0.0
        || ip.is_broadcast()                                   // 255.255.255.255
        || ip.is_multicast()                                   // 224.0.0.0/4
        || (o[0] == 100 && (o[1] & 0b1100_0000) == 64)         // 100.64.0.0/10 (CGNAT)
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))         // 198.18.0.0/15 (benchmarking)
        || o[0] == 0                                           // 0.0.0.0/8
        || o[0] >= 240                                         // 240.0.0.0/4 (reserved)
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_blocked_ipv4(v4);
    }
    if !ip.is_loopback() && !ip.is_unspecified() {
        if let Some(v4) = ip.to_ipv4() {
            return is_blocked_ipv4(v4);
        }
    }
    let seg0 = ip.segments()[0];
    ip.is_loopback()                          // ::1
        || ip.is_unspecified()                // ::
        || ip.is_multicast()                  // ff00::/8
        || (seg0 & 0xfe00) == 0xfc00          // fc00::/7 (Unique Local)
        || (seg0 & 0xffc0) == 0xfe80          // fe80::/10 (Link-Local)
        || (seg0 & 0xffc0) == 0xfec0          // fec0::/10 (Deprecated Site-Local)
}

fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_ipv4(v4),
        IpAddr::V6(v6) => is_blocked_ipv6(v6),
    }
}

fn is_blocked_hostname(host: &str) -> bool {
    let lower = host.trim().trim_end_matches('.').to_ascii_lowercase();
    lower.is_empty()
        || lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower == "metadata.google.internal"
}

async fn resolve_and_validate_host(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|_| "تعذر حل عنوان الخادم".to_string())?
        .collect();
    if addrs.is_empty() {
        return Err("تعذر حل عنوان الخادم".into());
    }
    if addrs.iter().any(|addr| is_blocked_ip(addr.ip())) {
        return Err("تم حظر الاتصال بعنوان شبكة محلي أو خاص (SSRF)".into());
    }
    Ok(addrs)
}

fn validate_https_calendar_url(raw_url: &str) -> Result<Url, String> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err("رابط التقويم فارغ.".into());
    }
    // Strictly allow ONLY https:// URLs — reject local files, file://, http://, UNC, javascript:, etc.
    if !trimmed.to_ascii_lowercase().starts_with("https://") {
        return Err("يُسمح فقط بروابط تقويم آمنة تبدأ بـ https:// (تم حظر الملفات المحلية والروابط غير المشفرة).".into());
    }

    let parsed = Url::parse(trimmed).map_err(|_| "رابط التقويم غير صالح.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("يُسمح فقط ببروتوكول https://.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("لا يُسمح بتضمين بيانات اعتماد داخل رابط التقويم.".into());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "رابط التقويم لا يحتوي على اسم نطاق صالح.".to_string())?;
    if is_blocked_hostname(host) {
        return Err("تم حظر الاتصال بالمضيف المحلي.".into());
    }

    // Immediate literal IP check before DNS resolution
    let host_unbracketed = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = host_unbracketed.parse::<IpAddr>() {
        if is_blocked_ip(ip) {
            return Err("تم حظر عنوان IP محلي أو خاص لأسباب أمنية.".into());
        }
    }

    Ok(parsed)
}

// -------------------------------------------------------------
// Safe Meeting Link Extraction (Strictly https:// ONLY)
// -------------------------------------------------------------

fn is_allowed_meeting_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h == "meet.google.com"
        || h == "zoom.us"
        || h.ends_with(".zoom.us")
        || h == "teams.microsoft.com"
        || h == "teams.live.com"
        || h == "meet.jit.si"
        || h == "webex.com"
        || h.ends_with(".webex.com")
}

fn extract_meeting_link(text: &str) -> Option<String> {
    for token in text.split_whitespace() {
        let clean = token.trim_matches(|c: char| {
            matches!(
                c,
                '<' | '>' | '"' | '\'' | '(' | ')' | '[' | ']' | ',' | ';' | '.'
            )
        });
        // Strict https:// check — NEVER allow javascript:, file:, data:, http:, etc.
        if !clean.starts_with("https://") {
            continue;
        }
        let Ok(parsed) = Url::parse(clean) else {
            continue;
        };
        if parsed.scheme() != "https" {
            continue;
        }
        let Some(host) = parsed.host_str() else {
            continue;
        };
        if !is_allowed_meeting_host(host) {
            continue;
        }
        let path = parsed.path();
        let host_lower = host.to_ascii_lowercase();
        let valid_path = if host_lower == "meet.google.com" {
            path.len() > 1
        } else if host_lower == "zoom.us" || host_lower.ends_with(".zoom.us") {
            path.starts_with("/j/") || path.starts_with("/w/") || path.starts_with("/my/")
        } else if host_lower == "teams.microsoft.com" {
            path.contains("/l/meetup-join/")
        } else if host_lower == "teams.live.com" {
            path.starts_with("/meet/")
        } else {
            path.len() > 1
        };

        if valid_path {
            return Some(parsed.into());
        }
    }
    None
}

// -------------------------------------------------------------
// RFC 5545 ICS Unfolding, Unescaping, TZID, VALUE=DATE & RRULE
// -------------------------------------------------------------

fn unfold_ics_lines(ics: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for raw_line in ics.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if let Some(cont) = line.strip_prefix(' ').or_else(|| line.strip_prefix('\t')) {
            if let Some(prev) = lines.last_mut() {
                prev.push_str(cont);
                continue;
            }
        }
        lines.push(line.to_string());
    }
    lines
}

fn unescape_ics_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push(' '),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some('\\') => out.push('\\'),
                Some(other) => {
                    out.push('\\');
                    out.push(other);
                }
                None => out.push('\\'),
            }
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

fn parse_fixed_tz_offset(tzid: &str) -> Option<FixedOffset> {
    let clean = tzid.trim().trim_matches('"');
    let lower = clean.to_ascii_lowercase();

    if matches!(lower.as_str(), "utc" | "gmt" | "etc/utc" | "etc/gmt" | "z") {
        return FixedOffset::east_opt(0);
    }

    // Handle explicit offsets like UTC+03:00, GMT-05:00, +02:00, -0400
    let offset_part = lower
        .strip_prefix("utc")
        .or_else(|| lower.strip_prefix("gmt"))
        .unwrap_or(&lower);
    if offset_part.starts_with('+') || offset_part.starts_with('-') {
        let sign = if offset_part.starts_with('-') { -1 } else { 1 };
        let digits = &offset_part[1..];
        let (h_str, m_str) = if let Some((h, m)) = digits.split_once(':') {
            (h, m)
        } else if digits.len() == 4 {
            (&digits[..2], &digits[2..])
        } else {
            (digits, "0")
        };
        if let (Ok(h), Ok(m)) = (h_str.parse::<i32>(), m_str.parse::<i32>()) {
            if h <= 14 && m < 60 {
                return FixedOffset::east_opt(sign * (h * 3600 + m * 60));
            }
        }
    }

    // Handle non-DST IANA & Windows TZIDs common for Wens users
    match clean {
        "Asia/Riyadh" | "Asia/Kuwait" | "Asia/Qatar" | "Asia/Bahrain" | "Asia/Baghdad"
        | "Asia/Aden" | "Asia/Amman" | "Europe/Istanbul" | "Asia/Istanbul"
        | "Arab Standard Time" | "Arabic Standard Time" | "Turkey Standard Time" => {
            FixedOffset::east_opt(3 * 3600)
        }
        "Asia/Dubai" | "Asia/Muscat" | "Arabian Standard Time" => FixedOffset::east_opt(4 * 3600),
        "Asia/Karachi" | "Pakistan Standard Time" => FixedOffset::east_opt(5 * 3600),
        "Asia/Kolkata" | "Asia/Calcutta" | "India Standard Time" => {
            FixedOffset::east_opt(5 * 3600 + 1800)
        }
        "Asia/Singapore" | "Asia/Kuala_Lumpur" | "Singapore Standard Time" => {
            FixedOffset::east_opt(8 * 3600)
        }
        "Asia/Tokyo" | "Tokyo Standard Time" => FixedOffset::east_opt(9 * 3600),
        "Asia/Jakarta" => FixedOffset::east_opt(7 * 3600),
        _ => None,
    }
}

fn local_from_naive(naive: NaiveDateTime) -> Option<DateTime<Local>> {
    naive
        .and_local_timezone(Local)
        .earliest()
        .or_else(|| naive.and_local_timezone(Local).latest())
}

#[derive(Debug, Clone, Copy)]
struct ParsedIcsTime {
    dt: DateTime<Local>,
    is_all_day: bool,
}

fn parse_ics_datetime_prop(params: &str, value: &str) -> Option<ParsedIcsTime> {
    let val = value.trim();
    let mut is_date_only = false;
    let mut tzid: Option<&str> = None;

    for param in params.split(';') {
        if let Some((k, v)) = param.split_once('=') {
            let ku = k.trim().to_ascii_uppercase();
            let vc = v.trim().trim_matches('"');
            if ku == "VALUE" && vc.eq_ignore_ascii_case("DATE") {
                is_date_only = true;
            } else if ku == "TZID" {
                tzid = Some(vc);
            }
        }
    }

    // VALUE=DATE or bare YYYYMMDD all-day date
    if is_date_only || (val.len() == 8 && val.chars().all(|c| c.is_ascii_digit())) {
        let date = NaiveDate::parse_from_str(val, "%Y%m%d").ok()?;
        let naive = date.and_hms_opt(0, 0, 0)?;
        let dt = local_from_naive(naive)?;
        return Some(ParsedIcsTime {
            dt,
            is_all_day: true,
        });
    }

    // UTC timestamp ending with Z
    if let Some(trimmed) = val.strip_suffix('Z').or_else(|| val.strip_suffix('z')) {
        let naive = NaiveDateTime::parse_from_str(trimmed, "%Y%m%dT%H%M%S")
            .or_else(|_| NaiveDateTime::parse_from_str(trimmed, "%Y%m%dT%H%M"))
            .ok()?;
        let utc = DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
        return Some(ParsedIcsTime {
            dt: utc.with_timezone(&Local),
            is_all_day: false,
        });
    }

    // Floating or TZID-qualified local datetime
    let naive = NaiveDateTime::parse_from_str(val, "%Y%m%dT%H%M%S")
        .or_else(|_| NaiveDateTime::parse_from_str(val, "%Y%m%dT%H%M"))
        .ok()?;

    if let Some(tz_str) = tzid {
        if let Some(offset) = parse_fixed_tz_offset(tz_str) {
            if let Some(fixed_dt) = naive
                .and_local_timezone(offset)
                .earliest()
                .or_else(|| naive.and_local_timezone(offset).latest())
            {
                return Some(ParsedIcsTime {
                    dt: fixed_dt.with_timezone(&Local),
                    is_all_day: false,
                });
            }
        }
    }

    let dt = local_from_naive(naive)?;
    Some(ParsedIcsTime {
        dt,
        is_all_day: false,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RruleFreq {
    Daily,
    Weekly,
}

#[derive(Debug, Clone)]
struct RruleSpec {
    freq: RruleFreq,
    interval: u32,
    count: Option<u32>,
    until: Option<DateTime<Local>>,
    by_day: Vec<Weekday>,
}

fn parse_ics_weekday(token: &str) -> Option<Weekday> {
    let trimmed = token.trim();
    let suffix = if trimmed.len() >= 2 {
        &trimmed[trimmed.len() - 2..]
    } else {
        trimmed
    };
    match suffix.to_ascii_uppercase().as_str() {
        "MO" => Some(Weekday::Mon),
        "TU" => Some(Weekday::Tue),
        "WE" => Some(Weekday::Wed),
        "TH" => Some(Weekday::Thu),
        "FR" => Some(Weekday::Fri),
        "SA" => Some(Weekday::Sat),
        "SU" => Some(Weekday::Sun),
        _ => None,
    }
}

fn parse_rrule(raw: &str) -> Option<RruleSpec> {
    let mut freq: Option<RruleFreq> = None;
    let mut interval: u32 = 1;
    let mut count: Option<u32> = None;
    let mut until: Option<DateTime<Local>> = None;
    let mut by_day: Vec<Weekday> = Vec::new();

    for part in raw.trim().split(';') {
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        let key = k.trim().to_ascii_uppercase();
        let val = v.trim();
        match key.as_str() {
            "FREQ" => match val.to_ascii_uppercase().as_str() {
                "DAILY" => freq = Some(RruleFreq::Daily),
                "WEEKLY" => freq = Some(RruleFreq::Weekly),
                _ => return None,
            },
            "INTERVAL" => {
                if let Ok(n) = val.parse::<u32>() {
                    interval = n.clamp(1, 366);
                }
            }
            "COUNT" => {
                if let Ok(n) = val.parse::<u32>() {
                    if n > 0 {
                        count = Some(n);
                    }
                }
            }
            "UNTIL" => {
                if let Some(parsed) = parse_ics_datetime_prop("", val) {
                    until = Some(if parsed.is_all_day {
                        parsed.dt + Duration::hours(23) + Duration::minutes(59) + Duration::seconds(59)
                    } else {
                        parsed.dt
                    });
                }
            }
            "BYDAY" => {
                for tok in val.split(',') {
                    if let Some(wd) = parse_ics_weekday(tok) {
                        if !by_day.contains(&wd) {
                            by_day.push(wd);
                        }
                    }
                }
            }
            _ => {}
        }
    }

    Some(RruleSpec {
        freq: freq?,
        interval,
        count,
        until,
        by_day,
    })
}

fn expand_occurrences_in_window(
    start: DateTime<Local>,
    duration: Duration,
    rrule: Option<&RruleSpec>,
    now: DateTime<Local>,
    window_start: DateTime<Local>,
    window_end: DateTime<Local>,
) -> Vec<DateTime<Local>> {
    let matches_window = |occ_start: DateTime<Local>| -> bool {
        let occ_end = occ_start + duration;
        (occ_start >= window_start && occ_start <= window_end)
            || (occ_start <= now && occ_end >= now)
    };

    let Some(rule) = rrule else {
        return if matches_window(start) {
            vec![start]
        } else {
            Vec::new()
        };
    };

    let mut out = Vec::new();
    let base_date = start.date_naive();
    let base_time: NaiveTime = start.time();
    let interval = rule.interval.max(1) as i64;

    match rule.freq {
        RruleFreq::Daily => {
            let days_diff = (window_start.date_naive() - base_date).num_days();
            let first_k: i64 = if days_diff > 1 {
                ((days_diff - 1) / interval).max(0)
            } else {
                0
            };

            for step in 0..8i64 {
                let k = first_k + step;
                if let Some(max_count) = rule.count {
                    if k >= max_count as i64 {
                        break;
                    }
                }
                let Some(occ_date) = base_date.checked_add_signed(Duration::days(k * interval)) else {
                    break;
                };
                let Some(occ_start) = local_from_naive(occ_date.and_time(base_time)) else {
                    continue;
                };
                if let Some(until_dt) = rule.until {
                    if occ_start > until_dt {
                        break;
                    }
                }
                if occ_start > window_end {
                    break;
                }
                if matches_window(occ_start) {
                    out.push(occ_start);
                }
            }
        }
        RruleFreq::Weekly => {
            let mut weekdays = if rule.by_day.is_empty() {
                vec![base_date.weekday()]
            } else {
                rule.by_day.clone()
            };
            weekdays.sort_by_key(|w| w.num_days_from_monday());

            let base_mon =
                base_date - Duration::days(base_date.weekday().num_days_from_monday() as i64);
            let win_mon = window_start.date_naive()
                - Duration::days(window_start.date_naive().weekday().num_days_from_monday() as i64);
            let weeks_diff = (win_mon - base_mon).num_days() / 7;
            let first_w: i64 = if weeks_diff > 0 {
                ((weeks_diff / interval) - 1).max(0)
            } else {
                0
            };

            // Compute exact occurrence count emitted before week `first_w` when COUNT is set
            let mut emitted_before: u64 = 0;
            if rule.count.is_some() && first_w > 0 {
                let week0_days = weekdays
                    .iter()
                    .filter(|wd| {
                        let d = base_mon + Duration::days(wd.num_days_from_monday() as i64);
                        d >= base_date
                    })
                    .count() as u64;
                emitted_before = week0_days
                    .saturating_add((first_w as u64 - 1).saturating_mul(weekdays.len() as u64));
            }

            let mut running_count = emitted_before;
            for step in 0..4i64 {
                let w = first_w + step;
                let Some(week_mon) = base_mon.checked_add_signed(Duration::days(w * interval * 7))
                else {
                    break;
                };
                for wd in &weekdays {
                    let occ_date = week_mon + Duration::days(wd.num_days_from_monday() as i64);
                    if occ_date < base_date {
                        continue;
                    }
                    if let Some(max_count) = rule.count {
                        if running_count >= max_count as u64 {
                            return out;
                        }
                    }
                    running_count += 1;

                    let Some(occ_start) = local_from_naive(occ_date.and_time(base_time)) else {
                        continue;
                    };
                    if let Some(until_dt) = rule.until {
                        if occ_start > until_dt {
                            return out;
                        }
                    }
                    if occ_start > window_end {
                        return out;
                    }
                    if matches_window(occ_start) {
                        out.push(occ_start);
                    }
                }
            }
        }
    }

    out
}

pub fn parse_ics_content(ics: &str) -> Vec<CalendarMeeting> {
    parse_ics_content_at(ics, Local::now())
}

fn parse_ics_content_at(ics: &str, now: DateTime<Local>) -> Vec<CalendarMeeting> {
    let mut meetings = Vec::new();
    let window_start = now - Duration::hours(1);
    let window_end = now + Duration::hours(24);

    let mut in_event = false;
    let mut cancelled = false;
    let mut current_uid = String::new();
    let mut current_summary = String::new();
    let mut current_start: Option<ParsedIcsTime> = None;
    let mut current_end: Option<ParsedIcsTime> = None;
    let mut current_location = String::new();
    let mut current_desc = String::new();
    let mut current_url = String::new();
    let mut current_rrule: Option<RruleSpec> = None;

    for line in unfold_ics_lines(ics) {
        let trimmed = line.trim();
        if trimmed.eq_ignore_ascii_case("BEGIN:VEVENT") {
            in_event = true;
            cancelled = false;
            current_uid.clear();
            current_summary.clear();
            current_start = None;
            current_end = None;
            current_location.clear();
            current_desc.clear();
            current_url.clear();
            current_rrule = None;
        } else if trimmed.eq_ignore_ascii_case("END:VEVENT") {
            if in_event && !cancelled {
                if let Some(start_info) = current_start {
                    let duration = match current_end {
                        Some(end_info) if end_info.dt > start_info.dt => {
                            end_info.dt - start_info.dt
                        }
                        _ if start_info.is_all_day => Duration::hours(24),
                        _ => Duration::minutes(30),
                    };

                    let occurrences = expand_occurrences_in_window(
                        start_info.dt,
                        duration,
                        current_rrule.as_ref(),
                        now,
                        window_start,
                        window_end,
                    );

                    let full_blob = format!(
                        "{} {} {} {}",
                        current_url, current_summary, current_location, current_desc
                    );
                    let link = extract_meeting_link(&full_blob);
                    let title = if current_summary.is_empty() {
                        "اجتماع".to_string()
                    } else {
                        current_summary.clone()
                    };
                    let location = if current_location.is_empty() {
                        None
                    } else {
                        Some(current_location.clone())
                    };

                    for occ_start in occurrences {
                        let occ_end = occ_start + duration;
                        let minutes_until = (occ_start - now).num_minutes();
                        let id = if current_uid.is_empty() {
                            format!("event_{}", occ_start.timestamp())
                        } else {
                            format!("{}_{}", current_uid, occ_start.timestamp())
                        };
                        let (start_time, end_time) = if start_info.is_all_day {
                            ("طوال اليوم".to_string(), "".to_string())
                        } else {
                            (
                                occ_start.format("%H:%M").to_string(),
                                occ_end.format("%H:%M").to_string(),
                            )
                        };

                        meetings.push(CalendarMeeting {
                            id,
                            title: title.clone(),
                            start_time,
                            end_time,
                            location: location.clone(),
                            meeting_link: link.clone(),
                            is_upcoming: minutes_until > 0,
                            minutes_until_start: minutes_until,
                        });
                    }
                }
            }
            in_event = false;
        } else if in_event {
            let Some((prop_head, value)) = trimmed.split_once(':') else {
                continue;
            };
            let (prop_name, params) = match prop_head.split_once(';') {
                Some((name, rest)) => (name.trim().to_ascii_uppercase(), rest),
                None => (prop_head.trim().to_ascii_uppercase(), ""),
            };

            match prop_name.as_str() {
                "UID" => current_uid = value.trim().to_string(),
                "STATUS" => {
                    if value.trim().eq_ignore_ascii_case("CANCELLED") {
                        cancelled = true;
                    }
                }
                "SUMMARY" => current_summary = unescape_ics_text(value),
                "DTSTART" => current_start = parse_ics_datetime_prop(params, value),
                "DTEND" => current_end = parse_ics_datetime_prop(params, value),
                "LOCATION" => current_location = unescape_ics_text(value),
                "DESCRIPTION" => current_desc = unescape_ics_text(value),
                "URL" | "X-GOOGLE-CONFERENCE" => {
                    if !current_url.is_empty() {
                        current_url.push(' ');
                    }
                    current_url.push_str(value.trim());
                }
                "RRULE" => current_rrule = parse_rrule(value),
                _ => {}
            }
        }
    }

    meetings.sort_by_key(|m| m.minutes_until_start);
    meetings
}

async fn fetch_https_ics_bounded(initial_url: &str) -> Result<String, String> {
    let mut current_url = validate_https_calendar_url(initial_url)?;

    for hop in 0..=MAX_REDIRECTS {
        let host = current_url
            .host_str()
            .ok_or_else(|| "رابط التقويم لا يحتوي على اسم نطاق صالح.".to_string())?
            .trim_matches(['[', ']']);
        let port = current_url.port_or_known_default().unwrap_or(443);
        let addrs = resolve_and_validate_host(host, port).await?;
        // Reuse the checked DNS answers at connection time and validate redirects independently.
        let client = reqwest::Client::builder()
            .https_only(true)
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .http1_only()
            .pool_max_idle_per_host(0)
            .resolve_to_addrs(host, &addrs)
            .build()
            .map_err(|e| format!("فشل تهيئة اتصال التقويم: {}", e.without_url()))?;
        let mut response = client
            .get(current_url.clone())
            .header(reqwest::header::ACCEPT, "text/calendar, text/plain;q=0.9")
            .send()
            .await
            .map_err(|e| format!("فشل جلب التقويم: {}", e.without_url()))?;

        if matches!(response.status().as_u16(), 301 | 302 | 303 | 307 | 308) {
            if hop == MAX_REDIRECTS {
                return Err("عدد إعادة التوجيهات لرابط التقويم كبير جداً.".into());
            }
            let loc = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|header| header.to_str().ok())
                .ok_or_else(|| "إعادة توجيه غير صالحة من خادم التقويم.".to_string())?;
            let next_url = current_url
                .join(loc)
                .map_err(|_| "رابط إعادة توجيه غير صالح.".to_string())?;
            current_url = validate_https_calendar_url(next_url.as_str())?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!("فشل جلب التقويم (HTTP {}).", response.status().as_u16()));
        }
        if response.content_length().is_some_and(|length| length > MAX_ICS_BYTES as u64) {
            return Err("حجم ملف التقويم يتجاوز الحد الأقصى المسموح (2 ميجابايت).".into());
        }

        let mut bytes = Vec::with_capacity(64 * 1024);
        while let Some(chunk) = response.chunk().await
            .map_err(|e| format!("فشل قراءة محتوى التقويم: {}", e.without_url()))?
        {
            if bytes.len().saturating_add(chunk.len()) > MAX_ICS_BYTES {
                return Err("حجم ملف التقويم يتجاوز الحد الأقصى المسموح (2 ميجابايت).".into());
            }
            bytes.extend_from_slice(&chunk);
        }

        return Ok(String::from_utf8_lossy(&bytes).into_owned());
    }

    Err("فشل جلب التقويم بعد إعادة التوجيه.".into())
}

pub async fn fetch_meetings() -> Result<Vec<CalendarMeeting>, String> {
    let mut policy = calendar_policy().subscribe();
    let url = policy.borrow_and_update().clone();
    let Some(url) = url else {
        return Ok(Vec::new());
    };

    let request = tokio::time::timeout(
        StdDuration::from_secs(HTTP_TIMEOUT_SECS),
        fetch_https_ics_bounded(&url),
    );
    let Some(result) = run_until_calendar_changes(&mut policy, request).await else {
        return Ok(Vec::new());
    };
    let ics_text = result.map_err(|_| "انتهت مهلة الاتصال بالتقويم.".to_string())??;
    let meetings = parse_ics_content(&ics_text);
    if policy.has_changed().unwrap_or(true) {
        return Ok(Vec::new());
    }
    Ok(meetings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn disabling_feed_drops_inflight_calendar_future() {
        use std::sync::{atomic::{AtomicBool, Ordering}, Arc};

        struct PendingRequest(Arc<AtomicBool>);

        impl Drop for PendingRequest {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let (sender, mut receiver) = watch::channel(Some("https://example.com/cal.ics".to_string()));
        let cancelled = Arc::new(AtomicBool::new(false));
        let request = PendingRequest(cancelled.clone());
        let (started, start_signal) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            run_until_calendar_changes(&mut receiver, async move {
                let _ = started.send(());
                std::future::pending::<()>().await;
                drop(request);
            }).await
        });

        start_signal.await.unwrap();
        sender.send_replace(None);
        assert_eq!(task.await.unwrap(), None);
        assert!(cancelled.load(Ordering::SeqCst));
    }

    #[test]
    fn blocks_ssrf_ips_and_local_paths() {
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1))));
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 5))));
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(172, 16, 1, 1))));
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1))));
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))));
        assert!(is_blocked_ip(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1))));
        assert!(!is_blocked_ip(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))));

        assert!(is_blocked_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_blocked_ip("::ffff:127.0.0.1".parse().unwrap()));
        assert!(is_blocked_ip("fc00::1".parse().unwrap()));
        assert!(is_blocked_ip("fe80::1".parse().unwrap()));

        assert!(validate_https_calendar_url("C:\\Windows\\win.ini").is_err());
        assert!(validate_https_calendar_url("/etc/passwd").is_err());
        assert!(validate_https_calendar_url("file:///etc/passwd").is_err());
        assert!(validate_https_calendar_url("http://example.com/cal.ics").is_err());
        assert!(validate_https_calendar_url("https://127.0.0.1/cal.ics").is_err());
        assert!(validate_https_calendar_url("https://localhost/cal.ics").is_err());
    }

    #[test]
    fn extract_meeting_link_rejects_javascript_and_http() {
        assert_eq!(extract_meeting_link("javascript:alert(1)//zoom.us/j/123"), None);
        assert_eq!(extract_meeting_link("http://zoom.us/j/123456"), None);
        assert_eq!(extract_meeting_link("file:///zoom.us/j/123"), None);
        assert_eq!(extract_meeting_link("data:text/html,https://meet.google.com/abc"), None);
        assert_eq!(
            extract_meeting_link("Join here: <https://meet.google.com/abc-defg-hij>"),
            Some("https://meet.google.com/abc-defg-hij".to_string())
        );
        assert_eq!(
            extract_meeting_link("Zoom: https://us02web.zoom.us/j/987654321"),
            Some("https://us02web.zoom.us/j/987654321".to_string())
        );
    }

    #[test]
    fn parses_folded_lines_value_date_tzid_and_rrule() {
        let now = Local::now();
        let target_start = now + Duration::hours(2);
        let past_daily = target_start - Duration::days(10);
        let past_weekly = target_start - Duration::days(14);
        let today_date_str = now.format("%Y%m%d").to_string();

        let ics = format!(
            "BEGIN:VCALENDAR\r\n\
             BEGIN:VEVENT\r\n\
             UID:daily-1\r\n\
             SUMMARY:Standup\r\n  Meeting\r\n\
             DTSTART:{}\r\n\
             DTEND:{}\r\n\
             RRULE:FREQ=DAILY;INTERVAL=1\r\n\
             DESCRIPTION:Link https://meet.google.com/abc-defg-hij\r\n\
             END:VEVENT\r\n\
             BEGIN:VEVENT\r\n\
             UID:weekly-1\r\n\
             SUMMARY:Weekly Review\r\n\
             DTSTART:{}\r\n\
             RRULE:FREQ=WEEKLY;INTERVAL=1\r\n\
             END:VEVENT\r\n\
             BEGIN:VEVENT\r\n\
             UID:allday-1\r\n\
             SUMMARY:All Day Conf\r\n\
             DTSTART;VALUE=DATE:{}\r\n\
             END:VEVENT\r\n\
             END:VCALENDAR\r\n",
            past_daily.format("%Y%m%dT%H%M%S"),
            (past_daily + Duration::minutes(45)).format("%Y%m%dT%H%M%S"),
            past_weekly.format("%Y%m%dT%H%M%S"),
            today_date_str
        );

        let meetings = parse_ics_content_at(&ics, now);
        assert!(meetings.iter().any(|m| m.title == "Standup Meeting"
            && m.meeting_link.as_deref() == Some("https://meet.google.com/abc-defg-hij")));
        assert!(meetings.iter().any(|m| m.title == "Weekly Review"));
        assert!(meetings.iter().any(|m| m.title == "All Day Conf" && m.start_time == "طوال اليوم"));
    }
}
