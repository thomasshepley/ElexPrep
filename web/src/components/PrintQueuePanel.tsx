import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PrintQueueItem, type AdHocLabel, type PrintJob, type PrintMethod } from '../api/client';

function summarize(labelType: string, content: Record<string, unknown>): string {
  switch (labelType) {
    case 'FIXTURE':
      return `#${content.address} — Uni ${content.mainUniverse}/${content.mainAddress}`;
    case 'PAL':
      return `${content.location ?? ''} — ${content.title ?? ''} ${content.subtitle ?? ''}`;
    case 'TRUSS_SPIKE_POSITION':
      return String(content.address ?? '');
    case 'TRUSS_SPIKE_TIP':
      return String(content.text ?? 'DO NOT TIP');
    case 'TRUSS_SPIKE_SACN':
      return `${content.ipAddress ?? ''}`;
    case 'CABLE':
      return `${content.text ?? ''}${content.isDmx ? ' (DMX)' : ''}`;
    case 'RACK':
      return `${content.title ?? ''} ${content.subtitle ?? ''}`;
    default:
      return JSON.stringify(content);
  }
}

export default function PrintQueuePanel({ jobId }: { jobId: string }) {
  const [queue, setQueue] = useState<PrintQueueItem[]>([]);
  const [adHoc, setAdHoc] = useState<AdHocLabel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trayMap, setTrayMap] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PrintMethod>('DRY_RUN');
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api.printQueue.list(jobId).then(({ queue, adHoc }) => {
      setQueue(queue);
      setAdHoc(adHoc);
      setSelected(new Set(queue.filter((q) => q.status === 'PENDING').map((q) => q.id)));
    });

  const refreshPrintJobs = () => api.printJobs.list(jobId).then(setPrintJobs);

  useEffect(() => {
    refresh();
    refreshPrintJobs();
    api.printQueue.printerConfig(jobId).then((c) => {
      setTrayMap(c.trayMap);
      setMethod(c.method);
    });
  }, [jobId]);

  const build = async () => {
    setBusy(true);
    try {
      await api.printQueue.build(jobId, { includeFixtureLabels: true, includePalLabels: true });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const setQty = async (id: string, quantity: number) => {
    await api.printQueue.updateItem(jobId, id, { quantity });
    refresh();
  };

  const removeItem = async (id: string) => {
    await api.printQueue.removeItem(jobId, id);
    refresh();
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmSelected = async (override = false): Promise<boolean> => {
    const ids = [...selected];
    if (!ids.length) return true;
    try {
      await api.printQueue.confirm(jobId, ids, override);
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('safety cap') && !override) {
        if (confirm(`${msg}\n\nPrint anyway?`)) return confirmSelected(true);
        return false;
      }
      setError(msg);
      return false;
    }
  };

  const confirmAndDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await confirmSelected())) return;
      window.location.href = api.printQueue.pdfUrl(jobId);
      setTimeout(refresh, 1500);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndSend = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await confirmSelected())) return;
      await api.printQueue.send(jobId);
      await refresh();
      await refreshPrintJobs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pendingItems = queue.filter((q) => q.status === 'PENDING');
  const confirmedOrPrinted = queue.filter((q) => q.status !== 'PENDING');

  return (
    <div>
      <div className="panel">
        <h3>Printer routing</h3>
        <p className="muted">
          {Object.entries(trayMap).map(([type, tray]) => `${type}: ${tray}`).join(' · ')}
        </p>
        <p className="muted">
          Delivery method: <strong>{method === 'DRY_RUN' ? 'Dry run (no printing)' : method === 'DIRECT_9100' ? 'Direct network (port 9100)' : 'Windows agent'}</strong>
          {' — '}configure in <Link to="/settings/printer">Printer Settings</Link>.
        </p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Print preview</h3>
          <button onClick={build} disabled={busy}>
            Build from patch + cases
          </button>
        </div>

        {pendingItems.length === 0 && adHoc.length === 0 && (
          <p className="muted">Nothing queued yet — build from patch/cases or add ad hoc labels.</p>
        )}

        {pendingItems.length > 0 && (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Type</th>
                <th>Content</th>
                <th>Qty</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                  </td>
                  <td>{item.labelType}</td>
                  <td>{summarize(item.labelType, item.content)}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      defaultValue={item.quantity}
                      style={{ width: 60 }}
                      onBlur={(e) => setQty(item.id, Number(e.target.value))}
                    />
                  </td>
                  <td>
                    <button className="secondary" onClick={() => removeItem(item.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {adHoc.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input type="checkbox" checked disabled title="Ad hoc labels are always included" />
                  </td>
                  <td>{item.labelType}</td>
                  <td>{summarize(item.labelType, item.content)}</td>
                  <td>{item.quantity}</td>
                  <td className="muted">ad hoc</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && <p className="error">{error}</p>}

        <div className="row" style={{ marginTop: '1rem' }}>
          <button onClick={confirmAndSend} disabled={busy || (pendingItems.length === 0 && adHoc.length === 0)}>
            Confirm &amp; send to printer
          </button>
          <button
            className="secondary"
            onClick={confirmAndDownload}
            disabled={busy || (pendingItems.length === 0 && adHoc.length === 0)}
          >
            Confirm &amp; download PDF
          </button>
        </div>
      </div>

      {printJobs.length > 0 && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Print jobs</h3>
            <button className="secondary" onClick={refreshPrintJobs}>
              Refresh
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Tray</th>
                <th>Pages</th>
                <th>Method</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {printJobs.map((pj) => (
                <tr key={pj.id}>
                  <td>{pj.labelType}</td>
                  <td>{trayMap[pj.labelType] ?? pj.tray}</td>
                  <td>{pj.pages}</td>
                  <td className="muted">{pj.method}</td>
                  <td>
                    {pj.status}
                    {pj.error && <div className="error">{pj.error}</div>}
                  </td>
                  <td className="row">
                    <a href={api.printJobs.pdfUrl(pj.id)} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                    {(pj.status === 'FAILED' || pj.status === 'CANCELLED') && (
                      <button
                        className="secondary"
                        onClick={() => api.printJobs.retry(pj.id).then(refreshPrintJobs)}
                      >
                        Retry
                      </button>
                    )}
                    {pj.status === 'QUEUED' && (
                      <button
                        className="secondary"
                        onClick={() => api.printJobs.cancel(pj.id).then(refreshPrintJobs)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmedOrPrinted.length > 0 && (
        <div className="panel">
          <h3>Previously confirmed / printed</h3>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Content</th>
                <th>Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {confirmedOrPrinted.map((item) => (
                <tr key={item.id}>
                  <td>{item.labelType}</td>
                  <td>{summarize(item.labelType, item.content)}</td>
                  <td>{item.quantity}</td>
                  <td className="muted">{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
