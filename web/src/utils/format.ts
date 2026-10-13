// Every user-facing date/time goes through here so the whole app reads the same way regardless
// of the viewer's browser locale: en-GB, 24-hour, e.g. "Thu 15 Oct", "19:00", "Thu 15 Oct 2026, 19:00".
const LOCALE = 'en-GB';

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const datePartsFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time24 = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
const longDayParts = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthYear = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' });

/** "Thu 15 Oct" - the year is added when it isn't the current one. */
export function formatDate(value: DateInput, opts: { withYear?: boolean } = {}): string {
  const d = toDate(value);
  if (!d) return '';
  const showYear = opts.withYear ?? d.getFullYear() !== new Date().getFullYear();
  // Assembled from parts because some ICU versions put a comma after the weekday ("Thu, 15 Oct").
  const parts = Object.fromEntries(datePartsFormat.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}${showYear ? ` ${parts.year}` : ''}`;
}

/** "19:00" */
export function formatTime(value: DateInput): string {
  const d = toDate(value);
  return d ? time24.format(d) : '';
}

/** "Thu 15 Oct, 19:00" */
export function formatDateTime(value: DateInput, opts: { withYear?: boolean } = {}): string {
  const d = toDate(value);
  return d ? `${formatDate(d, opts)}, ${formatTime(d)}` : '';
}

/** "Thursday 15 October 2026" */
export function formatLongDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const parts = Object.fromEntries(longDayParts.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** "Thursday 15 October" - a day heading, no year. */
export function formatDayHeading(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const parts = Object.fromEntries(longDayParts.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/** "October 2026" */
export function formatMonthYear(value: DateInput): string {
  const d = toDate(value);
  return d ? monthYear.format(d) : '';
}

/** "Thu 15 – Sat 17 Oct" style range; a single day when both ends fall on the same date. */
export function formatDateRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) return '';
  if (!s || !e) return formatDate(s ?? e);
  if (s.toDateString() === e.toDateString()) return formatDate(s);
  return `${formatDate(s)} – ${formatDate(e)}`;
}

/** "£1,250.00" */
export function formatMoney(value: number | null | undefined, currency = 'GBP'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(value);
}

/** Local "YYYY-MM-DD" key for grouping by calendar day. */
export function dayKey(value: DateInput): string {
  const d = toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Splits an ISO datetime into the values a <input type="date"> + <input type="time"> pair
 * expects (local time). Paired inputs avoid datetime-local, which renders in US order on some
 * browsers. */
export function toDateAndTimeInputs(iso: string | null | undefined): { date: string; time: string } {
  const d = toDate(iso);
  if (!d) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: dayKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Inverse of toDateAndTimeInputs - null when no date is set; a missing time means midnight. */
export function fromDateAndTimeInputs(date: string, time: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T${time || '00:00'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Value for a legacy <input type="datetime-local"> (local time, minutes precision). */
export function toDatetimeLocal(iso: string | null | undefined): string {
  const { date, time } = toDateAndTimeInputs(iso);
  return date ? `${date}T${time}` : '';
}

/** The server's "integration is turned off" / "job not linked" errors are an expected state, not a failure: pages
 * show them as a muted note and hide actions that can't work. */
export function isIntegrationOff(message: string | null | undefined): boolean {
  return Boolean(message && /integration is disabled|not linked to a Current RMS opportunity/i.test(message));
}
