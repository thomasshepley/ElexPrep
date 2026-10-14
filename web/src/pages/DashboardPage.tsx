import { useEffect, useState } from 'react';
import { Skeleton, SkeletonInline, SkeletonRegion, SkeletonRows, SkeletonText } from '../components/Skeleton';
import { Link } from 'react-router-dom';
import { api, type DashboardData } from '../api/client';
import MonthCalendar, { type CalendarEvent } from '../components/MonthCalendar';
import CrewSwatch from '../components/CrewSwatch';
import { dayKey, formatDateTime, formatDayHeading, formatDateRange, formatMoney, formatTime } from '../utils/format';
import { isPointInTime } from '../components/DayTimeline';
import { labelTypeName } from '../utils/labelTypes';

const NO_DATE = 'No date set';

function formatDateRangeOrNone(startsAt: string | null, endsAt: string | null): string {
  return startsAt ? formatDateRange(startsAt, endsAt) : NO_DATE;
}

function formatValue(value: number | null): string {
  return value === null ? '-' : formatMoney(value);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard
      .get()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const orders = data?.orders ?? null;

  const events: CalendarEvent[] = (orders ?? [])
    .filter((o) => o.startsAt)
    .map((o) => ({
      id: o.jobId,
      title: o.jobName,
      startsAt: o.startsAt!,
      endsAt: o.endsAt,
      href: `/jobs/${o.jobId}`,
      crew: o.crew,
    }));

  const totalValue = (orders ?? []).reduce((sum, o) => sum + (o.value ?? 0), 0);
  // With Current RMS off every value is null; "£0.00 total value" would read as broken.
  const hasValues = (orders ?? []).some((o) => o.value !== null);

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {orders === null ? <SkeletonInline w="8em" /> : `${orders.length} active order${orders.length === 1 ? '' : 's'}`}
            {hasValues && ` · ${formatValue(totalValue)} total value`}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {data && data.failedPrints.length > 0 && (
        <div className="panel panel-danger">
          <h3>Print jobs that failed</h3>
          <ul className="plain-list">
            {data.failedPrints.map((p) => (
              <li key={p.id}>
                <Link to={`/jobs/${p.jobId}`}>{p.jobName}</Link> - {labelTypeName(p.labelType)}{' '}
                <span className="muted">
                  ({formatDateTime(p.createdAt)}){p.error ? `: ${p.error}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data ? <ThisWeek days={data.thisWeek} /> : !error && <ThisWeekSkeleton />}

      <MonthCalendar events={events} />

      <div className="panel" style={{ marginTop: '1.25rem' }}>
        <h3>Active orders</h3>
        {orders === null && !error && (
          <SkeletonRegion>
            <SkeletonRows rows={3} cols={5} />
          </SkeletonRegion>
        )}
        {orders !== null && orders.length === 0 && (
          <p className="muted">No jobs are linked to a Current RMS order yet.</p>
        )}
        {orders !== null && orders.length > 0 && (
          <ul className="order-cards mobile-only">
            {orders.map((o) => (
              <li key={o.jobId}>
                <Link to={`/jobs/${o.jobId}`} className="order-card">
                  <strong>{o.jobName}</strong>
                  {o.venue && <span className="muted">{o.venue}</span>}
                  <span>{formatDateRangeOrNone(o.startsAt, o.endsAt)}</span>
                  <span className="muted">
                    {o.crewCount} crew{o.status ? ` · ${o.status}` : ''}
                    {o.value !== null ? ` · ${formatValue(o.value)}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {orders !== null && orders.length > 0 && (
          <div className="table-scroll desktop-only">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Venue</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Crew</th>
                  {hasValues && <th>Value</th>}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.jobId}>
                    <td>
                      <Link to={`/jobs/${o.jobId}`}>{o.jobName}</Link>
                    </td>
                    <td>{o.venue ?? '-'}</td>
                    <td>
                      <span className={o.startsAt ? 'chip chip-accent' : 'chip chip-neutral'}>
                        {formatDateRangeOrNone(o.startsAt, o.endsAt)}
                      </span>
                    </td>
                    <td className="muted">{o.status ?? '-'}</td>
                    <td>{o.crewCount}</td>
                    {hasValues && <td>{formatValue(o.value)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ThisWeekSkeleton() {
  return (
    <SkeletonRegion className="panel">
      <h3>This week</h3>
      <div className="week-strip">
        <section className="week-day">
          <Skeleton w="45%" h={12} style={{ marginBottom: 12 }} />
          <div className="week-entry">
            <Skeleton w="60%" h={16} style={{ marginBottom: 8 }} />
            <Skeleton w="35%" h={12} style={{ marginBottom: 12 }} />
            <SkeletonText lines={3} gap={10} />
            <div className="week-crew" style={{ marginTop: 12 }}>
              <Skeleton w={140} h={22} r={999} />
            </div>
          </div>
        </section>
      </div>
    </SkeletonRegion>
  );
}

/** The next seven days of job days: what's on, who's on it, and the day's timed entries. */
function ThisWeek({ days }: { days: DashboardData['thisWeek'] }) {
  const byDate = new Map<string, DashboardData['thisWeek']>();
  for (const d of days) {
    const key = dayKey(d.date);
    byDate.set(key, [...(byDate.get(key) ?? []), d]);
  }
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const heading = (key: string, date: string) =>
    key === todayKey ? `Today · ${formatDayHeading(date)}` : key === tomorrowKey ? `Tomorrow · ${formatDayHeading(date)}` : formatDayHeading(date);

  return (
    <div className="panel">
      <h3>This week</h3>
      {days.length === 0 ? (
        <p className="muted">Nothing scheduled in the next seven days. Days added on a job's Schedule tab show up here.</p>
      ) : (
        <div className="week-strip">
          {[...byDate.entries()].map(([key, entries]) => (
            <section key={key} className={`week-day${key === todayKey ? ' is-today' : ''}`}>
              <h4>{heading(key, entries[0].date)}</h4>
              {entries.map((d) => {
                const items = d.items.filter((i) => dayKey(i.startsAt) === key);
                return (
                <div key={d.id} className="week-entry">
                  <Link to={`/jobs/${d.jobId}`}>
                    <strong>{d.jobName}</strong>
                  </Link>
                  {d.venue && <div className="muted">{d.venue}</div>}
                  {items.length > 0 && (
                    <ul className="plain-list week-items">
                      {items.map((i) => (
                        <li key={i.id}>
                          <span className="week-time">
                            {formatTime(i.startsAt)}
                            {i.endsAt && !isPointInTime(i) ? `–${formatTime(i.endsAt)}` : ''}
                          </span>{' '}
                          {i.title}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="week-crew">
                    {d.crew.length === 0 ? (
                      <span className="muted">No crew on this day yet</span>
                    ) : (
                      d.crew.map((c) => <CrewSwatch key={c.id} name={c.name} role={c.role} color={c.color} />)
                    )}
                  </div>
                </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
