import { useEffect, useState } from 'react';
import { api, type CurrentRmsConfig, type CurrentRmsOpportunity } from '../api/client';

export default function CurrentRmsSettingsPage() {
  const [config, setConfig] = useState<CurrentRmsConfig | null>(null);
  const [subdomain, setSubdomain] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pollMinutes, setPollMinutes] = useState(15);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [opportunities, setOpportunities] = useState<CurrentRmsOpportunity[]>([]);
  const [search, setSearch] = useState('');

  const loadConfig = () =>
    api.currentRms.getConfig().then((c) => {
      setConfig(c);
      setSubdomain(c.subdomain);
      setPollMinutes(c.pollMinutes);
      setEnabled(c.enabled);
    });

  const loadOpportunities = (q?: string) => api.currentRms.listOpportunities(q).then(setOpportunities);

  useEffect(() => {
    loadConfig();
    loadOpportunities();
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.currentRms.updateConfig({
        enabled,
        subdomain,
        pollMinutes,
        ...(apiKey ? { apiKey } : {}),
      });
      setConfig(updated);
      setApiKey('');
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
      const res = await api.currentRms.testConnection(subdomain, apiKey || undefined);
      setMessage(res.message ?? 'Connected.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.currentRms.sync();
      if (res.error) setError(res.error);
      else setMessage(`Synced — ${res.pulled} opportunities pulled, ${res.alertsRaised} change alert(s) raised.`);
      await loadConfig();
      await loadOpportunities(search || undefined);
    } catch (e) {
      setError((e as Error).message);
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
      alert(`Created job "${job.name}" — it's private until you mark it Public in Job Settings.`);
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
        see this raw opportunity list — once you import one as a job, it stays private until
        you mark it Public in that job's settings, which is when normal users can see it.
      </p>
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}

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
            <input
              type="password"
              value={apiKey}
              placeholder={config.hasApiKey ? '•••••••• (set — leave blank to keep)' : 'paste API key'}
              onChange={(e) => setApiKey(e.target.value)}
              style={{ width: 260 }}
            />
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
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          {config.lastSyncedAt ? `Last synced ${new Date(config.lastSyncedAt).toLocaleString()}` : 'Never synced yet'}
          {config.lastSyncError ? ` — last sync failed: ${config.lastSyncError}` : ''}
        </p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Opportunities</h3>
          <input placeholder="Search subject/customer" value={search} onChange={(e) => doSearch(e.target.value)} />
        </div>
        {opportunities.length === 0 && (
          <p className="muted">
            No opportunities cached yet — save a valid connection above and click Sync now.
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
