import React from 'react';
import { Check } from 'lucide-react';
import { toLocalDateString } from './domain/formatters';

export const prayerKeys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const digits = (value: string | number) =>
  String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

export const formatMinutes = (minutes: number) => {
  const normalized = (minutes + 1440) % 1440;
  const h24 = Math.floor(normalized / 60);
  const period = h24 >= 12 ? 'م' : 'ص';
  return `${digits(String(h24 % 12 || 12).padStart(2, '0'))}:${digits(
    String(normalized % 60).padStart(2, '0')
  )} ${period}`;
};

export const dateKey = () => toLocalDateString();

export const isDateToday = (d?: string | null) =>
  Boolean(d && d === toLocalDateString());

export const PRE_PRAYER_LEAD_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 60, label: 'ساعة' },
  { minutes: 30, label: 'نصف ساعة' },
  { minutes: 20, label: 'ثلث ساعة' },
  { minutes: 15, label: 'ربع ساعة' },
  { minutes: 10, label: '١٠ دقائق' },
  { minutes: 5, label: '٥ دقائق' },
];

export function getLeadLabel(minutes: number): string {
  const match = PRE_PRAYER_LEAD_OPTIONS.find((o) => o.minutes === minutes);
  if (match) return match.label;
  return `${digits(minutes)} دقيقة`;
}

export function PageTitle({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}

export function CheckButton({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      className={`check-button ${done ? 'done' : ''}`}
      onClick={onClick}
      aria-pressed={done}
    >
      <span>{done ? <Check size={16} /> : null}</span>
      {label}
    </button>
  );
}
