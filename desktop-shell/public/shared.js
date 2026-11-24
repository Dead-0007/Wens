/* وِنس — shared utilities */
window.WensShared = (() => {
  const arabicDigits = (value) => String(value ?? '').replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  const pad = (value) => String(value).padStart(2, '0');
  const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  let dateFormatterZone = null;
  let dateFormatter;
  const selectedDateKey = (timeZone, date = new Date()) => {
    const zone = typeof timeZone === 'string' ? timeZone.trim() : '';
    if (zone !== dateFormatterZone) {
      dateFormatterZone = zone;
      dateFormatter = undefined;
      if (zone) {
        try {
          dateFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
          });
        } catch {}
      }
    }
    if (!dateFormatter) return localDateKey(date);
    const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  let offsetFormatterZone = null;
  let offsetFormatter;
  const prayerDayClock = (timeZone, now, dayOffset = 0) => {
    const [year, month, day] = selectedDateKey(timeZone, now).split('-').map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day + dayOffset));
    const zone = typeof timeZone === 'string' ? timeZone.trim() : '';
    if (zone !== offsetFormatterZone) {
      offsetFormatterZone = zone;
      offsetFormatter = undefined;
      if (zone) {
        try {
          offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' });
        } catch {}
      }
    }
    const utcNoon = +calendarDate + 12 * 60 * 60 * 1000;
    const offsetAt = (date) => {
      const label = offsetFormatter?.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value;
      const offset = label?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (offset) return (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) + Number(offset[3] || 0) / 60);
      return label === 'GMT' ? 0 : -date.getTimezoneOffset() / 60;
    };
    const offsetHours = offsetAt(new Date(utcNoon - offsetAt(new Date(utcNoon)) * 60 * 60 * 1000));
    return { calendarDate, offsetHours };
  };
  let clockFormatterZone = null;
  let prayerClockFormatter;
  const formatPrayerClock = (date, timeZone) => {
    const zone = typeof timeZone === 'string' ? timeZone.trim() : '';
    if (zone !== clockFormatterZone) {
      clockFormatterZone = zone;
      try {
        prayerClockFormatter = new Intl.DateTimeFormat('ar-EG', {
          timeZone: zone || undefined, hour: 'numeric', minute: '2-digit'
        });
      } catch {
        prayerClockFormatter = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' });
      }
    }
    return prayerClockFormatter.format(date);
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const isSafeHttpsUrl = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!/^https:\/\//i.test(trimmed)) return false;
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };
  const formatTime = (date, withPeriod = false) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'م' : 'ص';
    const h = hours % 12 || 12;
    return `${arabicDigits(`${pad(h)}:${pad(minutes)}`)}${withPeriod ? ` ${period}` : ''}`;
  };

  const resolvePrayerMethodParams = (method) => {
    const norm = String(method || 'egypt').toLowerCase().trim().replace(/[-_\s]/g, '');
    if (norm === 'mwl' || norm === 'muslimworldleague') {
      return { fajrAngle: 18.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'ummalqura' || norm === 'makkah' || norm === 'mecca' || norm === 'saudi') {
      return { fajrAngle: 18.5, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    }
    if (norm === 'karachi') {
      return { fajrAngle: 18.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'isna' || norm === 'northamerica') {
      return { fajrAngle: 15.0, ishaAngle: 15.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'dubai') {
      return { fajrAngle: 18.2, ishaAngle: 18.2, ishaMinutesAfterSunset: null };
    }
    if (norm === 'kuwait') {
      return { fajrAngle: 18.0, ishaAngle: 17.5, ishaMinutesAfterSunset: null };
    }
    if (norm === 'qatar') {
      return { fajrAngle: 18.0, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    }
    if (norm === 'gulf') {
      return { fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    }
    if (norm === 'morocco') {
      return { fajrAngle: 19.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'algeria' || norm === 'turkey') {
      return { fajrAngle: 18.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'tunisia' || norm === 'jordan') {
      return { fajrAngle: 18.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'singapore') {
      return { fajrAngle: 20.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'france') {
      return { fajrAngle: 12.0, ishaAngle: 12.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'russia') {
      return { fajrAngle: 16.0, ishaAngle: 15.0, ishaMinutesAfterSunset: null };
    }
    if (norm === 'tehran') {
      return { fajrAngle: 17.7, ishaAngle: 14.0, ishaMinutesAfterSunset: null };
    }
    // Default: Egyptian General Authority of Survey ('egypt')
    return { fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutesAfterSunset: null };
  };

  return { arabicDigits, pad, localDateKey, selectedDateKey, prayerDayClock, formatPrayerClock, escapeHtml, isSafeHttpsUrl, formatTime, resolvePrayerMethodParams };
})();

// Suppress default browser context menu across all Wens windows except editable fields
if (typeof window !== 'undefined') {
  window.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (target && typeof target.closest === 'function' && target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')) {
      return;
    }
    e.preventDefault();
  }, true);
}

