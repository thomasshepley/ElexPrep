import { useEffect, useState } from 'react';
import { api, type JobDocument } from '../api/client';
import FileInput from './FileInput';

export default function JobDocumentsPanel({ jobId }: { jobId: string }) {
  const [documents, setDocuments] = useState<JobDocument[]>([]);
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

  const remove = async (id: string) => {
    await api.jobDocuments.remove(jobId, id);
    refresh();
  };

  return (
    <div className="panel">
      <h3>Job documents</h3>
      <p className="muted">Call sheets, info packs, and other general files — visible to crew assigned to this job.</p>
      <FileInput accept="application/pdf,image/*" disabled={busy} onFile={upload} label="Upload document" />
      {error && <p className="error">{error}</p>}

      {documents.length > 0 && (
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
                <td className="muted">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="secondary" onClick={() => remove(d.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
