import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Job } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PatchImportPanel from '../components/PatchImportPanel';
import CasesPanel from '../components/CasesPanel';
import AdHocLabelsPanel from '../components/AdHocLabelsPanel';
import PrintQueuePanel from '../components/PrintQueuePanel';
import PlotsPanel from '../components/PlotsPanel';
import CurrentRmsPanel from '../components/CurrentRmsPanel';

const TABS = ['Patch Import', 'Cases', 'Ad Hoc Labels', 'Print Queue', 'Plots', 'Current RMS', 'Job Settings'] as const;
type Tab = (typeof TABS)[number];

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>('Patch Import');

  useEffect(() => {
    if (jobId) api.jobs.get(jobId).then(setJob);
  }, [jobId]);

  if (!jobId) return null;

  return (
    <div>
      <h1>{job?.name ?? 'Job'}</h1>
      {job?.venue && <p className="muted">{job.venue}</p>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
            {t === 'Current RMS' && job?.rmsAlertAt && ' •'}
          </button>
        ))}
      </div>

      {tab === 'Patch Import' && <PatchImportPanel jobId={jobId} />}
      {tab === 'Cases' && <CasesPanel jobId={jobId} />}
      {tab === 'Ad Hoc Labels' && <AdHocLabelsPanel jobId={jobId} />}
      {tab === 'Print Queue' && <PrintQueuePanel jobId={jobId} />}
      {tab === 'Plots' && <PlotsPanel jobId={jobId} />}
      {tab === 'Current RMS' && <CurrentRmsPanel jobId={jobId} />}
      {tab === 'Job Settings' && job && <JobSettingsPanel job={job} onUpdate={setJob} />}
    </div>
  );
}

function JobSettingsPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [name, setName] = useState(job.name);
  const [venue, setVenue] = useState(job.venue ?? '');
  const [logoBusy, setLogoBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await api.jobs.update(job.id, { name, venue });
    onUpdate(updated);
  };

  const togglePublic = async () => {
    const updated = await api.jobs.update(job.id, { isPublic: !job.isPublic });
    onUpdate(updated);
  };

  const uploadLogo = async (file: File) => {
    setLogoBusy(true);
    try {
      const updated = await api.jobs.uploadLogo(job.id, file);
      onUpdate(updated);
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Job settings</h3>
      <form onSubmit={save} className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem' }}>
        <label>
          Name
          <br />
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Venue
          <br />
          <input value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        <button type="submit">Save</button>
      </form>

      <div style={{ marginTop: '1.25rem' }}>
        <h4>Visibility</h4>
        {isAdmin ? (
          <>
            <label className="row" style={{ gap: '0.4rem' }}>
              <input type="checkbox" checked={job.isPublic} onChange={togglePublic} />
              Public — normal users can see this job
            </label>
            <p className="muted">Admins always see every job regardless of this setting.</p>
          </>
        ) : (
          <p className="muted">{job.isPublic ? 'This job is public.' : 'This job is private.'}</p>
        )}
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <h4>Job logo</h4>
        <p className="muted">Used on PAL/generic labels and prep displays.</p>
        {job.logoPath && <img src={api.jobs.logoUrl(job.id)} alt="Job logo" style={{ maxHeight: 80, display: 'block', marginBottom: '0.5rem' }} />}
        <input
          type="file"
          accept="image/*"
          disabled={logoBusy}
          onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
        />
      </div>
    </div>
  );
}
