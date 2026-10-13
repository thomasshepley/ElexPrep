import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  type Job,
  type CurrentRmsOpportunity,
  type CrewFeatures,
  CREW_FEATURE_KEYS,
  CREW_FEATURE_LABELS,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import { SearchIcon, WhereIcon } from '../components/Icons';
import LocationLinks from '../components/LocationLinks';

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const KIND_CHIP_CLASS: Record<string, string> = {
  QUOTE: 'chip-neutral',
  ORDER: 'chip-success',
  OTHER: 'chip-warning',
};

function OpportunityKindChip({ kind }: { kind: CurrentRmsOpportunity['kind'] }) {
  const label = kind === 'ORDER' ? 'Order' : kind === 'QUOTE' ? 'Quote' : 'Other';
  return <span className={`chip ${KIND_CHIP_CLASS[kind ?? 'OTHER']}`}>{label}</span>;
}

/**
 * The shared onboarding-options form used by both the single-row "Onboard" action and the
 * bulk "Onboard N selected" action - crew feature overrides apply either way; the OneDrive
 * manual-folder override only makes sense for a single job (a batch can't all share one path),
 * so it's hidden when onboarding more than one at once.
 */
export interface OnboardingReviewOpts {
  name?: string;
  description?: string;
  address?: string;
  startsAt?: string;
  endsAt?: string;
}

