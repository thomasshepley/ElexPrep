import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CrewMyJob } from '../api/client';

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return 'No date set yet';
  const start = new Date(startsAt);
  const startStr = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (!endsAt || endsAt === startsAt) return startStr;
  const end = new Date(endsAt);
  const endStr = end.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${startStr} – ${endStr}`;
}

/**
 * The crew member's list-style schedule — every job they're assigned to, soonest first (jobs
 * without a synced date sort to the bottom rather than being hidden, since not every job is
 * linked to a Current RMS opportunity yet).
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

  return (
    <div>
      <h1>Your schedule</h1>
      {error && <p className="error">{error}</p>}
      {jobs === null && !error && <p className="muted">Loading…</p>}
      {jobs !== null && jobs.length === 0 && (
        <p className="muted">You're not assigned to any jobs yet.</p>
      )}
      {jobs !== null && jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {jobs.map((j) => (
            <Link key={j.jobId} to={`/crew/jobs/${j.jobId}`} className="panel" style={{ display: 'block', textDecoration: 'none' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{j.jobName}</h3>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {j.role}
                    {j.venue && ` · ${j.venue}`}
                  </p>
                </div>
                <span className="chip chip-accent">{formatDateRange(j.startsAt, j.endsAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
