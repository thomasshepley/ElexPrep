import { SkeletonRegion, SkeletonRows } from './Skeleton';
import { useEffect, useState } from 'react';
import { api, type JobDocument } from '../api/client';
import FileInput from './FileInput';
import { formatDate } from '../utils/format';
import { useDialog } from './Dialog';
import { useToast } from './Toast';

export default function JobDocumentsPanel({ jobId }: { jobId: string }) {
  const dialog = useDialog();
  const { showToast } = useToast();
  const [documentsLoaded, setDocuments] = useState<JobDocument[] | null>(null);
  const documents = documentsLoaded ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => api.jobDocuments.list(jobId).then(setDocuments).catch((e) => setError(e.message));

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await api.jobDocuments.upload(jobId, file);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: JobDocument) => {
    if (!(await dialog.confirm({ title: `Remove ${d.originalName}?`, message: 'Crew on this job will no longer see it.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await api.jobDocuments.remove(jobId, d.id);
      showToast('Document removed', 'info');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
    refresh();
  };

  return (
    <div className="panel">
      <h3>Job documents</h3>
      <p className="muted">Call sheets, info packs, and other general files - visible to crew assigned to this job.</p>
      <FileInput accept="application/pdf,image/*" disabled={busy} onFile={upload} label="Upload document" />
      {error && <p className="error">{error}</p>}

      {documentsLoaded === null && !error && <SkeletonRegion style={{ marginTop: '0.75rem' }}><SkeletonRows rows={3} cols={3} /></SkeletonRegion>}
      {documentsLoaded !== null && documents.length === 0 && !error && <p className="muted">No documents yet.</p>}
      {documents.length > 0 && (
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
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <a href={api.jobDocuments.fileUrl(jobId, d.id)} target="_blank" rel="noreferrer">
                      {d.originalName}
                    </a>
                  </td>
                  <td className="muted">{formatDate(d.createdAt)}</td>
                  <td>
                    <button className="secondary" onClick={() => remove(d)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
