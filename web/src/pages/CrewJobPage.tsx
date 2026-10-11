import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, type CrewJobDetail, type JobScheduleItem, type KitListItem, type JobDocument, type Plot } from '../api/client';
import Chevron from '../components/Chevron';
import DayTimeline from '../components/DayTimeline';
import { WhoIcon, WhatIcon, WhenIcon, WhereIcon, WhyIcon } from '../components/Icons';
import LabelTypeForm, { AD_HOC_TYPES, type AdHocType } from '../components/LabelTypeForm';

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
 * and keeps a visible keyboard focus ring.
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

function WhySubsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h4 style={{ marginBottom: '0.5rem' }}>{title}</h4>
      {children}
    </div>
  );
}

/**
 * The "request to prep system" form: a real label creator (same type + content fields as the
 * admin's ad hoc label creator, via the shared LabelTypeForm) rather than a free-text box
 * standing in for one. Submits as a PENDING CrewLabelRequest — it doesn't print until an admin
 * approves it from the job's Labels tab.
 */
function RequestLabelForm({ jobId }: { jobId: string }) {
  const [sent, setSent] = useState(false);

  const submit = async (labelType: AdHocType, content: Record<string, unknown>, quantity: number) => {
    setSent(false);
    await api.crewPortal.submitLabelRequest(jobId, { labelType, content, quantity });
    setSent(true);
  };

  return (
    <div>
      <LabelTypeForm types={[...AD_HOC_TYPES]} onSubmit={submit} submitLabel="Send request" />
      {sent && <p className="muted">Request sent — it'll show up for prep to review before it prints.</p>}
    </div>
  );
}

export default function CrewJobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [detail, setDetail] = useState<CrewJobDetail | null>(null);
  const [schedule, setSchedule] = useState<JobScheduleItem[]>([]);
  const [kitList, setKitList] = useState<KitListItem[]>([]);
  const [documents, setDocuments] = useState<JobDocument[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    api.crewPortal.jobDetail(jobId).then(setDetail).catch((e) => setError(e.message));
    api.crewPortal.schedule(jobId).then(setSchedule).catch(() => {});
    api.crewPortal.kitList(jobId).then((r) => setKitList(r.items)).catch(() => {});
    api.crewPortal.documents(jobId).then(setDocuments).catch(() => {});
    api.crewPortal.plots(jobId).then(setPlots).catch(() => {});
  }, [jobId]);

  if (error) return <p className="error">{error}</p>;
  if (!detail || !jobId) return <p className="muted">Loading…</p>;

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

      <div style={{ marginTop: '0.9rem' }}>
        <InfoCard
          id="why"
          icon={<WhyIcon />}
          label="Why"
          summary="Day schedule, CAD, kit list, documents, and requests"
        >
          <WhySubsection title="Day schedule">
            {schedule.length > 0 ? <DayTimeline items={schedule} /> : <p className="muted">No schedule has been set for this job yet.</p>}
          </WhySubsection>

          <WhySubsection title="CAD">
            {plots.length === 0 && <p className="muted">No CAD files uploaded yet.</p>}
            {plots.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {plots.map((p) => (
                  <a key={p.id} href={api.crewPortal.plotUrl(jobId, p.id)} target="_blank" rel="noreferrer">
                    {p.originalName}
                  </a>
                ))}
              </div>
            )}
          </WhySubsection>

          <WhySubsection title="Kit list">
            {kitList.length === 0 && <p className="muted">No kit list available for this job.</p>}
            {kitList.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {kitList.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </WhySubsection>

          <WhySubsection title="Documents">
            {documents.length === 0 && <p className="muted">No documents uploaded yet.</p>}
            {documents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {documents.map((d) => (
                  <a key={d.id} href={api.crewPortal.documentUrl(jobId, d.id)} target="_blank" rel="noreferrer">
                    {d.originalName}
                  </a>
                ))}
              </div>
            )}
          </WhySubsection>

          <WhySubsection title="Need something prepped?">
            <RequestLabelForm jobId={jobId} />
          </WhySubsection>
        </InfoCard>
      </div>
    </div>
  );
}
