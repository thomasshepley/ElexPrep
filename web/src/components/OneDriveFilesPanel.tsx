import { useEffect, useState } from 'react';
import { api, type JobOneDriveStatus, type OneDriveItem } from '../api/client';

/**
 * The admin side of the OneDrive integration on a job's Plots/CAD tab: shows whether this
 * job's project folder matched automatically, lets an admin browse it and choose individual
 * files or whole folders to share with crew, and previews the auto-detected CAD PDF inline.
 * Entirely scaffolded against the real Microsoft Graph API shape (see server/src/oneDrive/) -
 * until real Azure credentials are added in Settings -> OneDrive, `enabled` stays false and
 * this renders a clear "not connected yet" state rather than a broken file browser.
 */
export default function OneDriveFilesPanel({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const [status, setStatus] = useState<JobOneDriveStatus | null>(null);
  const [crumbs, setCrumbs] = useState<{ id: string | undefined; name: string }[]>([{ id: undefined, name: 'Project folder' }]);
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [manualPath, setManualPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.jobOneDrive
      .get(jobId)
      .then((s) => {
        setStatus(s);
        onChange?.();
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const browse = (folderId: string | undefined, name: string, crumbIndex?: number) => {
    setError(null);
    api.jobOneDrive
      .browse(jobId, folderId)
      .then((r) => {
        setItems(r.items);
        setCrumbs((prev) => (crumbIndex !== undefined ? prev.slice(0, crumbIndex + 1) : [...prev, { id: folderId, name }]));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    if (status?.enabled && status.folderId) browse(undefined, 'Project folder');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.enabled, status?.folderId]);

  const runMatch = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.jobOneDrive.match(jobId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setManualFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.jobOneDrive.setFolder(jobId, manualPath);
      setManualPath('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const currentCrumbPath = () => crumbs.map((c) => c.name).join('/');

  const share = async (item: OneDriveItem) => {
    setBusy(true);
    try {
      await api.jobOneDrive.share(jobId, {
        itemId: item.id,
        itemName: item.name,
        itemPath: `${currentCrumbPath()}/${item.name}`,
        isFolder: Boolean(item.folder),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const unshare = async (shareId: string) => {
    setBusy(true);
    try {
      await api.jobOneDrive.unshare(jobId, shareId);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setCadPlot = async (shareId: string, isCadPlot: boolean) => {
    setBusy(true);
    try {
      await api.jobOneDrive.setCadPlot(jobId, shareId, isCadPlot);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  if (!status.enabled) {
    return (
      <div className="panel">
        <h3>OneDrive</h3>
        <p className="muted">
          Not connected yet. An admin can set up the Azure app credentials in Settings → OneDrive
          to enable automatic project-folder matching, file sharing with crew, and CAD plan
          auto-detection. Uploading plots manually below works either way.
        </p>
      </div>
    );
  }

  const sharedIds = new Set(status.shares.map((s) => s.itemId));

  return (
    <div className="panel">
      <h3>OneDrive</h3>
      {error && <p className="error">{error}</p>}

      {status.folderPath ? (
        <p className="muted">
          Linked to <strong>{status.folderPath}</strong> ({status.matchStatus === 'MATCHED' ? 'auto-matched' : 'manually set'}).{' '}
          <button type="button" className="link-button" onClick={runMatch} disabled={busy}>
            Re-match
          </button>
        </p>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <p className="muted">No project folder linked yet for this job.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={runMatch} disabled={busy}>
              Try auto-match
            </button>
          </div>
          <form onSubmit={setManualFolder} className="row" style={{ marginTop: '0.5rem', alignItems: 'flex-end' }}>
            <div className="field" style={{ width: '20rem' }}>
              <label htmlFor="onedrive-manual-path">Or set a folder path manually</label>
              <input
                id="onedrive-manual-path"
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder="Projects/2026/Big Gig Ltd"
              />
            </div>
            <button type="submit" disabled={busy || !manualPath}>
              Set folder
            </button>
          </form>
        </div>
      )}

      {status.folderId && items.length > 0 && (
        <>
          <h4>Browse &amp; share</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            {crumbs.length > 1 && (
              <span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => browse(undefined, 'Project folder', 0)}
                  aria-label="Back to project folder"
                >
                  …
                </button>
                {' / '}
              </span>
            )}
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && ' / '}
                <button type="button" className="link-button" onClick={() => browse(c.id, c.name, i)}>
                  {c.name}
                </button>
              </span>
            ))}
          </p>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.folder ? (
                      <button type="button" className="link-button" onClick={() => browse(item.id, item.name)}>
                        📁 {item.name}
                      </button>
                    ) : (
                      item.name
                    )}
                  </td>
                  <td>
                    {sharedIds.has(item.id) ? (
                      <span className="chip chip-success">Shared with crew</span>
                    ) : (
                      <button type="button" className="secondary" onClick={() => share(item)} disabled={busy}>
                        Share with crew
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {status.shares.length > 0 && (
        <div style={{ marginTop: '1.25rem' }}>
          <h4>Shared with crew</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {status.shares.map((s) => (
              <div key={s.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  {s.isFolder ? '📁' : '📄'} {s.itemPath}
                  {s.isCadPlot && <span className="chip chip-accent" style={{ marginLeft: '0.4rem' }}>CAD plot</span>}
                </span>
                <div className="row" style={{ gap: '0.4rem' }}>
                  {!s.isFolder && (
                    <button type="button" className="secondary" onClick={() => setCadPlot(s.id, !s.isCadPlot)} disabled={busy}>
                      {s.isCadPlot ? 'Unmark CAD plot' : 'Mark as CAD plot'}
                    </button>
                  )}
                  <button type="button" className="secondary" onClick={() => unshare(s.id)} disabled={busy}>
                    Unshare
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
