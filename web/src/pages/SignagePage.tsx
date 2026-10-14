import { SkeletonList, SkeletonRegion } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import type { PickListDiff } from '@elexprep/shared';
import { api, type CaseGroup, type CurrentRmsPickItem, type Job } from '../api/client';
import { formatDate, formatTime } from '../utils/format';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SignOutIcon } from '../components/Icons';

const DATA_REFRESH_MS = 60_000;
const DIFF_POLL_MS = 20_000;
const STORED_JOB_KEY = 'elex-signage-job';

function readStoredJobId(): string | null {
  try {
    return localStorage.getItem(STORED_JOB_KEY);
  } catch {
    return null;
  }
}

function storeJobId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORED_JOB_KEY, id);
    else localStorage.removeItem(STORED_JOB_KEY);
  } catch {
    // A locked-down kiosk browser may block storage - the screen still works, it just asks again.
  }
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Chromeless fullscreen view for prep-bay TV screens: shows a job's Current RMS pick list (if
 * linked and reachable) or its locally-generated case list, refreshing itself. The chosen job is
 * remembered so a TV reboot comes straight back to it; on first boot it picks the next job by date.
 * Works with the read-only SIGNAGE role - the one exception is ticking an item's prepped checkbox,
 * which is explicitly allowlisted since prep is the whole point here.
 */
/**
 * /signage sits outside the normal shell, so it needs its own signed-in guard and its own way
 * out: a sign-out button (and a link back to the portal for staff), kept small and faded so it
 * doesn't distract on a TV, but always reachable.
 */
export default function SignagePage() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <>
      <div className="signage-exit">
        {user.role !== 'SIGNAGE' && (
          <Link to="/" className="button secondary">
            Back to portal
          </Link>
        )}
        <button type="button" className="secondary" onClick={logout}>
          <SignOutIcon /> Sign out
        </button>
      </div>
      <SignageScreen />
    </>
  );
}