function OnboardingOptionsForm({
  count,
  opportunity,
  onCancel,
  onConfirm,
  busy,
}: {
  count: number;
  opportunity?: CurrentRmsOpportunity;
  onCancel: () => void;
  onConfirm: (opts: { crewFeatures: Partial<CrewFeatures>; oneDriveFolderPath?: string } & OnboardingReviewOpts) => void;
  busy: boolean;
}) {
  const [features, setFeatures] = useState<CrewFeatures | null>(null);
  const [folderPath, setFolderPath] = useState('');
  const [name, setName] = useState(opportunity?.subject ?? '');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(opportunity?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(opportunity?.endsAt ?? null));

  useEffect(() => {
    api.portalSettings
      .getCrewFeaturesDefault()
      .then(setFeatures)
      .catch(() => setFeatures(null));
  }, []);

  return (
    <div className="panel">
      <h3>{count === 1 ? 'Onboard this job' : `Onboard ${count} jobs`}</h3>

      {opportunity && (
        <div style={{ marginBottom: '1.25rem' }}>
          <p className="muted">
            Review and override the details below before this job is created - everything here
            stays editable afterward too, from the job's Job Settings tab.
          </p>

          <h4>Who</h4>
          <p className="muted" style={{ marginTop: 0 }}>You'll assign crew once this job is onboarded, from its Crew tab.</p>

          <h4>What</h4>
          <div className="field" style={{ maxWidth: '32rem' }}>
            <label htmlFor="onboard-name">Job name</label>
            <input id="onboard-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: '32rem' }}>
            <label htmlFor="onboard-description">Description (optional)</label>
            <textarea id="onboard-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <h4>When</h4>
          <div className="row" style={{ gap: '1rem' }}>
            <div className="field">
              <label htmlFor="onboard-starts">Starts</label>
              <input id="onboard-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="onboard-ends">Ends</label>
              <input id="onboard-ends" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          {!opportunity.startsAt && (
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Current RMS has no dates cached for this opportunity yet - set them here or later from the Schedule tab.
            </p>
          )}

          <h4>Where</h4>
          <div className="field" style={{ maxWidth: '32rem' }}>
            <label htmlFor="onboard-address">Address (optional)</label>
            <input
              id="onboard-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city, postcode"
            />
          </div>
          {address && <LocationLinks address={address} showMap={false} />}

          <h4>Why</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            Day schedule, CAD plots, kit list, and documents are all set up after onboarding, from
            this job's own tabs.
          </p>
        </div>
      )}

      <p className="muted">
        Sets which crew-portal sections are visible to this job's crew. Starts from the portal
        defaults (Settings → Crew Portal) - override any of them just for this job below.
      </p>
      {features && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {CREW_FEATURE_KEYS.map((key) => (
            <label key={key} className="row" style={{ gap: '0.4rem' }}>
              <input
                type="checkbox"
                checked={features[key]}
                onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
              />
              {CREW_FEATURE_LABELS[key]}
            </label>
          ))}
        </div>
      )}
      {count === 1 && (
        <div className="field" style={{ maxWidth: '26rem', marginBottom: '1rem' }}>
          <label htmlFor="onboard-onedrive-path">OneDrive folder (optional)</label>
          <input
            id="onboard-onedrive-path"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="Leave blank to auto-match by name, e.g. Projects/2026/Big Gig Ltd"
          />
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
            Only takes effect once OneDrive is connected in Settings → OneDrive - safe to leave
            blank either way.
          </p>
        </div>
      )}
      <div className="row">
        <button
          type="button"
          onClick={() =>
            onConfirm({
              crewFeatures: features ?? {},
              oneDriveFolderPath: folderPath || undefined,
              ...(opportunity
                ? {
                    name: name || undefined,
                    description: description || undefined,
                    address: address || undefined,
                    startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
                    endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
                  }
                : {}),
            })
          }
          disabled={busy}
        >
          {busy ? 'Onboarding…' : count === 1 ? 'Onboard job' : `Onboard ${count} jobs`}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function OnboardOpportunitiesPanel({ existingOppIds, onOnboarded }: { existingOppIds: Set<string>; onOnboarded: () => void }) {
  const [opportunities, setOpportunities] = useState<CurrentRmsOpportunity[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingSingle, setPendingSingle] = useState<CurrentRmsOpportunity | null>(null);
  const [pendingBulk, setPendingBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (q?: string) => api.currentRms.listOpportunities(q).then(setOpportunities).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const unOnboarded = useMemo(
    () => opportunities.filter((o) => (o.kind === 'QUOTE' || o.kind === 'ORDER') && !existingOppIds.has(String(o.rmsId))),
    [opportunities, existingOppIds]
  );

  const toggle = (rmsId: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rmsId)) next.delete(rmsId);
      else next.add(rmsId);
      return next;
    });
  };

  const confirmSingle = async (opts: { crewFeatures: Partial<CrewFeatures>; oneDriveFolderPath?: string } & OnboardingReviewOpts) => {
    if (!pendingSingle) return;
    setBusy(true);
    setError(null);
    try {
      const job = await api.currentRms.importOpportunity(pendingSingle.rmsId, opts);
      setMessage(`Onboarded "${job.name}" - it's private until you mark it Public in Job Settings.`);
      setPendingSingle(null);
      onOnboarded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmBulk = async (opts: { crewFeatures: Partial<CrewFeatures> }) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.currentRms.bulkImport([...selected], opts.crewFeatures);
      setMessage(
        `Onboarded ${result.created.length} job${result.created.length === 1 ? '' : 's'}` +
          (result.skipped.length ? `, skipped ${result.skipped.length}.` : '.')
      );
      setSelected(new Set());
      setPendingBulk(false);
      onOnboarded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      {pendingSingle && (
        <OnboardingOptionsForm
          count={1}
          opportunity={pendingSingle}
          busy={busy}
          onCancel={() => setPendingSingle(null)}
          onConfirm={confirmSingle}
        />
      )}
      {pendingBulk && (
        <OnboardingOptionsForm count={selected.size} busy={busy} onCancel={() => setPendingBulk(false)} onConfirm={confirmBulk} />
      )}

      <div className="toolbar">
        <div className="search-field">
          <SearchIcon />
          <input
            placeholder="Search by subject or customer"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              load(e.target.value || undefined);
            }}
          />
        </div>
        {selected.size > 0 && (
          <button type="button" onClick={() => setPendingBulk(true)}>
            Onboard {selected.size} selected
          </button>
        )}
      </div>

      {unOnboarded.length === 0 && (
        <div className="empty-state">
          <p style={{ margin: 0 }}>
            No un-onboarded Quotes or Orders cached yet - sync Current RMS from{' '}
            <Link to="/settings/current-rms">Settings → Current RMS</Link>.
          </p>
        </div>
      )}

      {unOnboarded.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Subject</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Dates</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {unOnboarded.map((o) => (
                <tr key={o.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(o.rmsId)} onChange={() => toggle(o.rmsId)} />
                  </td>
                  <td>{o.subject}</td>
                  <td>{o.memberName}</td>
                  <td className="row" style={{ gap: '0.4rem' }}>
                    <OpportunityKindChip kind={o.kind} /> <span className="muted">{o.status}</span>
                  </td>
                  <td className="muted">
                    {o.startsAt ? new Date(o.startsAt).toLocaleDateString() : ''}
                    {o.endsAt ? ` – ${new Date(o.endsAt).toLocaleDateString()}` : ''}
                  </td>
                  <td>
                    <button type="button" className="secondary" onClick={() => setPendingSingle(o)}>
                      Onboard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function JobsListPage() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const canDelete = isAdmin || Boolean(user?.permissions?.deleteJobs);
  const canOnboard = isAdmin || Boolean(user?.permissions?.onboardJobs);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tab, setTab] = useState<'portal' | 'onboard'>('portal');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobs.list().then(setJobs).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
  }, []);

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

  const existingOppIds = useMemo(
    () => new Set(jobs.filter((j) => j.currentRmsOpportunityId).map((j) => j.currentRmsOpportunityId!)),
    [jobs]
  );

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1>Jobs</h1>
          <p className="muted">{jobs.length === 0 ? 'Nothing here yet' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}</p>
        </div>
      </div>

      {canOnboard && (
        <div className="tabs">
          <button className={tab === 'portal' ? 'active' : ''} onClick={() => setTab('portal')}>
            Portal jobs
          </button>
          <button className={tab === 'onboard' ? 'active' : ''} onClick={() => setTab('onboard')}>
            Onboard from Current RMS
          </button>
        </div>
      )}

      {tab === 'onboard' && canOnboard && <OnboardOpportunitiesPanel existingOppIds={existingOppIds} onOnboarded={refresh} />}

      {tab === 'portal' && (
        <>
          {jobs.length > 0 && (
            <div className="toolbar">
              <div className="search-field">
                <SearchIcon />
                <input placeholder="Search jobs by name or venue" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {jobs.length === 0 && (
            <div className="empty-state">
              <p style={{ margin: 0 }}>
                No jobs yet
                {canOnboard ? (
                  <>
                    {' '}
                    - <button type="button" className="link-button" onClick={() => setTab('onboard')}>
                      onboard one from Current RMS
                    </button>{' '}
                    to get started.
                  </>
                ) : (
                  '.'
                )}
              </p>
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
        </>
      )}
    </div>
  );
}
