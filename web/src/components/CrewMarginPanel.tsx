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
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Crew margin</h3>
        <button className="secondary" onClick={load} disabled={loading}>
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

          {data.chargeBreakdown.length > 1 && (
            <>
              <h4 style={{ marginTop: '1rem', marginBottom: '0.3rem' }}>Charge by opportunity</h4>
              <table>
                <tbody>
                  {data.chargeBreakdown.map((b) => (
                    <tr key={b.opportunityId}>
                      <td>{b.subject}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(b.serviceCharge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {data.costBreakdown.length > 0 && (
            <>
              <h4 style={{ marginTop: '1rem', marginBottom: '0.3rem' }}>Cost by crew member</h4>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Day rate</th>
                    <th>Days</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.costBreakdown.map((b) => (
                    <tr key={b.crewProfileId}>
                      <td>{b.name}</td>
                      <td>{b.role}</td>
                      <td>{formatMoney(b.dayRate)}</td>
                      <td>{b.days}</td>
                      <td>{formatMoney(b.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
