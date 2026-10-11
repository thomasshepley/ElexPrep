import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
  href?: string;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_PER_DAY = 3;
const MAX_SPAN_DAYS = 60; // guards against a bad/unbounded endsAt expanding the bucket forever

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

/** Monday-start 6-week grid covering the given month, including the lead/trail days from adjacent months. */
function buildGridDays(year: number, month: number): Date[] {
  const first = startOfMonth(year, month);
  const firstWeekday = (first.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

/** Buckets events by the calendar day(s) they touch — a multi-day event appears on every day in its range. */
function bucketEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const start = new Date(ev.startsAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = ev.endsAt && !Number.isNaN(new Date(ev.endsAt).getTime()) ? new Date(ev.endsAt) : start;
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    let days = 0;
    while (cursor.getTime() <= last.getTime() && days < MAX_SPAN_DAYS) {
      const key = dateKey(cursor);
      const bucket = map.get(key) ?? [];
      bucket.push(ev);
      map.set(key, bucket);
      cursor.setDate(cursor.getDate() + 1);
      days++;
    }
  }
  return map;
}

/** A Google-Calendar-style month grid. Pass events with absolute ISO dates; navigation is purely client-side. */
export default function MonthCalendar({ events, initialMonth }: { events: CalendarEvent[]; initialMonth?: Date }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => initialMonth ?? today);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const gridDays = useMemo(() => buildGridDays(year, month), [year, month]);
  const buckets = useMemo(() => bucketEvents(events), [events]);
  const todayKey = dateKey(today);

  return (
    <div className="panel month-calendar">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <strong>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <div className="row" style={{ gap: '0.4rem' }}>
          <button className="secondary" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            ‹
          </button>
          <button className="secondary" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </button>
          <button className="secondary" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            ›
          </button>
        </div>
      </div>

      <div className="month-calendar-weekdays">
        {WEEKDAY_LABELS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="month-calendar-grid">
        {gridDays.map((d) => {
          const key = dateKey(d);
          const inMonth = d.getMonth() === month;
          const dayEvents = buckets.get(key) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_DAY);
          const overflow = dayEvents.length - visible.length;
          return (
            <div key={key} className={`month-calendar-day${inMonth ? '' : ' is-outside'}${key === todayKey ? ' is-today' : ''}`}>
              <span className="month-calendar-day-number">{d.getDate()}</span>
              <div className="month-calendar-events">
                {visible.map((ev) => {
                  const chip = <span className={`month-calendar-event chip chip-${ev.tone ?? 'accent'}`}>{ev.title}</span>;
                  return ev.href ? (
                    <Link key={ev.id} to={ev.href} className="month-calendar-event-link">
                      {chip}
                    </Link>
                  ) : (
                    <span key={ev.id}>{chip}</span>
                  );
                })}
                {overflow > 0 && <span className="month-calendar-event-more">+{overflow} more</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
