import { useEffect, useState } from 'react';
import type { PickListDiff } from '@elexprep/shared';
import { api, type CaseGroup, type CurrentRmsPickItem, type Job } from '../api/client';

const DATA_REFRESH_MS = 60_000;
const DIFF_POLL_MS = 20_000;

/**
 * Chromeless fullscreen view for prep-bay TV screens: pick a job once, then it shows either
 * that job's Current RMS pick list (if linked) or the locally-generated case list (if not),
 * refreshing itself. Works with the read-only SIGNAGE role — the one exception is ticking an
 * item's prepped checkbox, which is explicitly allowlisted since prep is the whole point here.
 */
export default function SignagePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [cases, setCases] = useState<CaseGroup[]>([]);
  const [pickItems, setPickItems] = useState<CurrentRmsPickItem[] | null>(null);
  const [pickListError, setPickListError] = useState<string | null>(null);
  const [diff, setDiff] = useState<PickListDiff | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    api.jobs.list().then(setJobs);
  }, []);

  const linked = Boolean(job?.currentRmsOpportunityId);

  useEffect(() => {
    if (!job) return;
    const load = () => {
      api.jobs.get(job.id).then(setJob);
      if (job.currentRmsOpportunityId) {
        api.jobCurrentRms
          .pickList(job.id)
          .then((res) => {
            setPickItems(res.items);
            setPickListError(null);
          })
          .catch((e) => setPickListError(e.message));
      } else {
        api.cases.list(job.id).then(setCases);
      }
    };
    load();
    const t = setInterval(load, DATA_REFRESH_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, linked]);

  // Polled separately (and more often) so the full-screen change alert shows up promptly —
  // this is cheap: it's just reading a column already on the job row, not a live CRMS call.
  useEffect(() => {
    if (!job || !linked) return;
    const check = () =>
      api.jobCurrentRms.itemsDiff(job.id).then((res) => {
        if (res.diff) setDiff(res.diff);
      });
    check();
    const t = setInterval(check, DIFF_POLL_MS);
    return () => clearInterval(t);
  }, [job?.id, linked]);

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
      {diff && <ItemsDiffOverlay diff={diff} onDismiss={dismissDiff} />}

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

      {linked ? (
        <PickListView items={pickItems} error={pickListError} onToggle={togglePrepped} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function PickListView({
  items,
  error,
  onToggle,
}: {
  items: CurrentRmsPickItem[] | null;
  error: string | null;
  onToggle: (item: CurrentRmsPickItem) => void;
}) {
  if (error) return <p className="error" style={{ fontSize: '1.3rem' }}>Could not load pick list: {error}</p>;
  if (!items) return <p className="muted" style={{ fontSize: '1.4rem' }}>Loading pick list…</p>;
  if (items.length === 0) return <p className="muted" style={{ fontSize: '1.4rem' }}>No items on this opportunity yet.</p>;

  const preppedCount = items.filter((i) => i.prepped).length;

  return (
    <div>
      <p className="muted" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
        {preppedCount} / {items.length} prepped — tap a row as you pull it
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {items.map((item) => {
          const name = item.name || item.product_name || item.description || `Item #${item.id}`;
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
 * what was added, orange for quantity changes — flashed the moment the sync poller detects the
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
