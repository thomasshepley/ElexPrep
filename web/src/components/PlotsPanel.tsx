import { useEffect, useState } from 'react';
import { api, type Plot } from '../api/client';
import FileInput from './FileInput';
import { useAuth } from '../auth/AuthContext';
import { hasPermission } from '../auth/roles';
import { useDialog } from './Dialog';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { formatDateTime } from '../utils/format';

/**
 * Upload/manage uploaded CAD plot PDFs. Previewing lives in CadPlotsViewer, shown once above
 * this panel on the Plots tab (alongside the auto-detected OneDrive CAD PDF and any
 * CAD-flagged OneDrive shares) - this panel only needs to handle add/remove.
 */
export default function PlotsPanel({ jobId, onChange }: { jobId: string; onChange?: (plots: Plot[]) => void }) {
  const dialog = useDialog();
  const { run } = useAsyncAction();
  const { user } = useAuth();
  const canEdit = hasPermission(user, 'editJobs');
  const [plots, setPlots] = useState<Plot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.plots.list(jobId).then((p) => {
    setPlots(p);
    onChange?.(p);
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
    if (!(await dialog.confirm({ title: 'Delete this plot?', message: plot.originalName, confirmLabel: 'Delete', danger: true }))) return;
    await run(() => api.plots.remove(jobId, plot.id), { success: 'Plot deleted' });
    refresh();
  };

  return (
    <div className="panel">
      <h3>Plot CAD PDFs</h3>
      {canEdit && <FileInput accept="application/pdf,.pdf" disabled={busy} onFile={upload} label="Choose PDF" />}
      {error && <p className="error">{error}</p>}
      {plots.length > 0 && (
        <div className="table-scroll">
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
                  <td className="muted">{formatDateTime(p.createdAt)}</td>
                  <td>
                    {canEdit && (
                      <button className="secondary" onClick={() => remove(p)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {plots.length === 0 && <p className="muted">No plots uploaded yet.</p>}
    </div>
  );
}
