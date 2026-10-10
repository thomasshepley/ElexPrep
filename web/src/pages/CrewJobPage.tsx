import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type CrewJobDetail } from '../api/client';

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not set yet';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * One expandable card — collapsed shows just the summary line, expanded reveals the detail
 * slot. Matches the "clickable to expand" interaction from the original ask; several of the
 * detail slots are still thin placeholders (venue access info, a real day schedule) that later
 * milestones fill in — the card already exists so they slot in without a layout change.
 */
function InfoCard({ label, summary, children }: { label: string; summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'block',
          width: '100%',
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h4 style={{ margin: 0 }}>{label}</h4>
          <span className="muted">{open ? '▲' : '▼'}</span>
        </div>
        <p style={{ margin: '0.4rem 0 0' }}>{summary}</p>
      </button>
      {open && <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>{children}</div>}
    </div>
  );
}

export default function CrewJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [detail, setDetail] = useState<CrewJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    api.crewPortal
      .jobDetail(jobId)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [jobId]);

  if (error) return <p className="error">{error}</p>;
  if (!detail) return <p className="muted">Loading…</p>;

  return (
    <div>
      <h1>{detail.what.jobName}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
        <InfoCard label="Who" summary={`You: ${detail.who.you.role}`}>
          {detail.who.others.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {detail.who.others.map((o, i) => (
                <li key={i}>
                  {o.displayName} — {o.role}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No other crew assigned yet.</p>
          )}
        </InfoCard>

        <InfoCard label="What" summary={detail.what.jobName}>
          <p>{detail.what.description ?? 'No further description yet.'}</p>
        </InfoCard>

        <InfoCard label="When" summary={formatDateTime(detail.when.startsAt)}>
          <p>
            Starts: {formatDateTime(detail.when.startsAt)}
            <br />
            Ends: {formatDateTime(detail.when.endsAt)}
          </p>
          {!detail.when.startsAt && <p className="muted">A day schedule will show here once one's set for this job.</p>}
        </InfoCard>

        <InfoCard label="Where" summary={detail.where.venue ?? 'Venue not set yet'}>
          <p>{detail.where.venue ?? 'No venue set for this job yet.'}</p>
          <p className="muted">Access notes, parking, and load-in info will show here once that's added.</p>
        </InfoCard>
      </div>
    </div>
  );
}
