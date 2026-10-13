import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Job, type CrewFeatures, CREW_FEATURE_KEYS, CREW_FEATURE_LABELS } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import JobPrepTab from '../components/JobPrepTab';
import JobPlotsTab from '../components/JobPlotsTab';
import LocationLinks from '../components/LocationLinks';
import JobSchedulePanel from '../components/JobSchedulePanel';
import JobDocumentsPanel from '../components/JobDocumentsPanel';
import JobContactsPanel from '../components/JobContactsPanel';
import CurrentRmsPanel from '../components/CurrentRmsPanel';
import JobLocationColorsPanel from '../components/JobLocationColorsPanel';
import JobCrewPanel from '../components/JobCrewPanel';
import CrewMarginPanel from '../components/CrewMarginPanel';
import JobDiscussionThread from '../components/JobDiscussionThread';
import FileInput from '../components/FileInput';

const TABS = ['Prep', 'Plots', 'Schedule', 'Documents', 'Contacts', 'Crew', 'Discussion', 'Current RMS', 'Job Settings'] as const;
type Tab = (typeof TABS)[number];

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>('Prep');

  useEffect(() => {
    if (jobId) api.jobs.get(jobId).then(setJob);
  }, [jobId]);

  if (!jobId) return null;

  return (
    <div>
      <h1>{job?.name ?? 'Job'}</h1>
      {job?.venue && <p className="muted">{job.venue}</p>}

      <div className="secondary-shell">
        <nav className="secondary-nav">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
              {t === 'Current RMS' && job?.rmsAlertAt && ' •'}
            </button>
          ))}
        </nav>
        <div className="secondary-content" key={tab}>
          {tab === 'Prep' && <JobPrepTab jobId={jobId} />}
          {tab === 'Plots' && <JobPlotsTab jobId={jobId} />}
          {tab === 'Schedule' && <JobSchedulePanel jobId={jobId} />}
          {tab === 'Documents' && <JobDocumentsPanel jobId={jobId} />}
          {tab === 'Contacts' && <JobContactsPanel jobId={jobId} />}
          {tab === 'Crew' && (
            <>
              <JobCrewPanel jobId={jobId} />
              <CrewMarginPanel jobId={jobId} />
            </>
          )}
          {tab === 'Discussion' && (
            <div className="panel">
              <JobDiscussionThread jobId={jobId} scope="staff" />
            </div>
          )}
          {tab === 'Current RMS' && <CurrentRmsPanel jobId={jobId} />}
          {tab === 'Job Settings' && job && <JobSettingsPanel job={job} onUpdate={setJob} />}
        </div>
      </div>
    </div>
  );
}

