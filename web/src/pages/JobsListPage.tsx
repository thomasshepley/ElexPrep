import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Job } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function JobsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobs.list().then(setJobs).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

  const createJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.jobs.create({ name, venue: venue || undefined });
      setName('');
      setVenue('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeJob = async (job: Job, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete job "${job.name}"? This removes its patch, cases, labels, plots, and print history too.`)) {
      return;
    }
    await api.jobs.remove(job.id);
    refresh();
  };

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const q = search.toLowerCase();
    return jobs.filter((j) => j.name.toLowerCase().includes(q) || (j.venue ?? '').toLowerCase().includes(q));
  }, [jobs, search]);

  return (
    <div>
      <h1>Jobs</h1>
      {isAdmin && (
        <div className="panel">
          <h3>New job</h3>
          <p className="muted">
            Or import one directly from an opportunity in{' '}
            <Link to="/settings/current-rms">Settings → Current RMS</Link>.
          </p>
          <form className="row" onSubmit={createJob}>
            <input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input placeholder="Venue (optional)" value={venue} onChange={(e) => setVenue(e.target.value)} />
            <button type="submit">Create job</button>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {jobs.length > 0 && (
        <input
          placeholder="Search jobs by name or venue"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: '0.75rem', width: '100%', maxWidth: 360 }}
        />
      )}

      <div>
        {jobs.length === 0 && <p className="muted">No jobs yet{isAdmin ? ' — create one above.' : '.'}</p>}
        {jobs.length > 0 && filtered.length === 0 && <p className="muted">No jobs match "{search}".</p>}
        {filtered.map((job) => (
          <div
            key={job.id}
            className="job-card"
            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'space-between' }}
          >
            <Link to={`/jobs/${job.id}`} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>
              <strong>{job.name}</strong>
              {job.venue && <span className="muted"> — {job.venue}</span>}
              {isAdmin && !job.isPublic && <span className="muted"> (private)</span>}
              {job.rmsAlertAt && <span className="error"> • RMS changed</span>}
            </Link>
            {isAdmin && (
              <button className="secondary" onClick={(e) => removeJob(job, e)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
