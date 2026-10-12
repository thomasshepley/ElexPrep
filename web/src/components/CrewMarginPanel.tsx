import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

function formatMoney(n: number): string {
  return `£${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Admin-only crew profit/cost: what the client is charged for crew (from Current RMS, summed
 * across every opportunity sharing this job's Current RMS "project" — see
 * server/src/routes/currentRms.ts's /crew-margin) against what ElexPrep's own records say crew
 * actually cost on this job. Deliberately never rendered in the freelancer-facing crew portal —
 * same sensitivity tier as bank details/compliance documents.
 */
export default function CrewMarginPanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.jobCrewMargin.get>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user?.role !== 'ADMIN') return null;

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
      <MarginDisplay data={data} error={error} loading={loading} onRefresh={load} />
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
        this job's margin calc. Only needed if it isn't already picked up automatically — that
        happens when Current RMS groups it under the same Project as this job's main
        opportunity.
      </p>
      {links.length > 0 && (
        <ul style={{ margin: '0.5rem 0' }}>
          {links.map((l) => (
            <li key={l.id}>
              #{l.rmsId} {l.subject ? `— ${l.subject}` : ''}{' '}
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

function MarginDisplay({
  data,
  error,
  loading,
  onRefresh,
}: {
  data: Awaited<ReturnType<typeof api.jobCrewMargin.get>> | null;
  error: string | null;
  loading: boolean;
  onRefresh: () => void;
}) {

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Crew margin</h3>
        <button className="secondary" onClick={onRefresh} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Charge is what Current RMS says the client is billed for crew/labour, across this job's
        linked opportunity and any other opportunity sharing its Current RMS project (e.g. a
        separate crewing quote). Cost is this job's crew assignments (day rate × days). Admin-only
        — never shown to crew.
      </p>
      {error && <p className="error">{error}</p>}
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
            Current RMS vs. ElexPrep — cross-reference man days
          </h4>
          <p className="muted" style={{ marginTop: 0 }}>
            What Current RMS's Service lines say is charged for crew, side by side with what
            ElexPrep's own crew assignments say they cost — same columns on both sides so you
            can spot a mismatch in man days or rate at a glance.
          </p>
          <div className="row" style={{ gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
              <strong>Current RMS (charged)</strong>
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
                  {data.chargeBreakdown.flatMap((b) =>
                    b.lines.map((line, i) => (
                      <tr key={`${b.opportunityId}-${i}`}>
                        <td>
                          {line.name}
                          {data.chargeBreakdown.length > 1 && <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{b.subject}</div>}
                        </td>
                        <td>{line.quantity}</td>
                        <td>{formatMoney(line.rate)}</td>
                        <td>{formatMoney(line.total)}</td>
                      </tr>
                    ))
                  )}
                  {data.chargeBreakdown.every((b) => b.lines.length === 0) && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No Service-type charge lines found.
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
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ flex: '1 1 20rem', minWidth: '20rem' }}>
              <strong>ElexPrep (crew cost)</strong>
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
                      <td>{b.days}</td>
                      <td title={`Suggested rate (profile/global default): ${formatMoney(b.suggestedRate)}`}>
                        {b.zeroRated ? <span className="muted">Zero-rated</span> : formatMoney(b.dayRate)}
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
        </>
      )}
    </div>
  );
}