function SignageScreen() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [cases, setCases] = useState<CaseGroup[]>([]);
  const [pickItems, setPickItems] = useState<CurrentRmsPickItem[] | null>(null);
  const [pickListError, setPickListError] = useState<string | null>(null);
  const [diff, setDiff] = useState<PickListDiff | null>(null);
  const [logoOk, setLogoOk] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const now = useClock();

  useEffect(() => {
    Promise.all([api.jobs.list(), api.dashboard.get().catch(() => ({ orders: [] }))])
      .then(([list, dashboard]) => {
        setJobs(list);
        const stored = readStoredJobId();
        const remembered = stored ? list.find((j) => j.id === stored) : undefined;
        if (remembered) return setJob(remembered);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const next = dashboard.orders
          .filter((o) => o.startsAt && new Date(o.endsAt ?? o.startsAt) >= today)
          .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())[0];
        const pick = next ? list.find((j) => j.id === next.jobId) : list.length === 1 ? list[0] : undefined;
        if (pick) setJob(pick);
        else setChoosing(true);
      })
      .catch((e) => setLoadError((e as Error).message));
  }, []);

  const linked = Boolean(job?.currentRmsOpportunityId);

  useEffect(() => {
    if (!job) return;
    const load = () => {
      api.jobs.get(job.id).then(setJob).catch(() => {});
      // The case list is always loaded so it can stand in if the pick list can't be reached
      // (integration off, RMS down) instead of the screen going dark.
      api.cases
        .list(job.id)
        .then((c) => {
          setCases(c);
          setRefreshedAt(new Date());
        })
        .catch(() => {});
      if (job.currentRmsOpportunityId) {
        api.jobCurrentRms
          .pickList(job.id)
          .then((res) => {
            setPickItems(res.items);
            setPickListError(null);
            setRefreshedAt(new Date());
          })
          .catch((e) => setPickListError((e as Error).message));
      }
    };
    load();
    const t = setInterval(load, DATA_REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, linked]);

  // Polled separately (and more often) so the full-screen change alert shows up promptly -
  // this is cheap: it's just reading a column already on the job row, not a live CRMS call.
  useEffect(() => {
    if (!job || !linked) return;
    const check = () =>
      api.jobCurrentRms
        .itemsDiff(job.id)
        .then((res) => {
          if (res.diff) setDiff(res.diff);
        })
        .catch(() => {});
    check();
    const t = setInterval(check, DIFF_POLL_MS);
    return () => clearInterval(t);
  }, [job?.id, linked]);

  const choose = (j: Job | null) => {
    storeJobId(j?.id ?? null);
    setPickItems(null);
    setPickListError(null);
    setCases([]);
    setJob(j);
    setChoosing(!j);
  };

  const togglePrepped = async (item: CurrentRmsPickItem) => {
    if (!job) return;
    const next = !item.prepped;
    setPickItems((items) => items?.map((i) => (i.id === item.id ? { ...i, prepped: next } : i)) ?? null);
    await api.jobCurrentRms.setPrepped(job.id, item.id, next).catch(() => {
      setPickItems((items) => items?.map((i) => (i.id === item.id ? { ...i, prepped: !next } : i)) ?? null);
    });
  };

  const dismissDiff = async () => {
    if (!job) return;
    setDiff(null);
    await api.jobCurrentRms.acknowledgeItemsDiff(job.id).catch(() => {});
  };

  if (!job) {
    return (
      <div className="signage-chooser">
        <div className="panel" style={{ width: 420 }}>
          <h2>Prep display</h2>
          {loadError ? (
            <p className="error">Could not load jobs: {loadError}</p>
          ) : !choosing ? (
            <SkeletonRegion>
              <SkeletonList items={3} />
            </SkeletonRegion>
          ) : (
            <>
              <p className="muted">Choose the job this screen should show. It will be remembered on this screen.</p>
              {jobs.map((j) => (
                <button key={j.id} className="secondary signage-chooser-option" onClick={() => choose(j)}>
                  {j.name}
                  {j.venue ? ` - ${j.venue}` : ''}
                </button>
              ))}
              {jobs.length === 0 && <p className="muted">No jobs found.</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  const byType = new Map<string, CaseGroup[]>();
  for (const c of cases) {
    if (!byType.has(c.fixtureType)) byType.set(c.fixtureType, []);
    byType.get(c.fixtureType)!.push(c);
  }
  const showPickList = linked && !pickListError;

  return (
    <div className="signage">
      {diff && <ItemsDiffOverlay diff={diff} onDismiss={dismissDiff} />}

      <header className="signage-header">
        {job.logoPath && logoOk && <img src={api.jobs.logoUrl(job.id)} alt="" className="signage-logo" onError={() => setLogoOk(false)} />}
        <div>
          <h1 className="signage-title">{job.name}</h1>
          {job.venue && <p className="muted signage-venue">{job.venue}</p>}
        </div>
        <div className="signage-meta">
          <div className="signage-clock">{formatTime(now)}</div>
          <div className="muted">{formatDate(now)}</div>
          {refreshedAt && <div className="muted signage-refreshed">Updated {formatTime(refreshedAt)}</div>}
        </div>
        <button className="secondary" onClick={() => choose(null)}>
          Change job
        </button>
      </header>

      {linked && pickListError && (
        <p className="muted signage-fallback-note">
          The Current RMS pick list isn't available right now ({pickListError}) - showing this job's case list instead.
        </p>
      )}

      {showPickList ? (
        <PickListView items={pickItems} onToggle={togglePrepped} />
      ) : (
        <>
          {cases.length === 0 && <p className="muted signage-empty">No cases generated for this job yet.</p>}
          <div className="signage-case-grid">
            {[...byType.entries()].map(([type, groups]) => (
              <div key={type} className="panel" style={{ marginBottom: 0 }}>
                <h2 className="signage-case-type">{type}</h2>
                {groups.map((g) => (
                  <div key={g.id} className="signage-case-row">
                    <strong>{g.label}</strong>
                    {g.location && <span className="muted"> - {g.location}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PickListView({ items, onToggle }: { items: CurrentRmsPickItem[] | null; onToggle: (item: CurrentRmsPickItem) => void }) {
  if (!items) return <p className="muted" style={{ fontSize: '1.4rem' }}>Loading pick list…</p>;
  if (items.length === 0) return <p className="muted" style={{ fontSize: '1.4rem' }}>No items on this opportunity yet.</p>;

  // Group rows are Current RMS's own section headings (e.g. "Lighting - Moving Lights"),
  // not real items to pick - shown as titles, excluded from the prepped count.
  const pickable = items.filter((i) => !i.isGroup);
  const preppedCount = pickable.filter((i) => i.prepped).length;

  return (
    <div>
      <div className="signage-progress" aria-label={`${preppedCount} of ${pickable.length} prepped`}>
        <div className="signage-progress-bar">
          <div className="signage-progress-fill" style={{ width: `${pickable.length ? (preppedCount / pickable.length) * 100 : 0}%` }} />
        </div>
        <span>
          {preppedCount} / {pickable.length} prepped - tap a row as you pull it
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {items.map((item) => {
          const name = item.name || item.product_name || item.description || `Item #${item.id}`;
          if (item.isGroup) {
            return (
              <h3
                key={item.id}
                style={{ fontSize: '1.4rem', margin: '1rem 0 0', paddingBottom: '0.3rem', borderBottom: '2px solid currentColor' }}
              >
                {name}
              </h3>
            );
          }
          return (
            <button
              key={item.id}
              onClick={() => onToggle(item)}
              className="panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: 0,
                textAlign: 'left',
                border: item.prepped ? '2px solid #1FA34C' : undefined,
                opacity: item.prepped ? 0.75 : 1,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 6,
                  border: '2px solid currentColor',
                  display: 'grid',
                  placeItems: 'center',
                  background: item.prepped ? '#1FA34C' : 'transparent',
                  color: item.prepped ? '#fff' : 'inherit',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                }}
              >
                {item.prepped ? '✓' : ''}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, textDecoration: item.prepped ? 'line-through' : 'none' }}>
                  {name}
                </div>
                {item.status_name && <span className="muted" style={{ fontSize: '1rem' }}>{item.status_name}</span>}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>×{item.quantity ?? 1}</div>
              <span
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  padding: '0.25rem 0.6rem',
                  borderRadius: 999,
                  background: item.bookedOut ? '#1FA34C' : '#555',
                  color: '#fff',
                }}
              >
                {item.bookedOut ? 'Booked out' : 'Not booked out'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Full-screen GitHub-diff-style alert: red for what was removed from the pick list, green for
 * what was added, orange for quantity changes - flashed the moment the sync poller detects the
 * linked opportunity's items changed, until someone on this screen dismisses it.
 */
function ItemsDiffOverlay({ diff, onDismiss }: { diff: PickListDiff; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(10, 10, 10, 0.97)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem',
        animation: 'signage-flash 1s ease-in-out 3',
      }}
    >
      <style>{`
        @keyframes signage-flash {
          0%, 100% { background-color: rgba(10, 10, 10, 0.97); }
          50% { background-color: rgba(120, 20, 20, 0.97); }
        }
      `}</style>
      <h1 style={{ fontSize: '3rem', margin: 0 }}>⚠ Job changed</h1>
      <p className="muted" style={{ fontSize: '1.3rem', marginBottom: '2rem' }}>
        The linked Current RMS opportunity's pick list has changed.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', maxWidth: 1100, width: '100%' }}>
        {diff.removed.length > 0 && (
          <div>
            <h3 style={{ color: '#f87171' }}>Removed</h3>
            {diff.removed.map((i) => (
              <div key={i.id} style={{ fontSize: '1.3rem', color: '#f87171' }}>
                − {i.name} ×{i.quantity}
              </div>
            ))}
          </div>
        )}
        {diff.added.length > 0 && (
          <div>
            <h3 style={{ color: '#4ade80' }}>Added</h3>
            {diff.added.map((i) => (
              <div key={i.id} style={{ fontSize: '1.3rem', color: '#4ade80' }}>
                + {i.name} ×{i.quantity}
              </div>
            ))}
          </div>
        )}
        {diff.changed.length > 0 && (
          <div>
            <h3 style={{ color: '#fb923c' }}>Quantity changed</h3>
            {diff.changed.map((i) => (
              <div key={i.id} style={{ fontSize: '1.3rem', color: '#fb923c' }}>
                {i.name}: {i.before} → {i.after}
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onDismiss}
        style={{ marginTop: '2.5rem', fontSize: '1.3rem', padding: '0.8rem 2rem' }}
      >
        Dismiss
      </button>
    </div>
  );
}
