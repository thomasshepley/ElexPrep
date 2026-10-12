import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Job, type CrewFeatures, CREW_FEATURE_KEYS, CREW_FEATURE_LABELS } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import PatchImportPanel from '../components/PatchImportPanel';
import CasesPanel from '../components/CasesPanel';
import LabelsPanel from '../components/LabelsPanel';
import PrintQueuePanel from '../components/PrintQueuePanel';
import JobPlotsTab from '../components/JobPlotsTab';
import JobSchedulePanel from '../components/JobSchedulePanel';
import JobDocumentsPanel from '../components/JobDocumentsPanel';
import CurrentRmsPanel from '../components/CurrentRmsPanel';
import JobLocationColorsPanel from '../components/JobLocationColorsPanel';
import JobCrewPanel from '../components/JobCrewPanel';
import JobDiscussionThread from '../components/JobDiscussionThread';
import FileInput from '../components/FileInput';

const TABS = ['Patch Import', 'Cases', 'Labels', 'Print Queue', 'Plots', 'Schedule', 'Documents', 'Crew', 'Discussion', 'Current RMS', 'Job Settings'] as const;
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
      {tab === 'Labels' && <LabelsPanel jobId={jobId} />}
      {tab === 'Print Queue' && <PrintQueuePanel jobId={jobId} />}
      {tab === 'Plots' && <JobPlotsTab jobId={jobId} />}
      {tab === 'Schedule' && <JobSchedulePanel jobId={jobId} />}
      {tab === 'Documents' && <JobDocumentsPanel jobId={jobId} />}
      {tab === 'Crew' && <JobCrewPanel jobId={jobId} />}
      {tab === 'Discussion' && (
        <div className="panel">
          <JobDiscussionThread jobId={jobId} scope="staff" />
        </div>
      )}
      {tab === 'Current RMS' && <CurrentRmsPanel jobId={jobId} />}
      {tab === 'Job Settings' && job && <JobSettingsPanel job={job} onUpdate={setJob} />}
    </div>
  );
}

function JobSettingsPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canPublish = isAdmin || Boolean(user?.permissions?.publishJobs);
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
        {canPublish ? (
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
        <FileInput accept="image/*" disabled={logoBusy} onFile={uploadLogo} label="Choose image" />
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <JobCrewFeaturesPanel job={job} onUpdate={onUpdate} />
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <JobLocationColorsPanel jobId={job.id} />
      </div>
    </div>
  );
}

/** Per-job override of which crew-portal sections are visible for this job's crew — starts
 * from whatever was set at onboarding (or the portal default, if never overridden). */
function JobCrewFeaturesPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit = isAdmin || Boolean(user?.permissions?.onboardJobs) || Boolean(user?.permissions?.manageCrewAssignments);
  const [features, setFeatures] = useState<CrewFeatures | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.portalSettings.getCrewFeaturesDefault().then((defaults) => {
      const override = job.crewFeaturesJson ? (JSON.parse(job.crewFeaturesJson) as Partial<CrewFeatures>) : {};
      setFeatures({ ...defaults, ...override });
    });
  }, [job.crewFeaturesJson]);

  if (!canEdit || !features) return null;

  const save = async () => {
    setBusy(true);
    try {
      const updated = await api.jobs.update(job.id, { crewFeatures: features });
      onUpdate(updated);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h4>Crew portal features</h4>
      <p className="muted">Which sections of this job's page are visible to its crew.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {CREW_FEATURE_KEYS.map((key) => (
          <label key={key} className="row" style={{ gap: '0.4rem' }}>
            <input type="checkbox" checked={features[key]} onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })} />
            {CREW_FEATURE_LABELS[key]}
          </label>
        ))}
      </div>
      <button type="button" className="secondary" onClick={save} disabled={busy}>
        Save
      </button>
    </div>
  );
}
