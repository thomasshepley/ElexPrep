import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Job } from '../api/client';

export default function JobsListPage() {
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
      <div className="panel">
        <h3>New job</h3>
        <form className="row" onSubmit={createJob}>
          <input placeholder="Job name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Venue (optional)" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <button type="submit">Create job</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div>
        {jobs.length === 0 && <p className="muted">No jobs yet — create one above.</p>}
        {jobs.map((job) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className="job-card">
            <strong>{job.name}</strong>
            {job.venue && <span className="muted"> — {job.venue}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
