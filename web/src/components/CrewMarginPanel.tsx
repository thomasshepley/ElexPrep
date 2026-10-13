import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { isAdminRole } from '../auth/roles';
import { formatMoney, isIntegrationOff } from '../utils/format';
import { useToast } from './Toast';


/**
 * Admin-only crew profit/cost: what the client is charged for crew (from Current RMS, summed
 * across every opportunity sharing this job's Current RMS "project" - see
 * server/src/routes/currentRms.ts's /crew-margin) against what ElexPrep's own records say crew
 * actually cost on this job. Deliberately never rendered in the freelancer-facing crew portal -
 * same sensitivity tier as bank details/compliance documents.
 */
export default function CrewMarginPanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  // The role gate lives in a wrapper so the inner component's hooks always run in the same order.
  if (!isAdminRole(user?.role)) return null;
  return <CrewMarginPanelInner jobId={jobId} />;
}

function CrewMarginPanelInner({ jobId }: { jobId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.jobCrewMargin.get>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    api.jobCrewMargin
      .get(jobId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <div>
      <LinkedOpportunitiesPanel jobId={jobId} onChanged={load} />
      <MarginDisplay jobId={jobId} data={data} error={error} loading={loading} onRefresh={load} />
    </div>
  );
}

/**
 * Lets an admin explicitly tie another Current RMS opportunity (e.g. a separate "<Job> -
 * Crewing" quote) into this job's margin calc, for cases where Current RMS didn't group the
 * two under the same Project and the automatic sibling detection can't catch it.
 */
function LinkedOpportunitiesPanel({ jobId, onChanged }: { jobId: string; onChanged: () => void }) {
  const [links, setLinks] = useState<Awaited<ReturnType<typeof api.jobLinkedRmsOpportunities.list>>>([]);
  const [rmsId, setRmsId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.jobLinkedRmsOpportunities.list(jobId).then(setLinks).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.jobLinkedRmsOpportunities.create(jobId, Number(rmsId));
      setRmsId('');
      await refresh();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.jobLinkedRmsOpportunities.remove(jobId, id);
    await refresh();
    onChanged();
  };

  return (
    <div className="panel">
      <h3 style={{ margin: 0 }}>Linked crewing opportunities</h3>
      <p className="muted">
        Tie another Current RMS opportunity (e.g. a separate "{'{Job}'} - Crewing" quote) into
        this job's margin calc. Only needed if it isn't already picked up automatically - that
        happens when Current RMS groups it under the same Project as this job's main
        opportunity.
      </p>
      {links.length > 0 && (
        <ul style={{ margin: '0.5rem 0' }}>
          {links.map((l) => (
            <li key={l.id}>
              #{l.rmsId} {l.subject ? `- ${l.subject}` : ''}{' '}
              <button className="secondary" style={{ padding: '0.1rem 0.5rem' }} onClick={() => remove(l.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end', gap: '0.6rem' }}>
        <div className="field" style={{ width: '10rem' }}>
          <label htmlFor={`link-rms-id-${jobId}`}>Opportunity #</label>
          <input
            id={`link-rms-id-${jobId}`}
            value={rmsId}
            onChange={(e) => setRmsId(e.target.value)}
            placeholder="e.g. 4821"
            required
          />
        </div>
        <button type="submit" disabled={busy || !rmsId}>
          Link
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

const MARGIN_RATE_SOURCES: Record<string, string> = {
  override: 'their rate on this job',
  jobRole: "this job's role rate",
  profile: 'their agreed rate',
  globalRole: 'the portal role rate',
  default: 'the portal default rate',
  none: 'nowhere - no rate set',
};

type MarginData = Awaited<ReturnType<typeof api.jobCrewMargin.get>>;
type ChargeLine = MarginData['chargeBreakdown'][number]['lines'][number];

function MarginDisplay({
  jobId,
  data,
  error,
  loading,
  onRefresh,
}: {
  jobId: string;
  data: MarginData | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { showToast } = useToast();
  const [newName, setNewName] = useState('');

  const setLine = async (line: ChargeLine, excluded: boolean | null) => {
    try {
      await api.jobCrewMargin.setLine(jobId, line.key, line.name, excluded);
      onRefresh();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  const saveNames = async (names: string[], message: string) => {
    try {
      await api.jobCrewMargin.setExcludedLineNames(names);
      showToast(message);
      onRefresh();
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  // Moves a line onto the every-job list, dropping this job's own override so the list governs it.
  const alwaysLeaveOut = async (line: ChargeLine) => {
    if (!data) return;
    await api.jobCrewMargin.setLine(jobId, line.key, line.name, null).catch(() => {});
    await saveNames([...data.excludedLineNames, line.name.trim()], `"${line.name}" is now left out on every job`);
  };

  const allLines = data ? data.chargeBreakdown.flatMap((b) => b.lines.map((line) => ({ line, subject: b.subject }))) : [];
  const counted = allLines.filter((l) => !l.line.excluded);
  const leftOut = allLines.filter((l) => l.line.excluded);

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Crew margin</h3>
        {!isIntegrationOff(error) && (
          <button className="secondary" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        )}
      </div>
      <p className="muted">
        Charge is what Current RMS says the client is billed for crew/labour, across this job's
        linked opportunity and any other opportunity sharing its Current RMS project (e.g. a
        separate crewing quote). Cost is each crew member's day rate × the job days they're
        assigned to on the Schedule tab (* = not on any day yet, so the Crew tab's Days figure is
        used; † = some days have their own rate). Rates come from the job's role rates unless a
        person has their own - hover a rate to see where it came from. Admin-only - never shown
        to crew.
      </p>
      {error &&
        (isIntegrationOff(error) ? (
          <p className="muted">
            {/not linked/i.test(error)
              ? "This job isn't linked to a Current RMS opportunity yet, so there's no charge to compare against. Link one on the Current RMS tab."
              : "Current RMS is turned off, so there's no charge to compare against. Turn it on in Settings → Current RMS."}
          </p>
        ) : (
          <p className="error">{error}</p>
        ))}
      {loading && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            <div>
              <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Charged for crew
              </div>
              <strong style={{ fontSize: '1.3rem' }}>{formatMoney(data.chargeTotal)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Crew cost
              </div>
              <strong style={{ fontSize: '1.3rem' }}>{formatMoney(data.costTotal)}</strong>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Margin
              </div>
              <strong style={{ fontSize: '1.3rem', color: data.margin < 0 ? 'var(--danger)' : undefined }}>
                {formatMoney(data.margin)}
                {data.marginPercent !== null && ` (${data.marginPercent.toFixed(1)}%)`}
              </strong>
            </div>
          </div>

          <h4 style={{ marginTop: '1rem', marginBottom: '0.3rem' }}>
            Current RMS vs. ElexPrep - cross-reference man days
          </h4>
          <p className="muted" style={{ marginTop: 0 }}>
            What Current RMS's Service lines say is charged for crew, side by side with what
            ElexPrep's own crew assignments say they cost - same columns on both sides so you
            can spot a mismatch in man days or rate at a glance.
          </p>
          <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
              <strong>Current RMS (charged)</strong>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {counted.map(({ line, subject }) => (
                      <tr key={line.key}>
                        <td>
                          {line.name}
                          {data.chargeBreakdown.length > 1 && <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{subject}</div>}
                          {line.onPortalList && (
                            <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                              Counted on this job (normally left out)
                            </div>
                          )}
                        </td>
                        <td>{line.quantity}</td>
                        <td>{formatMoney(line.rate)}</td>
                        <td>{formatMoney(line.total)}</td>
                        <td>
                          <button
                            type="button"
                            className="secondary margin-line-button"
                            title="Leave this line out of the crew charge on this job"
                            onClick={() => setLine(line, line.onPortalList ? null : true)}
                          >
                            Leave out
                          </button>
                        </td>
                      </tr>
                    ))}
                    {counted.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          {leftOut.length ? 'Every Service line is left out.' : 'No Service-type charge lines found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{formatMoney(data.chargeTotal)}</strong>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {leftOut.length > 0 && (
                <details className="margin-left-out">
                  <summary className="muted">
                    Left out of the charge: {leftOut.length} line{leftOut.length === 1 ? '' : 's'}, {formatMoney(data.excludedChargeTotal)}
                  </summary>
                  <ul className="plain-list">
                    {leftOut.map(({ line, subject }) => (
                      <li key={line.key} className="margin-left-out-line">
                        <span className="margin-left-out-name">
                          <s>{line.name}</s> <span className="muted">{formatMoney(line.total)}</span>
                          <span className="muted" style={{ display: 'block', fontSize: 'var(--text-xs)' }}>
                            {line.excludedBy === 'portal' ? 'Left out on every job' : 'Left out on this job'}
                            {data.chargeBreakdown.length > 1 ? ` · ${subject}` : ''}
                          </span>
                        </span>
                        <span className="row" style={{ gap: '0.4rem' }}>
                          {line.excludedBy === 'job' && !line.onPortalList && (
                            <button type="button" className="secondary margin-line-button" onClick={() => alwaysLeaveOut(line)}>
                              Always leave out
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary margin-line-button"
                            onClick={() => setLine(line, line.excludedBy === 'portal' ? false : null)}
                          >
                            Put back
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="margin-left-out">
                <summary className="muted">Always left out on every job ({data.excludedLineNames.length})</summary>
                <p className="muted" style={{ fontSize: 'var(--text-sm)', margin: '0.3rem 0' }}>
                  Charge lines with these names never count as crew charge, on any job (capitals and spacing don&apos;t matter).
                </p>
                <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                  {data.excludedLineNames.map((n) => (
                    <span key={n} className="chip chip-neutral">
                      {n}
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={`Stop leaving out ${n}`}
                        onClick={() => saveNames(data.excludedLineNames.filter((x) => x !== n), `"${n}" counts again`)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="row"
                  style={{ gap: '0.4rem', marginTop: '0.5rem' }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newName.trim()) return;
                    saveNames([...data.excludedLineNames, newName.trim()], `"${newName.trim()}" is now left out on every job`);
                    setNewName('');
                  }}
                >
                  <input aria-label="Line name to always leave out" placeholder="e.g. Transport" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button type="submit" className="secondary" disabled={!newName.trim()}>
                    Add
                  </button>
                </form>
              </details>
            </div>

            <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
              <strong>ElexPrep (crew cost)</strong>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costBreakdown.map((b) => (
                      <tr key={b.crewProfileId}>
                        <td>
                          {b.name}
                          <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{b.role}</div>
                        </td>
                        <td title={b.daysFromSchedule ? 'Job days assigned on the Schedule tab' : 'Not on any scheduled day yet - using the Days figure from the Crew tab'}>
                          {b.days}
                          {!b.daysFromSchedule && <span className="muted"> *</span>}
                        </td>
                        <td
                          title={[
                            `From ${MARGIN_RATE_SOURCES[b.dayRateSource] ?? 'their rates'}`,
                            b.suggestedRate ? `their rate card asks ${formatMoney(b.suggestedRate)}` : '',
                            b.dayOverrides ? `${b.dayOverrides} day(s) at their own rate` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          {b.zeroRated ? <span className="muted">Zero-rated</span> : formatMoney(b.dayRate)}
                          {b.dayOverrides > 0 && <span className="muted"> †</span>}
                        </td>
                        <td>{formatMoney(b.cost)}</td>
                      </tr>
                    ))}
                    {data.costBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          No crew assigned to this job yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{formatMoney(data.costTotal)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
