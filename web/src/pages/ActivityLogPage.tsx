import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ActivityLogEntry } from '../api/client';
import { formatDateTime } from '../utils/format';

const ACRONYMS: Record<string, string> = {
  rms: 'RMS',
  pdf: 'PDF',
  sacn: 'sACN',
  dmx: 'DMX',
  pal: 'PAL',
  ip: 'IP',
};

function prettifyAction(action: string): string {
  return action
    .split('.')
    .map((part) =>
      part
        .split('_')
        .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    )
    .join(' → ');
}

// ISO timestamps inside details ("startsAt: 2026-10-15T09:00:00.000Z") read as en-GB times.
const ISO_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g;

function readableDetail(detail: string | null): string | null {
  return detail ? detail.replace(ISO_PATTERN, (iso) => formatDateTime(iso)) : detail;
}

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [showIp, setShowIp] = useState(false);

  const load = async (before?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.activity.list({ before });
      setEntries((prev) => (before ? [...prev, ...page.entries] : page.entries));
      setNextCursor(page.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jobs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.jobId && e.jobName) seen.set(e.jobId, e.jobName);
    }
    return [...seen.entries()];
  }, [entries]);

  const filtered = entries.filter((e) => {
    if (jobFilter && e.jobId !== jobFilter) return false;
    if (!search) return true;
    const haystack = `${e.action} ${e.detail ?? ''} ${e.userName ?? ''} ${e.jobName ?? ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div>
      <h1>Activity log</h1>
      <div className="panel">
        <div className="row">
          <input
            aria-label="Search activity"
            placeholder="Search action, detail, job, or user"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <select aria-label="Job" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">All jobs</option>
            {jobs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <label className="row" style={{ gap: '0.4rem' }}>
            <input type="checkbox" checked={showIp} onChange={(e) => setShowIp(e.target.checked)} />
            Show IP addresses
          </label>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Job</th>
              <th>Action</th>
              <th>Detail</th>
              {showIp && <th>IP</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td className="muted">{formatDateTime(e.createdAt)}</td>
                <td>{e.userName ?? <span className="muted">system</span>}</td>
                <td>
                  {e.jobId && e.jobName ? (
                    <Link to={`/jobs/${e.jobId}`}>{e.jobName}</Link>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td>{prettifyAction(e.action)}</td>
                <td>{readableDetail(e.detail)}</td>
                {showIp && (
                  <td className="muted" title={e.userAgent ?? undefined}>
                    {e.ipAddress ?? '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && filtered.length === 0 && <p className="muted">No matching activity.</p>}
      {loading && <p className="muted">Loading…</p>}
      {nextCursor && !loading && (
        <button type="button" className="secondary" style={{ marginTop: 'var(--space-3)' }} onClick={() => load(nextCursor)}>
          Load older activity
        </button>
      )}
    </div>
  );
}
