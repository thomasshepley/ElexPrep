import { Skeleton, SkeletonPanel } from '../components/Skeleton';
import { useEffect, useState } from 'react';
import { api, type OneDriveConfig } from '../api/client';
import PasswordInput from '../components/PasswordInput';

/**
 * Azure app-registration credentials for the Microsoft Graph / OneDrive scaffold (see
 * server/src/oneDrive/). Until these are filled in with a real app registration (client-
 * credentials flow, Files.Read.All + Sites.Read.All application permissions granted by an
 * admin in Azure AD), `enabled` has no effect - every job's Files tab shows "not connected".
 */
export default function OneDriveSettingsPage() {
  const [config, setConfig] = useState<OneDriveConfig | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [driveId, setDriveId] = useState('');
  const [rootFolderPath, setRootFolderPath] = useState('Projects');
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () =>
    api.oneDrive
      .getConfig()
      .then((c) => {
      setConfig(c);
      setTenantId(c.tenantId);
      setClientId(c.clientId);
      setDriveId(c.driveId);
      setRootFolderPath(c.rootFolderPath);
      setEnabled(c.enabled);
      })
      .catch((e) => setLoadError((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.oneDrive.updateConfig({
        enabled,
        tenantId,
        clientId,
        driveId,
        rootFolderPath,
        ...(clientSecret ? { clientSecret } : {}),
      });
      setConfig(updated);
      setClientSecret('');
      setMessage('Saved.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.oneDrive.testConnection();
      if (res.ok) setMessage(res.message ?? 'Connected.');
      else setError(res.error ?? 'Connection failed.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!config) return loadError ? <p className="error">Could not load OneDrive settings: {loadError}</p> : (
      <div>
        <h1>OneDrive</h1>
        <Skeleton w="60%" h={14} style={{ marginBottom: 20 }} />
        <SkeletonPanel lines={5} /><SkeletonPanel lines={2} />
      </div>
    );

  return (
    <div>
      <h1>OneDrive</h1>
      <p className="muted">
        Scaffolded against the Microsoft Graph API - matches each onboarded job to a folder under{' '}
        <code>{rootFolderPath || 'Projects'}/&lt;year&gt;/&lt;project name&gt;</code>, lets admins
        browse it and share individual files or folders with crew, and auto-surfaces the first PDF
        in a "CAD" subfolder on the job's Plots tab. Everything stays inert until a real Azure app
        registration's credentials are entered below.
      </p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h3>Connection</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="field">
            <span className="field-label">Tenant ID</span>
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ width: 260 }} />
          </label>
          <label className="field">
            <span className="field-label">Client (application) ID</span>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ width: 260 }} />
          </label>
          <label className="field">
            <span className="field-label">Client secret</span>
            <PasswordInput
              value={clientSecret}
              placeholder={config.hasClientSecret ? '•••••••• (set - leave blank to keep)' : 'paste client secret'}
              onChange={(e) => setClientSecret(e.target.value)}
              style={{ width: 260 }}
            />
          </label>
          <label className="field">
            <span className="field-label">Drive ID</span>
            <input value={driveId} onChange={(e) => setDriveId(e.target.value)} placeholder="SharePoint/OneDrive drive id" style={{ width: 260 }} />
          </label>
          <label className="field">
            <span className="field-label">Root folder</span>
            <input value={rootFolderPath} onChange={(e) => setRootFolderPath(e.target.value)} style={{ width: 160 }} />
          </label>
          <label style={{ alignSelf: 'flex-end' }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
          </label>
        </div>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button onClick={save} disabled={busy}>
            Save
          </button>
          <button className="secondary" onClick={testConnection} disabled={busy}>
            Test connection
          </button>
        </div>
        {config.lastTestError && <p className="muted" style={{ marginTop: '0.5rem' }}>Last test failed: {config.lastTestError}</p>}
      </div>
    </div>
  );
}
