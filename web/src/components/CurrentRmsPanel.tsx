import { useEffect, useState } from 'react';
import { api, type CurrentRmsOpportunity, type CurrentRmsPickItem } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export default function CurrentRmsPanel({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const canLink = isAdmin || Boolean(user?.permissions?.linkCurrentRms);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [opportunity, setOpportunity] = useState<CurrentRmsOpportunity | undefined>();
  const [rmsAlertAt, setRmsAlertAt] = useState<string | null>(null);
  const [items, setItems] = useState<CurrentRmsPickItem[] | null>(null);
  const [pickListError, setPickListError] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api.jobCurrentRms.get(jobId).then((res) => {
      setLinked(res.linked);
      setOpportunity(res.opportunity);
      setRmsAlertAt(res.rmsAlertAt ?? null);
    });

  useEffect(() => {
    refresh();
    setItems(null);
  }, [jobId]);

  const loadPickList = async () => {
    setPickListError(null);
    try {
      const res = await api.jobCurrentRms.pickList(jobId);
      setItems(res.items);
    } catch (e) {
      setPickListError((e as Error).message);
    }
  };

  const link = async () => {
    setError(null);
    const rmsId = Number(linkInput);
    if (!rmsId) return setError('Enter a numeric Current RMS opportunity ID');
    setBusy(true);
    try {
      await api.jobCurrentRms.link(jobId, rmsId);
      setLinkInput('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!confirm('Unlink this job from its Current RMS opportunity?')) return;
    await api.jobCurrentRms.unlink(jobId);
    setItems(null);
    refresh();
  };

  const acknowledge = async () => {
    await api.jobCurrentRms.acknowledge(jobId);
    setRmsAlertAt(null);
  };

  if (linked === null) return null;

  return (
    <div>
      {rmsAlertAt && (
        <div className="panel" style={{ borderColor: '#c084fc' }}>
          <strong>This job's linked Current RMS opportunity has changed</strong>{' '}
          <span className="muted">({new Date(rmsAlertAt).toLocaleString()})</span>
          <div style={{ marginTop: '0.5rem' }}>
            <button className="secondary" onClick={acknowledge}>
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {!linked && (
        <div className="panel">
          <h3>Not linked to Current RMS</h3>
          {canLink ? (
            <>
              <p className="muted">
                Link this job to an opportunity by its numeric Current RMS ID (find it in{' '}
                <a href="/settings/current-rms">Settings → Current RMS</a>), or import a job
                directly from there instead.
              </p>
              <div className="row">
                <input
                  placeholder="Opportunity ID"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  style={{ width: 160 }}
                />
                <button onClick={link} disabled={busy}>
                  Link
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </>
          ) : (
            <p className="muted">Not linked to a Current RMS opportunity.</p>
          )}
        </div>
      )}

      {linked && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{opportunity?.subject ?? 'Linked opportunity'}</h3>
            {canLink && (
              <button className="secondary" onClick={unlink}>
                Unlink
              </button>
            )}
          </div>
          {opportunity && (
            <table style={{ maxWidth: 480 }}>
              <tbody>
                <tr>
                  <td>Customer</td>
                  <td>{opportunity.memberName}</td>
                </tr>
                <tr>
                  <td>Status</td>
                  <td>{opportunity.status}</td>
                </tr>
                <tr>
                  <td>Dates</td>
                  <td>
                    {opportunity.startsAt ? new Date(opportunity.startsAt).toLocaleDateString() : '?'} –{' '}
                    {opportunity.endsAt ? new Date(opportunity.endsAt).toLocaleDateString() : '?'}
                  </td>
                </tr>
                <tr>
                  <td>RMS last updated</td>
                  <td className="muted">
                    {opportunity.rmsUpdatedAt ? new Date(opportunity.rmsUpdatedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '1rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>Pick list</h4>
              <button className="secondary" onClick={loadPickList}>
                {items ? 'Refresh' : 'Load pick list'}
              </button>
            </div>
            {pickListError && <p className="error">{pickListError}</p>}
            {items && items.length === 0 && <p className="muted">No items returned.</p>}
            {items && items.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Current RMS status</th>
                    <th>Prepped</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) =>
                    i.isGroup ? (
                      <tr key={i.id}>
                        <td colSpan={4} style={{ fontWeight: 700, paddingTop: '0.75rem' }}>
                          {i.name ?? i.product_name ?? i.description ?? `#${i.id}`}
                        </td>
                      </tr>
                    ) : (
                      <tr key={i.id}>
                        <td>{i.name ?? i.product_name ?? i.description ?? `#${i.id}`}</td>
                        <td>{i.quantity ?? ''}</td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              padding: '0.15rem 0.5rem',
                              borderRadius: 999,
                              background: i.bookedOut ? '#1FA34C' : '#555',
                              color: '#fff',
                            }}
                          >
                            {i.status_name ?? (i.bookedOut ? 'Booked out' : 'Not booked out')}
                          </span>
                        </td>
                        <td>{i.prepped ? '✓' : ''}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
