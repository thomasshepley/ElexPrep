import { useEffect, useState } from 'react';
import { api, type PrintQueueItem, type AdHocLabel } from '../api/client';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    api.printQueue.list(jobId).then(({ queue, adHoc }) => {
      setQueue(queue);
      setAdHoc(adHoc);
      setSelected(new Set(queue.filter((q) => q.status === 'PENDING').map((q) => q.id)));
    });

  useEffect(() => {
    refresh();
    api.printQueue.printerConfig(jobId).then((c) => setTrayMap(c.trayMap));
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

  const confirmAndPrint = async (override = false) => {
    setBusy(true);
    setError(null);
    try {
      const ids = [...selected];
      if (ids.length) await api.printQueue.confirm(jobId, ids, override);
      window.location.href = api.printQueue.pdfUrl(jobId);
      setTimeout(refresh, 1500);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('safety cap') && !override) {
        if (confirm(`${msg}\n\nPrint anyway?`)) await confirmAndPrint(true);
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const pendingItems = queue.filter((q) => q.status === 'PENDING');
  const confirmedOrPrinted = queue.filter((q) => q.status !== 'PENDING');

  return (
    <div>
      <div className="panel">
        <h3>Printer routing — {trayMap && 'Develop ineo+ 3320i'}</h3>
        <p className="muted">
          {Object.entries(trayMap).map(([type, tray]) => `${type}: ${tray}`).join(' · ')}
        </p>
        <p className="muted">
          Real tray selection needs to run on the office machine with the printer driver installed —
          this preview and PDF generation works anywhere; wiring it to the physical printer is a
          later phase (see README).
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

        <div style={{ marginTop: '1rem' }}>
          <button onClick={() => confirmAndPrint(false)} disabled={busy || (pendingItems.length === 0 && adHoc.length === 0)}>
            Confirm selected &amp; generate print PDF
          </button>
        </div>
      </div>

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
