import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import CrewSwatch from './CrewSwatch';
import { formatDayHeading, formatMonthYear } from '../utils/format';

export interface CalendarEventCrew {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
  href?: string;
  crew?: CalendarEventCrew[];
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_PER_DAY = 3;
const MAX_VISIBLE_CREW_PER_DAY = 6;
const MAX_SPAN_DAYS = 60; // guards against a bad/unbounded endsAt expanding the bucket forever

/** Every crew member working any event on this day, deduped by id across overlapping jobs. */
function uniqueCrew(dayEvents: CalendarEvent[]): CalendarEventCrew[] {
  const seen = new Map<string, CalendarEventCrew>();
  for (const ev of dayEvents) {
    for (const c of ev.crew ?? []) {
      if (!seen.has(c.id)) seen.set(c.id, c);
    }
  }
  return [...seen.values()];
}

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

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** An event's first and last calendar day (local), or null for an unreadable date. */
function eventDays(ev: CalendarEvent): { first: Date; last: Date } | null {
  const start = new Date(ev.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = ev.endsAt && !Number.isNaN(new Date(ev.endsAt).getTime()) ? new Date(ev.endsAt) : start;
  const first = dayStart(start);
  let last = dayStart(end < start ? start : end);
  const cap = new Date(first.getFullYear(), first.getMonth(), first.getDate() + MAX_SPAN_DAYS - 1);
  if (last > cap) last = cap;
  return { first, last };
}

/** Buckets events by the calendar day(s) they touch - a multi-day event appears on every day in its range. */
function bucketEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const range = eventDays(ev);
    if (!range) continue;
    for (const cursor = new Date(range.first); cursor <= range.last; cursor.setDate(cursor.getDate() + 1)) {
      const key = dateKey(cursor);
      map.set(key, [...(map.get(key) ?? []), ev]);
    }
  }
  return map;
}

