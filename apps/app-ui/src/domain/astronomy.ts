import {
  formatArabicDigits,
  toLocalDateString,
  formatTimeMinutes,
  arShortWeekdayFormatter,
  formatArLongWeekday,
} from './formatters';

export interface QiblaResult {
  angle: number;
  direction: string;
  label: string;
}

export function sanitizeLatitude(lat: unknown, fallback = 30.0444): number {
  const n = typeof lat === 'number' ? lat : typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : NaN;
  if (!Number.isFinite(n) || n < -90 || n > 90) return fallback;
  return n;
}

export function sanitizeLongitude(lng: unknown, fallback = 31.2357): number {
  const n = typeof lng === 'number' ? lng : typeof lng === 'string' && lng.trim() !== '' ? Number(lng) : NaN;
  if (!Number.isFinite(n) || n < -180 || n > 180) return fallback;
  return n;
}

export function sanitizeFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCalcMethod(raw?: string | null): string {
  const cleaned = String(raw ?? 'egypt')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  switch (cleaned) {
    case 'makkah':
    case 'mecca':
    case 'ummalqura':
    case 'umm_al_qura':
    case 'umm_alqura':
      return 'umm_al_qura';
    case 'mwl':
    case 'muslim_world_league':
    case 'muslimworldleague':
      return 'muslim_world_league';
    case 'isna':
    case 'north_america':
    case 'northamerica':
      return 'north_america';
    case 'karachi':
      return 'karachi';
    case 'egypt':
    case 'egyptian':
      return 'egypt';
    case 'dubai':
    case 'kuwait':
    case 'qatar':
    case 'gulf':
    case 'morocco':
    case 'algeria':
    case 'tunisia':
    case 'turkey':
    case 'jordan':
    case 'singapore':
    case 'france':
    case 'russia':
    case 'tehran':
      return cleaned;
    default:
      return 'egypt';
  }
}

const tzFormatterCache = new Map<string, Intl.DateTimeFormat>();

function timeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = tzFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    tzFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function getCivilClock(now: Date = new Date(), timeZone?: string | null) {
  if (timeZone) {
    try {
      const parts = Object.fromEntries(timeZoneFormatter(timeZone).formatToParts(now)
        .map(({ type, value }) => [type, value]));
      return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
      };
    } catch {
      // Older preferences can contain unsupported time zones.
    }
  }
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

export function shiftCivilDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function civilPrayerEpoch(date: string, minutes: number, timeZone?: string | null): number {
  const [year, month, day] = date.split('-').map(Number);
  const civilNoon = new Date(year, month - 1, day, 12);
  const offset = getTimeZoneOffsetMinutes(civilNoon, timeZone);
  return Date.UTC(year, month - 1, day, 0, minutes - offset);
}

export function getTimeZoneOffsetMinutes(date: Date = new Date(), timeZone?: string | null): number {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const fallback = -safeDate.getTimezoneOffset();
  if (!timeZone || typeof timeZone !== 'string' || !timeZone.trim()) {
    return fallback;
  }
  const tz = timeZone.trim();
  try {
    const fmt = timeZoneFormatter(tz);
    const noonWallMs = Date.UTC(safeDate.getFullYear(), safeDate.getMonth(), safeDate.getDate(), 12);
    const offsetAt = (instant: number) => {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(instant))
        .map(({ type, value }) => [type, Number(value)]));
      const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
      return Math.round((asUtc - instant) / 60000);
    };
    const initialOffset = offsetAt(noonWallMs);
    const offsetMins = offsetAt(noonWallMs - initialOffset * 60000);
    if (!Number.isFinite(offsetMins) || offsetMins < -720 || offsetMins > 840) {
      return fallback;
    }
    return offsetMins;
  } catch {
    return fallback;
  }
}

export function getTimeZoneOffsetHours(date: Date = new Date(), timeZone?: string | null): number {
  return getTimeZoneOffsetMinutes(date, timeZone) / 60;
}

