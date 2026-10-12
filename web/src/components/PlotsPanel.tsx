import { useEffect, useState } from 'react';
import { api, type Plot } from '../api/client';
import FileInput from './FileInput';

/**
 * Upload/manage uploaded CAD plot PDFs. Previewing lives in CadPlotsViewer, shown once above
 * this panel on the Plots tab (alongside the auto-detected OneDrive CAD PDF and any
 * CAD-flagged OneDrive shares) - this panel only needs to handle add/remove.
 */
export default function PlotsPanel({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.plots.list(jobId).then((p) => {
    setPlots(p);
    onChange?.();
  });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await api.plots.upload(jobId, file);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plot: Plot) => {
    if (!confirm(`Delete plot "${plot.originalName}"?`)) return;
    await api.plots.remove(jobId, plot.id);
    refresh();
  };

  return (
    <div className="panel">
      <h3>Plot CAD PDFs</h3>
      <FileInput accept="application/pdf,.pdf" disabled={busy} onFile={upload} label="Choose PDF" />
      {error && <p className="error">{error}</p>}
      {plots.length > 0 && (
        <table style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>File</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {plots.map((p) => (
              <tr key={p.id}>
                <td>{p.originalName}</td>
                <td className="muted">{new Date(p.createdAt).toLocaleString()}</td>
                <td>
                  <button className="secondary" onClick={() => remove(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plots.length === 0 && <p className="muted">No plots uploaded yet.</p>}
    </div>
  );
}
