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
 * times overlap render side by side instead of stacked on top of each other — the same
 * layout Google Calendar's day view uses. `items` must already be sorted by start time.
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

/** A Google-Calendar-day-view-style vertical timeline for a job's schedule entries. */
export default function DayTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="muted">No schedule has been set for this job yet.</p>;
  }

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