export function calculateQibla(lat: number, lng: number): QiblaResult {
  const safeLat = sanitizeLatitude(lat, 30.0444);
  const safeLng = sanitizeLongitude(lng, 31.2357);
  const kaabaLat = (21.4225 * Math.PI) / 180;
  const kaabaLng = (39.8262 * Math.PI) / 180;
  const phi = (safeLat * Math.PI) / 180;
  const lambda = (safeLng * Math.PI) / 180;
  const y = Math.sin(kaabaLng - lambda);
  const x = Math.cos(phi) * Math.tan(kaabaLat) - Math.sin(phi) * Math.cos(kaabaLng - lambda);
  let qibla = (Math.atan2(y, x) * 180) / Math.PI;
  if (!Number.isFinite(qibla)) qibla = 136;
  qibla = (qibla + 360) % 360;
  const rounded = Math.round(qibla) % 360;
  let direction = 'جنوب شرق';
  if (rounded >= 337.5 || rounded < 22.5) direction = 'شمال';
  else if (rounded >= 22.5 && rounded < 67.5) direction = 'شمال شرق';
  else if (rounded >= 67.5 && rounded < 112.5) direction = 'شرق';
  else if (rounded >= 112.5 && rounded < 157.5) direction = 'جنوب شرق';
  else if (rounded >= 157.5 && rounded < 202.5) direction = 'جنوب';
  else if (rounded >= 202.5 && rounded < 247.5) direction = 'جنوب غرب';
  else if (rounded >= 247.5 && rounded < 292.5) direction = 'غرب';
  else if (rounded >= 292.5 && rounded < 337.5) direction = 'شمال غرب';
  return { angle: rounded, direction, label: `${formatArabicDigits(rounded)}° ${direction}` };
}

export function calculateSuhoorTime(fajrMinutesFromMidnight: number, leadMinutes: number = 45): number {
  const safeFajr = sanitizeFiniteNumber(fajrMinutesFromMidnight, 300);
  const safeLead = sanitizeFiniteNumber(leadMinutes, 45);
  return ((Math.round(safeFajr - safeLead) % 1440) + 1440) % 1440;
}

export interface MonthPrayerDayRow {
  day: number;
  dateStr: string;
  weekdayName: string;
  isToday: boolean;
  times: {
    key: string;
    nameAr: string;
    minutes: number;
    formatted: string;
  }[];
}

