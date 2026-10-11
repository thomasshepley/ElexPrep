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

/** A Google-Calendar-day-view-style vertical timeline for a job's schedule entries. */
export default function DayTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="muted">No schedule has been set for this job yet.</p>;
  }

  const sorted = [...items].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const starts = sorted.map((i) => minutesSinceMidnight(new Date(i.startsAt)));
  const ends = sorted.map((i) => {
    const start = new Date(i.startsAt);
    const end = i.endsAt ? new Date(i.endsAt) : new Date(start.getTime() + MIN_BLOCK_MIN * 60000);
    return Math.max(minutesSinceMidnight(end), minutesSinceMidnight(start) + MIN_BLOCK_MIN);
  });

  const dayStartHour = Math.max(0, Math.floor(Math.min(...starts) / 60) - 1);
  const dayEndHour = Math.min(24, Math.ceil(Math.max(...ends) / 60) + 1);
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
      {sorted.map((item) => {
        const start = new Date(item.startsAt);
        const end = item.endsAt ? new Date(item.endsAt) : null;
        const top = (minutesSinceMidnight(start) - dayStartHour * 60) * PX_PER_MIN;
        const durationMin = end ? Math.max(minutesSinceMidnight(end) - minutesSinceMidnight(start), MIN_BLOCK_MIN) : MIN_BLOCK_MIN;
        return (
          <div key={item.id} className="day-timeline-item" style={{ top, height: durationMin * PX_PER_MIN }}>
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
  );
}
