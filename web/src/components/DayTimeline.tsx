import { useMemo, useState } from 'react';

export interface TimelineItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  notes?: string | null;
}

const PX_PER_MIN = 1.1;
const MIN_BLOCK_MIN = 30; // a point-in-time entry (no endsAt) still gets a visible block

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Also used by JobSchedulePanel/DayBlocksColumn to match schedule items to day blocks - always
 * bucket by local calendar day (not UTC), consistent with how the hour-by-hour view below
 * already splits a multi-day job's items. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TimedItem extends TimelineItem {
  startMin: number;
  endMin: number;
}

interface LaidOutItem extends TimedItem {
  col: number;
  colCount: number;
}

/**
 * Assigns each item a column (and the column count of its overlap cluster) so entries whose
 * times overlap render side by side instead of stacked on top of each other - the same
 * layout Google Calendar's day view uses. `items` must already be sorted by start time, and
 * must all belong to the same calendar day - see DayTimeline below, which groups by date
 * before calling this, since two items on different days are never really "overlapping" even
 * if they happen to share the same time-of-day.
 */
function layoutColumns(items: TimedItem[]): LaidOutItem[] {
  // Split into overlap clusters first: a sweep over start-sorted items where an item starting
  // at or after the running max end-so-far can't overlap anything already in the cluster.
  const clusters: TimedItem[][] = [];
  let current: TimedItem[] = [];
  let clusterEnd = -Infinity;
  for (const item of items) {
    if (current.length > 0 && item.startMin >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -Infinity;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (current.length > 0) clusters.push(current);

  const result: LaidOutItem[] = [];
  for (const cluster of clusters) {
    // Greedy column assignment within the cluster: each column remembers the end time of the
    // last item placed in it; an item reuses the first column that's already free by its start.
    const columnEnds: number[] = [];
    const placements: { item: TimedItem; col: number }[] = [];
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[col] = item.endMin;
      }
      placements.push({ item, col });
    }
    const colCount = columnEnds.length;
    for (const { item, col } of placements) result.push({ ...item, col, colCount });
  }
  return result;
}

/** A single day's Google-Calendar-day-view-style vertical timeline. `items` must all fall on
 * the same calendar day - DayTimeline (below) handles splitting a multi-day job's items into
 * one of these per day. */
export function SingleDayTimeline({ items }: { items: TimelineItem[] }) {
  const sorted = [...items].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const timed: TimedItem[] = sorted.map((item) => {
    const startMin = minutesSinceMidnight(new Date(item.startsAt));
    const endMin = item.endsAt
      ? Math.max(minutesSinceMidnight(new Date(item.endsAt)), startMin + MIN_BLOCK_MIN)
      : startMin + MIN_BLOCK_MIN;
    return { ...item, startMin, endMin };
  });
  const laidOut = layoutColumns(timed);

  const dayStartHour = Math.max(0, Math.floor(Math.min(...timed.map((i) => i.startMin)) / 60) - 1);
  const dayEndHour = Math.min(24, Math.ceil(Math.max(...timed.map((i) => i.endMin)) / 60) + 1);
  const hours = Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => dayStartHour + i);
  const totalHeight = (dayEndHour - dayStartHour) * 60 * PX_PER_MIN;

  return (
    <div className="day-timeline" style={{ height: totalHeight }}>
      {hours.map((h) => (
        <div key={h} className="day-timeline-hour" style={{ top: (h - dayStartHour) * 60 * PX_PER_MIN }}>
          <span className="day-timeline-hour-label">{String(h).padStart(2, '0')}:00</span>
          <div className="day-timeline-hour-line" />
        </div>
      ))}
      <div className="day-timeline-track">
        {laidOut.map((item) => {
          const start = new Date(item.startsAt);
          const end = item.endsAt ? new Date(item.endsAt) : null;
          const top = (item.startMin - dayStartHour * 60) * PX_PER_MIN;
          const durationMin = item.endMin - item.startMin;
          const widthPct = 100 / item.colCount;
          return (
            <div
              key={item.id}
              className="day-timeline-item"
              style={{
                top,
                minHeight: durationMin * PX_PER_MIN,
                left: `${item.col * widthPct}%`,
                width: `calc(${widthPct}% - 6px)`,
              }}
            >
              <div className="day-timeline-item-time">
                {formatTime(start)}
                {end && ` – ${formatTime(end)}`}
              </div>
              <div className="day-timeline-item-title">{item.title}</div>
              {item.notes && <div className="day-timeline-item-notes">{item.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A job's day-by-day schedule, split into one calendar day per tab. Items are laid out by
 * minutes-since-midnight within a day (see SingleDayTimeline/layoutColumns), which only makes
 * sense when every item being compared actually falls on the same date - grouping by date
 * first (rather than rendering every item from every day on one shared time axis, as this
 * component used to) is what stops a multi-day job's entries from appearing to overlap just
 * because e.g. "Load in" on day 1 and "Show" on day 2 both start at 09:00.
 */
export default function DayTimeline({ items }: { items: TimelineItem[] }) {
  const days = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const key = dateKey(new Date(item.startsAt));
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected && days.some(([key]) => key === selected) ? selected : days[0]?.[0] ?? null;
  const activeItems = days.find(([key]) => key === activeKey)?.[1] ?? [];

  if (items.length === 0) {
    return <p className="muted">No schedule has been set for this job yet.</p>;
  }

  return (
    <div>
      {days.length > 1 && (
        <div className="row" style={{ gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          {days.map(([key]) => (
            <button
              key={key}
              className={key === activeKey ? '' : 'secondary'}
              onClick={() => setSelected(key)}
            >
              {new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>
          ))}
        </div>
      )}
      {activeKey && <SingleDayTimeline items={activeItems} />}
    </div>
  );
}