function getMethodParams(method: string): {
  fajrAngle: number;
  ishaAngle: number;
  ishaMinutesAfterSunset: number | null;
} {
  const normalized = normalizeCalcMethod(method);
  switch (normalized) {
    case 'muslim_world_league':
      return { fajrAngle: 18.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    case 'umm_al_qura':
      return { fajrAngle: 18.5, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    case 'karachi':
      return { fajrAngle: 18.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    case 'north_america':
      return { fajrAngle: 15.0, ishaAngle: 15.0, ishaMinutesAfterSunset: null };
    case 'dubai':
      return { fajrAngle: 18.2, ishaAngle: 18.2, ishaMinutesAfterSunset: null };
    case 'kuwait':
      return { fajrAngle: 18.0, ishaAngle: 17.5, ishaMinutesAfterSunset: null };
    case 'qatar':
      return { fajrAngle: 18.0, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    case 'gulf':
      return { fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutesAfterSunset: 90.0 };
    case 'morocco':
      return { fajrAngle: 19.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    case 'algeria':
    case 'turkey':
      return { fajrAngle: 18.0, ishaAngle: 17.0, ishaMinutesAfterSunset: null };
    case 'tunisia':
    case 'jordan':
      return { fajrAngle: 18.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    case 'singapore':
      return { fajrAngle: 20.0, ishaAngle: 18.0, ishaMinutesAfterSunset: null };
    case 'france':
      return { fajrAngle: 12.0, ishaAngle: 12.0, ishaMinutesAfterSunset: null };
    case 'russia':
      return { fajrAngle: 16.0, ishaAngle: 15.0, ishaMinutesAfterSunset: null };
    case 'tehran':
      return { fajrAngle: 17.7, ishaAngle: 14.0, ishaMinutesAfterSunset: null };
    case 'egypt':
    default:
      return { fajrAngle: 19.5, ishaAngle: 17.5, ishaMinutesAfterSunset: null };
  }
}

export function calculateMonthPrayerTable(
  year: number,
  monthIndex: number,
  latitude: number = 30.0444,
  longitude: number = 31.2357,
  tzOffsetHours: number = 3,
  method: string = 'egypt',
  fajrOffset: number = 0,
  maghribOffset: number = 0,
  ishaOffset: number = 0,
  asrHanafi: boolean = false,
  timeZone?: string
): MonthPrayerDayRow[] {
  const safeLat = sanitizeLatitude(latitude, 30.0444);
  const safeLng = sanitizeLongitude(longitude, 31.2357);
  const calcLat = Math.max(-89.9, Math.min(89.9, safeLat));
  const safeFallbackTz = sanitizeFiniteNumber(tzOffsetHours, -new Date().getTimezoneOffset() / 60);
  const safeFajrOffset = Math.max(-120, Math.min(120, sanitizeFiniteNumber(fajrOffset, 0)));
  const safeMaghribOffset = Math.max(-120, Math.min(120, sanitizeFiniteNumber(maghribOffset, 0)));
  const safeIshaOffset = Math.max(-120, Math.min(120, sanitizeFiniteNumber(ishaOffset, 0)));
  const shadowFactor = asrHanafi ? 2.0 : 1.0;

  function fix(val: number, max: number) {
    return val - max * Math.floor(val / max);
  }
  function julianDate(d: Date, lon: number) {
    const y = d.getFullYear();
    let m = d.getMonth() + 1;
    let yr = y;
    if (m <= 2) {
      yr -= 1;
      m += 12;
    }
    const a = Math.floor(yr / 100);
    const b = 2 - a + Math.floor(a / 4);
    const dayFraction = (d.getHours() + (d.getMinutes() + d.getSeconds() / 60) / 60) / 24;
    return (
      Math.floor(365.25 * (yr + 4716)) +
      Math.floor(30.6001 * (m + 1)) +
      d.getDate() +
      b -
      1524.5 +
      dayFraction -
      lon / (15 * 24)
    );
  }
  function sunPosition(jd: number) {
    const elapsed = jd - 2451545.0;
    const meanAnomaly = fix(357.529 + 0.98560028 * elapsed, 360.0);
    const meanLongitude = fix(280.459 + 0.98564736 * elapsed, 360.0);
    const anomRad = meanAnomaly * (Math.PI / 180);
    const sunLongitude = fix(
      meanLongitude + 1.915 * Math.sin(anomRad) + 0.02 * Math.sin(2 * anomRad),
      360.0
    );
    const obliquity = 23.439 - 0.00000036 * elapsed;
    const obRad = obliquity * (Math.PI / 180);
    const sunRad = sunLongitude * (Math.PI / 180);
    const rightAscension = fix(
      (Math.atan2(Math.cos(obRad) * Math.sin(sunRad), Math.cos(sunRad)) * (180 / Math.PI)) / 15.0,
      24.0
    );
    const declination = Math.asin(Math.max(-1, Math.min(1, Math.sin(obRad) * Math.sin(sunRad)))) * (180 / Math.PI);
    const equation = fix(meanLongitude / 15.0 - rightAscension, 24.0);
    return { declination, equation };
  }
  function midday(jd: number, portion: number) {
    return fix(12.0 - sunPosition(jd + portion).equation, 24.0);
  }
  function tryTimeAtAngle(
    jd: number,
    lat: number,
    angle: number,
    portion: number
  ): { hours: number; valid: boolean; ratio: number } {
    const { declination } = sunPosition(jd + portion);
    const angRad = angle * (Math.PI / 180);
    const decRad = declination * (Math.PI / 180);
    const latRad = lat * (Math.PI / 180);
    const num = -Math.sin(angRad) - Math.sin(decRad) * Math.sin(latRad);
    const den = Math.cos(decRad) * Math.cos(latRad);
    if (!Number.isFinite(den) || Math.abs(den) < 1e-9) {
      return { hours: midday(jd, portion), valid: false, ratio: num >= 0 ? 2 : -2 };
    }
    const ratio = num / den;
    if (!Number.isFinite(ratio) || ratio < -1.0 || ratio > 1.0) {
      return { hours: midday(jd, portion), valid: false, ratio };
    }
    const delta = (Math.acos(ratio) * (180 / Math.PI)) / 15.0;
    return {
      hours: midday(jd, portion) + (angle > 90.0 ? -delta : delta),
      valid: true,
      ratio,
    };
  }
  function tryAsrTime(jd: number, lat: number, portion: number): { hours: number; valid: boolean } {
    const { declination } = sunPosition(jd + portion);
    const diffRad = Math.abs(lat - declination) * (Math.PI / 180);
    const tanVal = Math.tan(Math.min(diffRad, (89.5 * Math.PI) / 180));
    const angle = -Math.atan(1.0 / (shadowFactor + tanVal)) * (180 / Math.PI);
    const res = tryTimeAtAngle(jd, lat, angle, portion);
    return { hours: res.hours, valid: res.valid };
  }

  const { fajrAngle, ishaAngle, ishaMinutesAfterSunset } = getMethodParams(method);
  const todayStr = toLocalDateString();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const rows: MonthPrayerDayRow[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekdayName = arShortWeekdayFormatter ? arShortWeekdayFormatter.format(d) : dateStr;
    const julian = julianDate(d, safeLng);
    const dayTzHours = timeZone ? getTimeZoneOffsetHours(d, timeZone) : safeFallbackTz;

    const portions = [5.0 / 24.0, 6.0 / 24.0, 12.0 / 24.0, 13.0 / 24.0, 18.0 / 24.0, 18.0 / 24.0];
    const dhuhr = midday(julian, portions[2]);

    const sunriseRes = tryTimeAtAngle(julian, calcLat, 180.0 - 0.833, portions[1]);
    const sunsetRes = tryTimeAtAngle(julian, calcLat, 0.833, portions[4]);
    let sunrise = sunriseRes.hours;
    let sunset = sunsetRes.hours;

    // Polar day / polar night fallback for sunrise & sunset
    if (!sunriseRes.valid || !sunsetRes.valid || sunset <= sunrise) {
      const halfDay = sunriseRes.ratio < -1.0 ? 8.5 : 3.0;
      sunrise = dhuhr - halfDay;
      sunset = dhuhr + halfDay;
    }

    const nightHours = Math.max(3.0, Math.min(20.0, fix(sunrise + 24.0 - sunset, 24.0)));

    const fajrRes = tryTimeAtAngle(julian, calcLat, 180.0 - fajrAngle, portions[0]);
    const fajrFallbackOffset = Math.min(nightHours / 3.0, Math.max(nightHours / 7.0, (fajrAngle / 60.0) * nightHours));
    const fajr = fajrRes.valid ? fajrRes.hours : sunrise - fajrFallbackOffset;

    const asrRes = tryAsrTime(julian, calcLat, portions[3]);
    const asr =
      asrRes.valid && asrRes.hours > dhuhr && asrRes.hours < sunset
        ? asrRes.hours
        : dhuhr + (sunset - dhuhr) * (asrHanafi ? 0.68 : 0.52);

    let isha: number;
    if (ishaMinutesAfterSunset !== null) {
      isha = sunset + ishaMinutesAfterSunset / 60.0;
    } else {
      const ishaRes = tryTimeAtAngle(julian, calcLat, ishaAngle, portions[5]);
      const ishaFallbackOffset = Math.min(nightHours / 3.0, Math.max(nightHours / 7.0, (ishaAngle / 60.0) * nightHours));
      isha = ishaRes.valid ? ishaRes.hours : sunset + ishaFallbackOffset;
    }

    const localize = (hours: number) => (hours + dayTzHours - safeLng / 15.0) * 60.0;

    let fajrM = Math.round(localize(fajr) + safeFajrOffset);
    let sunriseM = Math.round(localize(sunrise));
    let dhuhrM = Math.round(localize(dhuhr));
    let asrM = Math.round(localize(asr));
    let maghribM = Math.round(localize(sunset) + safeMaghribOffset);
    let ishaM = Math.round(localize(isha) + safeIshaOffset);

    // Normalize into [0, 1439] and guarantee strict finite chronological order
    const clampMin = (m: number, fallbackMin: number) => {
      if (!Number.isFinite(m)) return fallbackMin;
      return Math.max(0, Math.min(1439, m));
    };

    // Handle timezone wrap where all prayers shifted by ±1440 near date line
    if (dhuhrM < 0) {
      fajrM += 1440;
      sunriseM += 1440;
      dhuhrM += 1440;
      asrM += 1440;
      maghribM += 1440;
      ishaM += 1440;
    } else if (dhuhrM >= 1440) {
      fajrM -= 1440;
      sunriseM -= 1440;
      dhuhrM -= 1440;
      asrM -= 1440;
      maghribM -= 1440;
      ishaM -= 1440;
    }

    dhuhrM = clampMin(dhuhrM, 720);
    sunriseM = clampMin(sunriseM, Math.max(30, dhuhrM - 300));
    fajrM = clampMin(fajrM, Math.max(0, sunriseM - 75));
    if (fajrM >= sunriseM) fajrM = Math.max(0, sunriseM - 45);
    if (sunriseM >= dhuhrM) sunriseM = Math.max(fajrM + 15, dhuhrM - 60);
    asrM = clampMin(asrM, Math.min(1380, dhuhrM + 180));
    if (asrM <= dhuhrM) asrM = Math.min(1380, dhuhrM + 60);
    maghribM = clampMin(maghribM, Math.min(1410, asrM + 120));
    if (maghribM <= asrM) maghribM = Math.min(1410, asrM + 30);
    ishaM = clampMin(ishaM, Math.min(1439, maghribM + 75));
    if (ishaM <= maghribM) ishaM = Math.min(1439, maghribM + 60);
    if (maghribM >= ishaM) maghribM = Math.max(asrM + 1, ishaM - 30);

    rows.push({
      day,
      dateStr,
      weekdayName,
      isToday: dateStr === todayStr,
      times: [
        { key: 'fajr', nameAr: 'الفجر', minutes: fajrM, formatted: formatTimeMinutes(fajrM) },
        { key: 'sunrise', nameAr: 'الشروق', minutes: sunriseM, formatted: formatTimeMinutes(sunriseM) },
        { key: 'dhuhr', nameAr: 'الظهر', minutes: dhuhrM, formatted: formatTimeMinutes(dhuhrM) },
        { key: 'asr', nameAr: 'العصر', minutes: asrM, formatted: formatTimeMinutes(asrM) },
        { key: 'maghrib', nameAr: 'المغرب', minutes: maghribM, formatted: formatTimeMinutes(maghribM) },
        { key: 'isha', nameAr: 'العشاء', minutes: ishaM, formatted: formatTimeMinutes(ishaM) },
      ],
    });
  }

  return rows;
}

export function calculateWeekPrayerTable(
  fromDate: Date = new Date(),
  latitude: number = 30.0444,
  longitude: number = 31.2357,
  tzOffsetHours: number = 3,
  method: string = 'egypt',
  fajrOffset: number = 0,
  maghribOffset: number = 0,
  ishaOffset: number = 0,
  asrHanafi: boolean = false,
  timeZone?: string
): MonthPrayerDayRow[] {
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const dayOfWeek = start.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToSaturday = (dayOfWeek + 1) % 7;
  start.setDate(start.getDate() - diffToSaturday);

  const rows: MonthPrayerDayRow[] = [];
  const todayStr = toLocalDateString(fromDate);

  const monthCache = new Map<string, MonthPrayerDayRow[]>();
  const getMonthRows = (y: number, m: number) => {
    const key = `${y}-${m}`;
    let cached = monthCache.get(key);
    if (!cached) {
      cached = calculateMonthPrayerTable(
        y,
        m,
        latitude,
        longitude,
        tzOffsetHours,
        method,
        fajrOffset,
        maghribOffset,
        ishaOffset,
        asrHanafi,
        timeZone
      );
      monthCache.set(key, cached);
    }
    return cached;
  };

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const day = d.getDate();
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekdayName = formatArLongWeekday(d);

    const monthRows = getMonthRows(year, monthIndex);
    const dayRow = monthRows.find((r) => r.day === day);
    if (dayRow) {
      rows.push({
        ...dayRow,
        weekdayName,
        isToday: dateStr === todayStr,
      });
    }
  }
  return rows;
}

export function getTomorrowPrayerTimes(
  fromDate: Date = new Date(),
  latitude: number = 30.0444,
  longitude: number = 31.2357,
  tzOffsetHours: number = 3,
  method: string = 'egypt',
  fajrOffset: number = 0,
  maghribOffset: number = 0,
  ishaOffset: number = 0,
  asrHanafi: boolean = false,
  timeZone?: string
): MonthPrayerDayRow | null {
  const tomorrow = new Date(fromDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const monthIndex = tomorrow.getMonth();
  const day = tomorrow.getDate();
  const rows = calculateMonthPrayerTable(
    year,
    monthIndex,
    latitude,
    longitude,
    tzOffsetHours,
    method,
    fajrOffset,
    maghribOffset,
    ishaOffset,
    asrHanafi,
    timeZone
  );
  return rows.find((r) => r.day === day) || null;
}
