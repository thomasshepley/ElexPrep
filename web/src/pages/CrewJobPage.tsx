import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, type CrewJobDetail } from '../api/client';
import Chevron from '../components/Chevron';
import { WhoIcon, WhatIcon, WhenIcon, WhereIcon } from '../components/Icons';

const NO_DATE = 'No date set yet';
const NO_VENUE = 'No venue set yet';

function formatDateTime(iso: string | null): string {
  if (!iso) return NO_DATE;
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
 * slot. The trigger is a real <button> wrapped in an <h2> (the WAI-ARIA disclosure pattern),
 * not a div with a nested heading, so this reads correctly to screen-reader heading navigation
 * and keeps a visible keyboard focus ring. Several of the detail slots are still thin
 * placeholders (venue access info, a real day schedule) that later milestones fill in — the
 * card already exists so they slot in without a layout change.
 */
function InfoCard({
  id,
  icon,
  label,
  summary,
  children,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  summary: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = `${id}-detail`;
  return (
    <div className="panel card-interactive">
      <h2 className="info-card-heading">
        <button type="button" className="info-card-trigger" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen((o) => !o)}>
          <span className="info-card-icon">{icon}</span>
          <span className="info-card-label">{label}</span>
          <Chevron open={open} />
        </button>
      </h2>
      <p className="info-card-summary">{summary}</p>
      {open && (
        <div id={contentId} className="info-card-detail">
          {children}
        </div>
      )}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.9rem', marginTop: '1.25rem' }}>
        <InfoCard id="who" icon={<WhoIcon />} label="Who" summary={`You: ${detail.who.you.role}`}>
          <p className="muted" style={{ margin: '0 0 0.5rem' }}>
            You
          </p>
          <span className="chip chip-role">{detail.who.you.role}</span>
          {detail.who.others.length > 0 && (
            <>
              <p className="muted" style={{ margin: '1rem 0 0.5rem' }}>
                Also on this job
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {detail.who.others.map((o, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{o.displayName}</span>
                    <span className="chip chip-role">{o.role}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </InfoCard>

        <InfoCard id="what" icon={<WhatIcon />} label="What" summary={detail.what.jobName}>
          <p>{detail.what.description ?? 'No further description yet.'}</p>
        </InfoCard>

        <InfoCard id="when" icon={<WhenIcon />} label="When" summary={formatDateTime(detail.when.startsAt)}>
          <p>
            Starts: {formatDateTime(detail.when.startsAt)}
            <br />
            Ends: {formatDateTime(detail.when.endsAt)}
          </p>
          {!detail.when.startsAt && <p className="muted">A day schedule will show here once one's set for this job.</p>}
        </InfoCard>

        <InfoCard id="where" icon={<WhereIcon />} label="Where" summary={detail.where.venue ?? NO_VENUE}>
          <p>{detail.where.venue ?? NO_VENUE}</p>
          <p className="muted">Access notes, parking, and load-in info will show here once that's added.</p>
        </InfoCard>
      </div>
    </div>
  );
}
