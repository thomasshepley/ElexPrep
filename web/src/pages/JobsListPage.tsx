import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Job } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function JobsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
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

      <div>
        {jobs.length === 0 && <p className="muted">No jobs yet{isAdmin ? ' — create one above.' : '.'}</p>}
        {jobs.map((job) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className="job-card">
            <strong>{job.name}</strong>
            {job.venue && <span className="muted"> — {job.venue}</span>}
            {isAdmin && !job.isPublic && <span className="muted"> (private)</span>}
            {job.rmsAlertAt && <span className="error"> • RMS changed</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