/** Formats an ISO datetime string for a <input type="datetime-local"> value (local time, no
 * seconds/timezone) - undefined/null becomes '' so the field renders empty rather than crashing. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function JobSettingsPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const canPublish = isAdmin || Boolean(user?.permissions?.publishJobs);
  const [name, setName] = useState(job.name);
  const [venue, setVenue] = useState(job.venue ?? '');
  const [description, setDescription] = useState(job.description ?? '');
  const [address, setAddress] = useState(job.address ?? '');
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(job.startsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(job.endsAt));
  const [logoBusy, setLogoBusy] = useState(false);
  const [oneDriveLogo, setOneDriveLogo] = useState<{ itemId: string; name: string } | null>(null);

  useEffect(() => {
    if (!job.oneDriveFolderId) return;
    api.jobs.logoOneDriveCandidate(job.id).then(setOneDriveLogo).catch(() => setOneDriveLogo(null));
  }, [job.id, job.oneDriveFolderId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await api.jobs.update(job.id, {
      name,
      venue,
      description: description || null,
      address: address || null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    });
    onUpdate(updated);
  };

  const togglePublic = async () => {
    const updated = await api.jobs.update(job.id, { isPublic: !job.isPublic });
    onUpdate(updated);
  };

  const uploadLogo = async (file: File, slot: 'left' | 'middle' | 'right') => {
    setLogoBusy(true);
    try {
      const updated = await api.jobs.uploadLogo(job.id, file, slot);
      onUpdate(updated);
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async (slot: 'left' | 'middle' | 'right') => {
    setLogoBusy(true);
    try {
      const updated = await api.jobs.removeLogo(job.id, slot);
      onUpdate(updated);
    } finally {
      setLogoBusy(false);
    }
  };

  const applyOneDriveLogo = async (slot: 'left' | 'middle' | 'right') => {
    setLogoBusy(true);
    try {
      const updated = await api.jobs.applyLogoOneDriveCandidate(job.id, slot);
      onUpdate(updated);
      setOneDriveLogo(null);
    } finally {
      setLogoBusy(false);
    }
  };

  // The first still-empty slot, in the order most jobs would want it filled - used so the
  // OneDrive suggestion below has one obvious default action instead of asking which slot.
  const emptyLogoSlot = !job.logoPath ? 'middle' : !job.logoPathLeft ? 'left' : !job.logoPathRight ? 'right' : null;

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
        <label style={{ width: '100%', maxWidth: '32rem' }}>
          Description
          <br />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ width: '100%' }} />
        </label>
        <label style={{ width: '100%', maxWidth: '32rem' }}>
          Address
          <br />
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, postcode" style={{ width: '100%' }} />
        </label>
        {address && (
          <div style={{ width: '100%', maxWidth: '32rem' }}>
            <LocationLinks address={address} />
          </div>
        )}
        <div className="row" style={{ gap: '1rem' }}>
          <label>
            Starts
            <br />
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label>
            Ends
            <br />
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          These can extend earlier or later than the linked Current RMS opportunity's own dates -
          e.g. to cover a prep day before the hire actually starts. Leave blank to fall back to
          the opportunity's dates.
        </p>
        <button type="submit">Save</button>
      </form>

      <div style={{ marginTop: '1.25rem' }}>
        <h4>Visibility</h4>
        {canPublish ? (
          <>
            <label className="row" style={{ gap: '0.4rem' }}>
              <input type="checkbox" checked={job.isPublic} onChange={togglePublic} />
              Public - normal users can see this job
            </label>
            <p className="muted">Admins always see every job regardless of this setting.</p>
          </>
        ) : (
          <p className="muted">{job.isPublic ? 'This job is public.' : 'This job is private.'}</p>
        )}
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <h4>Job logo</h4>
        <p className="muted">
          Used on PAL/generic labels and prep displays. Up to three logos print side by side
          across the label's logo bar - most jobs just use the middle slot.
        </p>
        {oneDriveLogo && emptyLogoSlot && (
          <div className="panel onedrive-logo-suggestion" style={{ marginBottom: '0.9rem' }}>
            <p style={{ margin: 0 }}>
              Found a logo in this job's OneDrive folder: <strong>{oneDriveLogo.name}</strong>
            </p>
            <button type="button" disabled={logoBusy} onClick={() => applyOneDriveLogo(emptyLogoSlot)} style={{ marginTop: '0.5rem' }}>
              Use as {emptyLogoSlot} logo
            </button>
          </div>
        )}
        <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap' }}>
          {(['left', 'middle', 'right'] as const).map((slot) => {
            const path = slot === 'left' ? job.logoPathLeft : slot === 'right' ? job.logoPathRight : job.logoPath;
            return (
              <div key={slot}>
                <p className="muted" style={{ margin: '0 0 0.3rem', textTransform: 'capitalize' }}>
                  {slot}
                </p>
                {path && (
                  <div>
                    <img src={api.jobs.logoUrl(job.id, slot)} alt={`Job logo (${slot})`} style={{ maxHeight: 60, display: 'block', marginBottom: '0.3rem' }} />
                    <button type="button" className="secondary" disabled={logoBusy} onClick={() => removeLogo(slot)} style={{ marginBottom: '0.3rem' }}>
                      Remove
                    </button>
                  </div>
                )}
                <FileInput accept="image/*" disabled={logoBusy} onFile={(file) => uploadLogo(file, slot)} label={path ? 'Replace' : 'Choose image'} />
              </div>
            );
          })}
        </div>
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

/** Per-job override of which crew-portal sections are visible for this job's crew - starts
 * from whatever was set at onboarding (or the portal default, if never overridden). */
function JobCrewFeaturesPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
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
