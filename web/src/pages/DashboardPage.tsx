import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DashboardOrder } from '../api/client';
import MonthCalendar, { type CalendarEvent } from '../components/MonthCalendar';

const NO_DATE = 'No date set';

function formatDateRange(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return NO_DATE;
  const start = new Date(startsAt);
  const startStr = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  if (!endsAt) return startStr;
  const end = new Date(endsAt);
  const endStr = end.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return endStr === startStr ? startStr : `${startStr} – ${endStr}`;
}

function formatValue(value: number | null): string {
  if (value === null) return '-';
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard
      .get()
      .then((d) => setOrders(d.orders))
      .catch((e) => setError(e.message));
  }, []);

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

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {orders === null ? 'Loading…' : `${orders.length} active order${orders.length === 1 ? '' : 's'}`}
            {orders && orders.length > 0 && ` · ${formatValue(totalValue)} total value`}
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <MonthCalendar events={events} />

      <div className="panel" style={{ marginTop: '1.25rem' }}>
        <h3>Active orders</h3>
        {orders !== null && orders.length === 0 && (
          <p className="muted">No jobs are linked to a Current RMS order yet.</p>
        )}
        {orders !== null && orders.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Venue</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Crew</th>
                  <th>Value</th>
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
                        {formatDateRange(o.startsAt, o.endsAt)}
                      </span>
                    </td>
                    <td className="muted">{o.status ?? '-'}</td>
                    <td>{o.crewCount}</td>
                    <td>{formatValue(o.value)}</td>
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
