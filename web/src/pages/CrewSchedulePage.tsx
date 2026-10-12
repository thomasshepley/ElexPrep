import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CrewMyJob } from '../api/client';
import { WhereIcon } from '../components/Icons';
import MonthCalendar, { type CalendarEvent } from '../components/MonthCalendar';

const NO_DATE = 'No date set yet';

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return NO_DATE;
  const start = new Date(startsAt);
  const startStr = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (!endsAt) return startStr;
  const end = new Date(endsAt);
  const endStr = end.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return endStr === startStr ? startStr : `${startStr} – ${endStr}`;
}

/**
 * The crew member's schedule — a month calendar plus every job they're assigned to listed
 * below it (soonest first; jobs without a synced date sort to the bottom rather than being
 * hidden, since not every job is linked to a Current RMS opportunity yet), mirroring the
 * admin dashboard's calendar-plus-list layout rather than making List a separate tab.
 */
export default function CrewSchedulePage() {
  const [jobs, setJobs] = useState<CrewMyJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.crewPortal
      .myJobs()
      .then(setJobs)
      .catch((e) => setError(e.message));
  }, []);

  const events: CalendarEvent[] = (jobs ?? [])
    .filter((j) => j.startsAt)
    .map((j) => ({ id: j.jobId, title: j.jobName, startsAt: j.startsAt!, endsAt: j.endsAt, href: `/crew/jobs/${j.jobId}` }));

  return (
    <div>
      <h1>Your schedule</h1>
      {error && <p className="error">{error}</p>}
      {jobs === null && !error && <p className="muted">Loading…</p>}
      {jobs !== null && jobs.length === 0 && <p className="muted">You're not assigned to any jobs yet.</p>}

      {jobs !== null && jobs.length > 0 && (
        <>
          <div style={{ marginTop: '1rem' }}>
            <MonthCalendar events={events} />
          </div>

          <div className="panel" style={{ marginTop: '1.25rem' }}>
            <h3>Your jobs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {jobs.map((j) => {
                const dateRange = formatDateRange(j.startsAt, j.endsAt);
                return (
                  <Link key={j.jobId} to={`/crew/jobs/${j.jobId}`} className="job-card">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{j.jobName}</h3>
                        <div className="row" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
                          <span className="chip chip-role">{j.role}</span>
                          {j.venue && (
                            <span className="row muted" style={{ gap: '0.3rem', fontSize: 'var(--text-xs)' }}>
                              <WhereIcon /> {j.venue}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={dateRange === NO_DATE ? 'chip chip-neutral' : 'chip chip-accent'}>{dateRange}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
