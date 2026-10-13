import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CrewMyJob } from '../api/client';
import { WhereIcon } from '../components/Icons';
import MonthCalendar, { type CalendarEvent } from '../components/MonthCalendar';
import LocationLinks from '../components/LocationLinks';
import { formatDateRange, formatDayHeading, formatTime } from '../utils/format';
import { isPointInTime } from '../components/DayTimeline';

const NO_DATE = 'No date set yet';

function formatDateRangeOrNone(startsAt: string | null, endsAt: string | null): string {
  return startsAt ? formatDateRange(startsAt, endsAt) : NO_DATE;
}

/**
 * The crew member's schedule - a month calendar plus every job they're assigned to listed
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
    .map((j) => ({
      id: j.jobId,
      title: j.jobName,
      startsAt: j.startsAt!,
      endsAt: j.endsAt,
      href: `/crew/jobs/${j.jobId}`,
      crew: j.crew,
    }));

  return (
    <div>
      <h1>Your schedule</h1>
      {error && <p className="error">{error}</p>}
      {jobs === null && !error && <p className="muted">Loading…</p>}
      {jobs !== null && jobs.length === 0 && <p className="muted">You're not assigned to any jobs yet.</p>}

      {jobs !== null && jobs.length > 0 && (
        <>
          <NextCall jobs={jobs} />
          <div style={{ marginTop: '1rem' }}>
            <MonthCalendar events={events} />
          </div>

          <div className="panel" style={{ marginTop: '1.25rem' }}>
            <h3>Your jobs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {jobs.map((j) => {
                const dateRange = formatDateRangeOrNone(j.startsAt, j.endsAt);
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

/** The soonest booked day across every job: what, when the first call is, where, who else. */
function NextCall({ jobs }: { jobs: CrewMyJob[] }) {
  const next = jobs
    .filter((j) => j.nextDay)
    .sort((a, b) => new Date(a.nextDay!.date).getTime() - new Date(b.nextDay!.date).getTime())[0];
  if (!next?.nextDay) return null;
  const { nextDay } = next;
  const first = nextDay.items[0];
  // The admin-set call time for the day wins; otherwise the first thing they're on.
  const callAt = nextDay.callTime ?? (first ? formatTime(first.startsAt) : null);

  return (
    <section className="panel next-call" aria-label="Your next call">
      <p className="next-call-eyebrow">Next call time</p>
      <h2 className="next-call-when">
        {formatDayHeading(nextDay.date)}
        {callAt && <span> at {callAt}</span>}
      </h2>
      <p className="next-call-job">
        <Link to={`/crew/jobs/${next.jobId}`}>{next.jobName}</Link>
        <span className="chip chip-role">{next.role}</span>
        {nextDay.name && <span className="chip chip-neutral">{nextDay.name}</span>}
      </p>
      {nextDay.wrapTime && <p className="muted" style={{ margin: '0 0 0.5rem' }}>Estimated wrap {nextDay.wrapTime}</p>}
      {nextDay.items.length > 0 && (
        <ul className="plain-list next-call-items">
          {nextDay.items.map((i, idx) => (
            <li key={idx}>
              <span className="week-time">
                {formatTime(i.startsAt)}
                {i.endsAt && !isPointInTime(i) ? `–${formatTime(i.endsAt)}` : ''}
              </span>{' '}
              {i.title}
            </li>
          ))}
        </ul>
      )}
      {(next.venue || next.address) && (
        <div className="next-call-where">
          {next.venue && <div>{next.venue}</div>}
          <LocationLinks address={next.address} showMap={false} />
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>
        {nextDay.others.length > 0 ? `With ${nextDay.others.map((o) => `${o.name} (${o.role})`).join(', ')}` : "No one else is booked that day yet."}
      </p>
    </section>
  );
}
