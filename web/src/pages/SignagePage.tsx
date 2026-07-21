import { useEffect, useState } from 'react';
import { api, type CaseGroup, type Job } from '../api/client';

const REFRESH_MS = 60_000;

/**
 * Chromeless fullscreen view for prep-bay TV screens: pick a job once, then it shows the
 * job name, logo, and case list, refreshing itself every minute. Works with the read-only
 * SIGNAGE role.
 */
export default function SignagePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [cases, setCases] = useState<CaseGroup[]>([]);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    api.jobs.list().then(setJobs);
  }, []);

  useEffect(() => {
    if (!job) return;
    const load = () => {
      api.cases.list(job.id).then(setCases);
      api.jobs.get(job.id).then(setJob);
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [job?.id]);

  if (!job) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="panel" style={{ width: 420 }}>
          <h2>Prep display</h2>
          <p className="muted">Choose the job this screen should show.</p>
          {jobs.map((j) => (
            <button
              key={j.id}
              className="secondary"
              style={{ display: 'block', width: '100%', marginBottom: 8, textAlign: 'left' }}
              onClick={() => setJob(j)}
            >
              {j.name}
              {j.venue ? ` — ${j.venue}` : ''}
            </button>
          ))}
          {jobs.length === 0 && <p className="muted">No jobs found.</p>}
        </div>
      </div>
    );
  }

  const byType = new Map<string, CaseGroup[]>();
  for (const c of cases) {
    if (!byType.has(c.fixtureType)) byType.set(c.fixtureType, []);
    byType.get(c.fixtureType)!.push(c);
  }

  return (
    <div style={{ padding: '2rem 3rem', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {job.logoPath && logoOk && (
          <img
            src={api.jobs.logoUrl(job.id)}
            alt=""
            style={{ maxHeight: 90 }}
            onError={() => setLogoOk(false)}
          />
        )}
        <div>
          <h1 style={{ fontSize: '2.6rem', margin: 0 }}>{job.name}</h1>
          {job.venue && <p className="muted" style={{ fontSize: '1.3rem', margin: 0 }}>{job.venue}</p>}
        </div>
        <button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => setJob(null)}>
          Change job
        </button>
      </header>

      {cases.length === 0 && <p className="muted" style={{ fontSize: '1.4rem' }}>No cases generated for this job yet.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {[...byType.entries()].map(([type, groups]) => (
          <div key={type} className="panel" style={{ marginBottom: 0 }}>
            <h2 style={{ fontSize: '1.6rem' }}>{type}</h2>
            {groups.map((g) => (
              <div key={g.id} style={{ fontSize: '1.5rem', padding: '0.25rem 0' }}>
                <strong>{g.label}</strong>
                {g.location && <span className="muted" style={{ fontSize: '1.1rem' }}> — {g.location}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