/** Separate entries for the same thing on back-to-back days become one event, drawn as one bar. */
function mergeConsecutive(events: CalendarEvent[]): CalendarEvent[] {
  const groups = new Map<string, { ev: CalendarEvent; first: Date; last: Date }[]>();
  const loose: CalendarEvent[] = [];
  for (const ev of events) {
    const range = eventDays(ev);
    if (!range) {
      loose.push(ev);
      continue;
    }
    const key = `${ev.href ?? ''}|${ev.title}|${ev.tone ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), { ev, ...range }]);
  }
  const out: CalendarEvent[] = [...loose];
  for (const list of groups.values()) {
    list.sort((a, b) => a.first.getTime() - b.first.getTime());
    let cur = { ...list[0] };
    for (const next of list.slice(1)) {
      if (daysBetween(cur.last, next.first) <= 1) {
        if (next.last > cur.last) cur.last = next.last;
        const crew = new Map([...(cur.ev.crew ?? []), ...(next.ev.crew ?? [])].map((c) => [c.id, c]));
        cur.ev = { ...cur.ev, crew: [...crew.values()] };
      } else {
        out.push({ ...cur.ev, startsAt: cur.first.toISOString(), endsAt: cur.last.toISOString() });
        cur = { ...next };
      }
    }
    out.push({ ...cur.ev, startsAt: cur.first.toISOString(), endsAt: cur.last.toISOString() });
  }
  return out;
}

interface WeekSegment {
  ev: CalendarEvent;
  /** Columns 0 (Monday) to 6 this piece of the event covers in the week. */
  from: number;
  to: number;
  /** The event carries on from the week before / into the week after. */
  continuesBefore: boolean;
  continuesAfter: boolean;
  lane: number;
}

const DAY_MS = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.round((dayStart(b).getTime() - dayStart(a).getTime()) / DAY_MS);

/**
 * One week row's events as bars: a multi-day event is one bar across the days it covers (like
 * Google Calendar), laid out in lanes so bars never overlap. Longer events take the top lanes.
 */
function layoutWeek(events: CalendarEvent[], weekStart: Date): WeekSegment[] {
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const segments: Omit<WeekSegment, 'lane'>[] = [];
  for (const ev of events) {
    const range = eventDays(ev);
    if (!range || range.last < weekStart || range.first > weekEnd) continue;
    const from = Math.max(0, daysBetween(weekStart, range.first));
    const to = Math.min(6, daysBetween(weekStart, range.last));
    segments.push({ ev, from, to, continuesBefore: range.first < weekStart, continuesAfter: range.last > weekEnd });
  }
  segments.sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from) || a.ev.title.localeCompare(b.ev.title));
  const laneEnds: number[] = [];
  return segments.map((seg) => {
    let lane = laneEnds.findIndex((end) => end < seg.from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = seg.to;
    return { ...seg, lane };
  });
}

/** A Google-Calendar-style month grid. Pass events with absolute ISO dates; navigation is purely client-side. */
export default function MonthCalendar({ events, initialMonth }: { events: CalendarEvent[]; initialMonth?: Date }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => initialMonth ?? today);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const gridDays = useMemo(() => buildGridDays(year, month), [year, month]);
  const merged = useMemo(() => mergeConsecutive(events), [events]);
  const buckets = useMemo(() => bucketEvents(merged), [merged]);
  const todayKey = dateKey(today);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const openDayEvents = openDayKey ? buckets.get(openDayKey) ?? [] : [];

  return (
    <div className="panel month-calendar">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <strong>{formatMonthYear(cursor)}</strong>
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
        {Array.from({ length: 6 }, (_, w) => {
          const weekDays = gridDays.slice(w * 7, w * 7 + 7);
          const segments = layoutWeek(merged, weekDays[0]);
          const shown = segments.filter((seg) => seg.lane < MAX_VISIBLE_PER_DAY);
          return (
            <div key={dateKey(weekDays[0])} className="month-calendar-week">
              {weekDays.map((d, col) => {
                const key = dateKey(d);
                const inMonth = d.getMonth() === month;
                const dayEvents = buckets.get(key) ?? [];
                const hidden = segments.filter((seg) => seg.lane >= MAX_VISIBLE_PER_DAY && seg.from <= col && seg.to >= col).length;
                const dayCrew = uniqueCrew(dayEvents);
                const visibleCrew = dayCrew.slice(0, MAX_VISIBLE_CREW_PER_DAY);
                const crewOverflow = dayCrew.length - visibleCrew.length;
                return (
                  <div
                    key={key}
                    className={`month-calendar-day${inMonth ? '' : ' is-outside'}${key === todayKey ? ' is-today' : ''}`}
                    style={{ gridColumn: col + 1, cursor: dayEvents.length > 0 ? 'pointer' : undefined }}
                    onClick={() => dayEvents.length > 0 && setOpenDayKey(key)}
                  >
                    <span className="month-calendar-day-number">{d.getDate()}</span>
                    {hidden > 0 && (
                      <span className="month-calendar-event-more" aria-label={`${hidden} more`}>
                        +{hidden}
                        <span className="month-calendar-more-word"> more</span>
                      </span>
                    )}
                    {dayCrew.length > 0 && (
                      <div className="month-calendar-day-crew">
                        {visibleCrew.map((c) => (
                          <span key={c.id} className="month-calendar-crew-dot" style={{ background: c.color }} title={`${c.name} · ${c.role}`} />
                        ))}
                        {crewOverflow > 0 && <span className="month-calendar-crew-more">+{crewOverflow}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {shown.map((seg) => {
                const cls = `month-calendar-event chip chip-${seg.ev.tone ?? 'accent'}${seg.continuesBefore ? ' continues-before' : ''}${seg.continuesAfter ? ' continues-after' : ''}`;
                const style = { gridColumn: `${seg.from + 1} / ${seg.to + 2}`, gridRow: seg.lane + 2 };
                const span = seg.to - seg.from + 1;
                const label = (
                  <span className={cls} title={seg.ev.title}>
                    {seg.ev.title}
                  </span>
                );
                return seg.ev.href ? (
                  <Link
                    key={`${seg.ev.id}:${w}`}
                    to={seg.ev.href}
                    className="month-calendar-event-link"
                    style={style}
                    aria-label={span > 1 ? `${seg.ev.title}, ${span} days` : seg.ev.title}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {label}
                  </Link>
                ) : (
                  <span key={`${seg.ev.id}:${w}`} className="month-calendar-event-link" style={style}>
                    {label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {openDayKey && (
        <Modal
          title={formatDayHeading(`${openDayKey}T00:00:00`)}
          onClose={() => setOpenDayKey(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {openDayEvents.map((ev) => (
              <div key={ev.id}>
                {ev.href ? (
                  <Link to={ev.href} onClick={() => setOpenDayKey(null)} style={{ fontWeight: 600 }}>
                    {ev.title}
                  </Link>
                ) : (
                  <strong>{ev.title}</strong>
                )}
                <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {!ev.crew || ev.crew.length === 0 ? (
                    <span className="muted">No crew assigned yet.</span>
                  ) : (
                    ev.crew.map((c) => <CrewSwatch key={c.id} name={c.name} role={c.role} color={c.color} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
