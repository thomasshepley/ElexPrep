import { useEffect, useState } from 'react';
import { api, type PatchImportCandidate, type PatchSourceFile } from '../api/client';
import Modal from './Modal';
import { formatDateTime } from '../utils/format';

function formatSize(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Popup listing every CSV and PDF in the job's OneDrive folder (plus Plots-tab PDFs), likeliest
 * patch first. Clicking one reads it and hands back a PENDING candidate for review - a file
 * that's been imported before can be picked again.
 */
export default function PatchFilePicker({
  jobId,
  onClose,
  onPicked,
}: {
  jobId: string;
  onClose: () => void;
  onPicked: (candidate: PatchImportCandidate) => void;
}) {
  const [files, setFiles] = useState<PatchSourceFile[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.patch
      .listOneDriveFiles(jobId)
      .then((res) => {
        setFiles(res.files);
        setTruncated(res.truncated);
      })
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  const pick = async (file: PatchSourceFile) => {
    setReadingKey(file.key);
    setError(null);
    try {
      const res = await api.patch.readOneDriveFile(jobId, file.key);
      onPicked(res.candidate);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReadingKey(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (files ?? []).filter((f) => !q || `${f.name} ${f.path}`.toLowerCase().includes(q));

  return (
    <Modal title="Choose a patch file" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        CSVs and PDFs from this job's OneDrive folder and Plots tab, likeliest first. Pick one to
        read its patch table - nothing is imported until you approve it.
      </p>
      {files && files.length > 0 && (
        <input
          type="search"
          className="patch-picker-search"
          aria-label="Search files"
          placeholder="Search file or folder name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {error && <p className="error">{error}</p>}
      {!files && !error && <p className="muted">Looking through the job folder…</p>}
      {files && files.length === 0 && <p className="muted">No CSV or PDF files in this job's OneDrive folder or on its Plots tab.</p>}
      {files && files.length > 0 && (
        <ul className="patch-picker-list" aria-label="Patch files">
          {shown.map((f) => {
            const reading = readingKey === f.key;
            const size = formatSize(f.size);
            return (
              <li key={f.key}>
                <button type="button" className="patch-picker-row" onClick={() => pick(f)} disabled={readingKey !== null} aria-busy={reading}>
                  <span className={`patch-picker-kind kind-${f.kind}`} aria-hidden="true">
                    {f.kind.toUpperCase()}
                  </span>
                  <span className="patch-picker-name">
                    <span className="patch-picker-title">
                      {f.name}
                      {f.suggested && <span className="chip chip-role">Likely patch</span>}
                      {f.lastImportedAt && <span className="chip">Imported {formatDateTime(f.lastImportedAt)}</span>}
                    </span>
                    <span className="muted patch-picker-meta">
                      {f.path}
                      {' · '}
                      {f.origin === 'plots' ? 'uploaded' : 'modified'} {formatDateTime(f.modifiedAt)}
                      {size && ` · ${size}`}
                    </span>
                  </span>
                  <span className="patch-picker-state" aria-hidden="true">
                    {reading ? 'Reading…' : f.lastImportedAt ? 'Import again' : 'Use this'}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="muted">No files match "{query}".</li>}
        </ul>
      )}
      {truncated && <p className="muted">Very large folder - only the first 60 folders were searched.</p>}
    </Modal>
  );
}
