import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ActivityLogEntry } from '../api/client';

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

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [jobFilter, setJobFilter] = useState('');

  useEffect(() => {
    api.activity.list().then(setEntries);
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
            placeholder="Search action, detail, job, or user"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">All jobs</option>
            {jobs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>Job</th>
            <th>Action</th>
            <th>Detail</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.id}>
              <td className="muted">{new Date(e.createdAt).toLocaleString()}</td>
              <td>{e.userName ?? <span className="muted">system</span>}</td>
              <td>
                {e.jobId && e.jobName ? (
                  <Link to={`/jobs/${e.jobId}`}>{e.jobName}</Link>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>{prettifyAction(e.action)}</td>
              <td>{e.detail}</td>
              <td className="muted" title={e.userAgent ?? undefined}>{e.ipAddress ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="muted">No matching activity.</p>}
    </div>
  );
}
