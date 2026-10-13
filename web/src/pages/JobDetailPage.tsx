import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Job, type CrewFeatures, CREW_FEATURE_KEYS, CREW_FEATURE_LABELS } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { hasPermission, isAdminRole } from '../auth/roles';
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
import { usePageTitle } from '../pageTitle';
import DateTimeInput from '../components/DateTimeInput';
import { useDialog } from '../components/Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { toDatetimeLocal } from '../utils/format';

const TABS = ['Prep', 'Plots', 'Schedule', 'Documents', 'Contacts', 'Crew', 'Discussion', 'Current RMS', 'Job Settings'] as const;
type Tab = (typeof TABS)[number];

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab>('Prep');
  const [loadError, setLoadError] = useState<string | null>(null);
  usePageTitle(job?.name);

  useEffect(() => {
    if (!jobId) return;
    setLoadError(null);
    api.jobs.get(jobId).then(setJob).catch((e) => setLoadError((e as Error).message));
  }, [jobId]);

  if (!jobId) return null;
  if (loadError) {
    return (
      <div className="error-page">
        <h1>Job not available</h1>
        <p className="muted">{loadError === 'not found' ? "This job doesn't exist, or you don't have access to it." : loadError}</p>
      </div>
    );
  }

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

function JobSettingsPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { busy, run } = useAsyncAction();
  const isAdmin = isAdminRole(user?.role);
  const canPublish = isAdmin || Boolean(user?.permissions?.publishJobs);
  const canEditJob = hasPermission(user, 'editJobs');
  const canDelete = hasPermission(user, 'deleteJobs');
  const [name, setName] = useState(job.name);
  const [venue, setVenue] = useState(job.venue ?? '');
  const [description, setDescription] = useState(job.description ?? '');
  const [address, setAddress] = useState(job.address ?? '');
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(job.startsAt));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(job.endsAt));
  const [oneDriveLogo, setOneDriveLogo] = useState<{ itemId: string; name: string } | null>(null);

  useEffect(() => {
    if (!job.oneDriveFolderId) return;
    api.jobs.logoOneDriveCandidate(job.id).then(setOneDriveLogo).catch(() => setOneDriveLogo(null));
  }, [job.id, job.oneDriveFolderId]);

  const dirty =
    name !== job.name ||
    venue !== (job.venue ?? '') ||
    description !== (job.description ?? '') ||
    address !== (job.address ?? '') ||
    startsAt !== toDatetimeLocal(job.startsAt) ||
    endsAt !== toDatetimeLocal(job.endsAt);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = await run(
      () =>
        api.jobs.update(job.id, {
          name,
          venue,
          description: description || null,
          address: address || null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      { success: 'Job details saved' }
    );
    if (updated) onUpdate(updated);
  };

  const togglePublic = async () => {
    const updated = await run(() => api.jobs.update(job.id, { isPublic: !job.isPublic }), {
      success: job.isPublic ? 'Job is now private' : 'Job is now public',
    });
    if (updated) onUpdate(updated);
  };

  const uploadLogo = async (file: File, slot: LogoSlot) => {
    const updated = await run(() => api.jobs.uploadLogo(job.id, file, slot), { success: 'Logo updated' });
    if (updated) onUpdate(updated);
  };

  const removeLogo = async (slot: LogoSlot) => {
    const updated = await run(() => api.jobs.removeLogo(job.id, slot), { success: 'Logo removed' });
    if (updated) onUpdate(updated);
  };

  const applyOneDriveLogo = async (slot: LogoSlot) => {
    const updated = await run(() => api.jobs.applyLogoOneDriveCandidate(job.id, slot), { success: 'Logo imported from OneDrive' });
    if (updated) {
      onUpdate(updated);
      setOneDriveLogo(null);
    }
  };

  const deleteJob = async () => {
    const ok = await dialog.confirm({
      title: `Delete "${job.name}"?`,
      message: 'This removes its patch, cases, labels, plots, documents and print history. It cannot be undone.',
      confirmLabel: 'Delete job',
      danger: true,
      typeToConfirm: job.name,
    });
    if (!ok) return;
    const done = await run(() => api.jobs.remove(job.id).then(() => true), { success: `Deleted "${job.name}"` });
    if (done) navigate('/jobs');
  };

  // The first still-empty slot, in the order most jobs would want it filled - used so the
  // OneDrive suggestion below has one obvious default action instead of asking which slot.
  const emptyLogoSlot: LogoSlot | null = !job.logoPath ? 'middle' : !job.logoPathLeft ? 'left' : !job.logoPathRight ? 'right' : null;

  return (
    <div className="stack">
      <section className="panel">
        <h3 className="mt-0">Details</h3>
        {!canEditJob && <p className="muted">You can view this job's details, but editing them needs the "Edit jobs" permission.</p>}
        <form onSubmit={save}>
          <fieldset disabled={!canEditJob || busy} className="plain-fieldset">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="job-name">Name</label>
                <input id="job-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="job-venue">Venue</label>
                <input id="job-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              </div>
              <div className="field form-grid-full">
                <label htmlFor="job-description">Description</label>
                <textarea id="job-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="field form-grid-full">
                <label htmlFor="job-address">Address</label>
                <input id="job-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, postcode" />
              </div>
              {address && (
                <div className="form-grid-full">
                  <LocationLinks address={address} />
                </div>
              )}
              <div className="field">
                <label htmlFor="job-starts">Starts</label>
                <DateTimeInput id="job-starts" value={startsAt} onChange={setStartsAt} />
              </div>
              <div className="field">
                <label htmlFor="job-ends">Ends</label>
                <DateTimeInput id="job-ends" value={endsAt} onChange={setEndsAt} defaultTime="18:00" />
              </div>
            </div>
            <p className="muted">
              These can extend earlier or later than the linked Current RMS opportunity's dates - e.g. to cover a prep day
              before the hire starts. Leave blank to use the opportunity's dates.
            </p>
            {canEditJob && (
              <button type="submit" disabled={!dirty || busy}>
                Save details
              </button>
            )}
          </fieldset>
        </form>
      </section>

      <section className="panel">
        <h3 className="mt-0">Visibility</h3>
        {canPublish ? (
          <>
            <label className="row" style={{ gap: '0.4rem' }}>
              <input type="checkbox" checked={job.isPublic} onChange={togglePublic} disabled={busy} />
              Public - every staff account can see this job
            </label>
            <p className="muted mb-0">Admins always see every job regardless of this setting.</p>
          </>
        ) : (
          <p className="muted mb-0">{job.isPublic ? 'This job is public.' : 'This job is private.'}</p>
        )}
      </section>

      <section className="panel">
        <h3 className="mt-0">Logos</h3>
        <p className="muted">
          Used on PAL/generic labels and prep displays. Up to three logos print side by side across the label's logo bar - most
          jobs just use the middle slot.
        </p>
        {canEditJob && oneDriveLogo && emptyLogoSlot && (
          <div className="panel onedrive-logo-suggestion">
            <p className="mt-0">
              Found a logo in this job's OneDrive folder: <strong>{oneDriveLogo.name}</strong>
            </p>
            <button type="button" disabled={busy} onClick={() => applyOneDriveLogo(emptyLogoSlot)}>
              Use as {emptyLogoSlot} logo
            </button>
          </div>
        )}
        <div className="logo-slots">
          {(['left', 'middle', 'right'] as const).map((slot) => {
            const path = slot === 'left' ? job.logoPathLeft : slot === 'right' ? job.logoPathRight : job.logoPath;
            return (
              <div key={slot} className="logo-slot">
                <p className="muted logo-slot-name">{slot}</p>
                {path ? (
                  <img src={api.jobs.logoUrl(job.id, slot)} alt={`Job logo (${slot})`} className="logo-slot-preview" />
                ) : (
                  <p className="muted">None</p>
                )}
                {canEditJob && (
                  <div className="row" style={{ gap: '0.4rem' }}>
                    <FileInput
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      disabled={busy}
                      onFile={(file) => uploadLogo(file, slot)}
                      label={path ? 'Replace' : 'Choose image'}
                    />
                    {path && (
                      <button type="button" className="secondary" disabled={busy} onClick={() => removeLogo(slot)}>
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <JobCrewFeaturesPanel job={job} onUpdate={onUpdate} />

      <section className="panel">
        <JobLocationColorsPanel jobId={job.id} />
      </section>

      {canDelete && (
        <section className="panel danger-zone">
          <h3 className="mt-0">Danger zone</h3>
          <div className="row-between">
            <p className="muted mb-0">
              Delete this job and everything attached to it. You'll be asked to type the job's name to confirm.
            </p>
            <button type="button" className="danger" disabled={busy} onClick={deleteJob}>
              Delete job
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

type LogoSlot = 'left' | 'middle' | 'right';

/** Per-job override of which crew-portal sections are visible for this job's crew - starts
 * from whatever was set at onboarding (or the portal default, if never overridden). */
function JobCrewFeaturesPanel({ job, onUpdate }: { job: Job; onUpdate: (j: Job) => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const canEdit = isAdmin || Boolean(user?.permissions?.onboardJobs) || Boolean(user?.permissions?.manageCrewAssignments);
  const [features, setFeatures] = useState<CrewFeatures | null>(null);
  const { busy, run } = useAsyncAction();

  useEffect(() => {
    api.portalSettings
      .getCrewFeaturesDefault()
      .then((defaults) => {
        const override = job.crewFeaturesJson ? (JSON.parse(job.crewFeaturesJson) as Partial<CrewFeatures>) : {};
        setFeatures({ ...defaults, ...override });
      })
      .catch(() => setFeatures(null));
  }, [job.crewFeaturesJson]);

  if (!canEdit || !features) return null;

  const save = async () => {
    const updated = await run(() => api.jobs.update(job.id, { crewFeatures: features }), { success: 'Crew portal features saved' });
    if (updated) onUpdate(updated);
  };

  return (
    <section className="panel">
      <h3 className="mt-0">Crew portal</h3>
      <p className="muted">Which sections of this job's page are visible to its crew.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
        {CREW_FEATURE_KEYS.map((key) => (
          <label key={key} className="row" style={{ gap: '0.4rem' }}>
            <input type="checkbox" checked={features[key]} onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })} />
            {CREW_FEATURE_LABELS[key]}
          </label>
        ))}
      </div>
      <button type="button" onClick={save} disabled={busy}>
        Save crew portal features
      </button>
    </section>
  );
}
