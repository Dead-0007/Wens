export function formatArabicDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const arBacklogDateFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
})();

export const arFullDateFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
})();

export const arLongWeekdayFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });
  } catch {
    return null;
  }
})();

export const arShortWeekdayFormatter = (() => {
  try {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
  } catch {
    return null;
  }
})();

export const formatArLongWeekday = (d: Date): string =>
  arLongWeekdayFormatter ? arLongWeekdayFormatter.format(d) : toLocalDateString(d);

export function formatBacklogDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  if (!d) return dateStr;
  try {
    return arBacklogDateFormatter ? arBacklogDateFormatter.format(d) : dateStr;
  } catch {
    return dateStr;
  }
}

export function formatArabicDateDisplay(date: Date): string {
  try {
    return arFullDateFormatter ? arFullDateFormatter.format(date) : toLocalDateString(date);
  } catch {
    return toLocalDateString(date);
  }
}

export function formatTimeMinutes(minutes: number): string {
  const normalized = (minutes + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const period = h24 >= 12 ? 'م' : 'ص';
  return `${formatArabicDigits(String(h24 % 12 || 12).padStart(2, '0'))}:${formatArabicDigits(
    String(normalized % 60).padStart(2, '0')
  )} ${period}`;
}

export function formatDiffDaysToCountdown(diffDays: number, isToday: boolean = false): string {
  if (isToday || diffDays <= 0) return 'اليوم هو موعد الصيام!';
  if (diffDays === 1) return 'غدًا (متبقي يوم واحد)';
  if (diffDays === 2) return 'متبقي يومان';
  const digits = (v: number) => String(v).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  if (diffDays >= 3 && diffDays <= 10) return `متبقي ${digits(diffDays)} أيام`;
  return `متبقي ${digits(diffDays)} يوماً`;
}
