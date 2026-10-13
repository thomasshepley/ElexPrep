import { resolveCrewColor } from '@elexprep/shared';
import type { JobDay } from '../api/client';

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The crew portal's read-only mirror of the admin Schedule tab's day-blocks overview (see
 * DayBlocksColumn.tsx) - same cards, same per-day crew swatches, but no roster strip, no drag
 * handles, and no add/remove controls. A crew member can see the job's full day-by-day shape
 * and who else is working which day; only an admin (or someone with manageCrewAssignments) can
 * actually change any of it.
 */
export default function DayBlocksReadOnly({ days }: { days: JobDay[] }) {
  if (days.length === 0) {
    return <p className="muted">No days have been added to this job yet.</p>;
  }
  return (
    <div className="day-blocks-list day-blocks-readonly">
      {days.map((day) => (
        <div key={day.id} className="day-block day-block-readonly">
          <div className="day-block-header">
            <span className="day-block-date">{formatDayLabel(day.date)}</span>
          </div>
          <div className="day-block-crew">
            {day.crew.length === 0 ? (
              <span className="muted day-block-crew-empty">No crew assigned yet</span>
            ) : (
              day.crew.map((c) => (
                <span key={c.id} className="day-block-crew-chip">
                  <span className="crew-swatch-dot" style={{ background: resolveCrewColor(c.crewProfileId, c.color) }} />
                  {c.displayName}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
