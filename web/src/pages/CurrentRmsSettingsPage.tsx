import { useEffect, useState } from 'react';
import { api, type CurrentRmsConfig, type CurrentRmsOpportunity } from '../api/client';
import PasswordInput from '../components/PasswordInput';

export default function CurrentRmsSettingsPage() {
  const [config, setConfig] = useState<CurrentRmsConfig | null>(null);
  const [subdomain, setSubdomain] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  // Shows the plain input for typing/replacing a key; hidden in favor of a "saved" chip once
  // a key is already stored, so the field never looks like it silently lost what you typed.
  const [editingApiKey, setEditingApiKey] = useState(true);
  const [pollMinutes, setPollMinutes] = useState(15);
  const [enabled, setEnabled] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [opportunities, setOpportunities] = useState<CurrentRmsOpportunity[]>([]);
  const [search, setSearch] = useState('');

  const loadConfig = () =>
    api.currentRms.getConfig().then((c) => {
      setConfig(c);
      setSubdomain(c.subdomain);
      setPollMinutes(c.pollMinutes);
      setEnabled(c.enabled);
      setEditingApiKey(!c.hasApiKey);
    });

  const loadOpportunities = (q?: string) => api.currentRms.listOpportunities(q).then(setOpportunities);

  useEffect(() => {
    loadConfig();
    loadOpportunities();
  }, []);

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const updated = await api.currentRms.updateConfig({
        enabled,
        subdomain,
        pollMinutes,
        ...(apiKeyInput ? { apiKey: apiKeyInput } : {}),
      });
      setConfig(updated);
      setApiKeyInput('');
      setEditingApiKey(!updated.hasApiKey);
      setSaveMessage('Saved.');
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeApiKey = async () => {
    if (!confirm('Remove the saved Current RMS API key? Syncing will stop working until a new key is saved.')) return;
    setBusy(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const updated = await api.currentRms.updateConfig({ removeApiKey: true });
      setConfig(updated);
      setApiKeyInput('');
      setEditingApiKey(true);
      setSaveMessage('API key removed.');
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setTestResult(null);
    try {
      const res = await api.currentRms.testConnection(subdomain, apiKeyInput || undefined);
      setTestResult({ ok: true, text: res.message ?? 'Connected.' });
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setSyncResult(null);
    try {
      const res = await api.currentRms.sync();
      if (res.error) setSyncResult({ ok: false, text: res.error });
      else setSyncResult({ ok: true, text: `${res.pulled} opportunities pulled, ${res.alertsRaised} change alert(s) raised.` });
      await loadConfig();
      await loadOpportunities(search || undefined);
    } catch (e) {
      setSyncResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const doSearch = (q: string) => {
    setSearch(q);
    loadOpportunities(q || undefined);
  };

  const importOpportunity = async (rmsId: number) => {
    try {
      const job = await api.currentRms.importOpportunity(rmsId);
      alert(`Created job "${job.name}" - it's private until you mark it Public in Job Settings.`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (!config) return null;

  return (
    <div>
      <h1>Current RMS</h1>
      <p className="muted">
        Pulls opportunities from Current RMS so you can turn one into a job here. Only admins
        see this raw opportunity list - once you import one as a job, it stays private until
        you mark it Public in that job's settings, which is when normal users can see it.
      </p>
      {saveMessage && <p className="muted">{saveMessage}</p>}
      {saveError && <p className="error">{saveError}</p>}

      <div className="panel">
        <h3>Connection</h3>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label>
            Subdomain
            <br />
            <input
              value={subdomain}
              placeholder="yourcompany"
              onChange={(e) => setSubdomain(e.target.value)}
              style={{ width: 200 }}
            />
            <div className="muted" style={{ fontSize: '0.8rem' }}>
              from https://<strong>yourcompany</strong>.current-rms.com
            </div>
          </label>
          <label>
            API key
            <br />
            {!editingApiKey ? (
              <div className="row" style={{ marginTop: '0.1rem' }}>
                <span className="success" style={{ fontWeight: 600 }}>
                  •••••••• saved
                </span>
                <button type="button" className="secondary" onClick={() => setEditingApiKey(true)}>
                  Replace
                </button>
                <button type="button" className="secondary" onClick={removeApiKey} disabled={busy}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="row" style={{ marginTop: '0.1rem' }}>
                <PasswordInput
                  value={apiKeyInput}
                  placeholder="paste API key"
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{ width: 260 }}
                  autoComplete="off"
                />
                {config.hasApiKey && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditingApiKey(false);
                      setApiKeyInput('');
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
            <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {editingApiKey
                ? 'Not saved until you click Save below.'
                : "Saved - Test connection below uses this saved key unless you click Replace and type a new one."}
            </div>
          </label>
          <label>
            Poll every (minutes)
            <br />
            <input
              type="number"
              min={1}
              value={pollMinutes}
              onChange={(e) => setPollMinutes(Number(e.target.value))}
              style={{ width: 80 }}
            />
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
          <button className="secondary" onClick={syncNow} disabled={busy || !enabled}>
            Sync now
          </button>
        </div>
        {testResult && (
          <p className={testResult.ok ? 'success' : 'error'} style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            {testResult.ok ? '✓' : '✕'} {testResult.text}
          </p>
        )}
        {syncResult && (
          <p className={syncResult.ok ? 'success' : 'error'} style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            {syncResult.ok ? '✓' : '✕'} {syncResult.text}
          </p>
        )}
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            marginTop: '0.75rem',
            paddingTop: '0.6rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <strong>Last synced</strong>
          <span className={config.lastSyncError ? 'error' : 'muted'}>
            {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : 'Never synced yet'}
          </span>
        </div>
        {config.lastSyncError && (
          <p className="error" style={{ marginTop: '0.25rem' }}>
            Last sync failed: {config.lastSyncError}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Opportunities</h3>
          <input placeholder="Search subject/customer" value={search} onChange={(e) => doSearch(e.target.value)} />
        </div>
        {opportunities.length === 0 && (
          <p className="muted">
            No opportunities cached yet - save a valid connection above and click Sync now.
          </p>
        )}
        {opportunities.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Dates</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((o) => (
                <tr key={o.id}>
                  <td>{o.subject}</td>
                  <td>{o.memberName}</td>
                  <td>{o.status}</td>
                  <td className="muted">
                    {o.startsAt ? new Date(o.startsAt).toLocaleDateString() : ''}
                    {o.endsAt ? ` – ${new Date(o.endsAt).toLocaleDateString()}` : ''}
                  </td>
                  <td className="muted">{o.rmsUpdatedAt ? new Date(o.rmsUpdatedAt).toLocaleString() : ''}</td>
                  <td>
                    <button className="secondary" onClick={() => importOpportunity(o.rmsId)}>
                      Import as job
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
