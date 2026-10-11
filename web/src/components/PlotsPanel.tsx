import { useEffect, useState } from 'react';
import { api, type Plot } from '../api/client';
import FileInput from './FileInput';
import InlinePdfViewer from './InlinePdfViewer';

export default function PlotsPanel({ jobId }: { jobId: string }) {
  const [plots, setPlots] = useState<Plot[]>([]);
  const [viewing, setViewing] = useState<Plot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.plots.list(jobId).then(setPlots);

  useEffect(() => {
    refresh();
    setViewing(null);
  }, [jobId]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const plot = await api.plots.upload(jobId, file);
      await refresh();
      setViewing(plot);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plot: Plot) => {
    if (!confirm(`Delete plot "${plot.originalName}"?`)) return;
    await api.plots.remove(jobId, plot.id);
    if (viewing?.id === plot.id) setViewing(null);
    refresh();
  };

  return (
    <div>
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
                  <td>
                    <a
                      href={api.plots.fileUrl(jobId, p.id)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        setViewing(p);
                      }}
                    >
                      {p.originalName}
                    </a>
                  </td>
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

      {viewing && (
        <div className="panel">
          <h3>{viewing.originalName}</h3>
          <InlinePdfViewer url={api.plots.fileUrl(jobId, viewing.id)} title={viewing.originalName} />
        </div>
      )}
    </div>
  );
}
