/**
 * Minimal iCalendar (RFC 5545) writer for the crew portal's "Add to calendar" download - just
 * enough for phone calendars: all-day events for booked days and timed events for entries.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** All-day event on this calendar date (YYYY-MM-DD), or a timed event from start to end. */
  allDay?: string;
  start?: Date;
  end?: Date | null;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Lines over 75 octets are folded with CRLF + space, as the spec requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function nextDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function buildIcs(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ELEX//ELEX Portal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calendarName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${utcStamp(now)}`, `SUMMARY:${escapeText(e.summary)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${e.allDay.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${nextDate(e.allDay).replace(/-/g, '')}`);
    } else if (e.start) {
      lines.push(`DTSTART:${utcStamp(e.start)}`);
      lines.push(`DTEND:${utcStamp(e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000))}`);
    }
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
