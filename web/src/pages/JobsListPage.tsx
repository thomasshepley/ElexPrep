import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Job } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PlusIcon, SearchIcon, WhereIcon } from '../components/Icons';

export default function JobsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canCreate = isAdmin || Boolean(user?.permissions?.createJobs);
  const canDelete = isAdmin || Boolean(user?.permissions?.deleteJobs);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [showCreate, setShowCreate] = useState(false);
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
      setShowCreate(false);
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
      <div className="dashboard-header">
        <div>
          <h1>Jobs</h1>
          <p className="muted">{jobs.length === 0 ? 'Nothing here yet' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setShowCreate((s) => !s)} className="row" style={{ gap: '0.4rem' }}>
            <PlusIcon /> New job
          </button>
        )}
      </div>

      {canCreate && showCreate && (
        <div className="panel">
          <h3>New job</h3>
          <p className="muted">
            Or import one directly from an opportunity in <Link to="/settings/current-rms">Settings → Current RMS</Link>.
          </p>
          <form onSubmit={createJob}>
            <div className="row" style={{ alignItems: 'flex-end', gap: '0.9rem' }}>
              <div className="field" style={{ width: '14rem' }}>
                <label htmlFor="new-job-name">Job name</label>
                <input id="new-job-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
              </div>
              <div className="field" style={{ width: '14rem' }}>
                <label htmlFor="new-job-venue">Venue</label>
                <input id="new-job-venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Optional" />
              </div>
              <button type="submit">Create job</button>
            </div>
          </form>
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="toolbar">
          <div className="search-field">
            <SearchIcon />
            <input placeholder="Search jobs by name or venue" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No jobs yet{canCreate ? ' — create one above to get started.' : '.'}</p>
        </div>
      )}
      {jobs.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>No jobs match "{search}".</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="job-grid">
          {filtered.map((job) => (
            <div key={job.id} className="job-card" style={{ position: 'relative' }}>
              <Link to={`/jobs/${job.id}`} className="job-card-stretched-link" aria-label={job.name} />
              <div className="job-card-top">
                <h3>{job.name}</h3>
                {canDelete && (
                  <button className="secondary job-card-delete" onClick={(e) => removeJob(job, e)}>
                    Delete
                  </button>
                )}
              </div>
              {job.venue && (
                <div className="job-card-venue">
                  <WhereIcon /> {job.venue}
                </div>
              )}
              <div className="job-card-tags">
                {isAdmin && <span className={`chip ${job.isPublic ? 'chip-success' : 'chip-neutral'}`}>{job.isPublic ? 'Public' : 'Private'}</span>}
                {job.rmsAlertAt && <span className="chip chip-warning">RMS changed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
